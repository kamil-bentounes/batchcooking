import { describe, expect, it } from 'vitest'
import { DELAI_DU_BANDEAU, heureDite, mesRepasManges } from './annuler-mange.ts'
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
