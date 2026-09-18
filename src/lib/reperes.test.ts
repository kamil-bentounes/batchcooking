/**
 * Les repères d'un repas hors barquette.
 *
 * Peu de logique, mais deux choses qui cassent en silence : un moment sans
 * aucun repère rendrait l'écran inutilisable, et un ordre instable ferait
 * bouger les boutons sous le pouce d'une ouverture à l'autre.
 */
import { describe, expect, it } from 'vitest'
import { REPERES, reperesDe } from './reperes.ts'

describe('les repères', () => {
  it('couvrent les quatre moments de la journée', () => {
    // Un moment sans repère est un moment qu'on ne saisira jamais, donc
    // ~900 kcal par jour de mensonge dans le tableau de bord (D26).
    for (const m of ['petit_dejeuner', 'dejeuner', 'diner', 'collation']) {
      expect(reperesDe(m).length, `aucun repère pour ${m}`).toBeGreaterThan(2)
    }
  })

  it('rendent le plus léger d’abord, toujours dans le même ordre', () => {
    const a = reperesDe('dejeuner').map(r => r.label)
    expect(a).toEqual([...a])
    expect(reperesDe('dejeuner').map(r => r.label)).toEqual(a)
    const kcal = reperesDe('dejeuner').map(r => r.kcal)
    expect([...kcal].sort((x, y) => x - y)).toEqual(kcal)
  })

  it('rendent une liste vide pour un moment inconnu, sans exploser', () => {
    expect(reperesDe('gouter-de-minuit')).toEqual([])
  })

  it('portent tous des valeurs plausibles', () => {
    for (const r of REPERES) {
      expect(r.kcal, r.label).toBeGreaterThanOrEqual(0)
      expect(r.proteinG, r.label).toBeGreaterThanOrEqual(0)
      // 4 kcal par gramme de protéine : au-delà, le repère est incohérent.
      expect(r.proteinG * 4, r.label).toBeLessThanOrEqual(r.kcal + 1)
    }
  })
})
