import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELAI_DU_BANDEAU, heureDite, mesRepasManges, Minuteur, puceDuMange } from './annuler-mange.ts'
import type { Case } from './donnees/barquettes.ts'

const uneCase = (o: Partial<Case>): Case => ({
  id: 'c', day: '2026-10-27', meal: 'dejeuner', user_profile_id: 'moi', state: 'mange', portion: null, extras: [],
  ...o,
} as unknown as Case)
const plat = { id: 'p', label: 'Lasagnes' } as unknown as Case['portion']
const extra = [{ label: 'Sandwich' }] as unknown as Case['extras']

describe('annuler « mangé » : ce que l’écran sait', () => {
  it('le bandeau reste 6 secondes', () => expect(DELAI_DU_BANDEAU).toBe(6000))

  it('heureDite : « 12 h 40 », les minutes sur deux chiffres, l’heure sans zéro', () => {
    expect(heureDite(new Date(2026, 9, 27, 12, 40).toISOString())).toBe('12 h 40')
    expect(heureDite(new Date(2026, 9, 27, 8, 5).toISOString())).toBe('8 h 05')
    expect(heureDite(null)).toBeNull()
    expect(heureDite(undefined)).toBeNull()
    expect(heureDite('pas une date')).toBeNull()
  })

  it('mesRepasManges : mes cases mangées du jour, nommables, dans l’ordre de la journée', () => {
    const cases = [
      uneCase({ id: 'soir', meal: 'diner', portion: plat }),
      uneCase({ id: 'midi', meal: 'dejeuner', portion: plat }),
      uneCase({ id: 'matin', meal: 'petit_dejeuner', extras: extra }),
      uneCase({ id: 'prevu', meal: 'collation', state: 'prevu', portion: plat }),
      uneCase({ id: 'autre-jour', day: '2026-10-26', portion: plat }),
      uneCase({ id: 'a-elle', user_profile_id: 'elle', portion: plat }),
      uneCase({ id: 'vide' }),
    ]
    expect(mesRepasManges(cases, 'moi', '2026-10-27').map(c => c.id)).toEqual(['matin', 'midi', 'soir'])
  })
})

describe('puceDuMange : l’heure de la saisie n’est pas celle du repas', () => {
  const le = (j: number, h: number, m: number) => new Date(2026, 9, j, h, m).toISOString()
  it('noté le jour du repas : « Mangé à 12 h 40 »', () => {
    expect(puceDuMange(le(27, 12, 40), '2026-10-27')).toBe('Mangé à 12 h 40')
  })
  it('noté un autre jour : on dit quand on l’a noté, pas « Mangé à 9 h 12 »', () => {
    expect(puceDuMange(le(27, 9, 12), '2026-10-26')).toBe('Noté mangé le mar. 27 oct. à 9 h 12')
  })
  it('sans heure lisible : « Mangé »', () => {
    expect(puceDuMange(null, '2026-10-27')).toBe('Mangé')
  })
})

describe('Minuteur : 6 secondes, pause, reprise, démontage', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('appelle surFin au bout du délai, une seule fois', () => {
    const fin = vi.fn()
    const m = new Minuteur(DELAI_DU_BANDEAU, fin)
    m.demarre()
    vi.advanceTimersByTime(5_999)
    expect(fin).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fin).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60_000)
    m.demarre()
    vi.advanceTimersByTime(60_000)
    expect(fin).toHaveBeenCalledTimes(1)
  })

  it('en pause, le temps ne compte pas ; la reprise repart avec le reste', () => {
    const fin = vi.fn()
    const m = new Minuteur(DELAI_DU_BANDEAU, fin)
    m.demarre()
    vi.advanceTimersByTime(4_000)
    m.pause()
    vi.advanceTimersByTime(60_000)
    expect(fin).not.toHaveBeenCalled()
    m.demarre()
    vi.advanceTimersByTime(1_999)
    expect(fin).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fin).toHaveBeenCalledTimes(1)
  })

  it('plusieurs pauses s’additionnent : les 6 secondes sont consommées, pas recommencées', () => {
    const fin = vi.fn()
    const m = new Minuteur(DELAI_DU_BANDEAU, fin)
    m.demarre(); vi.advanceTimersByTime(2_000); m.pause()
    m.demarre(); vi.advanceTimersByTime(2_000); m.pause()
    m.demarre(); vi.advanceTimersByTime(1_999)
    expect(fin).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fin).toHaveBeenCalledTimes(1)
  })

  it('« demarre » deux fois ne double pas le délai ; « pause » sans départ ne fait rien', () => {
    const fin = vi.fn()
    const m = new Minuteur(DELAI_DU_BANDEAU, fin)
    m.pause()
    m.demarre(); m.demarre()
    vi.advanceTimersByTime(6_000)
    expect(fin).toHaveBeenCalledTimes(1)
  })

  it('le démontage l’éteint : plus de surFin, même s’il redémarre', () => {
    const fin = vi.fn()
    const m = new Minuteur(DELAI_DU_BANDEAU, fin)
    m.demarre()
    vi.advanceTimersByTime(3_000)
    m.arrete()
    m.demarre()
    vi.advanceTimersByTime(60_000)
    expect(fin).not.toHaveBeenCalled()
  })
})
