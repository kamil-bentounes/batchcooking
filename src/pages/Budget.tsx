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
  enCentimes, useRegularise, type Depense,
} from '../lib/donnees/budget.ts'

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

/** Une jauge. Au-delà du plafond elle reste pleine et change de teinte. */
function Jauge({ part, depasse }: { part: number; depasse: boolean }) {
  return (
    <div className="mt-2.5 h-[7px] rounded-full bg-brume overflow-hidden">
      <div className="h-[7px] rounded-full transition-[width]"
           style={{ width: `${Math.min(100, Math.max(0, part * 100))}%`,
                    background: depasse ? 'var(--color-ocre)' : 'var(--color-herbe)' }} />
    </div>
  )
}

export function Budget({ userId, va }: { userId: string; va: (v: string) => void }) {
  const [mois, setMois] = useState(moisDe)
  const { data: foyer } = useFoyer()
  const depenses = useMois(mois)
  const { data: enveloppes = [] } = useEnveloppes(mois)
  const { data: comptes = [] } = useComptes()
  const charges = useCharges()

  const prenoms = new Map((foyer?.membres ?? []).map(m => [m.id, m.display_name]))
  const aFaire = virements(depenses.data ?? [], userId, comptes, prenoms)
  /* ⚠️ Seulement les charges MENSUELLES variables.
   *
   *    La première version prenait toute dépense estimée, donc aussi la taxe
   *    foncière ramenée au douzième : saisir le relevé de 1450 € en octobre
   *    écrasait le mois d'octobre à 1450 € au lieu d'étaler l'écart sur les
   *    douze mois déjà partagés. La régularisation ANNUELLE est un autre
   *    mécanisme, qui n'est pas encore écrit — tant qu'il ne l'est pas, on
   *    n'offre pas un bouton qui abîme le mois. */
  const mensuellesVariables = new Set(
    (charges.data ?? [])
      .filter(c => c.variable && c.periodicite === 'mensuel')
      .map(c => c.id))
  const aConfirmer = (depenses.data ?? []).filter(
    d => d.nature === 'estimee' && d.charge_id && mensuellesVariables.has(d.charge_id))
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

        <div className="mt-2 flex items-baseline justify-between">
          <h1 className="titre text-[34px] first-letter:uppercase">{nomDuMois(mois)}</h1>
          <div className="flex gap-1">
            <button onClick={() => setMois(m => decale(m, -1))} aria-label="Mois précédent"
                    className="w-11 h-11 grid place-items-center text-doux">‹</button>
            {/* Pas de flèche vers l'avant au mois courant. Une flèche grisée à
                1,71:1 ne se lit pas, et laisser passer vers l'avenir CRÉERAIT
                ses dépenses avec la clé du jour, figée. On n'affiche pas une
                porte qui ne doit pas s'ouvrir. */}
            {mois < moisDe() && (
              <button onClick={() => setMois(m => decale(m, 1))} aria-label="Mois suivant"
                      className="w-11 h-11 grid place-items-center text-doux">›</button>
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

        <Erreur de={depenses.error} />
        {depenses.isPending ? <Attente /> : aFaire.length === 0 ? (
          <>
            <Vide titre="Rien à verser"
                  texte="Aucune charge n’est posée. On commence par là." />
            <button onClick={() => va('/charges')}
                    className="w-full h-[58px] rounded-[18px] bg-herbe text-fond
                               text-[17px] font-medium">
              Poser les charges
            </button>
            <button onClick={() => va('/budget-reglages')}
                    className="mt-3 w-full min-h-11 rounded-[14px] border border-brume
                               text-[15px] text-doux">
              D’abord les revenus et les comptes
            </button>
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

        <div className="mt-4 flex gap-2">
          <button onClick={() => va('/budget-reglages')}
                  className="flex-1 min-h-11 rounded-[14px] border border-brume
                             text-[15px] text-doux">
            Revenus et comptes
          </button>
          <button onClick={() => va('/epargne')}
                  className="flex-1 min-h-11 rounded-[14px] border border-brume
                             text-[15px] text-doux">
            L’épargne
          </button>
        </div>

        {aFaire.length > 0 && (
          <button onClick={() => va('/charges')}
                  className="mt-4 w-full min-h-11 rounded-[14px] border border-brume
                             text-[15px] text-doux">
            Voir et modifier les charges
          </button>
        )}

        {aConfirmer.length > 0 && (
          <>
            <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
              À confirmer
            </h2>
            <p className="mt-2 text-[15px] text-doux">
              Ces montants sont des estimations. Saisis le relevé et le virement du
              mois suivant s’ajustera tout seul.
            </p>
            <Surface className="mt-3">
              {aConfirmer.map(d => (
                <AConfirmer key={d.id} depense={d} foyerId={foyer?.id ?? ''} />
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
                const depasse = e.reste_cents < 0
                return (
                  <div key={e.enveloppe_id}
                       className={`py-4 ${i < enveloppes.length - 1 ? 'border-b border-brume' : ''}`}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[15px] font-semibold">{e.libelle}</span>
                      <span className="text-[15px] text-doux">
                        <span className="chiffre text-[17px]"
                              style={{ color: depasse ? 'var(--color-ocre)' : 'var(--color-herbe)' }}>
                          {euros(e.depense_cents, false)}
                        </span>
                        {' / '}{euros(e.plafond_cents)}
                      </span>
                    </div>
                    <Jauge part={e.plafond_cents === 0 ? 0 : e.depense_cents / e.plafond_cents}
                           depasse={depasse} />
                  </div>
                )
              })}
            </Surface>
          </>
        )}
      </div>
    </main>
  )
}
