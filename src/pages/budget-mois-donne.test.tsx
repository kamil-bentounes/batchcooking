/**
 * Un mois donné du budget a son adresse, `/budget/AAAA-MM` (3.2) : la clôture y ramène
 * « sur ce mois ». Le mois d'une adresse ne dépasse jamais le mois courant : l'ouvrir
 * créerait ses lignes avec la clé du jour, figée.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { depense, ecranDuMois, saisie, SEPT, texte, tout } from './budget-banc.tsx'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 21, 10, 0, 0))
})
afterEach(() => vi.useRealTimers())

const titre = (html: string) => /<h1[^>]*>([^<]*)<\/h1>/.exec(html)?.[1]

describe('Budget — le mois de départ', () => {
  it('sans adresse de mois : le mois courant', () => {
    expect(titre(ecranDuMois(tout()))).toBe('Octobre')
  })

  it('une adresse /budget/2026-09 ouvre septembre, et lit ses lignes à lui', () => {
    const h = ecranDuMois(
      tout({ depenses: [depense({ mois: SEPT, montant_cents: 640_00 })], saisies: [saisie(10_00, SEPT)] }),
      { mois: SEPT, depart: SEPT })
    expect(titre(h)).toBe('Septembre')
    expect(texte(h)).not.toContain('Un instant')
    expect(texte(h)).toContain('Il te reste')
  })

  it('septembre propose octobre, son suivant ; le mois courant, personne', () => {
    expect(ecranDuMois(tout(), { mois: SEPT, depart: SEPT })).toContain('Mois suivant : octobre')
    expect(ecranDuMois(tout())).not.toContain('Mois suivant')
  })

  it('une adresse au-delà du mois courant retombe sur le mois courant', () => {
    expect(titre(ecranDuMois(tout(), { depart: '2026-12-01' }))).toBe('Octobre')
  })

  it('un mois qui n’existe pas (2026-13, 2026-00) retombe sur le mois courant', () => {
    expect(titre(ecranDuMois(tout(), { depart: '2026-13-01' }))).toBe('Octobre')
    expect(titre(ecranDuMois(tout(), { depart: '2026-00-01' }))).toBe('Octobre')
  })

  it('une adresse sur le mois courant est le mois courant', () => {
    expect(titre(ecranDuMois(tout(), { depart: '2026-10-01' }))).toBe('Octobre')
  })
})
