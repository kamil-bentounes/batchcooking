import { describe, expect, it } from 'vitest'
import { budget, organise } from './liste.ts'
import type { ArticleRange, Rang } from './liste.ts'

const LIDL = { id: 'lidl', name: 'Lidl' }
const CARREFOUR = { id: 'carrefour', name: 'Carrefour' }

let n = 0
function art(p: Partial<ArticleRange> = {}): ArticleRange {
  return {
    id: `a${n++}`,
    label: `Article ${n}`,
    store_id: LIDL.id,
    aisle: 'Épicerie salée',
    checked_at: null,
    ...p,
  }
}

describe('une sortie par magasin (D59)', () => {
  it('sépare les enseignes', () => {
    const s = organise(
      [art({ store_id: LIDL.id }), art({ store_id: CARREFOUR.id }), art({ store_id: LIDL.id })],
      [], [LIDL, CARREFOUR])
    expect(s).toHaveLength(2)
    expect(s.find(x => x.storeId === LIDL.id)!.total).toBe(2)
  })

  it('suit l’ordre des enseignes du foyer', () => {
    const s = organise(
      [art({ store_id: CARREFOUR.id }), art({ store_id: LIDL.id })],
      [], [LIDL, CARREFOUR])
    expect(s.map(x => x.storeId)).toEqual([LIDL.id, CARREFOUR.id])
  })

  it('met les articles sans magasin en dernier', () => {
    const s = organise(
      [art({ store_id: null }), art({ store_id: LIDL.id })],
      [], [LIDL])
    expect(s.map(x => x.storeId)).toEqual([LIDL.id, null])
  })

  it('compte ce qui reste à prendre, magasin par magasin', () => {
    const s = organise([
      art({ store_id: LIDL.id, checked_at: '2026-01-01T10:00:00Z' }),
      art({ store_id: LIDL.id }),
      art({ store_id: CARREFOUR.id }),
    ], [], [LIDL, CARREFOUR])
    expect(s.find(x => x.storeId === LIDL.id)!.restants).toBe(1)
    expect(s.find(x => x.storeId === CARREFOUR.id)!.restants).toBe(1)
  })
})

describe('l’ordre des rayons', () => {
  it('suit le référentiel quand rien n’a été appris', () => {
    const s = organise([
      art({ aisle: 'Entretien' }),
      art({ aisle: 'Fruits et légumes' }),
      art({ aisle: 'Frais' }),
    ], [], [LIDL])
    expect(s[0].groupes.map(g => g.rayon))
      .toEqual(['Fruits et légumes', 'Frais', 'Entretien'])
  })

  it('suit ce que le magasin a appris, et non le référentiel', () => {
    // Ce Lidl-là commence par l'entretien : c'est ce qu'on a observé.
    const appris: Rang[] = [
      { store_id: LIDL.id, aisle: 'Entretien', position: 1 },
      { store_id: LIDL.id, aisle: 'Fruits et légumes', position: 9 },
    ]
    const s = organise([
      art({ aisle: 'Fruits et légumes' }),
      art({ aisle: 'Entretien' }),
    ], appris, [LIDL])
    expect(s[0].groupes.map(g => g.rayon)).toEqual(['Entretien', 'Fruits et légumes'])
  })

  it('n’applique pas l’ordre d’un magasin à un autre', () => {
    const appris: Rang[] = [{ store_id: LIDL.id, aisle: 'Entretien', position: 1 }]
    const s = organise([
      art({ store_id: CARREFOUR.id, aisle: 'Fruits et légumes' }),
      art({ store_id: CARREFOUR.id, aisle: 'Entretien' }),
    ], appris, [CARREFOUR])
    expect(s[0].groupes.map(g => g.rayon)).toEqual(['Fruits et légumes', 'Entretien'])
  })

  it('range un rayon inconnu à la fin plutôt que de le perdre', () => {
    const s = organise([
      art({ aisle: 'Rayon inventé' }),
      art({ aisle: 'Fruits et légumes' }),
    ], [], [LIDL])
    expect(s[0].groupes.map(g => g.rayon)).toEqual(['Fruits et légumes', 'Rayon inventé'])
    expect(s[0].total, 'un article a été perdu').toBe(2)
  })

  it('traite une absence de rayon comme « Autre », sans planter', () => {
    const s = organise([art({ aisle: null })], [], [LIDL])
    expect(s[0].groupes[0].rayon).toBe('Autre')
  })
})

describe('dans un rayon', () => {
  it('met ce qui reste à prendre avant ce qui est coché', () => {
    const s = organise([
      art({ label: 'Alpha', checked_at: '2026-01-01T10:00:00Z' }),
      art({ label: 'Zeta' }),
    ], [], [LIDL])
    expect(s[0].groupes[0].articles.map(a => a.label)).toEqual(['Zeta', 'Alpha'])
  })

  it('trie ensuite par nom, avec les accents à leur place', () => {
    const s = organise([
      art({ label: 'Œufs' }), art({ label: 'Ail' }), art({ label: 'Épinards' }),
    ], [], [LIDL])
    expect(s[0].groupes[0].articles.map(a => a.label)).toEqual(['Ail', 'Épinards', 'Œufs'])
  })

  it('ne modifie pas le tableau qu’on lui donne', () => {
    const liste = [art({ label: 'B' }), art({ label: 'A' })]
    organise(liste, [], [LIDL])
    expect(liste.map(a => a.label)).toEqual(['B', 'A'])
  })
})

describe('le budget', () => {
  it('somme les estimations', () => {
    expect(budget([
      { est_price_eur: 2.5, paid_price_eur: null },
      { est_price_eur: '1.25', paid_price_eur: null },
    ]).estime).toBe(3.75)
  })

  it('se tait sur le réel tant que personne n’a saisi de prix', () => {
    expect(budget([{ est_price_eur: 3, paid_price_eur: null }]).paye).toBeNull()
  })

  it('rend le réel dès qu’il existe, même partiel', () => {
    const b = budget([
      { est_price_eur: 3, paid_price_eur: 2.99 },
      { est_price_eur: 4, paid_price_eur: null },
    ])
    expect(b.paye).toBe(2.99)
    expect(b.estime).toBe(7)
  })

  it('ne traîne pas de centimes flottants', () => {
    expect(budget([
      { est_price_eur: 0.1, paid_price_eur: null },
      { est_price_eur: 0.2, paid_price_eur: null },
    ]).estime).toBe(0.3)
  })

  it('rend zéro sur une liste vide', () => {
    expect(budget([])).toEqual({ estime: 0, paye: null })
  })
})
