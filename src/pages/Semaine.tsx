/**
 * La semaine qu'on choisit (maquette `Semaine.dc.html`, hors dépôt : `~/PERSO/sauvegardes-popote/maquettes-2026-10-26-frigo/`).
 *
 * « Pour les repas de la semaine, je veux que ce soit moi qui choisisse ce que je souhaite manger tous les jours. »
 * Le bandeau remonte de sept jours : sept jours passés, aujourd'hui, les six suivants, avec deux points (midi, soir) qui
 * disent d'où vient le repas ; le jour choisi a deux cartes, vides (« + Choisir le midi ») ou pleines (le plat, pour qui,
 * « Changer », « Je l'ai mangé ») ; un plat congelé porte un bandeau bleu qui dit quand le sortir ; la feuille de choix
 * propose le frigo (le plus pressé d'abord), le congélateur, puis autre chose. On peut changer le repas le jour même.
 *
 * Un jour PASSÉ se note : « + Noter ce que j'ai mangé ce midi » ouvre la même feuille, et ce qu'on y choisit est
 * mangé (le repas a eu lieu : `choisir_un_repas`, 0128) ; un repas posé mais pas marqué mangé dit « pas encore noté ».
 *
 * Rien n'est distribué tout seul : après « On range », c'est cet écran qui remplit la semaine. Ce qui reste de
 * l'ancien écran : les extras (le petit déjeuner, la collation, « en plus »), et « sauté », qui est une réponse
 * — « vide » n'est PAS « zéro » (D33).
 *
 * `?jour=2026-10-26&repas=diner` ouvre la semaine sur ce jour, la feuille de ce repas déjà ouverte : c'est le geste
 * du « Changer » de l'accueil.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Attente, Ecran, Erreur } from '../ui/coque.tsx'
import { Bandeau } from '../ui/semaine/Bandeau.tsx'
import { CarteDuRepas, CarteVide } from '../ui/semaine/Carte.tsx'
import { FeuilleDeChoix } from '../ui/semaine/FeuilleDeChoix.tsx'
import type { NotreAliment } from '../ui/semaine/FeuilleDeChoix.tsx'
import { EnPlus, HorsBarquette } from '../ui/semaine/EnPlus.tsx'
import { useFoyer, prenomDe } from '../lib/donnees/foyer.ts'
import {
  NOM_REPAS, jour, useBarquettes, useChoisirUnRepas, useFrequents, useMange, useRetireLaCase, useSemaine,
} from '../lib/donnees/barquettes.ts'
import type { Case, Choix } from '../lib/donnees/barquettes.ts'
import { usePrevus, useRecettesDesPlats } from '../lib/donnees/frigo.ts'
import { useAliments } from '../lib/donnees/aliments.ts'
import { useRappelActif } from '../lib/donnees/rappels.ts'
import { detailDeLUnite, ecrit, valeursDeLUnite } from '../lib/aliments/calcul.ts'
import { groupeLesParts, lisLeJour, nomCourt } from '../lib/frigo.ts'
import {
  MOMENTS_EN_PLUS, REPAS_CHOISIS, MOT_DU_REPAS, caseVide, cartesDuRepas, contenuDe, couleurDuPoint, indexDAujourdhui, joursDuBandeau,
  lisLAdresse, messageDeLiberation, titreDeLaFeuille,
} from '../lib/choix.ts'
import type { CaseLue, Carte, PointDuJour, RepasChoisi } from '../lib/choix.ts'
import { maintenant } from '../lib/horloge.ts'
import { useJourLocal } from '../lib/jour-local.ts'

export function Semaine({ userId, va, remplace }: {
  userId: string
  va: (v: string) => void
  /** Change l'adresse sans nouvelle entrée d'historique (retire `?jour=…` une fois lu). */
  remplace?: (v: string) => void
}) {
  /* « Aujourd'hui » se relit quand la page redevient visible et à minuit : une page ouverte hier soir ne reste pas
     sur hier. Le jour CHOISI est une date, pas un rang : il reste le même quand le bandeau avance d'un jour. */
  const jourReel = useJourLocal()
  const debut = useMemo(() => lisLeJour(jourReel), [jourReel])
  const jours = useMemo(() => joursDuBandeau(debut), [debut])
  const demande = useMemo(() => lisLAdresse(window.location.search, jours), [jours])

  const { data: foyer, isPending: foyerEnCours, error: erreurFoyer } = useFoyer()
  /* Le bandeau remonte : la semaine se lit depuis son premier jour (sept jours avant aujourd'hui). */
  const { data: cases, isPending, error: erreurCases } = useSemaine(lisLeJour(jours[0].jour), jours.length)
  const { data: lesPrevus, error: erreurPrevus } = usePrevus()
  const lectureBarquettes = useBarquettes()
  const lectureFrequents = useFrequents()
  const barquettes = useMemo(() => lectureBarquettes.data ?? [], [lectureBarquettes.data])
  const frequents = useMemo(() => lectureFrequents.data ?? [], [lectureFrequents.data])
  /* Nos aliments (0124) : proposés AVANT les repères, dans la feuille et dans « en plus ». */
  const lectureAliments = useAliments()
  const aliments = useMemo(() => lectureAliments.data ?? [], [lectureAliments.data])
  /* Une liste qu'on n'a pas pu lire n'est pas une liste vide : on le dit, on ne propose pas « ajouter » comme si rien n'existait. */
  const alimentsEnPanne = !!lectureAliments.error && aliments.length === 0
  const mange = useMange()
  /* Le bandeau bleu d'un plat congelé dit « Mail mardi à 19 h… » quand MON rappel « Sortir du congélateur » est activé,
     « Pense à sortir… » sinon. Tant que les réglages ne sont pas lus, il ne promet pas de mail. */
  const rappelActif = useRappelActif('sortir_du_congelateur')
  const choisit = useChoisirUnRepas()
  /* « Sauté » du petit déjeuner et de la collation, et sa remise : hors de la feuille, donc leur propre état. */
  const saute = useChoisirUnRepas()
  const remet = useRetireLaCase()

  /* Le jour choisi est une date, pas un rang : il reste le même quand le bandeau avance. Sauf aujourd'hui, qu'on ne « choisit »
     pas : `null` le suit — une page laissée ouverte sur aujourd'hui passe à demain à minuit, elle ne reste pas sur hier. */
  const auj = indexDAujourdhui(jours)
  const [choisiExplicite, setChoisiExplicite] = useState<string | null>(() => (demande.index === auj ? null : jours[demande.index].jour))
  const choisiJour = choisiExplicite ?? jours[auj].jour
  const index = Math.max(0, jours.findIndex(j => j.jour === choisiJour))
  /** La feuille ouverte : le repas, et pour qui « Pour » commence. */
  const [feuille, setFeuille] = useState<{ repas: RepasChoisi; pour: 'tous' | string } | null>(null)
  const [message, setMessage] = useState('')
  /* Le bouton exact qui a ouvert la feuille (le repas, et la clé de sa carte) : c'est lui qui reprend le focus une fois
     la feuille refermée (une ref : pas de rendu en plus). */
  const rendreLeFocus = useRef<{ repas: RepasChoisi; cle: string } | null>(null)
  /* Un choix est en vol : un second toucher ne part pas, et ne remplace pas le message du premier. */
  const enVol = useRef(false)

  const membres = useMemo(
    () => (foyer?.membres ?? []).map(m => ({ id: m.id, prenom: prenomDe(m.display_name) })), [foyer])
  const jourChoisi = jours[index]
  const now = maintenant()

  /* Le lien `?jour=…&repas=…` ouvre la feuille UNE fois, quand le foyer est lu (« Pour » a besoin des membres). */
  const lienLu = useRef(false)
  useEffect(() => {
    if (lienLu.current || !demande.repas || membres.length === 0 || isPending) return
    lienLu.current = true
    const les = (cases ?? []).filter(c => c.day === jours[demande.index].jour && c.meal === demande.repas)
    const { cartes, sansChoix } = cartesDuRepas(les as unknown as CaseLue[], membres, userId)
    const mienne = cartes.find(c => c.personnes.includes(userId))
    rendreLeFocus.current = { repas: demande.repas, cle: mienne?.cle ?? 'vide' }
    setFeuille({ repas: demande.repas, pour: pourDeLaCarte(mienne, sansChoix, membres.length) })
  }, [demande, membres, isPending, cases, jours, userId])

  /* Le focus revient au bouton exact qui a ouvert la feuille. Après un choix il peut avoir changé (« + Choisir » est
     devenu une carte, ou deux cartes n'en font plus qu'une) : on retombe alors sur le premier bouton du repas. */
  useEffect(() => {
    const o = rendreLeFocus.current
    if (!o || feuille) return
    const boutons = [...document.querySelectorAll<HTMLElement>(`[data-repas="${o.repas}"] [data-ouvre]`)]
    const bouton = boutons.find(b => b.dataset.ouvre === o.cle) ?? boutons[0]
    bouton?.focus()
    rendreLeFocus.current = null
  }, [feuille, cases])

  const nettoieLAdresse = () => {
    if (!window.location.search) return
    if (remplace) remplace('/semaine')
    else window.history.replaceState(null, '', window.location.pathname)
  }

  const groupes = useMemo(() => groupeLesParts(barquettes), [barquettes])
  const lesCases = cases ?? []
  const lues = lesCases as unknown as CaseLue[]
  const duJour = (j: string, m: string) => lues.filter(c => c.day === j && c.meal === m)
  const idsRecettes = useMemo(() => [...new Set([
    ...groupes.map(g => g.recipeId),
    ...lues.map(c => c.portion?.recipe_id ?? null),
  ].filter((x): x is string => !!x))], [groupes, lues])
  const { data: recettes } = useRecettesDesPlats(idsRecettes)
  const photoDe = (recipeId: string | null) => (recipeId ? recettes?.get(recipeId)?.image_url ?? null : null)

  /* Une lecture qui a échoué ne se montre pas comme une semaine vide : « + Choisir le midi » sur un jour qui a ses repas. */
  if (isPending || foyerEnCours) return <Ecran actif="semaine" va={va}><Attente /></Ecran>
  if (!cases || !foyer) return <Ecran actif="semaine" va={va}><Erreur de={erreurCases ?? erreurFoyer ?? 'Je n’ai pas pu lire la semaine.'} /></Ecran>

  /* Les points du bandeau : le mien d'abord, puis les autres, dans l'ordre du foyer. */
  const points: [PointDuJour, PointDuJour][] = jours.map(j => REPAS_CHOISIS.map(m =>
    couleurDuPoint(ordreDeLecture(duJour(j.jour, m), membres, userId).map(contenuDe))) as [PointDuJour, PointDuJour])

  const ouvre = (repas: RepasChoisi, pour: 'tous' | string, cle: string) => {
    choisit.reset()
    setMessage('')
    rendreLeFocus.current = { repas, cle }
    setFeuille({ repas, pour })
  }
  const ferme = () => {
    setFeuille(null)
    nettoieLAdresse()
  }

  async function choisi(choix: Choix, personnes: string[]) {
    if (!feuille || enVol.current) return
    enVol.current = true
    try {
      const r = await choisit.mutateAsync({ jour: jourChoisi.jour, repas: feuille.repas, personnes, choix })
      setMessage(messageDeLiberation(r.liberees))
      ferme()
    } catch { /* l'erreur est dite dans la feuille (`choisit.error`) */ } finally { enVol.current = false }
  }

  /* « Sauté » pour le petit déjeuner et la collation : le même geste que la feuille (`choisir_un_repas`), pour moi. */
  const sauteLe = (moment: 'petit_dejeuner' | 'collation') => {
    saute.mutate({ jour: jourChoisi.jour, repas: moment, personnes: [userId], choix: { type: 'saute' } })
  }

  /* Nos aliments : une ligne chacun, avec les valeurs d'UNE unité ; un appui demande « combien ? ». */
  const nosAliments: NotreAliment[] = aliments.map(a => ({
    id: a.id, label: a.label, remplace_repere: a.remplace_repere, detail: detailDeLUnite(a), reste: `${ecrit(valeursDeLUnite(a).kcal)} kcal`, aliment: a,
  }))

  const dejaMange = feuille
    ? duJour(jourChoisi.jour, feuille.repas).filter(c => c.state === 'mange').map(c => c.user_profile_id)
    : []
  const mesCasesDuJour = lues.filter(c => c.day === jourChoisi.jour && c.user_profile_id === userId)

  return (
    <Ecran actif="semaine" va={va}>
      <h1 className="titre text-[34px] font-semibold leading-none">La semaine</h1>
      <p className="mt-2 text-[14px] text-doux">Tu choisis chaque repas. Le frigo propose d’abord ce qui presse.</p>

      <Bandeau jours={jours} points={points} index={index}
               surChoix={i => {
                 setChoisiExplicite(i === auj ? null : jours[i].jour); setMessage(''); mange.reset(); saute.reset(); remet.reset(); nettoieLAdresse()
               }} />

      <section aria-label={jourChoisi.long} className="mt-5">
        <div className="flex items-baseline gap-2.5">
          <h2 className="titre text-[24px] font-semibold">{jourChoisi.long}</h2>
          {jourChoisi.aujourdhui && <span className="text-[13px] font-bold text-herbe">aujourd’hui</span>}
          {jourChoisi.hier && <span data-hier="" className="text-[13px] font-bold text-ocre">hier</span>}
        </div>
        {jourChoisi.passe && (
          <p data-jour-passe="" className="mt-1 text-[15px] leading-[1.45] text-doux">
            Un jour passé : tu notes ce que tu as mangé. Les barquettes que tu coches sortent du frigo ou du congélateur.
          </p>
        )}

        <div role="status" aria-live="polite">
          {message && (
            <p className="mt-3 rounded-[14px] bg-frais-fond px-3.5 py-2.5 text-[14px] text-frais-encre">{message}</p>
          )}
        </div>
        <Erreur de={erreurCases ?? erreurPrevus ?? mange.error ?? saute.error ?? remet.error} />
        {alimentsEnPanne && (
          <p role="alert" className="mt-4 text-[15px] text-groseille">
            Je n’ai pas pu lire nos aliments : les repères sont proposés à leur place.
          </p>
        )}

        <div className="mt-3.5 flex flex-col gap-3">
          {REPAS_CHOISIS.map(m => {
            const { cartes, sansChoix } = cartesDuRepas(duJour(jourChoisi.jour, m), membres, userId)
            return (
              <div key={m} data-repas={m}>
                <h3 className="mb-1.5 ml-0.5 text-[13px] font-normal text-doux">{MOT_DU_REPAS[m].titre}</h3>
                <div className="flex flex-col gap-2.5">
                  {cartes.map(carte => {
                    const mienne = carte.cases.find(c => c.user_profile_id === userId)
                    const c = carte.contenu
                    /* Un plat, ou « autre chose » (qui ne compte au bilan qu'une fois mangé) : « Je l'ai mangé ». */
                    const laMienne = mienne ? lesCases.find(x => x.id === mienne.id) : undefined
                    const surMange = laMienne && mienne!.state === 'prevu' && (c.genre === 'plat' || c.genre === 'autre')
                      && jourChoisi.jour <= jour(now)
                      ? () => mange.mutate(laMienne) : undefined
                    return (
                      <CarteDuRepas key={carte.cle} carte={carte} membres={membres} moi={userId} jour={jourChoisi.jour} repas={m}
                                    photo={c.genre === 'plat' ? photoDe(c.recipeId) : null}
                                    maintenant={now} rappelActif={rappelActif}
                                    surChange={() => ouvre(m, pourDeLaCarte(carte, sansChoix, membres.length), carte.cle)}
                                    surMange={surMange} enCours={mange.isPending} passe={jourChoisi.passe}
                                    enPlus={mienne && c.genre === 'plat'
                                      ? <EnPlus cas={laMienne!} frequents={frequents} nosAliments={aliments} userId={userId} /> : null} />
                    )
                  })}
                  {(cartes.length === 0 || sansChoix.length > 0) && (
                    <CarteVide repas={m} passe={jourChoisi.passe}
                               pour={cartes.length > 0 ? { ids: sansChoix, membres, moi: userId } : undefined}
                               surOuvre={() => ouvre(m, pourDeLaCarte(undefined, sansChoix, membres.length), 'vide')} />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Ce que « La semaine » ne choisit pas : le matin et le goûter, notés après coup, pour moi. */}
        <section aria-label="Autres moments" className="mt-7">
          <h3 className="mb-1 ml-0.5 text-[13px] font-normal text-doux">Autres moments</h3>
          {MOMENTS_EN_PLUS.map(moment => {
            const c = lesCases.find(x => x.day === jourChoisi.jour && x.user_profile_id === userId && x.meal === moment)
            /* Une case vide (ce que laissait « retirer » le dernier extra) ne se montre pas : elle n'est rien. */
            if (!c || caseVide(c)) return null
            return (
              <div key={moment} className="mt-2 rounded-2xl bg-brume/25 p-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px]">{NOM_REPAS[moment]}{c.portion ? ` · ${nomCourt(c.portion.label)}` : ''}{c.state === 'saute' ? ' · sauté' : ''}</span>
                  {c.state === 'saute' && (
                    <button type="button" disabled={remet.isPending} onClick={() => remet.mutate(c.id)}
                            aria-label={`${NOM_REPAS[moment]} : ne plus le sauter`}
                            className="inline-flex min-h-11 items-center text-[13px] text-doux underline underline-offset-2 disabled:opacity-60">
                      annuler
                    </button>
                  )}
                </div>
                <EnPlus cas={c} frequents={frequents} nosAliments={aliments} userId={userId} />
              </div>
            )
          })}
          <HorsBarquette key={jourChoisi.jour} jour={jourChoisi.jour} userId={userId} frequents={frequents} nosAliments={aliments}
                         dejaLa={mesCasesDuJour as unknown as Case[]}
                         surSaute={sauteLe} enCours={saute.isPending} />
        </section>
      </section>

      <FeuilleDeChoix
        ouverte={feuille !== null}
        fermer={ferme}
        titre={feuille ? titreDeLaFeuille(jourChoisi, feuille.repas) : 'Choisir un repas'}
        repas={feuille?.repas ?? 'diner'} jour={jourChoisi.jour} membres={membres}
        pourInitial={feuille?.pour ?? 'tous'} dejaMange={dejaMange} moi={userId}
        groupes={groupes} prevus={lesPrevus ?? null} maintenant={now} photoDe={photoDe} frequents={frequents}
        lectures={{
          barquettes: { enCours: lectureBarquettes.isPending, erreur: lectureBarquettes.error },
          frequents: { enCours: lectureFrequents.isPending, erreur: lectureFrequents.error },
          prevus: { enCours: lesPrevus === undefined && !erreurPrevus, erreur: erreurPrevus },
        }}
        nosAliments={nosAliments} alimentsEnPanne={alimentsEnPanne}
        versNosAliments={() => feuille && va(`/aliments?depuis=semaine&jour=${jourChoisi.jour}&repas=${feuille.repas}`)}
        enCours={choisit.isPending} erreur={choisit.error} surChoix={choisi} />
    </Ecran>
  )
}

/** Les cases d'un repas dans l'ordre où l'on se lit : moi d'abord, puis le foyer. */
function ordreDeLecture(les: CaseLue[], membres: { id: string }[], moi: string): CaseLue[] {
  const rang = (id: string) => (id === moi ? -1 : membres.findIndex(m => m.id === id))
  return [...les].sort((a, b) => rang(a.user_profile_id) - rang(b.user_profile_id))
}

/** Pour qui la feuille commence : ceux de la carte qu'on change, ou ceux qui n'ont encore rien. */
function pourDeLaCarte(carte: Carte | undefined, sansChoix: string[], nbMembres: number): 'tous' | string {
  const ids = carte ? carte.personnes : sansChoix
  return ids.length === 1 && nbMembres > 1 ? ids[0] : 'tous'
}
