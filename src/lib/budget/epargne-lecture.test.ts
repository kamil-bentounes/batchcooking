import { describe, expect, it } from 'vitest'
import { partDeLaBarre, pastilleDe, photoDeLaPoche, pourcentage, repereDeLaDate, tailleDuTotal } from './epargne-lecture.ts'

describe('épargne : ce que la carte dit', () => {
  it('le pourcentage arrondi, et rien sans objectif ni solde lu', () => {
    expect(pourcentage(124_000, 400_000)).toBe(31)
    expect(pourcentage(0, 400_000)).toBe(0)
    expect(pourcentage(450_000, 300_000)).toBe(150)
    expect(pourcentage(300_000, 300_000)).toBe(100)
    expect(pourcentage(null, 400_000)).toBeNull()
    expect(pourcentage(100, null)).toBeNull()
    expect(pourcentage(100, 0)).toBeNull()
    expect(pourcentage(-500, 400_000)).toBe(0)
  })

  it('le pourcentage aux bornes : 99,5 % n’est pas 100 %, 0,4 % n’est pas 0 %', () => {
    expect(pourcentage(398_000, 400_000)).toBe(99)        // 99,5 %
    expect(pourcentage(399_999, 400_000)).toBe(99)
    expect(pourcentage(400_000, 400_000)).toBe(100)
    expect(pourcentage(1_600, 400_000)).toBe(1)           // 0,4 %
    expect(pourcentage(1, 400_000)).toBe(1)
    expect(pourcentage(0, 400_000)).toBe(0)
    expect(pourcentage(124_999, 400_000)).toBe(31)        // vers le bas : 31,2 %
    expect(pourcentage(199_999, 400_000)).toBe(49)        // 49,99 % : 49, pas 50
  })

  it('la barre ne dépasse jamais la piste', () => {
    expect(partDeLaBarre(124_000, 400_000)).toBeCloseTo(0.31)
    expect(partDeLaBarre(900_000, 400_000)).toBe(1)
    expect(partDeLaBarre(-1, 400_000)).toBe(0)
    expect(partDeLaBarre(null, 400_000)).toBeNull()
    expect(partDeLaBarre(1, null)).toBeNull()
  })

  it('la date : « pour août 2027 » ou « pas de date »', () => {
    expect(repereDeLaDate('2027-08-31')).toBe('pour août 2027')
    expect(repereDeLaDate('2027-01-01')).toBe('pour janvier 2027')
    expect(repereDeLaDate(null)).toBe('pas de date')
    expect(repereDeLaDate('')).toBe('pas de date')
  })

  it('la photo et la pastille', () => {
    expect(photoDeLaPoche('urgence')).toBe('epargne')
    expect(photoDeLaPoche('projet')).toBe('auto')
    expect(pastilleDe(0)).toContain('bg-herbe')
    expect(pastilleDe(1)).toContain('bg-safran')
    expect(pastilleDe(7)).toContain('bg-brume')
    expect(pastilleDe(-1)).toContain('bg-brume')          // quelqu'un qui n'est plus du foyer
    expect(pastilleDe(-1)).not.toBe(pastilleDe(0))
  })

  it('le gros total rétrécit avec sa longueur', () => {
    expect(tailleDuTotal('760 €')).toBe('grand')
    expect(tailleDuTotal('1 240 €')).toBe('grand')
    expect(tailleDuTotal('1 240,50 €')).toBe('moyen')
    expect(tailleDuTotal('12 345,67 €')).toBe('petit')
  })
})
