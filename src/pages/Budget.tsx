/**
 * Le budget : le mois.
 *
 * Deux sections, dans cet ordre, et l'ordre est le message.
 *
 *  · LES VIREMENTS d'abord. C'est la seule chose sur laquelle on peut agir
 *    aujourd'hui — un solde abstrait ne se fait pas, un virement si.
 *  · LES ENVELOPPES ensuite, avec leur jauge. Une enveloppe dépassée s'affiche
 *    en OCRE, jamais en rouge : une dette entre deux personnes qui s'aiment
 *    n'est pas une erreur.
 *
 * L'ouverture du mois est paresseuse — il n'y a pas de tâche planifiée, donc
 * c'est cette lecture qui la déclenche, et `ouvre_le_mois` est idempotente.
 */
import { useState } from 'react'
import { Marque, Surface, Vide, Attente, Erreur } from '../ui/coque.tsx'
import { Champ } from '../ui/kit.tsx'
import { useFoyer } from '../lib/donnees/foyer.ts'
import {
  useMois, useEnveloppes, useComptes, useCharges, virements, moisDe, euros,
  enCentimes, useRegularise, useRegulariseAnnuel, useProvisionsDe, useExcedent,
  cestLHeureDuReleve, JOUR_DU_RELEVE, useRegleLeMois, type Depense,
} from '../lib/donnees/budget.ts'

/**
 * Le relevé annuel.
 *
 * La taxe foncière a été provisionnée au douzième toute l'année ; en septembre
 * le vrai montant arrive. On ne l'impute pas au mois courant — ce serait
 * facturer 1450 € en octobre — mais on pose l'ÉCART, réparti selon ce que
 * chacun a porté sur l'année.
 */
function ReleveAnnuel({ charge, annees }: {
  charge: { id: string; libelle: string; periodicite: string }; annees: number[]
}) {
  /* ⚠️ L'ANNÉE SE CHOISIT.
   *
   *    La première version prenait l'année du mois affiché : en janvier 2027
   *    elle proposait « le relevé 2027 », provisionné d'un seul douzième, et
   *    saisir 1450 € facturait 1329 € d'un coup. Pire, le relevé de l'année
   *    écoulée devenait insaisissable dès le 1er janvier. */
  const [annee, setAnnee] = useState(annees[0])
  const [reel, setReel] = useState('')
  const provisions = useProvisionsDe(charge.id, annee)
  const regularise = useRegulariseAnnuel()
  const cents = enCentimes(reel)
  const provisionne = provisions.data?.total ?? 0
  const ecart = cents === null ? null : cents - provisionne

  return (
    <div className="py-4 border-b border-brume last:border-0">
      <div className="flex items-baseline justify-between">
        <span className="text-[16px]">{charge.libelle}</span>
        <span className="text-[15px] text-doux">
          provisionné {euros(provisionne)} en {annee}
        </span>
      </div>
      {annees.length > 1 && (
        <div role="radiogroup" aria-label="Année" className="mt-2 flex gap-2">
          {annees.map(a => (
            <button key={a} role="radio" aria-checked={annee === a}
                    onClick={() => setAnnee(a)}
                    className={`px-4 min-h-11 inline-flex items-center rounded-full
                                text-[14px] transition-colors
                      ${annee === a ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
              {a}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2.5 flex gap-2 items-end">
        <div className="grow">
          {/* Une charge trimestrielle n'a pas de « relevé annuel » : elle en a
              quatre. On demande donc le TOTAL de l'année, ce qui vaut pour les
              deux périodicités. */}
          <Champ label={`Total payé en ${annee} (€)`} type="text" inputMode="decimal"
                 value={reel} onChange={e => setReel(e.target.value)} />
        </div>
        <button disabled={cents === null || ecart === 0 || regularise.isPending}
                onClick={() => regularise.mutate(
                  { chargeId: charge.id, annee, reelCents: cents! },
                  { onSuccess: () => setReel('') })}
                className="min-h-11 px-4 rounded-[14px] bg-herbe text-fond text-[15px]
                           font-medium disabled:bg-brume disabled:text-encre shrink-0">
          Régulariser
        </button>
      </div>
      <p className="mt-2 text-[14px] text-doux">
        L’ajustement se pose sur le mois en cours ; les mois de {annee} ne bougent pas.
      </p>
      {ecart !== null && ecart !== 0 && (
        <p className="mt-2 text-[15px]"
           style={{ color: ecart > 0 ? 'var(--color-ocre)' : undefined }}>
          {ecart > 0
            ? `Il manque ${euros(ecart)} — répartis selon ce que chacun a porté.`
            : `${euros(-ecart)} de trop-perçu, à rendre dans les mêmes proportions.`}
        </p>
      )}
      <Erreur de={regularise.error} />
    </div>
  )
}

/**
 * Ce qu'on a VRAIMENT payé.
 *
 * Une provision n'est qu'une estimation : l'énergie à la consommation, une
 * charge annuelle ramenée au douzième. En fin de mois on saisit le relevé, et
 * la ligne cesse d'être une supposition.
 *
 * Les parts se reposent avec les POINTS DE BASE de la provision, jamais avec la
 * clé d'aujourd'hui : corriger un montant n'est pas l'occasion de repartager.
 */
function AConfirmer({ depense, foyerId }: { depense: Depense; foyerId: string }) {
  const [reel, setReel] = useState('')
  const regularise = useRegularise()
  const cents = enCentimes(reel)

  return (
    <div className="py-4 border-b border-brume last:border-0">
      <div className="flex items-baseline justify-between">
        <span className="text-[16px]">{depense.libelle}</span>
        <span className="text-[15px] text-doux">prévu {euros(depense.montant_cents)}</span>
      </div>
      <div className="mt-2.5 flex gap-2 items-end">
        <div className="grow">
          <Champ label="Vraiment payé (€)" type="text" inputMode="decimal" value={reel}
                 onChange={e => setReel(e.target.value)} />
        </div>
        <button disabled={cents === null || regularise.isPending}
                onClick={() => regularise.mutate(
                  { foyerId, depense, reelCents: cents! },
                  { onSuccess: () => setReel('') })}
                className="min-h-11 px-4 rounded-[14px] bg-herbe text-fond text-[15px]
                           font-medium disabled:bg-brume disabled:text-encre shrink-0">
          C’est ça
        </button>
      </div>
      <Erreur de={regularise.error} />
    </div>
  )
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
              'août', 'septembre', 'octobre', 'novembre', 'décembre']

function nomDuMois(iso: string): string {
  const [a, m] = iso.split('-').map(Number)
  return `${MOIS[m - 1]}${a === new Date().getFullYear() ? '' : ` ${a}`}`
}

function decale(iso: string, pas: number): string {
  const [a, m] = iso.split('-').map(Number)
  const d = new Date(a, m - 1 + pas, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Une jauge. Au-delà du plafond elle reste pleine et change de teinte.
 *
 * `prevision` la rend CREUSE : une barre pleine et opaque disait « tout est
 * dépensé » le premier du mois, alors que le chiffre à côté annonçait un
 * prévu. Deux signaux contradictoires sur la même ligne, et c'est la barre
 * qu'on lit en premier.
 */
function Jauge({ part, depasse, prevision }:
  { part: number; depasse: boolean; prevision?: boolean }) {
  const teinte = depasse ? 'var(--color-ocre)' : 'var(--color-herbe)'
  return (
    <div className="mt-2.5 h-[7px] rounded-full bg-brume overflow-hidden">
      <div className="h-[7px] rounded-full transition-[width]"
           style={{ width: `${Math.min(100, Math.max(0, part * 100))}%`,
                    background: prevision
                      ? `repeating-linear-gradient(115deg, ${teinte} 0 4px,
                         transparent 4px 9px)`
                      : teinte,
                    opacity: prevision ? 0.65 : 1 }} />
    </div>
  )
}

export function Budget({ userId, va }: { userId: string; va: (v: string) => void }) {
  const [mois, setMois] = useState(moisDe)
  const [baisse, setBaisse] = useState(false)
  const { data: foyer } = useFoyer()
  const depenses = useMois(mois)
  const { data: enveloppes = [] } = useEnveloppes(mois)
  const { data: comptes = [] } = useComptes()
  const charges = useCharges()

  const prenoms = new Map((foyer?.membres ?? []).map(m => [m.id, m.display_name]))
  const aFaire = virements(depenses.data ?? [], userId, comptes, prenoms)
  const regleLeMois = useRegleLeMois()
  /* Un mois PASSÉ, et ce qu'on y a déjà réglé. Rattraper une charge annuelle
     depuis janvier ouvre huit mois d'un coup, et chacun réclamait un virement
     pour un mois qu'on a vécu et payé — sans aucun moyen de le dire. */
  const moisPasse = mois < moisDe()
  const lignes = depenses.data ?? []
  const dejaRegle = lignes.length > 0 && lignes.every(d => d.regle_le)
  /* Tout ce qui n'était qu'une PRÉVISION : les charges variables, et celles
   * que porte une enveloppe — le restaurant à 400 € n'est pas un montant connu,
   * c'est un plafond.
   *
   * ⚠️ Les charges NON mensuelles restent dehors. La taxe foncière au douzième
   *    ne se confirme pas mois par mois : saisir 1450 € en octobre écraserait
   *    octobre à 1450 €. Elle a son propre mécanisme, plus bas. */
  const previsionnelles = new Set(
    (charges.data ?? [])
      .filter(c => c.periodicite === 'mensuel' && (c.variable || c.enveloppe_id))
      .map(c => c.id))
  const aConfirmer = (depenses.data ?? []).filter(
    d => d.nature === 'estimee' && d.charge_id && previsionnelles.has(d.charge_id))
  const heureDuReleve = cestLHeureDuReleve(mois)
  const excedent = useExcedent(mois)
  const monExcedent = (excedent.data ?? []).find(e => e.userId === userId)?.cents ?? 0

  /* Les charges non mensuelles, dont le relevé arrive une fois l'an. On ne les
     propose que si elles ont effectivement produit une provision ce mois-ci. */
  /* Une charge ARCHIVÉE reste régularisable : son relevé arrive justement
     après qu'on a cessé de la payer. On ne la filtre donc pas. */
  const vues = new Set((depenses.data ?? []).map(d => d.charge_id))
  const annuelles = (charges.data ?? [])
    .filter(c => c.periodicite !== 'mensuel' && vues.has(c.id))
  const anneeCourante = new Date().getFullYear()
  const anneesOuvertes = [anneeCourante, anneeCourante - 1]
  const total = aFaire.reduce((s, v) => s + v.cents, 0)

  /* Le dernier jour à 14 h, `fin` valait minuit et tout le bloc disparaissait —
     « Dernier jour. » était du code mort. On compte des JOURS, pas des instants. */
  const joursRestants = (() => {
    const [a, m] = mois.split('-').map(Number)
    const dernier = new Date(a, m, 0).getDate()
    const n = new Date()
    if (n.getFullYear() !== a || n.getMonth() + 1 !== m) return null
    return dernier - n.getDate()
  })()

  return (
    <main className="min-h-dvh px-6 pt-4 pb-16">
      <div className="mx-auto w-full max-w-lg">
        <header className="h-14 flex items-center">
          <button onClick={() => va('/')} aria-label="Retour à l’accueil de Popote"
                  className="flex items-center gap-2 min-h-11 text-herbe">
            <span aria-hidden="true" className="text-[20px] text-doux">‹</span>
            <Marque taille={22} />
            <span className="titre text-[20px]">Popote</span>
          </button>
        </header>

        {/* Le mois se choisit AVANT le titre, pas par un chevron orphelin posé à
            sa droite : seul, à l'autre bout de la ligne, il se lisait comme un
            repli et non comme « le mois d'avant ». */}
        <div className="mt-2 flex items-center gap-2">
          <h1 className="titre text-[34px] first-letter:uppercase grow">{nomDuMois(mois)}</h1>
          <div className="flex gap-1 shrink-0">
            <button onClick={() => setMois(m => decale(m, -1))} aria-label="Mois précédent"
                    className="min-h-11 px-3 inline-flex items-center gap-1.5 rounded-full
                               bg-brume/50 text-[14px]">
              <span aria-hidden="true">‹</span> Avant
            </button>
            {/* Pas de flèche vers l'avant au mois courant. Une flèche grisée à
                1,71:1 ne se lit pas, et laisser passer vers l'avenir CRÉERAIT
                ses dépenses avec la clé du jour, figée. On n'affiche pas une
                porte qui ne doit pas s'ouvrir. */}
            {mois < moisDe() && (
              <button onClick={() => setMois(m => decale(m, 1))} aria-label="Mois suivant"
                      className="min-h-11 px-3 inline-flex items-center gap-1.5 rounded-full
                                 bg-brume/50 text-[14px]">
                Après <span aria-hidden="true">›</span>
              </button>
            )}
          </div>
        </div>
        {joursRestants !== null && (
          <p className="mt-1 text-[15px] text-doux">
            {joursRestants === 0 ? 'Dernier jour.'
              : joursRestants === 1 ? 'Il reste un jour.'
              : `Il reste ${joursRestants} jours.`}
          </p>
        )}

        {/* La porte vers les charges, EN HAUT. Elle était sous les virements,
            les confirmations, le relevé annuel et les enveloppes — près de trois
            mille pixels de défilement pour le geste le plus fréquent. */}
        {aFaire.length > 0 && (
          <button onClick={() => va('/charges')}
                  className="mt-5 w-full min-h-11 rounded-[14px] border border-brume
                             text-[15px]">
            Voir et modifier les charges
          </button>
        )}

        <Erreur de={depenses.error} />
        {/* Le geste n'existe QUE sur un mois passé : sur le mois courant, ce qui
            dit qu'une ligne est payée, c'est la confirmation du 27. */}
        {moisPasse && lignes.length > 0 && (
          <div className="mt-3">
            <button onClick={() => regleLeMois.mutate({ mois, regle: !dejaRegle })}
                    disabled={regleLeMois.isPending}
                    className={`min-h-11 px-4 rounded-full text-[14px] transition-colors
                      ${dejaRegle ? 'bg-herbe text-fond' : 'bg-brume/50 text-encre'}`}>
              {dejaRegle ? '✓ Ce mois est réglé' : 'Ce mois est déjà réglé'}
            </button>
            <Erreur de={regleLeMois.error} />
          </div>
        )}

        {depenses.isPending ? <Attente /> : aFaire.length === 0 ? (
          <>
            {/* Deux états VIDES distincts, et les confondre accusait à tort :
                `virements()` écarte ce qu'on paie depuis son propre compte, et
                quelqu'un arrivé en cours de mois n'a aucune part. Il voyait donc
                « aucune charge n'est posée » — avec, juste dessous, les
                enveloppes pleines de chiffres. */}
            {/* Et un TROISIÈME : un mois qu'on a marqué réglé. Sans lui, il
                s'annonçait « payé par quelqu'un d'autre », ce qui est faux et
                inquiétant — on vient de dire l'avoir payé soi-même. */}
            <Vide titre={dejaRegle ? 'Ce mois est soldé'
                    : (depenses.data ?? []).length === 0
                    ? 'Rien à verser' : 'Rien à verser pour toi'}
                  texte={dejaRegle
                    ? 'Tu l’as marqué comme déjà réglé. Retouche le bouton pour revenir dessus.'
                    : (depenses.data ?? []).length === 0
                    ? 'Aucune charge n’est posée. On commence par là.'
                    : 'Les charges du mois sont payées par quelqu’un d’autre, ou tu n’y participes pas.'} />
            {(depenses.data ?? []).length === 0 && (
              <button onClick={() => va('/charges')}
                      className="w-full h-[58px] rounded-[18px] bg-herbe text-fond
                                 text-[17px] font-medium">
                Poser les charges
              </button>
            )}
            {(depenses.data ?? []).length === 0 && (
              <button onClick={() => va('/budget-reglages')}
                      className="mt-3 w-full min-h-11 rounded-[14px] border border-brume
                                 text-[15px] text-doux">
                D’abord les revenus et les comptes
              </button>
            )}
          </>
        ) : (
          <>
            <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
              À verser
            </h2>
            <Surface className="mt-3">
              {aFaire.map((v, i) => (
                <div key={`${v.compteId}-${i}`}
                     className={`py-4 flex items-baseline justify-between
                                 ${i < aFaire.length - 1 ? 'border-b border-brume' : ''}`}>
                  <span>
                    <span className="block text-[16px]">{v.vers}</span>
                    <span className="block mt-0.5 text-[14px] text-doux">{v.detail}</span>
                  </span>
                  <span className="chiffre text-[26px] text-herbe">{euros(v.cents)}</span>
                </div>
              ))}
              {aFaire.length > 1 && (
                <div className="py-3.5 border-t border-brume flex items-baseline justify-between">
                  <span className="text-[15px] text-doux">En tout</span>
                  <span className="chiffre text-[20px]">{euros(total)}</span>
                </div>
              )}
            </Surface>
          </>
        )}

        {aConfirmer.length > 0 && (
          <>
            <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
              {heureDuReleve ? 'Le relevé du mois' : 'À confirmer, vers le 27'}
            </h2>
            <p className="mt-2 text-[15px] text-doux">
              {heureDuReleve
                ? 'Saisis ce que vous avez vraiment payé sur chacun. L’écart avec ce qui était prévu revient dans le virement du mois suivant.'
                : `Ces montants sont des prévisions. On te demandera le réel à partir du ${JOUR_DU_RELEVE}.`}
            </p>
            <Surface className="mt-3">
              {aConfirmer.map(d => (
                <AConfirmer key={d.id} depense={d} foyerId={foyer?.id ?? ''} />
              ))}
            </Surface>
          </>
        )}

        {monExcedent !== 0 && (
          <>
            <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
              {monExcedent > 0 ? 'Tu as versé en trop' : 'Il te reste à verser'}
            </h2>
            <Surface className="mt-3">
              <p className="flex items-baseline gap-2.5">
                <span className="chiffre text-[32px]"
                      style={{ color: monExcedent > 0 ? 'var(--color-herbe)' : 'var(--color-ocre)' }}>
                  {euros(Math.abs(monExcedent))}
                </span>
                <span className="text-[15px] text-doux">
                  {monExcedent > 0 ? 'de plus que ce qui a été dépensé' : 'sur ce qui a été dépensé'}
                </span>
              </p>
              {monExcedent > 0 && (
                <>
                  <p className="mt-3 text-[15px] leading-[23px] text-doux">
                    Cet argent est sur le compte commun. Deux façons de le rendre à qui
                    l’a versé — et une seule bonne selon le mois : baisser le virement
                    suivant quand c’est une variation, le mettre de côté quand c’est
                    structurel.
                  </p>
                  <div className="mt-3.5 flex gap-2">
                    <button onClick={() => va('/epargne')}
                            className="flex-1 min-h-11 rounded-[14px] bg-herbe text-fond
                                       text-[15px] font-medium">
                      Le verser à l’épargne
                    </button>
                    <button onClick={() => setBaisse(b => !b)}
                            className="flex-1 min-h-11 rounded-[14px] border border-brume
                                       text-[15px]">
                      Baisser le prochain
                    </button>
                  </div>
                  {baisse && (
                    <p className="mt-3 text-[15px] leading-[23px]">
                      Vire {euros(Math.max(0, total - monExcedent))} au lieu de{' '}
                      {euros(total)} le mois prochain. L’app ne le fait pas à ta place :
                      c’est ta banque qui vire, pas elle.
                    </p>
                  )}
                </>
              )}
            </Surface>
          </>
        )}

        {annuelles.length > 0 && (
          <>
            <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
              Le relevé est arrivé ?
            </h2>
            <p className="mt-2 text-[15px] text-doux">
              Ces charges sont provisionnées. Quand tu reçois le vrai montant, saisis-le :
              l’écart se répartit sur l’année, sans toucher aux mois déjà partagés.
            </p>
            <Surface className="mt-3">
              {annuelles.map(c => (
                <ReleveAnnuel key={c.id} charge={c} annees={anneesOuvertes} />
              ))}
            </Surface>
          </>
        )}

        {enveloppes.length > 0 && (
          <>
            <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
              Les enveloppes
            </h2>
            <Surface className="mt-3">
              {enveloppes.map((e, i) => {
                /* Rien de confirmé encore : la jauge ne mesurerait que la
                    provision contre le plafond — deux fois la même chose, et
                    elle affichait « plein » le premier du mois. On montre alors
                    ce qui est PRÉVU, et on dit que le réel n'est pas connu. */
                const seulementPrevu = e.depense_cents === 0 && e.prevu_cents > 0
                const montre = seulementPrevu ? e.prevu_cents : e.depense_cents
                /* Le dépassement se juge sur le CHIFFRE AFFICHÉ. Calculé sur le
                   seul réel, une enveloppe montrant « 260,00 / 200,00 € »
                   restait verte : la couleur disait que tout allait bien
                   pendant que les chiffres disaient le contraire. */
                const depasse = montre > e.plafond_cents
                return (
                  <div key={e.enveloppe_id}
                       className={`py-4 ${i < enveloppes.length - 1 ? 'border-b border-brume' : ''}`}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[15px] font-semibold">{e.libelle}</span>
                      <span className="text-[15px] text-doux">
                        <span className="chiffre text-[17px]"
                              style={{ color: depasse ? 'var(--color-ocre)'
                                       : seulementPrevu ? 'var(--color-doux)' : 'var(--color-herbe)' }}>
                          {euros(montre, false)}
                        </span>
                        {' / '}{euros(e.plafond_cents)}
                      </span>
                    </div>
                    <Jauge part={e.plafond_cents === 0 ? 0 : montre / e.plafond_cents}
                           depasse={depasse} prevision={seulementPrevu} />
                    {seulementPrevu && (
                      <p className="mt-1.5 text-[14px] text-doux">
                        {depasse
                          ? 'Ce que tu as mis dedans dépasse déjà le plafond — avant la moindre dépense.'
                          : 'Prévu, pas encore dépensé — le vrai montant se dit en fin de mois.'}
                      </p>
                    )}
                  </div>
                )
              })}
            </Surface>
          </>
        )}
        {/* La navigation EN BAS. Entre « à verser » et « à confirmer », ces
            trois boutons coupaient la lecture de ce qui compte pour proposer
            d'aller ailleurs. */}
        <nav aria-label="Le reste du budget" className="mt-10 flex flex-col gap-2">
          <div className="flex gap-2">
            <button onClick={() => va('/budget-reglages')}
                    className="flex-1 min-h-11 rounded-[14px] border border-brume text-[15px]">
              Revenus et comptes
            </button>
            <button onClick={() => va('/epargne')}
                    className="flex-1 min-h-11 rounded-[14px] border border-brume text-[15px]">
              L’épargne
            </button>
          </div>
        </nav>
      </div>
    </main>
  )
}