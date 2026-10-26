/**
 * La semaine qu'on choisit (maquette `Semaine.dc.html`, hors dépôt : `~/PERSO/sauvegardes-popote/maquettes-2026-10-26-frigo/`).
 *
 * « Pour les repas de la semaine, je veux que ce soit moi qui choisisse ce que je souhaite manger tous les jours. »
 * Sept jours en bandeau, avec deux points (midi, soir) qui disent d'où vient le repas ; le jour choisi a deux
 * cartes, vides (« + Choisir le midi ») ou pleines (le plat, pour qui, « Changer », « Je l'ai mangé ») ; un plat
 * congelé porte un bandeau bleu qui dit quand le sortir ; la feuille de choix propose le frigo (le plus pressé
 * d'abord), le congélateur, puis autre chose. On peut changer le repas le jour même.
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
import { EnPlus, HorsBarquette } from '../ui/semaine/EnPlus.tsx'
import { useFoyer, prenomDe } from '../lib/donnees/foyer.ts'
import {
  NOM_REPAS, jour, useBarquettes, useChoisirUnRepas, useFrequents, useMange, useSemaine,
} from '../lib/donnees/barquettes.ts'
import type { Choix } from '../lib/donnees/barquettes.ts'
import { usePrevus, useRecettesDesPlats } from '../lib/donnees/frigo.ts'
import { groupeLesParts, nomCourt } from '../lib/frigo.ts'
import {
  MOMENTS_EN_PLUS, REPAS_CHOISIS, MOT_DU_REPAS, cartesDuRepas, contenuDe, couleurDuPoint, joursDuBandeau, lisLAdresse,
  messageDeLiberation, pourDit, titreDeLaFeuille,
} from '../lib/choix.ts'
import type { CaseLue, Carte, PointDuJour, RepasChoisi } from '../lib/choix.ts'
import { maintenant } from '../lib/horloge.ts'

/** Les rappels par mail n'existent pas encore (chantier 5) : le bandeau bleu dit « Pense à sortir… ». */
const RAPPEL_PAR_MAIL_ACTIF = false

export function Semaine({ userId, va, remplace }: {
  userId: string
  va: (v: string) => void
  /** Change l'adresse sans nouvelle entrée d'historique (retire `?jour=…` une fois lu). */
  remplace?: (v: string) => void
}) {
  /* Le jour est posé au montage : une page ouverte à minuit ne change pas de « aujourd'hui » sous les doigts. */
  const debut = useMemo(() => maintenant(), [])
  const jours = useMemo(() => joursDuBandeau(debut), [debut])
  const demande = useMemo(() => lisLAdresse(window.location.search, jours), [jours])

  const { data: foyer } = useFoyer()
  const { data: cases = [], isPending, error: erreurCases } = useSemaine(debut, 7)
  const { data: lesPrevus, error: erreurPrevus } = usePrevus()
  const { data: barquettes = [] } = useBarquettes()
  const { data: frequents = [] } = useFrequents()
  const mange = useMange()
  const choisit = useChoisirUnRepas()

  const [index, setIndex] = useState(demande.index)
  /** La feuille ouverte : le repas, et pour qui « Pour » commence. */
  const [feuille, setFeuille] = useState<{ repas: RepasChoisi; pour: 'tous' | string } | null>(null)
  const [message, setMessage] = useState('')
  /* Le repas dont le bouton doit reprendre le focus une fois la feuille refermée (une ref : pas de rendu en plus). */
  const rendreLeFocus = useRef<RepasChoisi | null>(null)

  const membres = useMemo(
    () => (foyer?.membres ?? []).map(m => ({ id: m.id, prenom: prenomDe(m.display_name) })), [foyer])
  const jourChoisi = jours[index]
  const now = maintenant()

  /* Le lien `?jour=…&repas=…` ouvre la feuille UNE fois, quand le foyer est lu (« Pour » a besoin des membres). */
  const lienLu = useRef(false)
  useEffect(() => {
    if (lienLu.current || !demande.repas || membres.length === 0 || isPending) return
    lienLu.current = true
    const les = cases.filter(c => c.day === jours[demande.index].jour && c.meal === demande.repas)
    const { cartes, sansChoix } = cartesDuRepas(les as unknown as CaseLue[], membres, userId)
    const mienne = cartes.find(c => c.personnes.includes(userId))
    setFeuille({ repas: demande.repas, pour: pourDeLaCarte(mienne, sansChoix, membres.length) })
  }, [demande, membres, isPending, cases, jours, userId])

  /* Le focus revient au bouton du repas qu'on vient de choisir ou de laisser : celui qui a ouvert la feuille a
     peut-être changé (« + Choisir » est devenu une carte). */
  useEffect(() => {
    if (!rendreLeFocus.current || feuille) return
    document.querySelector<HTMLElement>(`[data-repas="${rendreLeFocus.current}"] [data-ouvre]`)?.focus()
    rendreLeFocus.current = null
  }, [feuille, cases])

  const nettoieLAdresse = () => {
    if (!window.location.search) return
    if (remplace) remplace('/semaine')
    else window.history.replaceState(null, '', window.location.pathname)
  }

  const groupes = useMemo(() => groupeLesParts(barquettes), [barquettes])
  const lues = cases as unknown as CaseLue[]
  const duJour = (j: string, m: string) => lues.filter(c => c.day === j && c.meal === m)
  const idsRecettes = useMemo(() => [...new Set([
    ...groupes.map(g => g.recipeId),
    ...lues.map(c => c.portion?.recipe_id ?? null),
  ].filter((x): x is string => !!x))], [groupes, lues])
  const { data: recettes } = useRecettesDesPlats(idsRecettes)
  const photoDe = (recipeId: string | null) => (recipeId ? recettes?.get(recipeId)?.image_url ?? null : null)

  if (isPending) return <Ecran actif="semaine" va={va}><Attente /></Ecran>

  /* Les points du bandeau : le mien d'abord, puis les autres, dans l'ordre du foyer. */
  const points: [PointDuJour, PointDuJour][] = jours.map(j => REPAS_CHOISIS.map(m =>
    couleurDuPoint(ordreDeLecture(duJour(j.jour, m), membres, userId).map(contenuDe))) as [PointDuJour, PointDuJour])

  const ouvre = (repas: RepasChoisi, pour: 'tous' | string) => {
    choisit.reset()
    setMessage('')
    setFeuille({ repas, pour })
  }
  const ferme = () => {
    const repas = feuille?.repas ?? null
    setFeuille(null)
    rendreLeFocus.current = repas
    nettoieLAdresse()
  }

  async function choisi(choix: Choix, personnes: string[]) {
    if (!feuille) return
    try {
      const r = await choisit.mutateAsync({ jour: jourChoisi.jour, repas: feuille.repas, personnes, choix })
      setMessage(messageDeLiberation(r.liberees))
      ferme()
    } catch { /* l'erreur est dite dans la feuille (`choisit.error`) */ }
  }

  const dejaMange = feuille
    ? duJour(jourChoisi.jour, feuille.repas).filter(c => c.state === 'mange').map(c => c.user_profile_id)
    : []
  const mesCasesDuJour = lues.filter(c => c.day === jourChoisi.jour && c.user_profile_id === userId)

  return (
    <Ecran actif="semaine" va={va}>
      <h1 className="titre text-[34px] font-semibold leading-none">La semaine</h1>
      <p className="mt-2 text-[14px] text-doux">Tu choisis chaque repas. Le frigo propose d’abord ce qui presse.</p>

      <Bandeau jours={jours} points={points} index={index}
               surChoix={i => { setIndex(i); setMessage(''); nettoieLAdresse() }} />

      <section aria-label={jourChoisi.long} className="mt-5">
        <div className="flex items-baseline gap-2.5">
          <h2 className="titre text-[24px] font-semibold">{jourChoisi.long}</h2>
          {jourChoisi.aujourdhui && <span className="text-[13px] font-bold text-herbe">aujourd’hui</span>}
        </div>

        <div role="status" aria-live="polite">
          {message && (
            <p className="mt-3 rounded-[14px] bg-frais-fond px-3.5 py-2.5 text-[14px] text-frais-encre">{message}</p>
          )}
        </div>
        <Erreur de={erreurCases ?? erreurPrevus ?? mange.error} />

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
                    const surMange = mienne && mienne.state !== 'mange' && c.genre === 'plat' && jourChoisi.jour <= jour(now)
                      ? () => mange.mutate(mienne.id) : undefined
                    return (
                      <CarteDuRepas key={carte.cle} carte={carte} membres={membres} jour={jourChoisi.jour} repas={m}
                                    photo={c.genre === 'plat' ? photoDe(c.recipeId) : null}
                                    maintenant={now} rappelActif={RAPPEL_PAR_MAIL_ACTIF}
                                    surChange={() => ouvre(m, pourDeLaCarte(carte, sansChoix, membres.length))}
                                    surMange={surMange} enCours={mange.isPending}
                                    enPlus={mienne && c.genre === 'plat'
                                      ? <EnPlus cas={cases.find(x => x.id === mienne.id)!} frequents={frequents} /> : null} />
                    )
                  })}
                  {(cartes.length === 0 || sansChoix.length > 0) && (
                    <CarteVide repas={m}
                               pour={cartes.length > 0 ? pourDit(sansChoix, membres) : undefined}
                               surOuvre={() => ouvre(m, pourDeLaCarte(undefined, sansChoix, membres.length))} />
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
            const c = cases.find(x => x.day === jourChoisi.jour && x.user_profile_id === userId && x.meal === moment)
            if (!c || (c.extras.length === 0 && !c.portion && c.state === 'prevu')) return null
            return (
              <div key={moment} className="mt-2 rounded-2xl bg-brume/25 p-3.5">
                <div className="text-[14px]">{NOM_REPAS[moment]}{c.portion ? ` · ${nomCourt(c.portion.label)}` : ''}{c.state === 'saute' ? ' · sauté' : ''}</div>
                <EnPlus cas={c} frequents={frequents} />
              </div>
            )
          })}
          <HorsBarquette key={jourChoisi.jour} jour={jourChoisi.jour} userId={userId} frequents={frequents}
                         dejaLa={mesCasesDuJour as unknown as typeof cases} />
        </section>
      </section>

      <FeuilleDeChoix
        ouverte={feuille !== null}
        fermer={ferme}
        titre={feuille ? titreDeLaFeuille(jourChoisi, feuille.repas) : 'Choisir un repas'}
        repas={feuille?.repas ?? 'diner'} jour={jourChoisi.jour} membres={membres}
        pourInitial={feuille?.pour ?? 'tous'} dejaMange={dejaMange}
        groupes={groupes} prevus={lesPrevus ?? null} maintenant={now} photoDe={photoDe} frequents={frequents}
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
