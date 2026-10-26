import { describe, expect, it } from 'vitest'
import { echelleDe } from './useEchelle.ts'

describe('L7 · le frigo de 302 px tient dans un écran de 320 px', () => {
  it('assez de place : taille réelle, jamais agrandi', () => {
    expect(echelleDe(350, 302)).toBe(1)
    expect(echelleDe(302, 302)).toBe(1)
  })
  it('320 px moins les marges de 20 px : réduit à la largeur disponible', () => {
    expect(echelleDe(280, 302)).toBeCloseTo(280 / 302, 5)
    expect(302 * echelleDe(280, 302)).toBeLessThanOrEqual(280)
  })
  it('une mesure absente ne casse rien', () => {
    expect(echelleDe(0, 302)).toBe(1)
    expect(echelleDe(NaN, 302)).toBe(1)
  })
})
