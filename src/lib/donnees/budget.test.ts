import { afterEach, describe, expect, it, vi } from 'vitest'
import { effortMensuel, enCentimes } from './budget.ts'

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

describe('enCentimes : la borne du champ est celle de la colonne', () => {
  /* Grand test, parcours « nouveau venu » (22/10) : « 999 999 999 » € passait
     le champ du revenu, et la base répondait en anglais « value "99999999900"
     is out of range for type integer » — après avoir écrit le prénom, sous un
     « 999 999 999,00 € par mois, noté. ». Les colonnes sont des `integer` : le
     champ refuse ce qu'elles refusent. */
  it('refuse dix millions d’euros et plus (bien avant l’entier de la base), accepte le plus grand qui tient', () => {
    expect(enCentimes('9 999 999,99')).toBe(999_999_999)
    expect(enCentimes('10000000')).toBeNull()
    expect(enCentimes('999999999')).toBeNull()
  })

  it('lit les montants ordinaires', () => {
    expect(enCentimes('2 400,50')).toBe(240_050)
    expect(enCentimes('12,3')).toBe(1_230)
    expect(enCentimes('abc')).toBeNull()
    expect(enCentimes('-5')).toBeNull()
  })
})
