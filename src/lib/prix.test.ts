/**
 * Le rapprochement ticket ↔ liste, éprouvé sur de VRAIS libellés de caisse.
 *
 * C'est le maillon faible de tout le lot : un rapprochement faux fait apprendre
 * un prix faux, et un prix faux se propage ensuite à toutes les estimations.
 * D'où des cas pris tels qu'ils sortent d'une caisse — abrégés, en majuscules,
 * avec le poids collé au nom — et surtout des PIÈGES : « pomme » contre « pomme
 * de terre », deux laits différents, le même produit vu deux fois.
 */
import { describe, expect, it } from 'vitest'
import {
  SEUIL_PROPOSE, SEUIL_SUR, estimation, motsUtiles, poidsDuLibelle,
  rapproche, ressemblance,
} from './prix.ts'

describe('les mots qui portent l’identité', () => {
  it('jette les mesures, garde le produit', () => {
    expect(motsUtiles('LAIT DEMI ECREME 1L')).toEqual(['lait', 'demi', 'ecreme'])
    expect(motsUtiles('TOMATES GRAPPE 500G')).toEqual(['tomates', 'grappe'])
  })

  it('jette ce qui ne distingue rien', () => {
    // « Sachet de tomates » et « tomates » sont le même achat.
    expect(motsUtiles('SACHET DE TOMATES BIO')).toEqual(['tomates'])
  })

  it('développe les abréviations de caisse', () => {
    expect(motsUtiles('PDT CHARLOTTE')).toEqual(['pomme', 'terre', 'charlotte'])
    expect(motsUtiles('YT NAT X4')).toEqual(['yaourt', 'nature'])
  })

  it('ignore les codes article', () => {
    expect(motsUtiles('3256540000123 BANANE')).toEqual(['banane'])
  })
})

describe('le poids caché dans le libellé', () => {
  it('lit les formes collées', () => {
    expect(poidsDuLibelle('POULET FILET 500G')).toEqual({ quantite: 500, unite: 'g' })
    expect(poidsDuLibelle('LAIT 1.5L')).toEqual({ quantite: 1500, unite: 'ml' })
    expect(poidsDuLibelle('CREME 20CL')).toEqual({ quantite: 200, unite: 'ml' })
    expect(poidsDuLibelle('RIZ 2KG')).toEqual({ quantite: 2000, unite: 'g' })
  })

  it('lit un multiple d’emballage', () => {
    expect(poidsDuLibelle('YAOURT NATURE X4')).toEqual({ quantite: 4, unite: 'u' })
  })

  it('rend null quand le libellé ne dit rien', () => {
    expect(poidsDuLibelle('BANANE CAVENDISH')).toBeNull()
  })
})

describe('la ressemblance', () => {
  it('reconnaît le produit sous le bruit d’emballage', () => {
    // C'est le cas courant : la caisse en dit plus que la liste.
    expect(ressemblance('LAIT DEMI ECREME 1L', 'lait')).toBeGreaterThan(SEUIL_SUR)
    expect(ressemblance('YAOURT NATURE X4 CARREFOUR', 'yaourt nature')).toBeGreaterThan(SEUIL_SUR)
  })

  it('encaisse les pluriels et les troncatures', () => {
    expect(ressemblance('TOMAT GRAPPE', 'tomates')).toBeGreaterThan(SEUIL_SUR)
    expect(ressemblance('CAROTTES', 'carotte')).toBeGreaterThan(SEUIL_SUR)
  })

  it('ne confond pas une pomme avec une pomme de terre', () => {
    // Le piège du lot : un mot commun, deux produits sans rapport.
    expect(ressemblance('POMMES GOLDEN 1KG', 'pomme de terre')).toBeLessThan(SEUIL_SUR)
  })

  it('ne confond pas deux laits', () => {
    expect(ressemblance('LAIT DEMI ECREME 1L', 'lait de coco')).toBeLessThan(SEUIL_SUR)
  })

  it('rend zéro quand rien ne se ressemble', () => {
    expect(ressemblance('SACS POUBELLE 30L', 'courgette')).toBe(0)
  })

  it('ne compte pas deux fois le même mot', () => {
    // Répéter un mot ne couvre pas mieux : « lait lait » n'est pas deux fois
    // plus « lait de coco » que « lait ». Le doublon fait même baisser le score,
    // parce qu'il ajoute du bruit côté ticket — ce qui est le bon sens.
    expect(ressemblance('LAIT LAIT', 'lait de coco'))
      .toBeLessThanOrEqual(ressemblance('LAIT', 'lait de coco'))
  })

  it('rend zéro plutôt que de diviser par rien', () => {
    expect(ressemblance('500G', 'tomate')).toBe(0)
    expect(ressemblance('TOMATE', '1 kg')).toBe(0)
  })
})

describe('le rapprochement d’un ticket entier', () => {
  const liste = [
    { id: 'a', label: 'poulet' },
    { id: 'b', label: 'pomme de terre' },
    { id: 'c', label: 'yaourt nature' },
    { id: 'd', label: 'courgette' },
  ]

  it('rattache chaque ligne au bon article', () => {
    const r = rapproche([
      { label: 'FILET PLT 500G', price_eur: 6.49 },
      { label: 'PDT CHARLOTTE 2.5KG', price_eur: 3.99 },
      { label: 'YT NATURE X8', price_eur: 2.15 },
    ], liste)

    expect(r.map(x => x.article?.id)).toEqual(['a', 'b', 'c'])
    expect(r.every(x => x.sur), 'des rapprochements évidents sont restés incertains').toBe(true)
  })

  it('laisse sans article ce qui n’est pas sur la liste', () => {
    const r = rapproche([{ label: 'SACS POUBELLE 30L', price_eur: 3.2 }], liste)
    expect(r[0].article).toBeNull()
    expect(r[0].sur).toBe(false)
  })

  it('n’attribue jamais le même article à deux lignes', () => {
    // Deux passages du même produit en caisse : le second doit rester libre,
    // sinon on écraserait le prix payé du premier.
    const r = rapproche([
      { label: 'COURGETTE', price_eur: 1.2 },
      { label: 'COURGETTES VRAC', price_eur: 1.4 },
    ], liste)
    expect(r.filter(x => x.article?.id === 'd')).toHaveLength(1)
  })

  it('donne l’article à la ligne qui lui ressemble le plus', () => {
    const r = rapproche([
      { label: 'POMMES GOLDEN', price_eur: 2.5 },
      { label: 'PDT CHARLOTTE', price_eur: 3.99 },
    ], liste)
    expect(r[1].article?.id, 'la pomme a pris la pomme de terre').toBe('b')
  })

  it('garde l’ordre du ticket', () => {
    // L'écran se relit une ligne de papier à la fois.
    const lignes = [
      { label: 'SACS POUBELLE', price_eur: 3.2 },
      { label: 'FILET PLT', price_eur: 6.49 },
    ]
    expect(rapproche(lignes, liste).map(x => x.ligne.label))
      .toEqual(['SACS POUBELLE', 'FILET PLT'])
  })

  it('rend le même résultat à chaque lancer', () => {
    // Deux téléphones lisent le même ticket : ils doivent en tirer le même
    // rapprochement (D50).
    const lignes = [{ label: 'COURGETTE', price_eur: 1.2 }, { label: 'COURGETTE', price_eur: 1.2 }]
    const a = JSON.stringify(rapproche(lignes, liste).map(x => x.article?.id ?? null))
    for (let i = 0; i < 5; i++) {
      expect(JSON.stringify(rapproche(lignes, liste).map(x => x.article?.id ?? null))).toBe(a)
    }
  })

  it('n’explose pas sur une liste vide', () => {
    const r = rapproche([{ label: 'PAIN', price_eur: 1.1 }], [])
    expect(r).toHaveLength(1)
    expect(r[0].article).toBeNull()
  })
})

describe('l’estimation du prochain panier', () => {
  const prix = [
    { label: 'poulet', food_id: null, store_id: 's1', unit: 'kg',
      avg_price_eur: 12.98, last_price_eur: 12.98, observations: 3 },
    { label: 'poulet', food_id: null, store_id: 's2', unit: 'kg',
      avg_price_eur: 9.5, last_price_eur: 9.5, observations: 1 },
    { label: 'yaourt nature', food_id: null, store_id: 's1', unit: 'u',
      avg_price_eur: 0.27, last_price_eur: 0.27, observations: 6 },
  ]

  it('ramène un prix au kilo à la quantité achetée', () => {
    const e = estimation({ label: 'poulet', quantity: 500, unit: 'g' }, prix, 's1')
    expect(e!.euros).toBe(6.49)
    expect(e!.source).toBe('magasin')
  })

  it('préfère le prix de CETTE enseigne', () => {
    // Le même poulet ne vaut pas le même prix partout.
    expect(estimation({ label: 'poulet', quantity: 1000, unit: 'g' }, prix, 's2')!.euros).toBe(9.5)
  })

  it('accepte un prix d’ailleurs, mais le dit', () => {
    const e = estimation({ label: 'poulet', quantity: 1000, unit: 'g' }, prix, 's3')
    expect(e!.source).toBe('ailleurs')
  })

  it('multiplie un prix à l’unité par la quantité', () => {
    expect(estimation({ label: 'yaourt nature', quantity: 8, unit: 'u' }, prix, 's1')!.euros)
      .toBe(2.16)
  })

  it('rend le prix tel quel quand la quantité est inconnue', () => {
    // Inventer une quantité serait pire que de rendre un ordre de grandeur.
    expect(estimation({ label: 'poulet', quantity: null, unit: null }, prix, 's1')!.euros).toBe(12.98)
  })

  it('se tait plutôt que de deviner', () => {
    expect(estimation({ label: 'ananas' }, prix, 's1')).toBeNull()
  })

  it('rattache par aliment quand il est connu, sans regarder le libellé', () => {
    const parAliment = [{ ...prix[0], label: 'BLANC DE VOLAILLE', food_id: 'f1' }]
    const e = estimation({ label: 'poulet', food_id: 'f1', quantity: 1000, unit: 'g' },
      parAliment, 's1')
    expect(e!.euros).toBe(12.98)
  })

  it('départage deux prix par le nombre d’observations', () => {
    const doublon = [
      { label: 'pain', food_id: null, store_id: 's1', unit: 'u',
        avg_price_eur: 1.1, last_price_eur: 1.1, observations: 1 },
      { label: 'pain', food_id: null, store_id: 's1', unit: 'u',
        avg_price_eur: 1.5, last_price_eur: 1.5, observations: 9 },
    ]
    expect(estimation({ label: 'pain' }, doublon, 's1')!.observations).toBe(9)
  })
})

describe('les seuils', () => {
  it('sont ordonnés', () => {
    expect(SEUIL_PROPOSE).toBeLessThan(SEUIL_SUR)
  })
})
