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
    // Un nombre mixte reste d'un seul tenant dans la quantité.
    ['1 ½ tasse de lait', '1 ½ tasse', 'Lait'],
    ['1½ tasse de lait', '1½ tasse', 'Lait'],
    ['1 1/2 tasse de lait', '1 1/2 tasse', 'Lait'],
    ['2 ¼ l de bouillon', '2 ¼ l', 'Bouillon'],
    // Sans nom, la ligne entière est le nom : on ne fabrique pas « G » ni « À 3 ».
    ['250 g', '', '250 g'],
    ['2 à 3', '', '2 à 3'],
    ['1 c. à soupe', '', '1 c. à soupe'],
    ['2', '', '2'],
    // Les écritures que les sites varient.
    ['1 boite de tomates', '1 boite', 'Tomates'],
    ['2 boîtes de maïs', '2 boîtes', 'Maïs'],
    ['2 c.à.s de sucre', '2 c.à.s', 'Sucre'],
    ['1 c.à.c de sel', '1 c.à.c', 'Sel'],
    ['1 càs d’huile', '1 càs', 'Huile'],
    ['3 x 100 g de riz', '3 x 100 g', 'Riz'],
    ['2 × 125 g de beurre', '2 × 125 g', 'Beurre'],
    // Les blancs en double se referment, l'espace insécable aussi.
    ['  400   g   de   lentilles  corail ', '400 g', 'Lentilles corail'],
    ['200&nbsp;g de farine', '200 g', 'Farine'],
    // Les fractions d'une seule touche.
    ['½ citron', '½', 'Citron'],
    ['¼ l de lait', '¼ l', 'Lait'],
    ['¾ de tasse de sucre', '¾', 'Tasse de sucre'],
    ['⅓ de chou', '⅓', 'Chou'],
    ['⅔ de tasse de riz', '⅔', 'Tasse de riz'],
    // Les unités, une à une.
    ['2 cs de sucre', '2 cs', 'Sucre'],
    ['1 cc de sel', '1 cc', 'Sel'],
    ['1 pincée de sel', '1 pincée', 'Sel'],
    ['2 pincées de sel', '2 pincées', 'Sel'],
    ['3 feuilles de laurier', '3 feuilles', 'Laurier'],
    ['1 feuille de laurier', '1 feuille', 'Laurier'],
    ['1 branche de thym', '1 branche', 'Thym'],
    ['2 branches de céleri', '2 branches', 'Céleri'],
    ['1 pot de yaourt', '1 pot', 'Yaourt'],
    ['2 pots de crème', '2 pots', 'Crème'],
    // Les majuscules ne changent rien.
    ['4 Gousses d’ail', '4 Gousses', 'Ail'],
    ['2 À 3 Gousses d’ail', '2 À 3 Gousses', 'Ail'],
    ['400 G de farine', '400 G', 'Farine'],
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

  it('compare ce qu’il affiche : 90 % ne s’écrit pas « sous 90 % »', () => {
    expect(precision({ kcal_margin: 9, protein_g_margin: 0, coverage: 0.8999 })).toBe('à 9 kcal près')
    expect(precision({ kcal_margin: 9, protein_g_margin: 0, coverage: 0.9 })).toBe('à 9 kcal près')
    expect(precision({ kcal_margin: 9, protein_g_margin: 0, coverage: 0.894 }))
      .toBe('89 % des ingrédients connus')
  })

  it('arrondit la couverture au plus proche', () => {
    expect(precision({ kcal_margin: 0, protein_g_margin: 0, coverage: 0.714 })).toBe('71 % des ingrédients connus')
    expect(precision({ kcal_margin: 0, protein_g_margin: 0, coverage: 0.716 })).toBe('72 % des ingrédients connus')
  })

  it('parle de la couverture jusqu’à 90 %, pas seulement sous 80 %', () => {
    expect(precision({ kcal_margin: 5, protein_g_margin: 0, coverage: 0.85 })).toBe('85 % des ingrédients connus')
  })

  it('arrondit la marge au plus proche, et en dessous de 1 kcal tout est pesé', () => {
    const p = (m: number | string) => precision({ kcal_margin: m, protein_g_margin: 0, coverage: 1 })
    expect(p(0.4)).toBe('Tout est pesé')
    expect(p(0.5)).toBe('à 1 kcal près')
    expect(p(0.6)).toBe('à 1 kcal près')
    expect(p(1)).toBe('à 1 kcal près')
    expect(p(9.4)).toBe('à 9 kcal près')
    expect(p(9.5)).toBe('à 10 kcal près')
    expect(p('12')).toBe('à 12 kcal près')
  })

  it('ne s’écrit jamais « NaN » : une marge illisible compte zéro, comme un temps illisible', () => {
    const p = (m: unknown, c: unknown = 1) =>
      precision({ kcal_margin: m as number, protein_g_margin: 0, coverage: c as number })
    expect(p('x')).toBe('Tout est pesé')
    expect(p(NaN)).toBe('Tout est pesé')
    expect(p(Infinity)).toBe('Tout est pesé')
    expect(p('x', 'y')).toBe('0 % des ingrédients connus')
  })
})
