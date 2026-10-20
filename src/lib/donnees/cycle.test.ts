/** Le cycle : le dimanche qu'on cuisine, et ce qu'un « + » ne doit pas recharger. */
import { describe, expect, it } from 'vitest'
import { dimancheDe, garderLeCatalogue } from './cycle.ts'

describe('le dimanche du cycle', () => {
  it('est la veille du lundi que le cycle couvre', () => {
    const d = dimancheDe('2026-10-26')
    expect(d.getDay()).toBe(0)
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 10, 25])
  })

  it('passe d’un mois à l’autre', () => {
    const d = dimancheDe('2026-11-02')
    expect([d.getMonth() + 1, d.getDate()]).toEqual([11, 1])
  })
})

describe('retenir une recette', () => {
  it('ne recharge ni le catalogue ni une fiche', () => {
    expect(garderLeCatalogue(['catalogue-leger'])).toBe(false)
    expect(garderLeCatalogue(['fiche', 'r1'])).toBe(false)
  })

  it('recharge tout le reste', () => {
    expect(garderLeCatalogue(['cycle-recettes', 'c1'])).toBe(true)
    expect(garderLeCatalogue(['deja-faites'])).toBe(true)
  })
})
