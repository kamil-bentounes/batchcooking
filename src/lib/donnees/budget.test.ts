import { afterEach, describe, expect, it, vi } from 'vitest'
import { effortMensuel } from './budget.ts'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('l’effort mensuel', () => {
  it('compte les mois depuis l’heure du front, pas celle de la machine', () => {
    // Le banc joue un 1er novembre 2026 : de novembre 2026 à mars 2027, il reste 4 mois.
    vi.stubEnv('MODE', 'development')
    vi.stubGlobal('localStorage', {
      getItem: (cle: string) => (cle === 'popote.maintenant' ? '2026-11-01T10:00:00' : null),
    })
    expect(effortMensuel(100_000, '2027-03-01', 20_000)).toEqual({ parMois: 20_000, mois: 4 })
  })
  it('zéro mois restant : tout le reste, maintenant', () => {
    vi.stubEnv('MODE', 'development')
    vi.stubGlobal('localStorage', {
      getItem: (cle: string) => (cle === 'popote.maintenant' ? '2026-11-15T10:00:00' : null),
    })
    expect(effortMensuel(100_000, '2026-11-30', 20_000)).toEqual({ parMois: 80_000, mois: 0 })
  })
  it('sans objectif ou sans échéance, rien à tenir', () => {
    expect(effortMensuel(null, '2027-03-01', 0)).toBeNull()
    expect(effortMensuel(100_000, null, 0)).toBeNull()
  })
})
