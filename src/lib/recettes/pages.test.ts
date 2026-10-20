/** La liste par dix (R1) : on ne fait que descendre, les boutons sont en bas. */
import { describe, expect, it } from 'vitest'
import { bornesDeLaPage, nombreDePages, numeros, tranche } from './pages.ts'

describe('les pages', () => {
  it('comptent par dix, et une au moins', () => {
    expect(nombreDePages(1390)).toBe(139)
    expect(nombreDePages(12)).toBe(2)
    expect(nombreDePages(10)).toBe(1)
    expect(nombreDePages(0)).toBe(1)
  })

  it('donnent leurs dix recettes', () => {
    const l = Array.from({ length: 12 }, (_, i) => i + 1)
    expect(tranche(l, 1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(tranche(l, 2)).toEqual([11, 12])
  })

  it('ramènent une page au-delà de la fin à la dernière', () => {
    expect(tranche([1, 2, 3], 5)).toEqual([1, 2, 3])
  })

  it('disent de quelle recette à quelle recette', () => {
    expect(bornesDeLaPage(2, 1390)).toEqual({ de: 11, a: 20 })
    expect(bornesDeLaPage(2, 12)).toEqual({ de: 11, a: 12 })
    expect(bornesDeLaPage(1, 0)).toEqual({ de: 0, a: 0 })
  })
})

describe('les numéros', () => {
  it.each([
    [1, 139, [1, 2, 3, '…', 139]],
    [2, 139, [1, 2, 3, '…', 139]],
    [3, 139, [1, 2, 3, 4, '…', 139]],
    [50, 139, [1, '…', 49, 50, 51, '…', 139]],
    [139, 139, [1, '…', 137, 138, 139]],
    [1, 2, [1, 2]],
    [3, 5, [1, 2, 3, 4, 5]],
    [1, 6, [1, 2, 3, '…', 6]],
    // Un « … » pour une seule page manquante est un bouton perdu : on la montre.
    [4, 139, [1, 2, 3, 4, 5, '…', 139]],
    [136, 139, [1, '…', 135, 136, 137, 138, 139]],
    [3, 6, [1, 2, 3, 4, 5, 6]],
  ] as const)('page %i sur %i', (page, total, attendu) => {
    expect(numeros(page, total)).toEqual(attendu)
  })
})
