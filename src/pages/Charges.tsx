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
import { Attente, Erreur, Vide } from '../ui/coque.tsx'
import { useFoyer, prenomDe } from '../lib/donnees/foyer.ts'
import {
  useCharges, useCatalogue, useAjouteCharge, useComptes, euros, moisDe, type Charge,
} from '../lib/donnees/budget.ts'
import { categorieDeLArticle, modeDeLArticle, type Categorie, type Mode } from '../lib/budget/categories.ts'
import { communeDeLaCharge, enVigueur, phraseDuTotal, debutDuChamp, peutPoser, periodiciteDeLaFacon,
         plancherDuDebut, retireesEncoreAReg, type Rythme } from '../lib/budget/charges.ts'
import {
  comptesDesFiltres, duFiltre, phraseDeLArrivee, rangeParCategorie, totalDuMois, type Filtre,
} from '../lib/budget/charges-liste.ts'
import { moisDeDepart, nomDuMois } from '../lib/budget/mois.ts'
import { maintenant } from '../lib/horloge.ts'
import { FeuilleMiseDeCote } from '../ui/budget/FeuilleMiseDeCote.tsx'
import { Catalogue, type Depart } from '../ui/charges/Catalogue.tsx'
import { CategorieDeCharges } from '../ui/charges/Categorie.tsx'
import { CHAMP, CHOISIE, ChoixCategorie, ChoixFacon, FILET, PILULE, Titre } from '../ui/charges/Choix.tsx'
import { EnTete } from '../ui/charges/EnTete.tsx'
import { useGestes } from '../ui/charges/gestes.ts'
import { Coche, Micro } from '../ui/charges/icones.tsx'
import { LigneDeCharge } from '../ui/charges/LigneDeCharge.tsx'
import { Retirees } from '../ui/charges/Retirees.tsx'
import { Total } from '../ui/charges/Total.tsx'

const CARTE = 'rounded-[24px] bg-surface p-4 shadow-carte min-[900px]:rounded-[26px] min-[900px]:p-[22px]'
const BOUTON_PLEIN = `w-full min-h-[54px] rounded-[18px] bg-herbe text-fond text-[17px] font-semibold
                      disabled:bg-brume disabled:text-encre transition-colors`

/** Le formulaire d'ajout, qu'il vienne du catalogue ou d'une ligne inventée. */
export function Ajout({ depart, membres, moi, foyerId, comptes, surFini }: {
  depart: Depart | null
  membres: { id: string; display_name: string; entre_le?: string | null }[]
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
  /* Arrivée à venir : la charge court depuis le mois d'arrivée (`moisDeDepart`), pas depuis aujourd'hui —
     sinon elle ouvrirait le mois courant, qui n'est pas encore celui de qui entre le mois prochain. */
  const [debut, setDebut] = useState<string>(
    moisDeDepart(membres.find(m => m.id === moi)?.entre_le, moisDe()))
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
  const { pret, cents, refusMontant, refusDebut, refusLibelle } = peutPoser({
    libelle, montant, qui: qui.length, debut, plancher })

  return (
    <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 min-[900px]:grid-cols-2 min-[900px]:items-start min-[900px]:gap-5">
      <div className={`${CARTE} grid grid-cols-[minmax(0,1fr)] gap-[18px]`}>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <label htmlFor="quoi-charge" className="text-[14px] font-semibold">Quoi</label>
          <input id="quoi-charge" value={libelle} onChange={e => setLibelle(e.target.value)} className={CHAMP} />
          {refusLibelle && <p role="alert" className="text-[14px] font-semibold text-groseille">{refusLibelle}</p>}
          {depart?.precision && <p className="text-[13.5px] leading-snug text-doux">{depart.precision}</p>}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <label htmlFor="combien-charge" className="text-[14px] font-semibold">Combien (€)</label>
          <span className="flex items-center gap-2">
            <input id="combien-charge" type="text" inputMode="decimal" value={montant}
                   onChange={e => setMontant(e.target.value)}
                   className={`${CHAMP} max-w-[150px] font-titre text-[20px] font-semibold`} />
            <span aria-hidden="true" className="text-[15px] text-doux">€</span>
          </span>
          {refusMontant && <p role="alert" className="text-[14px] font-semibold text-groseille">{refusMontant}</p>}
        </div>

        <ChoixCategorie valeur={categorie} choisir={setCategorie} nom="Catégorie" />
        <div>
          <ChoixFacon mode={mode} rythme={rythme} nom="Comment elle se paie"
                      choisir={(m, r) => { setMode(m); setRythme(r) }} />
          {mode === 'mis_de_cote' && (
            <p className="mt-2 text-[14px] text-doux">
              On en met de côté le {rythme === 'annuel' ? 'douzième' : 'tiers'} chaque mois :
              {' '}{euros(Math.round((cents ?? 0) / (rythme === 'annuel' ? 12 : 3)))} par mois.
            </p>
          )}
        </div>
      </div>

      <div className={`${CARTE} grid grid-cols-[minmax(0,1fr)] gap-[18px]`}>
        <div>
          <Titre>Qui participe</Titre>
          <div className="flex gap-2 flex-wrap">
            {membres.map(m => {
              const dedans = qui.includes(m.id)
              return (
                <button key={m.id} type="button" role="checkbox" aria-checked={dedans}
                        onClick={() => setQui(l => dedans ? l.filter(x => x !== m.id) : [...l, m.id])}
                        className={`${PILULE} ${dedans ? 'bg-herbe text-fond' : FILET}`}>
                  {dedans && <Coche />}{prenomDe(m.display_name)}
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
              <button type="button" role="checkbox" aria-checked={commune} onClick={() => setCommune(c => !c)}
                      className="mt-3 flex items-center gap-3 min-h-11 text-left">
                <span className={`w-[22px] h-[22px] rounded-[7px] border-2 shrink-0
                                  ${commune ? 'bg-herbe border-herbe' : 'border-doux'}`} />
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
            <Titre>Comment la partager</Titre>
            <div role="radiogroup" aria-label="Clé de répartition" className="grid grid-cols-3 gap-2">
              {([['defaut', 'Comme le foyer'], ['prorata', 'Au prorata'], ['moitie', 'Moitié-moitié']] as const).map(([v, nom]) => (
                <button key={v} type="button" role="radio" aria-checked={cle === v} onClick={() => setCle(v)}
                        className={`min-h-11 px-2 py-1.5 rounded-[14px] text-[14px] font-medium leading-tight text-center
                                    transition-colors ${cle === v ? CHOISIE : FILET}`}>
                  {nom}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <label className="text-[14px] font-semibold" htmlFor="debut-charge">Elle court depuis</label>
          <input id="debut-charge" type="month" value={debut.slice(0, 7)}
                 /* Pas avant janvier de l'année précédente : la base refuse (0096). */
                 min={plancher.slice(0, 7)}
                 onChange={e => setDebut(debutDuChamp(e.target.value))} className={CHAMP} />
          {refusDebut && <p role="alert" className="text-[14px] font-semibold text-groseille">{refusDebut}</p>}
          {periode !== 'mensuel' && debut.slice(0, 4) === String(maintenant().getFullYear())
            && Number(debut.slice(5, 7)) > 1 && (
            <p className="text-[14px] text-ocre">
              On ne mettra de côté qu’à partir de ce mois-là. Si tu la paies
              depuis janvier, remonte la date — sinon la facture annuelle tombera
              d’un coup.
            </p>
          )}
        </div>

        {comptes.length > 0 && (
          <div>
            <Titre>Payée depuis</Titre>
            <div role="radiogroup" aria-label="Compte débité" className="flex gap-2 flex-wrap">
              {comptes.map(c => (
                <button key={c.id} type="button" role="radio" aria-checked={compteId === c.id}
                        onClick={() => setCompteId(c.id)}
                        className={`${PILULE} ${compteId === c.id ? CHOISIE : FILET}`}>
                  {c.nom}
                </button>
              ))}
            </div>
          </div>
        )}

        {comptes.length === 0 && (
          <p className="text-[15px] text-ocre">
            Aucun compte déclaré : cette charge apparaîtra sous « à répartir »
            au lieu d’un virement. Pose-les dans les réglages du budget.
          </p>
        )}

        <Erreur de={ajoute.error} />

        <button type="button" className={BOUTON_PLEIN} disabled={!pret || ajoute.isPending}
                onClick={() => ajoute.mutate({
                  libelle: libelle.trim(), montantCents: cents ?? 0, periodicite: periode,
                  /* La façon et la catégorie, dites. `variable` et l'enveloppe ne servent plus qu'à l'ancien
                     paquet (§ 4.1) : à faux et vide, le trigger de `charge` ne déduit rien par-dessus. */
                  mode, categorie, variable: false, enveloppeId: null,
                  participants: qui, cle: cle === 'defaut' ? null : cle,
                  catalogueId: depart?.catalogueId ?? null, foyerId,
                  compteId: compteId || null,
                  /* Commune dès que plus d'une personne y participe — ou que le catalogue le suggérait alors
                     qu'on est encore seul dans le foyer. C'est cette intention qui fera entrer le second
                     membre à son arrivée. */
                  commun: communeDeLaCharge({ qui: qui.length, membres: membres.length, intention: commune }),
                  debut, arrivee: membres.find(m => m.id === moi)?.entre_le,
                }, { onSuccess: surFini })}>
          {ajoute.isPending ? 'J’ajoute…' : 'Ajouter cette charge'}
        </button>
      </div>
    </div>
  )
}

/** Ce que le dernier geste annonce : sur la ligne `id` tant qu'elle est dans la liste, sinon en tête. */
type Annonce = { texte: string; id: string | null } | null

export function Charges({ userId, retour }: { userId: string; retour: () => void }) {
  const [filtre, setFiltre] = useState<Filtre>('tout')
  const [dictee, setDictee] = useState(false)
  const [dit, setAnnonce] = useState<Annonce>(null)
  const dis = (texte: string | null, id?: string) => setAnnonce(texte === null ? null : { texte, id: id ?? null })
  const [ajout, setAjout] = useState<Depart | undefined>()
  const { data: foyer } = useFoyer()
  const charges = useCharges()
  const { data: catalogue = [] } = useCatalogue()
  const ajouteUne = useAjouteCharge()
  const comptes = useComptes()
  /* La feuille d'une charge retirée qui attend encore une facture (§ 3.4). */
  const [feuille, setFeuille] = useState<Charge | null>(null)
  const g = useGestes({ charges: charges.data ?? [], dis })
  /* Le compte commun, pour la dictée : elle ne demande pas où débiter, et une
     charge sans compte ne produit pas de virement. */
  const compteParDefaut = (comptes.data ?? [])
    .find(c => c.genre === 'commun')?.id ?? (comptes.data ?? [])[0]?.id ?? null

  const membres = (foyer?.membres ?? []).map(m => ({ id: m.id, display_name: m.display_name, entre_le: m.entre_le }))
  const prenoms = new Map(membres.map(m => [m.id, prenomDe(m.display_name)]))
  const moi = membres.find(m => m.id === userId)

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
            debut: l.debut, arrivee: membres.find(m => m.id === userId)?.entre_le,
            })
            posees++
          } catch (e) {
            dis(`${posees} charge${posees > 1 ? 's' : ''} ajoutée${posees > 1 ? 's' : ''}, `
              + `puis « ${l.libelle} » a été refusée : ${(e as Error).message}`)
            setDictee(false)
            return
          }
        }
        dis(`${posees} charge${posees > 1 ? 's' : ''} ajoutée${posees > 1 ? 's' : ''}.`)
        setDictee(false)
      }} />
    )
  }


  if (ajout !== undefined) {
    return (
      <main className="min-h-dvh px-4 pb-16 min-[900px]:px-8 min-[900px]:pb-14">
        <div className="mx-auto w-full max-w-[1180px]">
          <EnTete userId={userId} retour={() => setAjout(undefined)} retourTexte="Les charges" />
          <h1 className="titre text-[34px] mt-3.5 leading-[1.05] min-[900px]:text-[46px]">
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
  const vues = duFiltre(vivantes, filtre, userId)
  const comptesDuFiltre = comptesDesFiltres(vivantes, userId)

  /* Avant son arrivée, l'écran se cale sur le MOIS D'ARRIVÉE, comme le hub : chaque ligne lisait 0 € et
     « commence en novembre », alors que tout est posé pour novembre. Le total, lui, ne compte que ce qui est en
     vigueur ce mois-là, comme l'écran du mois : une charge qui démarre en 2031 apparaît, avec sa date, hors du total. */
  const courant = moisDe()
  const mois = moisDeDepart(moi?.entre_le, courant)
  const avantLArrivee = mois > courant
  const groupes = rangeParCategorie(vues, mois)
  const total = totalDuMois(vues, mois)
  const enCours = vues.filter(c => enVigueur(c, mois))
  /* Ce que le MOIS ne demandera pas de virer : une charge qu'on paie depuis son
     propre compte ne crée pas de dette — `virements()` l'écarte, à raison.
     Mais les deux écrans affichaient alors deux totaux différents sans qu'un
     mot ne l'explique : 2 964 € ici, 2 878 € là, et on cherche l'erreur. */
  const sienPropre = new Set((comptes.data ?? [])
    .filter(c => c.genre === 'perso' && c.titulaire_id === userId).map(c => c.id))
  const avance = totalDuMois(enCours.filter(c => c.compte_id && sienPropre.has(c.compte_id)
    && c.participants.length === 1 && c.participants[0] === userId), mois)

  /* Rien ne s'affirme avant la lecture : « 0,00 € par mois » le temps du chargement n'était pas un total. */
  const lu = !charges.isPending && foyer !== undefined
  const phrase = phraseDuTotal({
    lu, total: euros(total), avance: avance > 0 ? euros(avance) : null, pourToi: filtre === 'moi',
  })
  const arrivee = phraseDeLArrivee({ avant: avantLArrivee, nomDuMois: nomDuMois(mois) })

  /* Elles disparaissent le 31 décembre de l'année qui suit leur retrait (§ 3.7). */
  const retirees = retireesEncoreAReg(charges.data ?? [], maintenant().getFullYear())
  const surUneLigne = dit?.id && vues.some(c => c.id === dit.id) ? dit.id : null

  return (
    <main className="min-h-dvh px-4 pb-16 min-[900px]:px-8 min-[900px]:pb-14">
      <div className="mx-auto w-full max-w-[1180px]">
        <EnTete userId={userId} retour={retour} retourTexte="Le mois" />
        <h1 className="titre text-[34px] mt-3.5 leading-[1.05] max-[360px]:text-[30px] min-[900px]:text-[46px]">
          Les charges
        </h1>

        {arrivee && (
          <p className="mt-3 rounded-2xl bg-sable px-3.5 py-3 text-[14.5px] leading-snug">{arrivee}</p>
        )}

        <div className="mt-[18px] grid grid-cols-[minmax(0,1fr)] gap-3 min-[900px]:grid-cols-[7fr_5fr] min-[900px]:items-start min-[900px]:gap-5">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 content-start min-w-0">
            {/* ⚠️ SEULEMENT l'erreur de CHARGEMENT ici.
                Celles des GESTES descendent sur la ligne qui les a produites. Un refus affiché en tête de page,
                quatre écrans au-dessus du bouton qu'on vient de toucher, ne se voit pas : on croit que rien ne
                s'est passé, et on retouche. */}
            <Erreur de={charges.error} />
            {dit && !surUneLigne && (
              <p role="status" className="rounded-2xl bg-frais-fond px-3.5 py-3 text-[14.5px] text-frais-encre">{dit.texte}</p>
            )}
            {!lu && !charges.error && <Attente />}
            {lu && (
              <>
                <Total total={total} phrase={phrase} groupes={groupes} pourToi={filtre === 'moi'} />

                <div role="group" aria-label="Filtrer" className="flex gap-2 flex-wrap">
                  {([['tout', 'Tout'], ['commun', 'En commun'], ['moi', 'À moi']] as const).map(([v, nom]) => (
                    <button key={v} type="button" aria-pressed={filtre === v} onClick={() => setFiltre(v)}
                            className={`${PILULE} ${filtre === v ? CHOISIE : 'bg-piste text-encre'}`}>
                      {nom}
                      <b className={`text-[13px] font-semibold tabular-nums ${filtre === v ? 'opacity-80' : ''}`}>
                        {comptesDuFiltre[v]}
                      </b>
                    </button>
                  ))}
                </div>

                {vues.length === 0 ? (
                  <Vide titre="Rien encore"
                        texte="Ajoute-les depuis le catalogue : on ne se souvient pas de ses charges, on les reconnaît." />
                ) : groupes.map(gr => (
                  <CategorieDeCharges key={gr.cle} cle={gr.cle} nom={gr.nom} clair={gr.clair}
                                      total={gr.total} nLignes={gr.lignes.length}>
                    {gr.lignes.map(c => (
                      <LigneDeCharge key={c.id} c={c} mois={mois} moi={userId} foyerId={foyer?.id ?? ''}
                                     membres={membres} prenoms={prenoms} comptes={comptes.data} g={g}
                                     dit={surUneLigne === c.id ? dit!.texte : null} />
                    ))}
                  </CategorieDeCharges>
                ))}
              </>
            )}

            <Retirees charges={retirees} ouvrir={setFeuille} />
            {feuille && <FeuilleMiseDeCote charge={feuille} fermer={() => setFeuille(null)} />}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 content-start min-w-0">
            {/* La relecture est UNE PORTE, pas un écran : elle se lance d'ici, au pied de la liste qu'elle relit, et
                rend ses constats au même endroit. Elle ne s'affiche qu'avec des charges à relire — sur une liste
                vide elle ne pourrait que répondre « il n'y a rien ». */}
            {(charges.data ?? []).length > 0 && (
              <RevueCharges surOubli={libelle => {
                /* ⚠️ On retrouve la LIGNE DU CATALOGUE, on ne fabrique pas un départ à partir du seul libellé :
                   sans `catalogueId`, la charge créée serait détachée du référentiel, et sans `periode` ni
                   `portee` elle repartirait sur « mensuel / commun » quoi qu'elle soit. Le serveur garantit déjà
                   que le libellé vient du catalogue — si on ne le retrouve pas, on ouvre quand même, vide plutôt
                   que faux. */
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

            <section aria-labelledby="dicte" className="rounded-[26px] bg-encre p-[18px] text-surface grid grid-cols-[minmax(0,1fr)] gap-3 sur-encre">
              <div className="flex items-center gap-3.5">
                <span aria-hidden="true" className="w-[52px] h-[52px] rounded-[18px] bg-safran text-encre grid place-items-center shrink-0">
                  <Micro taille={26} />
                </span>
                <div>
                  <h2 id="dicte" className="titre text-[21px] font-semibold">Dicte tout, je range</h2>
                  <p className="mt-0.5 text-[14px] leading-snug text-[#D5DDD7]">
                    Plus rapide que cocher cinquante lignes, et ça te dit ce que tu as oublié.
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setDictee(true)}
                      className="w-full min-h-[54px] rounded-[18px] bg-safran text-encre text-[17px] font-bold
                                 inline-flex items-center justify-center gap-2">
                <Micro />Dicter mes charges
              </button>
            </section>

            <Catalogue catalogue={catalogue} choisit={setAjout} />
          </div>
        </div>
      </div>
    </main>
  )
}
