/**
 * Les réglages du budget (2.18), rendus en chaîne avec un cache REMPLI À LA MAIN
 * (même méthode que `budget.test.tsx` : ni jsdom ni Testing Library dans le dépôt).
 *
 * Le point qui compte : chacun lit son revenu EN VIGUEUR, pas le dernier de la liste.
 * `useRevenus` rend tout l'historique du plus récent au plus ancien ; une `Map`
 * construite telle quelle gardait le PLUS ANCIEN (4 325 € après un passage à 4 500 €),
 * et la version « on renverse la liste » gardait le plus récent — fût-il daté d'un
 * mois qui n'a pas commencé.
 *
 * L'heure : le 21 octobre 2026, donc le mois courant est octobre.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Compte, Revenu } from '../lib/donnees/budget.ts'
import { CLE } from '../lib/donnees/budget.ts'
import { CLE as CLE_FOYER, type Foyer } from '../lib/donnees/foyer.ts'
import { BudgetReglages } from './BudgetReglages.tsx'

// `route.ts` lit `window` au chargement : on ne teste pas la navigation ici.
vi.mock('../lib/route.ts', () => ({ useRoute: () => ({ va: () => {} }) }))

const FINE = ' '
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 21, 10, 0, 0))
})
afterEach(() => vi.useRealTimers())

const membre = (id: string, nom: string) => ({ id, display_name: nom })
const foyer = (membres: { id: string; display_name: string }[]) =>
  ({ id: 'f1', nom: 'Chez nous', plafondLlmEur: 0, membres }) as unknown as Foyer
const revenu = (qui: string, cents: number, valid_from: string): Revenu =>
  ({ id: `r-${qui}-${valid_from}`, user_profile_id: qui, net_mensuel_cents: cents, valid_from })

function ecran(membres: { id: string; display_name: string }[], revenus: Revenu[],
               comptes: Compte[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: {
    retry: false, retryOnMount: false, staleTime: Infinity } } })
  qc.setQueryData(CLE_FOYER.foyer, foyer(membres))
  qc.setQueryData(CLE.revenus, revenus)
  qc.setQueryData(CLE.comptes, comptes)
  qc.setQueryData(['regle-partage'], 'prorata')
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <BudgetReglages userId="u1" retour={() => {}} />
    </QueryClientProvider>)
}

const K = membre('u1', 'Kamil')
const T = membre('u2', 'Thauba')

describe('Réglages du budget — le revenu en vigueur', () => {
  // Du plus récent au plus ancien, comme `lisLesRevenus` : un futur, un en vigueur, un passé.
  const historique = [
    revenu('u1', 500_000, '2027-01-01'),
    revenu('u1', 450_000, '2026-09-01'),
    revenu('u1', 400_000, '2026-01-01'),
  ]

  it('affiche le revenu en vigueur : ni le plus ancien, ni celui d’un mois qui n’a pas commencé', () => {
    const t = texte(ecran([K], historique))
    expect(t).toContain(`4${FINE}500,00 € / mois`)
    expect(t).not.toContain(`5${FINE}000,00 € / mois`)
    expect(t).not.toContain(`4${FINE}000,00 € / mois`)
  })

  it('ne dépend pas de l’ordre dans lequel la liste arrive', () => {
    const t = texte(ecran([K], [...historique].reverse()))
    expect(t).toContain(`4${FINE}500,00 € / mois`)
  })

  it('chacun lit le sien : un revenu posé le dernier jour du mois vaut déjà ce mois', () => {
    const t = texte(ecran([K, T], [
      ...historique,
      revenu('u2', 300_000, '2026-01-01'),
      revenu('u2', 320_000, '2026-10-31'),
      revenu('u2', 350_000, '2026-11-01'),
    ]))
    expect(t).toContain(`4${FINE}500,00 € / mois`)
    expect(t).toContain(`3${FINE}200,00 € / mois`)
    expect(t).not.toContain(`3${FINE}500,00 € / mois`)
    expect(t).not.toContain('pas encore renseigné')
  })

  it('un revenu seulement futur n’est pas un revenu : « pas encore renseigné », et le partage le dit', () => {
    const t = texte(ecran([K, T], [
      revenu('u1', 450_000, '2026-01-01'),
      revenu('u2', 350_000, '2026-11-01'),
    ]))
    expect(t).toContain('pas encore renseigné')
    expect(t).not.toContain(`3${FINE}500,00 € / mois`)
    expect(t).toContain('Tant qu’il en manque un, le partage se fait à parts égales')
  })

  it('le bouton propose « Mettre à jour » seulement si j’ai un revenu en vigueur', () => {
    expect(texte(ecran([K], historique))).toContain('Mettre à jour mon revenu')
    expect(texte(ecran([K], historique))).toContain('Le précédent est gardé')
    const futur = texte(ecran([K], [revenu('u1', 500_000, '2027-01-01')]))
    expect(futur).toContain('Enregistrer mon revenu')
    expect(futur).not.toContain('Le précédent est gardé')
    expect(texte(ecran([K], []))).toContain('Enregistrer mon revenu')
  })
})

describe('Réglages du budget — les enveloppes sont parties', () => {
  it('ni section, ni formulaire, ni suggestion d’enveloppe', () => {
    const h = ecran([K], [revenu('u1', 450_000, '2026-01-01')])
    expect(h).not.toMatch(/enveloppe/i)
    expect(texte(h)).toContain('Les revenus')
    expect(texte(h)).toContain('Les comptes')
  })
})
