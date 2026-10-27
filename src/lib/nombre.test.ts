import { describe, expect, it } from 'vitest'
import { nb } from './nombre.ts'

describe('nb — un nombre à la française', () => {
  it('la virgule décimale, jamais le point', () => {
    expect(nb(0.4)).toBe('0,4')
    expect(nb(12.5)).toBe('12,5')
  })
  it('un entier reste entier', () => {
    expect(nb(15)).toBe('15')
    expect(nb(0)).toBe('0')
  })
  it('une décimale au plus par défaut, deux sur demande', () => {
    expect(nb(0.46)).toBe('0,5')
    expect(nb(0.456, 2)).toBe('0,46')
  })
})
