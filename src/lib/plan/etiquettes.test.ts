import { describe, expect, it } from 'vitest'
import { placeEtiquettes } from './etiquettes.ts'

describe('placeEtiquettes', () => {
  it('garde la place du temps quand les gestes sont espacés', () => {
    const { tops, hauteur } = placeEtiquettes(
      [{ id: 'a', debutMin: 0 }, { id: 'b', debutMin: 30 }], 3.2, 46)
    expect(tops.get('a')).toBe(-2)
    expect(tops.get('b')).toBe(30 * 3.2 - 2)
    expect(hauteur).toBe(30 * 3.2 - 2 + 46)
  })

  it('décale vers le bas ceux qui tombent au même moment : aucun ne recouvre un autre', () => {
    // Sept gestes qui commencent à 0 : à deux cuisiniers, c'est le cas ordinaire.
    const taches = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, debutMin: 0 }))
    const { tops } = placeEtiquettes(taches, 3.2, 46)
    const rangs = taches.map(t => tops.get(t.id)!)
    for (let i = 1; i < rangs.length; i++) expect(rangs[i] - rangs[i - 1]).toBeGreaterThanOrEqual(46)
  })

  it('ne remonte jamais un geste au-dessus de sa minute', () => {
    const { tops } = placeEtiquettes(
      [{ id: 'a', debutMin: 0 }, { id: 'b', debutMin: 1 }, { id: 'c', debutMin: 60 }], 3.2, 46)
    expect(tops.get('c')).toBe(60 * 3.2 - 2)
    expect(tops.get('b')! - tops.get('a')!).toBeGreaterThanOrEqual(46)
  })

  it('range les gestes par minute de début, quel que soit l’ordre reçu', () => {
    const { tops } = placeEtiquettes(
      [{ id: 'tard', debutMin: 50 }, { id: 'tot', debutMin: 0 }], 3.2, 46)
    expect(tops.get('tot')!).toBeLessThan(tops.get('tard')!)
  })

  it('ne rend rien pour aucun geste', () => {
    expect(placeEtiquettes([], 3.2, 46).tops.size).toBe(0)
  })
})
