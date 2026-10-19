import { describe, expect, it } from 'vitest'
import { affichable, agrege, COUVERTURE_MINIMALE, ecrit, parPart, plausible } from './macros.ts'
import type { LigneIngredient } from './macros.ts'

/** Poulet : 165 kcal, 31 g de protéines pour 100 g. */
const POULET = { kcal: 165, proteinG: 31, fiberG: 0, carbG: 0, fatG: 3.6 }
/** Huile d'olive : 900 kcal, rien d'autre. */
const HUILE = { kcal: 900, proteinG: 0, fiberG: 0, carbG: 0, fatG: 100 }

function ligne(p: Partial<LigneIngredient> = {}): LigneIngredient {
  return { grammes: 100, grammesTypiques: null, pour100: POULET, ...p }
}

describe('l agrégat', () => {
  it('somme les lignes pesées sans aucune marge', () => {
    const a = agrege([
      ligne({ grammes: 300 }),
      ligne({ grammes: 200, pour100: HUILE }),
    ])
    expect(a.valeur.kcal).toBe(Math.round(165 * 3 + 900 * 2))
    expect(a.marge.kcal).toBe(0)
    expect(a.couverture).toBe(1)
    expect(a.devinees).toBe(0)
  })

  it('devine une quantité manquante et le paie en incertitude', () => {
    // « Un filet d'huile » : 10 g typiques, donc 90 kcal ± 45.
    const a = agrege([ligne({ grammes: null, grammesTypiques: 10, pour100: HUILE })])
    expect(a.valeur.kcal).toBe(90)
    expect(a.marge.kcal).toBe(45)
    expect(a.devinees).toBe(1)
  })

  it('ne compte pas une ligne sans aliment rattaché', () => {
    const a = agrege([ligne({ grammes: 200 }), ligne({ pour100: null })])
    expect(a.valeur.kcal).toBe(330)
    expect(a.couverture).toBe(0.5)
  })

  it('ne compte pas une ligne sans quantité ni repli', () => {
    const a = agrege([ligne(), ligne({ grammes: null, grammesTypiques: null })])
    expect(a.couverture).toBe(0.5)
  })

  it('rend une couverture nulle sur une recette vide, sans planter', () => {
    const a = agrege([])
    expect(a.couverture).toBe(0)
    expect(a.valeur.kcal).toBe(0)
  })
})

describe('le refus de répondre', () => {
  it('refuse d afficher quand trop de lignes manquent', () => {
    const a = agrege([ligne(), ligne({ pour100: null }), ligne({ pour100: null })])
    expect(a.couverture).toBeLessThan(COUVERTURE_MINIMALE)
    expect(affichable(a)).toBe(false)
  })

  it('accepte d afficher quand presque tout est là', () => {
    const lignes = [...Array(9)].map(() => ligne()).concat([ligne({ pour100: null })])
    expect(affichable(agrege(lignes))).toBe(true)
  })
})

describe('la mise à la part', () => {
  it('divise valeur et marge dans le même rapport', () => {
    const a = agrege([
      ligne({ grammes: 800 }),
      ligne({ grammes: null, grammesTypiques: 20, pour100: HUILE }),
    ])
    const p = parPart(a, 820, 205)     // le quart
    expect(p.valeur.kcal).toBe(Math.round(a.valeur.kcal / 4))
    expect(p.marge.kcal).toBe(Math.round(a.marge.kcal / 4))
  })

  it('garde la couverture, qui ne dépend pas de la taille de la part', () => {
    const a = agrege([ligne(), ligne({ pour100: null })])
    expect(parPart(a, 100, 50).couverture).toBe(a.couverture)
  })

  it('ne divise pas par zéro', () => {
    const p = parPart(agrege([ligne()]), 0, 100)
    expect(p.valeur.kcal).toBe(0)
  })
})

describe('l écriture', () => {
  it('écrit un chiffre sec quand il est sûr', () => {
    expect(ecrit(512, 0, 'kcal')).toBe('512 kcal')
  })

  it('écrit une fourchette dès qu il y a du doute', () => {
    expect(ecrit(512, 33, 'kcal')).toBe('479–545 kcal')
  })

  it('ne fait pas de fourchette pour une marge dérisoire', () => {
    expect(ecrit(38, 0.4, 'g')).toBe('38 g')
  })

  it('se passe d unité quand on ne lui en donne pas', () => {
    expect(ecrit(40, 3)).toBe('37–43')
  })
})

describe('une part plausible (R7)', () => {
  it('garde une part ordinaire', () => {
    expect(plausible({ grams: 340, kcal: 520 })).toBe(true)
  })

  it('garde une petite part : la truffe protéinée de 20 g', () => {
    expect(plausible({ grams: 20, kcal: 95 })).toBe(true)
  })

  it('écarte plus gras que l’huile', () => {
    expect(plausible({ grams: 100, kcal: 950 })).toBe(false)
  })

  it('écarte une part de plus d’un kilo et demi : c’est le plat entier', () => {
    expect(plausible({ grams: 1600, kcal: 1500 })).toBe(false)
  })

  it('écarte une part sans énergie', () => {
    expect(plausible({ grams: 300, kcal: 12 })).toBe(false)
  })

  it('écarte une journée entière dans une part', () => {
    expect(plausible({ grams: 900, kcal: 2400 })).toBe(false)
  })

  it('tient ses bornes au chiffre près', () => {
    expect(plausible({ grams: 200, kcal: 20 })).toBe(true)
    expect(plausible({ grams: 1500, kcal: 2000 })).toBe(true)
    expect(plausible({ grams: 100, kcal: 900 })).toBe(true)
  })

  it('écarte une part de poids nul', () => {
    expect(plausible({ grams: 0, kcal: 300 })).toBe(false)
  })
})
