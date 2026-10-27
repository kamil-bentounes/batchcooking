import { describe, expect, it } from 'vitest'
import { partDeLaBarre, pastilleDe, photoDeLaPoche, pourcentage, repereDeLaDate } from './epargne-lecture.ts'

describe('épargne : ce que la carte dit', () => {
  it('le pourcentage arrondi, et rien sans objectif ni solde lu', () => {
    expect(pourcentage(124_000, 400_000)).toBe(31)
    expect(pourcentage(0, 400_000)).toBe(0)
    expect(pourcentage(450_000, 300_000)).toBe(150)
    expect(pourcentage(null, 400_000)).toBeNull()
    expect(pourcentage(100, null)).toBeNull()
    expect(pourcentage(100, 0)).toBeNull()
    expect(pourcentage(-500, 400_000)).toBe(0)
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
    expect(pastilleDe(-1)).toContain('bg-herbe')
  })
})
