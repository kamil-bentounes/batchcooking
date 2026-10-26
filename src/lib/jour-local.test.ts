import { describe, expect, it } from 'vitest'
import { delaiJusquAMinuit } from './jour-local.ts'

describe('le délai jusqu’à minuit', () => {
  it('à 23 h 59 : une minute ; à midi : douze heures et une seconde', () => {
    expect(delaiJusquAMinuit(new Date(2026, 9, 26, 23, 59, 0))).toBe(61_000)
    expect(delaiJusquAMinuit(new Date(2026, 9, 26, 12, 0, 0))).toBe(12 * 3_600_000 + 1_000)
  })
  it('jamais nul ni négatif : un réveil à 0 h 00 s 0 attend la seconde de marge', () => {
    expect(delaiJusquAMinuit(new Date(2026, 9, 27, 0, 0, 0))).toBe(24 * 3_600_000 + 1_000)
    expect(delaiJusquAMinuit(new Date(2026, 9, 26, 23, 59, 59, 999))).toBeGreaterThanOrEqual(1_000)
  })
  it('passe le changement d’heure : le dimanche 25 octobre 2026 dure 25 h, le minuteur ne dort pas plus que ça', () => {
    /* Le fuseau du poste de test est quelconque : le délai reste dans la fourchette d'un jour (23 à 25 h). */
    const d = delaiJusquAMinuit(new Date(2026, 9, 25, 0, 0, 30))
    expect(d).toBeGreaterThan(22 * 3_600_000)
    expect(d).toBeLessThanOrEqual(25 * 3_600_000 + 1_000)
  })
})
