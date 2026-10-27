/**
 * Le calcul d'un pot : valeurs pour 100 g × poids / 100. C'est LE chiffre que la semaine, « en plus » et l'écran des
 * aliments disent tous — il ne doit exister qu'à un seul endroit.
 */
import { describe, expect, it } from 'vitest'
import { choixDeLUnite, detailDeLUnite, ecrit, extraDeLUnite, pourUneUnite, uniteEtPoids, valeursDeLUnite } from './calcul.ts'

/* Le yaourt dessert protéiné de la maquette : 76 kcal, 10 g de protéines, 5,6 g de glucides, 1,4 g de lipides pour 100 g. */
const yaourt = {
  label: 'Yaourt dessert protéiné', kcal_100g: 76, protein_100g: 10, carb_100g: 5.6, fat_100g: 1.4, fiber_100g: 0,
  unite: 'pot', unite_g: 125,
}

describe('un pot', () => {
  it('76 kcal et 10 g de protéines pour 100 g, dans un pot de 125 g : 95 kcal et 12,5 g', () => {
    const v = valeursDeLUnite(yaourt)
    expect(v.kcal).toBe(95)
    expect(v.protein).toBe(12.5)
    expect(v.carb).toBe(7)
    expect(v.fat).toBe(1.8) // 1,75 arrondi au dixième
    expect(v.fiber).toBe(0)
  })

  it('le repère générique « Yaourt » (60 kcal, 4 g) était faux de 35 kcal et 8,5 g pour ce yaourt-là', () => {
    const v = valeursDeLUnite(yaourt)
    expect(v.kcal - 60).toBe(35)
    expect(v.protein - 4).toBe(8.5)
  })

  it('100 g, c’est les valeurs telles quelles ; 0 g, rien', () => {
    const v = { kcal: 57, protein: 10, carb: 3.9, fat: 0.2, fiber: 0 }
    expect(pourUneUnite(v, 100)).toEqual(v)
    expect(pourUneUnite(v, 0)).toEqual({ kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0 })
  })

  it('pas d’erreur d’arrondi de virgule flottante : 5,6 g × 1,25 vaut 7, pas 7,000000000000001', () => {
    expect(pourUneUnite({ kcal: 0, protein: 5.6, carb: 0, fat: 0, fiber: 0 }, 125).protein).toBe(7)
    expect(pourUneUnite({ kcal: 0, protein: 0.1, carb: 0, fat: 0, fiber: 0 }, 300).protein).toBe(0.3)
  })

  it('les calories s’arrondissent à l’unité, comme sur une étiquette', () => {
    expect(pourUneUnite({ kcal: 57, protein: 0, carb: 0, fat: 0, fiber: 0 }, 140).kcal).toBe(80) // 79,8
    expect(pourUneUnite({ kcal: 100, protein: 0, carb: 0, fat: 0, fiber: 0 }, 2.4).kcal).toBe(2) // 2,4
  })

  it('accepte les nombres que la base rend en texte (numeric → "76")', () => {
    const v = valeursDeLUnite({ ...yaourt, kcal_100g: '76', protein_100g: '10', carb_100g: '5.6', fat_100g: '1.4', fiber_100g: '0', unite_g: '125' })
    expect(v.kcal).toBe(95)
    expect(v.protein).toBe(12.5)
  })
})

describe('le geste : une unité', () => {
  it('« la semaine » écrit le pot entier, avec son poids et ses vraies valeurs', () => {
    expect(choixDeLUnite(yaourt)).toEqual({
      type: 'repere', label: 'Yaourt dessert protéiné', grams: 125,
      kcal: 95, protein_g: 12.5, carb_g: 7, fat_g: 1.8, fiber_g: 0,
    })
  })

  it('« en plus » écrit la même chose, dans les noms de `useAjouteExtra`', () => {
    expect(extraDeLUnite(yaourt)).toEqual({
      label: 'Yaourt dessert protéiné', grammes: 125, kcal: 95, proteinG: 12.5, carbG: 7, fatG: 1.8, fiberG: 0,
    })
  })

  it('les deux disent le même chiffre', () => {
    const a = choixDeLUnite(yaourt)
    const b = extraDeLUnite(yaourt)
    expect([a.kcal, a.protein_g, a.carb_g, a.fat_g, a.fiber_g]).toEqual([b.kcal, b.proteinG, b.carbG, b.fatG, b.fiberG])
  })
})

describe('ce qui s’écrit', () => {
  it('à la française : virgule, séparateur de milliers, un dixième au plus', () => {
    expect(ecrit(12.5)).toBe('12,5')
    expect(ecrit(95)).toBe('95')
    expect(ecrit(12.54)).toBe('12,5')
  })

  it('« 1 pot (125 g) » et « 1 pot (125 g) · 12,5 g de protéines »', () => {
    expect(uniteEtPoids(yaourt)).toBe('1 pot (125 g)')
    expect(detailDeLUnite(yaourt)).toBe('1 pot (125 g) · 12,5 g de protéines')
    expect(uniteEtPoids({ unite: 'part', unite_g: 80.5 })).toBe('1 part (80,5 g)')
  })
})

describe('un aliment au gramme', () => {
  it('se dit « 100 g », pas « 1 g (100 g) »', () => {
    expect(uniteEtPoids({ unite: 'g', unite_g: 100 })).toBe('100 g')
    expect(uniteEtPoids({ unite: 'pot', unite_g: 125 })).toBe('1 pot (125 g)')
  })
})
