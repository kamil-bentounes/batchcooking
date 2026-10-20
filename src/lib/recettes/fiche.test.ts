/** La fiche (i) : les ingrédients en deux colonnes, et ce que vaut la fourchette. */
import { describe, expect, it } from 'vitest'
import { ingredientEnDeux, precision } from './fiche.ts'

describe('un ingrédient en deux colonnes', () => {
  it.each([
    ['400 g de lentilles corail', '400 g', 'Lentilles corail'],
    ['2 oignons', '2', 'Oignons'],
    ['1 c. à soupe d’huile d’olive', '1 c. à soupe', 'Huile d’olive'],
    ['2 à 3 gousses d’ail', '2 à 3 gousses', 'Ail'],
    ['1/2 citron', '1/2', 'Citron'],
    ['20 cl de crème', '20 cl', 'Crème'],
    ['1,5 kg de pommes de terre', '1,5 kg', 'Pommes de terre'],
    ['200g de farine', '200g', 'Farine'],
    ['3 gousse ail', '3 gousse', 'Ail'],
    ['Sel, poivre', '', 'Sel, poivre'],
    ['thym', '', 'Thym'],
    ['Fish &amp; chips', '', 'Fish & chips'],
  ])('« %s » → « %s » | « %s »', (brut, qte, nom) => {
    expect(ingredientEnDeux(brut)).toEqual({ qte, nom })
  })
})

describe('la pastille « Par part »', () => {
  it('dit la marge des calories', () => {
    expect(precision({ kcal_margin: 9, protein_g_margin: 0.4, coverage: 1 })).toBe('à 9 kcal près')
  })

  it('dit quand tout est pesé', () => {
    expect(precision({ kcal_margin: 0, protein_g_margin: 0, coverage: 1 })).toBe('Tout est pesé')
  })

  it('dit d’abord ce qu’on ne connaît pas', () => {
    expect(precision({ kcal_margin: 30, protein_g_margin: 2, coverage: 0.72 }))
      .toBe('72 % des ingrédients connus')
  })
})
