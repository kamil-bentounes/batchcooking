/**
 * Les charges du foyer.
 *
 * Il n'y a qu'UNE liste. Pas « les communes » d'un côté et « les perso » de
 * l'autre qu'il faudrait synchroniser : chaque ligne dit qui participe, et
 * « perso » n'est que le cas où il n'y a qu'une personne dedans. C'est ici, sur
 * la ligne, que se décide ce qui est partagé — nulle part ailleurs.
 *
 * L'ajout part du CATALOGUE. Un écran « ajoute tes dépenses » avec un champ
 * vide obtient une chose : rien. On ne se souvient pas de ses charges, on les
 * reconnaît — d'où cinquante-deux lignes à cocher, chacune avec la périodicité
 * la plus probable, parce qu'un contrôle technique saisi comme mensuel fait une
 * erreur d'un facteur douze.
 */
import { useState } from 'react'
import { Dictee } from './Dictee.tsx'
import { RevueCharges } from './RevueCharges.tsx'
import { Surface, Vide, Attente, Erreur, Principal, BarreAction } from '../ui/coque.tsx'
import { Champ } from '../ui/kit.tsx'
import { useFoyer, prenomDe } from '../lib/donnees/foyer.ts'
import {
  useCharges, useCatalogue, useAjouteCharge, useRetireLaCharge, useComptes, useChangeCategorie,
  useRattacheCharge, useMajParticipants, useCorrigeCharge, useAUneHistoire, useEtatDeLAnnee,
  euros, moisDe, type Charge,
} from '../lib/donnees/budget.ts'
import { CATEGORIES, NOM_DU_MODE, categorieDeLArticle, infoCategorie, modeDeLArticle,
         type Categorie, type Mode } from '../lib/budget/categories.ts'
import { ceQuiChange, communeDeLaCharge, debutDuChamp, ditLaCorrection, peutCorriger, peutPoser, periodiciteDeLaFacon,
         plancherDuDebut, retireesEncoreAReg, sousTitreDeLaFacon, suiteDuRetrait, texteDeLaRetiree,
         type Rythme } from '../lib/budget/charges.ts'
import { maintenant } from '../lib/horloge.ts'
import { FeuilleMiseDeCote } from '../ui/budget/FeuilleMiseDeCote.tsx'

const PERIODE: Record<string, string> = {
  mensuel: 'par mois', trimestriel: 'par trimestre', annuel: 'par an',
}

type Filtre = 'tout' | 'commun' | 'moi'

/** « Catégorie » (§ 3.7) : les huit, chacune avec sa pastille — la couleur n'est
    jamais seule, le nom est écrit. */
function ChoixCategorie({ valeur, choisir, nom }: {
  valeur: Categorie; choisir: (c: Categorie) => void; nom: string
}) {
  return (
    <div>
      <span className="block text-[15px] font-semibold">Catégorie</span>
      <div role="radiogroup" aria-label={nom} className="mt-2 flex gap-2 flex-wrap">
        {CATEGORIES.map(c => (
          <button key={c.cle} type="button" role="radio" aria-checked={valeur === c.cle}
                  onClick={() => choisir(c.cle)}
                  className={`px-3.5 min-h-11 inline-flex items-center gap-2 rounded-full text-[14px]
                              transition-colors
                    ${valeur === c.cle ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
            <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full"
                  style={{ background: valeur === c.cle ? c.sombre : c.clair }} />
            {c.nom}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * « Comment elle se paie » (§ 3.7). Ce choix remplace la périodicité seule et la
 * case « variable » : les trois premiers fixent le mensuel, « Mise de côté »
 * demande tous les trois mois ou une fois par an.
 */
function ChoixFacon({ mode, rythme, choisir, nom, bloque = false }: {
  mode: Mode; rythme: Rythme; choisir: (m: Mode, r: Rythme) => void; nom: string
  /** Une charge mise de côté qui a une histoire ne devient pas mensuelle (§ 4.5). */
  bloque?: boolean
}) {
  return (
    <div>
      <span className="block text-[15px] font-semibold">Comment elle se paie</span>
      <div role="radiogroup" aria-label={nom} className="mt-2 grid grid-cols-2 gap-2">
        {(['fixe', 'facture', 'au_fil', 'mis_de_cote'] as const).map(m => (
          <button key={m} type="button" role="radio" aria-checked={mode === m}
                  disabled={bloque && m !== 'mis_de_cote'} onClick={() => choisir(m, rythme)}
                  className={`min-h-11 px-3 py-2 rounded-[12px] text-[14px] leading-tight text-left
                              transition-colors disabled:opacity-40
                    ${mode === m ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
            {NOM_DU_MODE[m]}
          </button>
        ))}
      </div>
      {mode === 'mis_de_cote' && (
        <div role="radiogroup" aria-label="Tous les combien" className="mt-2 flex gap-2">
          {([['trimestriel', 'Tous les trois mois'], ['annuel', 'Une fois par an']] as const)
            .map(([r, texte]) => (
              <button key={r} type="button" role="radio" aria-checked={rythme === r}
                      onClick={() => choisir('mis_de_cote', r)}
                      className={`flex-1 min-h-11 rounded-[12px] text-[14px] transition-colors
                        ${rythme === r ? 'bg-herbe text-fond' : 'bg-brume/50 text-encre'}`}>
                {texte}
              </button>
            ))}
        </div>
      )}
      {bloque && (
        <p className="mt-2 text-[14px] leading-snug text-doux">
          Pour la payer chaque mois, retire-la et ajoute la nouvelle. Ses factures et ses années
          soldées restent ; une année encore ouverte se soldera à la clôture de décembre.
        </p>
      )}
    </div>
  )
}

/** Une charge mise de côté retirée, qui peut encore recevoir sa facture (§ 3.7). */
function Retiree({ charge, ouvrir }: { charge: Charge; ouvrir: () => void }) {
  const annee = Number(charge.archive_le!.slice(0, 4))
  const etat = useEtatDeLAnnee(charge.id, annee)
  return (
    <div className="py-4 flex items-center justify-between gap-3 border-b border-brume last:border-0">
      <span className="min-w-0">
        <span className="block text-[16px]">{charge.libelle}</span>
        <span className="block mt-0.5 text-[14px] text-doux">
          {texteDeLaRetiree(etat.data?.soldee, annee)}
        </span>
      </span>
      <button onClick={ouvrir}
              className="shrink-0 min-h-11 px-3.5 rounded-[12px] border border-brume text-[14px]">
        Ajouter une facture
      </button>
    </div>
  )
}

/** Le formulaire d'ajout, qu'il vienne du catalogue ou d'une ligne inventée. */
export function Ajout({ depart, membres, moi, foyerId, comptes, surFini }: {
  depart: { libelle: string; periode: string; portee: string; precision: string | null
            catalogueId: string | null
            /* La section et le rang de plafond de l'article : la catégorie et la
               façon s'en déduisent (§ 3.7). */
            section?: string; plafondOrdre?: number | null } | null
  membres: { id: string; display_name: string }[]
  moi: string
  foyerId: string
  comptes: { id: string; nom: string; genre: string }[]
  surFini: () => void
}) {
  const [libelle, setLibelle] = useState(depart?.libelle ?? '')
  const [montant, setMontant] = useState('')
  /* La catégorie vient de la section de l'article ; une ligne libre la demande,
     « Autre » d'office. La façon vient de la nature de l'article : avec plafond,
     au fil du mois ; Électricité et Gaz, une facture du mois ; non mensuel, mis
     de côté ; le reste, fixe (§ 3.7). */
  const [categorie, setCategorie] = useState<Categorie>(
    depart?.catalogueId && depart.section
      ? categorieDeLArticle({ section: depart.section, libelle: depart.libelle }) : 'autre')
  const [mode, setMode] = useState<Mode>(
    depart?.catalogueId
      ? modeDeLArticle({ periode: depart.periode, plafond_ordre: depart.plafondOrdre ?? null,
                         libelle: depart.libelle })
      : 'fixe')
  const [rythme, setRythme] = useState<Rythme>(depart?.periode === 'trimestriel' ? 'trimestriel' : 'annuel')
  const periode = periodiciteDeLaFacon(mode, rythme)
  const [cle, setCle] = useState<'defaut' | 'prorata' | 'moitie'>('defaut')
  /* Le compte débité et l'enveloppe. Sans eux, l'app ne peut annoncer qu'un
     montant à répartir — jamais un virement, qui est la seule chose sur
     laquelle on agit.

     Le COMMUN d'office, pas le premier de la liste : `useComptes` trie par nom,
     si bien qu'un livret ou le compte de l'autre pouvait être proposé. */
  const [compteId, setCompteId] = useState<string>(
    comptes.find(c => c.genre === 'commun')?.id ?? comptes[0]?.id ?? '')
  /* Depuis quand elle court. Le premier du mois en cours par défaut, mais une
     charge annuelle posée en septembre doit pouvoir commencer en janvier :
     sinon elle ne provisionne que les mois restants, et sa régularisation
     facture l'année entière d'un coup. */
  const [debut, setDebut] = useState<string>(moisDe())
  /* L'intention, déclarée à la main quand on est encore seul dans le foyer.
     Sans elle, `qui.length > 1` était impossible et aucune charge inventée ne
     pouvait accueillir le second membre à son arrivée. Le catalogue la
     pré-coche ; une ligne libre demande. */
  /* ⚠️ Une ligne LIBRE ne présume rien, même à deux.
     `membres.length > 1` suffisait à la cocher : dans un foyer de deux, toute
     charge inventée entrait d'office dans le budget de l'autre. Le catalogue
     sait ce que vaut chaque poste et le pré-coche ; « Autre chose », par
     définition, ne sait rien. */
  const [commune, setCommune] = useState(
    depart?.catalogueId
      ? (depart.portee === 'commun' || membres.length > 1)
      : depart?.portee === 'commun')
  /* Le catalogue PRÉ-COCHE : les deux pour l'électricité, une seule personne
     pour un forfait mobile. Ce n'est qu'une suggestion — la case reste ouverte. */
  const [qui, setQui] = useState<string[]>(
    depart?.portee === 'perso' ? [moi] : membres.map(m => m.id))
  const ajoute = useAjouteCharge()

  /* Le montant et le départ passent par les mêmes règles que les feuilles : 0 € et plus de
     1 000 000 € se refusent avant l'envoi, et un « Elle court depuis » vidé ne part pas
     comme « -01 ». */
  const plancher = plancherDuDebut(maintenant())
  const { pret, cents, refusMontant, refusDebut } = peutPoser({
    libelle, montant, qui: qui.length, debut, plancher })

  return (
    <>
      <div className="mt-5 space-y-4">
        <Champ label="Quoi" value={libelle} onChange={e => setLibelle(e.target.value)} />
        {depart?.precision && (
          <p className="-mt-1 text-[14px] leading-[22px] text-doux">{depart.precision}</p>
        )}
        <Champ label="Combien (€)" type="text" inputMode="decimal" value={montant}
               onChange={e => setMontant(e.target.value)} />
        {refusMontant && (
          <p role="alert" className="-mt-1 text-[14px]" style={{ color: 'var(--color-ocre)' }}>
            {refusMontant}
          </p>
        )}

        <ChoixCategorie valeur={categorie} choisir={setCategorie} nom="Catégorie" />
        <ChoixFacon mode={mode} rythme={rythme} nom="Comment elle se paie"
                    choisir={(m, r) => { setMode(m); setRythme(r) }} />
        {mode === 'mis_de_cote' && (
          <p className="-mt-1 text-[14px] text-doux">
            On en met de côté le {rythme === 'annuel' ? 'douzième' : 'tiers'} chaque mois :
            {' '}{euros(Math.round((cents ?? 0) / (rythme === 'annuel' ? 12 : 3)))} par mois.
          </p>
        )}

        <div>
          <span className="block text-[15px] font-semibold">Qui participe</span>
          <div className="mt-2 flex gap-2 flex-wrap">
            {membres.map(m => {
              const dedans = qui.includes(m.id)
              return (
                <button key={m.id} role="checkbox" aria-checked={dedans}
                        onClick={() => setQui(l =>
                          dedans ? l.filter(x => x !== m.id) : [...l, m.id])}
                        className={`px-4 min-h-11 inline-flex items-center rounded-full
                                    text-[14px] transition-colors
                          ${dedans ? 'bg-herbe text-fond' : 'bg-brume/50 text-encre'}`}>
                  {prenomDe(m.display_name)}
                </button>
              )
            })}
          </div>
          {qui.length === 1 && !communeDeLaCharge({ qui: 1, membres: membres.length, intention: commune }) && (
            <p className="mt-2 text-[14px] text-doux">
              Payée par une seule personne : elle n’entrera dans aucun partage.
            </p>
          )}
          {membres.length === 1 && (
            <>
              <button role="checkbox" aria-checked={commune} onClick={() => setCommune(c => !c)}
                      className="mt-3 flex items-center gap-3 min-h-11 text-left">
                <span className={`w-[22px] h-[22px] rounded-[7px] border-2 shrink-0
                                  ${commune ? 'bg-herbe border-herbe' : 'border-brume'}`} />
                <span className="text-[15px]">Elle se partagera avec le foyer</span>
              </button>
              <p className="mt-1 text-[14px] text-doux">
                Tu es seul pour l’instant. Coche si la personne que tu invites devra
                la partager : elle y entrera toute seule en arrivant.
              </p>
            </>
          )}
        </div>

        {qui.length > 1 && (
          <div>
            <span className="block text-[15px] font-semibold">Comment la partager</span>
            <div role="radiogroup" aria-label="Clé de répartition" className="mt-2 flex gap-2">
              {([['defaut', 'Comme le foyer'], ['prorata', 'Au prorata'],
                 ['moitie', 'Moitié-moitié']] as const).map(([v, nom]) => (
                <button key={v} role="radio" aria-checked={cle === v} onClick={() => setCle(v)}
                        className={`flex-1 min-h-11 rounded-[12px] text-[13px] transition-colors
                          ${cle === v ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
                  {nom}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-[15px] font-semibold" htmlFor="debut-charge">
            Elle court depuis
          </label>
          <input id="debut-charge" type="month" value={debut.slice(0, 7)}
                 /* Pas avant janvier de l'année précédente : la base refuse (0096). */
                 min={plancher.slice(0, 7)}
                 onChange={e => setDebut(debutDuChamp(e.target.value))}
                 className="mt-2 w-full min-h-11 rounded-[14px] border border-brume
                            bg-surface px-4 text-[16px]" />
          {refusDebut && (
            <p role="alert" className="mt-2 text-[14px]" style={{ color: 'var(--color-ocre)' }}>
              {refusDebut}
            </p>
          )}
          {periode !== 'mensuel' && debut.slice(0, 4) === String(maintenant().getFullYear())
            && Number(debut.slice(5, 7)) > 1 && (
            <p className="mt-2 text-[14px]" style={{ color: 'var(--color-ocre)' }}>
              On ne mettra de côté qu’à partir de ce mois-là. Si tu la paies
              depuis janvier, remonte la date — sinon la facture annuelle tombera
              d’un coup.
            </p>
          )}
        </div>

        {comptes.length > 0 && (
          <div>
            <span className="block text-[15px] font-semibold">Payée depuis</span>
            <div role="radiogroup" aria-label="Compte débité" className="mt-2 flex gap-2 flex-wrap">
              {comptes.map(c => (
                <button key={c.id} role="radio" aria-checked={compteId === c.id}
                        onClick={() => setCompteId(c.id)}
                        className={`px-4 min-h-11 inline-flex items-center rounded-full
                                    text-[14px] transition-colors
                          ${compteId === c.id ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
                  {c.nom}
                </button>
              ))}
            </div>
          </div>
        )}

        {comptes.length === 0 && (
          <p className="text-[15px]" style={{ color: 'var(--color-ocre)' }}>
            Aucun compte déclaré : cette charge apparaîtra sous « à répartir »
            au lieu d’un virement. Pose-les dans les réglages du budget.
          </p>
        )}

        <Erreur de={ajoute.error} />
      </div>

      <BarreAction>
        <Principal disabled={!pret || ajoute.isPending}
                   onClick={() => ajoute.mutate({
                     libelle: libelle.trim(), montantCents: cents ?? 0, periodicite: periode,
                     /* La façon et la catégorie, dites. `variable` et l'enveloppe ne
                        servent plus qu'à l'ancien paquet (§ 4.1) : à faux et vide, le
                        trigger de `charge` ne déduit rien par-dessus. */
                     mode, categorie, variable: false, enveloppeId: null,
                     participants: qui, cle: cle === 'defaut' ? null : cle,
                     catalogueId: depart?.catalogueId ?? null, foyerId,
                     compteId: compteId || null,
                     /* Commune dès que plus d'une personne y participe — ou que
                        le catalogue le suggérait alors qu'on est encore seul
                        dans le foyer. C'est cette intention qui fera entrer le
                        second membre à son arrivée. */
                     commun: communeDeLaCharge({ qui: qui.length, membres: membres.length, intention: commune }),
                     debut,
                   }, { onSuccess: surFini })}>
          {ajoute.isPending ? 'J’ajoute…' : 'Ajouter cette charge'}
        </Principal>
      </BarreAction>
    </>
  )
}

export function Charges({ userId, retour }: { userId: string; retour: () => void }) {
  const [filtre, setFiltre] = useState<Filtre>('tout')
  const [dictee, setDictee] = useState(false)
  const [dit, setDit] = useState('')
  /* Le catalogue fait six hauteurs d'écran de pastilles. Sans moyen d'y
     chercher, on ne le parcourt pas — on renonce et on tape « Autre chose ». */
  const [cherche, setCherche] = useState('')
  const [ajout, setAjout] = useState<Parameters<typeof Ajout>[0]['depart'] | undefined>()
  const { data: foyer } = useFoyer()
  const charges = useCharges()
  const { data: catalogue = [] } = useCatalogue()
  const retire = useRetireLaCharge()
  const ajouteUne = useAjouteCharge()
  const comptes = useComptes()
  const rattache = useRattacheCharge()
  const majQui = useMajParticipants()
  const corrige = useCorrigeCharge()
  const changeCategorie = useChangeCategorie()
  /* La feuille d'une charge retirée qui attend encore une facture (§ 3.4). */
  const [feuille, setFeuille] = useState<Charge | null>(null)
  const [quiOuvert, setQuiOuvert] = useState<string | null>(null)
  /* La charge en cours de correction, et ce qu'on y tape. Une faute de frappe
     le premier soir était définitive : aucun écran ne revenait sur un montant. */
  const [corrigeOuvert, setCorrigeOuvert] = useState<string | null>(null)
  const [cLibelle, setCLibelle] = useState('')
  const [cMontant, setCMontant] = useState('')
  const [cMode, setCMode] = useState<Mode>('fixe')
  const [cRythme, setCRythme] = useState<Rythme>('annuel')
  const [cCategorie, setCCategorie] = useState<Categorie>('autre')
  /* La date de départ. C'était le seul champ que le formulaire d'ajout signale
     comme dangereux — « remonte la date, sinon le relevé annuel tombera d'un
     coup » — et le seul qu'on ne pouvait plus toucher ensuite. */
  const [cDebut, setCDebut] = useState('')
  /* Une charge mise de côté qui a une histoire ne devient pas mensuelle : on le
     sait AVANT, pour griser les trois autres façons (§ 3.7). Un seul panneau de
     correction est ouvert à la fois : une seule lecture. */
  const enCorrection = (charges.data ?? []).find(c => c.id === corrigeOuvert)
  const histoire = useAUneHistoire(corrigeOuvert ?? '', enCorrection?.mode === 'mis_de_cote')
  const bloque = enCorrection?.mode === 'mis_de_cote' && histoire.data === true
  /* Le compte commun, pour la dictée : elle ne demande pas où débiter, et une
     charge sans compte ne produit pas de virement. */
  const compteParDefaut = (comptes.data ?? [])
    .find(c => c.genre === 'commun')?.id ?? (comptes.data ?? [])[0]?.id ?? null

  const membres = (foyer?.membres ?? []).map(m => ({ id: m.id, display_name: m.display_name }))
  const prenoms = new Map(membres.map(m => [m.id, prenomDe(m.display_name)]))

  /* La dictée pose les lignes une à une, par la même mutation que le
     formulaire : elle n'a aucun chemin d'écriture à elle. Ce qu'un modèle
     propose entre par la même porte que ce qu'on tape. */
  if (dictee) {
    return (
      <Dictee retour={() => setDictee(false)} surRetenues={async lignes => {
        /* ⚠️ Cette promesse était lancée sans être attendue ni rattrapée : un
           libellé trop long ou un montant démesuré faisait lever `ou()`, la
           promesse partait au néant, l'écran ne bougeait pas, et le lot restait
           à moitié écrit sans un mot. On compte ce qui est passé, et on dit ce
           qui a échoué. */
        let posees = 0
        /* Une ligne sans montant n'entre PAS à zéro : le formulaire manuel
           refuse zéro, et il n'y a aucune raison qu'une dictée l'accepte. Elles
           sont écartées avant l'écriture, et l'écran de revue les montre
           décochées. */
        for (const l of lignes.filter(x => x.montant_cents && x.montant_cents > 0)) {
          const article = catalogue.flatMap(s => s.lignes).find(k => k.libelle === l.catalogue_libelle)
          try {
            await ajouteUne.mutateAsync({
            libelle: l.libelle.slice(0, 80),
            montantCents: l.montant_cents!,
            periodicite: l.periodicite,
            participants: l.portee === 'commun' ? membres.map(m => m.id) : [userId],
            commun: l.portee === 'commun',
            /* Une ligne du catalogue dit sa façon, comme à l'ajout à la main
               (§ 3.7) : des Courses dictées se dépensent au fil du mois. Sans
               article, la base la déduit de `variable` et de la périodicité,
               comme pour l'ancien paquet. La catégorie, elle, vient de
               l'article par la base (0096). */
            ...(article
              ? { mode: modeDeLArticle({ periode: l.periodicite, plafond_ordre: article.plafond_ordre,
                                          libelle: article.libelle }), variable: false }
              : { variable: l.variable }),
            compteId: compteParDefaut,
            /* Le modèle DÉSIGNE une ligne du catalogue, et on la jetait : un
               tiers de son prompt travaillait pour rien, et toute charge dictée
               arrivait détachée du référentiel. */
            catalogueId: article?.id ?? null,
            foyerId: foyer?.id ?? '',
            /* Une charge non mensuelle dictée en septembre ne provisionnait que
               les mois restants, et sa régularisation réclamait l'année entière
               d'un coup — 1 329 € au lieu de 362 € pour une taxe foncière. La
               dictée demande désormais depuis quand. */
            debut: l.debut,
            })
            posees++
          } catch (e) {
            setDit(`${posees} charge${posees > 1 ? 's' : ''} ajoutée${posees > 1 ? 's' : ''}, `
              + `puis « ${l.libelle} » a été refusée : ${(e as Error).message}`)
            setDictee(false)
            return
          }
        }
        setDit(`${posees} charge${posees > 1 ? 's' : ''} ajoutée${posees > 1 ? 's' : ''}.`)
        setDictee(false)
      }} />
    )
  }

  if (ajout !== undefined) {
    return (
      <main className="min-h-dvh px-6 pt-14 pb-40">
        <div className="mx-auto w-full max-w-lg">
          <button onClick={() => setAjout(undefined)}
                  className="inline-flex items-center gap-2 min-h-11 -mt-3 text-[15px] text-doux">
            <span aria-hidden="true">‹</span> Les charges
          </button>
          <h1 className="titre text-[32px] mt-6">
            {ajout?.libelle || 'Une charge de plus'}
          </h1>
          <Ajout depart={ajout} membres={membres} moi={userId}
                 foyerId={foyer?.id ?? ''}
                 comptes={comptes.data ?? []}
                 surFini={() => setAjout(undefined)} />
        </div>
      </main>
    )
  }

  const vivantes = (charges.data ?? []).filter(c => !c.archive_le)
  const vues = vivantes.filter(c =>
    filtre === 'tout' ? true
    : filtre === 'commun' ? c.participants.length > 1
    : c.participants.length === 1 && c.participants[0] === userId)

  /* Une recherche insensible à la casse ET aux accents : personne ne tape
     « électricité » avec son accent sur un clavier de téléphone. */
  const sansAccent = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = sansAccent(cherche.trim())
  const vuesCatalogue = q === ''
    ? catalogue
    : catalogue
        .map(s => ({ ...s, lignes: s.lignes.filter(l => sansAccent(l.libelle).includes(q)) }))
        .filter(s => s.lignes.length > 0)

  const parMois = (c: Charge) =>
    c.periodicite === 'mensuel' ? c.montant_cents
    : c.periodicite === 'annuel' ? Math.round(c.montant_cents / 12)
    : Math.round(c.montant_cents / 3)
  const total = vues.reduce((s, c) => s + parMois(c), 0)
  /* Ce que le MOIS ne demandera pas de virer : une charge qu'on paie depuis son
     propre compte ne crée pas de dette — `virements()` l'écarte, à raison.
     Mais les deux écrans affichaient alors deux totaux différents sans qu'un
     mot ne l'explique : 2 964 € ici, 2 878 € là, et on cherche l'erreur. */
  const sienPropre = new Set((comptes.data ?? [])
    .filter(c => c.genre === 'perso' && c.titulaire_id === userId).map(c => c.id))
  const avance = vues
    .filter(c => c.compte_id && sienPropre.has(c.compte_id)
                 && c.participants.length === 1 && c.participants[0] === userId)
    .reduce((s, c) => s + parMois(c), 0)

  /* « Retirer » (0111). Une saisie ne part pas sans qu'on l'ait vue : la base
     refuse d'abord avec le total, l'écran le demande, puis rappelle. */
  const retirer = (c: Charge, avecLesSaisies = false) => retire.mutate({ id: c.id, avecLesSaisies }, {
    onSuccess: r => {
      const suite = suiteDuRetrait(r, c.libelle, confirm)
      if ('rappeler' in suite) retirer(c, true)
      else if ('dit' in suite) setDit(suite.dit)
    },
  })

  /* Enregistrer une correction. L'argent passe par `corrige_la_charge`, qui
     refait les mois ; la catégorie, par un simple `update`, qui ne touche aucun
     montant (§ 4.1). Une catégorie seule n'appelle pas la première : « 0 mois
     refait » aurait laissé croire qu'on avait corrigé l'argent. */
  const enregistre = (c: Charge, cents: number) => {
    const periodicite = periodiciteDeLaFacon(cMode, cRythme)
    const debut = cDebut || c.debut
    const { argent, categorie } = ceQuiChange(c, {
      libelle: cLibelle, cents, mode: cMode, periodicite, debut, categorie: cCategorie })
    if (!argent && !categorie) { setCorrigeOuvert(null); return }
    const range = (texte: string) => {
      const fini = () => { setCorrigeOuvert(null); setDit(texte) }
      if (!categorie) fini()
      else changeCategorie.mutate({ id: c.id, categorie: cCategorie }, { onSuccess: fini })
    }
    if (!argent) {
      range(`« ${c.libelle} » rangée dans ${infoCategorie(cCategorie).nom}.`)
      return
    }
    corrige.mutate({ id: c.id, libelle: cLibelle.trim(), montantCents: cents, periodicite, debut,
                     mode: cMode }, {
      onSuccess: n => range(ditLaCorrection(cLibelle.trim(), n)),
    })
  }

  /* Elles disparaissent le 31 décembre de l'année qui suit leur retrait (§ 3.7). */
  const retirees = retireesEncoreAReg(charges.data ?? [], maintenant().getFullYear())

  return (
    <main className="min-h-dvh px-6 pt-14 pb-16">
      <div className="mx-auto w-full max-w-lg">
        <button onClick={retour}
                className="inline-flex items-center gap-2 min-h-11 -mt-3 text-[15px] text-doux">
          <span aria-hidden="true">‹</span> Le mois
        </button>

        <h1 className="titre text-[34px] mt-6">Les charges</h1>

        <div role="group" aria-label="Filtrer" className="mt-5 flex gap-2">
          {([['tout', 'Tout'], ['commun', 'En commun'], ['moi', 'À moi']] as const).map(([v, nom]) => (
            <button key={v} aria-pressed={filtre === v} onClick={() => setFiltre(v)}
                    className={`px-4 min-h-11 inline-flex items-center rounded-full text-[14px]
                                transition-colors
                      ${filtre === v ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
              {nom}
            </button>
          ))}
        </div>

        <p className="mt-4 text-[15px] text-doux">
          {euros(total)} par mois {filtre === 'moi' ? 'pour toi' : 'pour le foyer'},
          {' '}une fois tout ramené au mois.
          {avance > 0 && (
            <>
              {' '}Dont {euros(avance)} que tu paies depuis ton propre compte :
              le mois ne te demandera pas de te les virer à toi-même.
            </>
          )}
        </p>

        {/* La relecture est UNE PORTE, pas un écran : elle se lance d'ici, au
            pied de la liste qu'elle relit, et rend ses constats au même endroit.
            Elle ne s'affiche qu'avec des charges à relire — sur une liste vide
            elle ne pourrait que répondre « il n'y a rien ». */}
        {(charges.data ?? []).length > 0 && (
          <RevueCharges surOubli={libelle => {
            /* ⚠️ On retrouve la LIGNE DU CATALOGUE, on ne fabrique pas un
               départ à partir du seul libellé : sans `catalogueId`, la charge
               créée serait détachée du référentiel, et sans `periode` ni
               `portee` elle repartirait sur « mensuel / commun » quoi qu'elle
               soit. Le serveur garantit déjà que le libellé vient du catalogue
               — si on ne le retrouve pas, on ouvre quand même, vide plutôt que
               faux. */
            const sec = catalogue.find(s => s.lignes.some(x => x.libelle === libelle))
            const l = sec?.lignes.find(x => x.libelle === libelle)
            setAjout(sec && l
              ? { libelle: l.libelle, periode: l.periode, portee: l.portee,
                  precision: l.precision_txt, catalogueId: l.id,
                  section: sec.nom, plafondOrdre: l.plafond_ordre }
              : { libelle, periode: 'mensuel', portee: 'commun',
                  precision: null, catalogueId: null })
          }} />
        )}

        {/* ⚠️ SEULEMENT l'erreur de CHARGEMENT ici.
            Celles des GESTES descendent sur la ligne qui les a produites. Un
            refus affiché en tête de page, quatre écrans au-dessus du bouton
            qu'on vient de toucher, ne se voit pas : on croit que rien ne s'est
            passé, et on retouche. Vu sur une capture — après avoir cru le
            problème réglé en câblant ce bandeau le matin même. */}
        <Erreur de={charges.error} />
        {dit && <p className="mt-3 text-[15px] text-doux">{dit}</p>}
        {charges.isPending ? <Attente /> : vues.length === 0 ? (
          <Vide titre="Rien encore"
                texte="Ajoute-les depuis le catalogue : on ne se souvient pas de ses charges, on les reconnaît." />
        ) : (
          <Surface className="mt-4">
            {vues.map((c, i) => (
              <div key={c.id}
                   className={`py-4 ${i < vues.length - 1 ? 'border-b border-brume' : ''}`}>
                {/* ⚠️ Le libellé SEUL sur sa ligne, les actions en dessous.
                    Elles étaient à droite du nom : une ligne portant
                    « Rattacher », « Corriger » ET « Retirer » dépassait la
                    largeur du téléphone, et « Retirer » était coupé au bord de
                    la carte. Les faire déborder l'une après l'autre était pire
                    — trois boutons empilés, chacun sur sa ligne, et plus aucun
                    alignement. Une rangée à part tient quel que soit le nombre
                    d'actions et la longueur du nom, et c'est ce qui se touche
                    au pouce. Vu sur la seule capture à DEUX personnes. */}
                <div>
                <span className="block">
                  <span className="block text-[16px]">{c.libelle}</span>
                  <span className="block mt-0.5 text-[14px] text-doux">
                    {euros(c.montant_cents)} {PERIODE[c.periodicite]}
                    {' · '}
                    {c.participants.length > 1
                      ? c.participants.map(u => prenoms.get(u) ?? '?').join(' et ')
                      /* Zéro participant est un état atteignable — on peut tous
                         se décocher — et il se lisait « personne seul ». */
                      : c.participants.length === 0
                        ? 'personne n’y participe'
                        : (prenoms.get(c.participants[0]) ?? '?') + ' seul'}
                    {c.cle === 'moitie' && ' · moitié-moitié'}
                    {c.cle === 'prorata' && ' · au prorata'}
                    {sousTitreDeLaFacon(c)}
                    {!c.compte_id && ' · sans compte'}
                    {/* « en attente du foyer » ne dit pas ce qui est attendu.
                        C'est une charge marquée commune alors qu'on est encore
                        seul : elle attend quelqu'un. */}
                    {c.commun && c.participants.length === 1
                      && ' · partagée dès que quelqu’un arrive'}
                    {/* Le foyer partage tout : chacun peut corriger la ligne de
                        l'autre, et c'est voulu. Mais une correction silencieuse
                        sur la ligne de quelqu'un d'autre est une surprise. On ne
                        verrouille pas, on dit qui. */}
                    {c.modifie_par && c.modifie_par !== userId
                      && ` · ✎ ${prenoms.get(c.modifie_par) ?? 'quelqu’un'}`}
                  </span>
                </span>
                <div className="mt-1 flex items-center gap-1 flex-wrap -ml-2">
                {/* Une charge sans histoire est réellement SUPPRIMÉE, une autre
                    archivée — et les deux disparaissaient de la liste sans un
                    mot. Un pouce qui glisse ne doit pas effacer une ligne. */}
                {/* Rattacher après coup : une charge née de la dictée, ou
                    d'avant que le formulaire ne demande le compte, n'avait
                    aucun moyen d'en recevoir un — et sans compte, elle ne
                    produit pas de virement. */}
                {!c.compte_id && comptes.data && comptes.data.length > 0 && (
                  <button onClick={() => rattache.mutate({
                            id: c.id,
                            compteId: comptes.data!.find(x => x.genre === 'commun')?.id
                              ?? comptes.data![0].id,
                          })}
                          className="min-h-11 px-2 text-[14px]"
                          style={{ color: 'var(--color-ocre)' }}>
                    Rattacher
                  </button>
                )}
                {/* Corriger. Sans ce bouton, 11 200 € tapés au lieu de 1 120 €
                    restaient dans le mois pour toujours : « Retirer » échoue
                    sur la clé étrangère et retombe sur l'archivage, et reposer
                    la charge juste ajoutait la bonne par-dessus la fausse. */}
                <button onClick={() => {
                          setCorrigeOuvert(o => (o === c.id ? null : c.id))
                          setCLibelle(c.libelle)
                          setCMontant(String(c.montant_cents / 100).replace('.', ','))
                          setCMode(c.mode)
                          setCRythme(c.periodicite === 'trimestriel' ? 'trimestriel' : 'annuel')
                          setCCategorie(c.categorie)
                          setCDebut(c.debut)
                        }}
                        aria-label={`Corriger ${c.libelle}`}
                        aria-expanded={corrigeOuvert === c.id}
                        className="text-herbe min-h-11 px-2 text-[14px]">Corriger</button>
                <button onClick={() => {
                          if (!confirm(`Retirer « ${c.libelle} » ? Elle disparaîtra de tous les mois.`)) return
                          retirer(c)
                        }}
                        disabled={retire.isPending}
                        aria-label={`Retirer ${c.libelle}`}
                        className="text-doux min-h-11 px-2 text-[14px]">Retirer</button>
                {/* Qui participe se change APRÈS COUP. Sans ça, inviter quelqu'un
                    une fois les charges posées obligeait à toutes les refaire.
                    Sa place est ici, avec les autres actions de la ligne. */}
                {membres.length > 1 && quiOuvert !== c.id && (
                  <button onClick={() => setQuiOuvert(c.id)}
                          className="min-h-11 px-2 text-[14px] text-herbe">
                    Changer qui participe
                  </button>
                )}
                </div>
                </div>

                {corrigeOuvert === c.id && (() => {
                  /* Les mêmes règles que l'ajout : le plafond de 1 000 000 €, et un départ
                     vidé ne part pas comme « -01 ». */
                  const { pret, cents, refusMontant, refusDebut } = peutCorriger({
                    libelle: cLibelle, montant: cMontant, mode: cMode, debut: cDebut,
                    garde: c.debut, plancher: plancherDuDebut(maintenant()) })
                  return (
                    <div className="mt-3 rounded-[14px] border border-brume p-3 space-y-3">
                      <label className="block">
                        <span className="text-[14px] text-doux">Son nom</span>
                        <input value={cLibelle} onChange={e => setCLibelle(e.target.value)}
                               className="mt-1 w-full min-h-11 rounded-[12px] border border-brume
                                          bg-surface px-3 text-[16px]" />
                      </label>
                      <label className="block">
                        <span className="text-[14px] text-doux">Son montant</span>
                        <span className="mt-1 flex items-center gap-2">
                          <input value={cMontant} inputMode="decimal"
                                 onChange={e => setCMontant(e.target.value)}
                                 aria-label={`Montant de ${c.libelle}`}
                                 className="w-32 min-h-11 rounded-[12px] border border-brume
                                            bg-surface px-3 text-[16px]" />
                          <span className="text-[15px] text-doux">€</span>
                        </span>
                        {refusMontant && cMontant.trim() !== '' && (
                          <span role="alert" className="mt-1 block text-[14px]"
                                style={{ color: 'var(--color-ocre)' }}>{refusMontant}</span>
                        )}
                      </label>
                      <ChoixCategorie valeur={cCategorie} choisir={setCCategorie}
                                      nom={`Catégorie de ${c.libelle}`} />
                      <ChoixFacon mode={cMode} rythme={cRythme} bloque={bloque}
                                  nom={`Comment se paie ${c.libelle}`}
                                  choisir={(m, r) => { setCMode(m); setCRythme(r) }} />
                      {cMode === 'mis_de_cote' && (
                        <label className="block">
                          <span className="text-[14px] text-doux">Elle court depuis</span>
                          <input type="month" value={cDebut.slice(0, 7)}
                                 aria-label={`Depuis quand court ${c.libelle}`}
                                 onChange={e => setCDebut(debutDuChamp(e.target.value))}
                                 className="mt-1 min-h-11 rounded-[12px] border border-brume
                                            bg-surface px-3 text-[16px]" />
                          {refusDebut && (
                            <span role="alert" className="mt-1 block text-[14px]"
                                  style={{ color: 'var(--color-ocre)' }}>{refusDebut}</span>
                          )}
                          <span className="mt-1 block text-[14px] text-doux">
                            C’est elle qui décide sur combien de mois le montant
                            se répartit.
                          </span>
                        </label>
                      )}
                      {/* Ce que ça touche, dit AVANT : un mois confirmé garde ce
                          qu'on a réellement payé, il ne se réécrit pas. */}
                      <p className="text-[14px] text-doux">
                        Les mois déjà confirmés gardent leur montant. Les autres
                        se refont.
                      </p>
                      <Erreur de={(corrige.variables?.id === c.id ? corrige.error : null)
                                  ?? (changeCategorie.variables?.id === c.id ? changeCategorie.error : null)} />
                      <div className="flex gap-2">
                        <button disabled={!pret || corrige.isPending || changeCategorie.isPending}
                                onClick={() => enregistre(c, cents ?? 0)}
                                className="px-4 min-h-11 rounded-[12px] bg-herbe text-fond
                                           text-[15px] disabled:opacity-40">
                          {corrige.isPending ? 'Je corrige…' : 'Enregistrer'}
                        </button>
                        <button onClick={() => setCorrigeOuvert(null)}
                                className="px-3 min-h-11 text-[15px] text-doux">Annuler</button>
                      </div>
                    </div>
                  )
                })()}

                {/* Chaque mutation ne montre son échec QUE sur sa propre ligne :
                    `variables` dit laquelle l'a déclenchée. Sans ce filtre, un
                    refus sur une charge s'afficherait sous les cinq autres. */}
                <Erreur de={
                  (retire.error && retire.variables?.id === c.id && retire.error) ||
                  (rattache.error && rattache.variables?.id === c.id && rattache.error) ||
                  (majQui.error && majQui.variables?.chargeId === c.id && majQui.error) ||
                  null} />

                {membres.length > 1 && quiOuvert === c.id && (
                    <div className="mt-2 flex gap-2 flex-wrap items-center">
                      {membres.map(m => {
                        const dedans = c.participants.includes(m.id)
                        return (
                          <button key={m.id} role="checkbox" aria-checked={dedans}
                                  disabled={majQui.isPending}
                                  onClick={() => majQui.mutate({
                                    chargeId: c.id, foyerId: foyer?.id ?? '',
                                    participants: dedans
                                      ? c.participants.filter(x => x !== m.id)
                                      : [...c.participants, m.id],
                                  })}
                                  className={`px-3.5 min-h-11 inline-flex items-center rounded-full
                                              text-[14px] transition-colors
                                    ${dedans ? 'bg-herbe text-fond' : 'bg-brume/50 text-encre'}`}>
                            {prenomDe(m.display_name)}
                          </button>
                        )
                      })}
                      <button onClick={() => setQuiOuvert(null)}
                              className="min-h-11 px-2 text-[14px] text-doux">Fermer</button>
                    </div>
                )}
              </div>
            ))}
          </Surface>
        )}

        {/* « Retirées, encore à régler » (§ 3.7) : une charge mise de côté retirée
            garde sa feuille jusqu'au 31 décembre de l'année qui suit son retrait.
            La facture d'une maison vendue arrive souvent après — la régularisation
            de copropriété votée en avril. « Retirer » a emporté ses lignes des
            mois ouverts : sans ce chemin, la feuille ne s'ouvrirait plus. */}
        {retirees.length > 0 && (
          <>
            <h2 className="mt-10 text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
              Retirées, encore à régler
            </h2>
            <Surface className="mt-3">
              {retirees.map(c => <Retiree key={c.id} charge={c} ouvrir={() => setFeuille(c)} />)}
            </Surface>
          </>
        )}
        {feuille && <FeuilleMiseDeCote charge={feuille} fermer={() => setFeuille(null)} />}

        <button onClick={() => setDictee(true)}
                className="mt-8 w-full min-h-[58px] rounded-[18px] bg-encre text-fond
                           text-[16px] font-medium">
          Dicte tout, je range
        </button>
        <p className="mt-2 text-center text-[14px] text-doux">
          Plus rapide que cocher cinquante lignes — et ça te dit ce que tu as oublié.
        </p>

        <h2 className="mt-10 text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
          Ou une par une
        </h2>
        <label className="mt-3 block">
          <span className="sr-only">Chercher une charge</span>
          <input value={cherche} onChange={e => setCherche(e.target.value)}
                 placeholder="Chercher — « assurance », « mobile »…"
                 className="w-full min-h-11 rounded-[14px] border border-brume bg-surface
                            px-4 text-[16px] placeholder:text-doux" />
        </label>
        <div className="mt-4 space-y-6">
          {vuesCatalogue.length === 0 && cherche.trim() !== '' && (
            <p className="text-[15px] text-doux">
              Rien sous ce nom. Prends « Autre chose » plus bas, le catalogue
              n’enferme personne.
            </p>
          )}
          {vuesCatalogue.map(section => (
            <div key={section.nom}>
              <p className="text-[15px] font-semibold">{section.nom}</p>
              <div className="mt-2 flex gap-2 flex-wrap">
                {section.lignes.map(l => (
                  <button key={l.id}
                          onClick={() => setAjout({
                            libelle: l.libelle, periode: l.periode, portee: l.portee,
                            precision: l.precision_txt, catalogueId: l.id,
                            section: section.nom, plafondOrdre: l.plafond_ordre,
                          })}
                          className="px-3.5 min-h-11 inline-flex items-center rounded-full
                                     border border-brume text-[14px] hover:bg-brume/40
                                     transition-colors">
                    {l.libelle}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {/* ⚠️ `portee: 'perso'`, pas `'commun'`.
              « Autre chose » pré-cochait « Elle se partagera avec le foyer » :
              une charge inventée pour soi seul entrait donc automatiquement
              dans le budget de l'autre à son arrivée, sans que rien ne l'ait
              demandé. Le catalogue, lui, sait ce que chaque poste vaut — c'est
              la ligne LIBRE, celle dont on ne sait rien, qui doit demander. */}
          <button onClick={() => setAjout({
                    libelle: '', periode: 'mensuel', portee: 'perso',
                    precision: null, catalogueId: null })}
                  className="w-full min-h-11 rounded-[14px] border border-dashed border-brume
                             text-[15px] text-doux">
            Autre chose
          </button>
        </div>
      </div>
    </main>
  )
}
