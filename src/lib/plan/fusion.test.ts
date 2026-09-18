import { describe, expect, it } from 'vitest'
import { actionsDeLaSession, construitTaches, fusionne } from './fusion.ts'
import type { Etape } from './fusion.ts'
import type { Tache } from './types.ts'

function etape(id: string, p: Partial<Etape> = {}): Etape {
  return {
    id,
    recetteId: 'dahl',
    texte: id,
    ordinal: 1,
    dureeMin: 6,
    verbe: 'emincer',
    quantiteG: 250,
    appareil: null,
    charge: 'actif',
    dependDe: [],
    ...p,
  }
}

function tache(id: string, p: Partial<Tache> = {}): Tache {
  return {
    id,
    label: id,
    dureeMin: 6,
    actif: true,
    appareil: null,
    dependDe: [],
    recettes: ['dahl'],
    verbe: 'emincer',
    quantiteG: 250,
    ...p,
  }
}

describe('des étapes aux actions', () => {
  it('ne planifie jamais une étape à zéro minute', () => {
    // Sinon elle disparaît du plan sans que personne s'en aperçoive.
    const [t] = construitTaches([etape('e', { dureeMin: null })])
    expect(t.dureeMin).toBeGreaterThan(0)
  })

  it('rend passive une étape qui n occupe personne', () => {
    const [four, risotto] = construitTaches([
      etape('four', { charge: 'passif', appareil: 'four' }),
      etape('risotto', { charge: 'bloquant', appareil: 'plaque' }),
    ])
    expect(four.actif).toBe(false)
    // Bloquant : l'appareil ET la personne. On ne remue pas en épluchant.
    expect(risotto.actif).toBe(true)
  })
})

describe('la fusion (D35)', () => {
  it('rapproche le même geste de deux recettes et additionne les quantités', () => {
    const r = fusionne([
      tache('a', { quantiteG: 300, recettes: ['dahl'] }),
      tache('b', { quantiteG: 200, recettes: ['basquaise'] }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].quantiteG).toBe(500)
    expect(r[0].recettes.sort()).toEqual(['basquaise', 'dahl'])
    expect(r[0].label).toBe('emincer 500 g')
  })

  it('ne fait économiser que la mise en place, pas le geste', () => {
    // 6 + 6 = 12 min de découpe ; on ne récupère que la planche.
    const [r] = fusionne([
      tache('a', { dureeMin: 6, recettes: ['dahl'] }),
      tache('b', { dureeMin: 6, recettes: ['basquaise'] }),
    ])
    expect(r.dureeMin).toBe(9.5)
    expect(r.dureeMin).toBeGreaterThan(6)
  })

  it('ne récupère pas plus de temps que le geste le plus court n en dure', () => {
    const [r] = fusionne([
      tache('a', { dureeMin: 1, recettes: ['dahl'] }),
      tache('b', { dureeMin: 20, recettes: ['basquaise'] }),
    ])
    expect(r.dureeMin).toBe(20.5)
  })

  it('ne fusionne jamais deux étapes d une même recette', () => {
    // « Émince » avant cuisson et « émince » après ne sont pas le même moment.
    const r = fusionne([
      tache('avant', { recettes: ['dahl'] }),
      tache('apres', { recettes: ['dahl'] }),
    ])
    expect(r).toHaveLength(2)
  })

  it('ne fusionne pas des gestes qui ne mobilisent pas la même chose', () => {
    const r = fusionne([
      tache('poele', { appareil: 'plaque', recettes: ['dahl'] }),
      tache('fryer', { appareil: 'air_fryer', recettes: ['basquaise'] }),
    ])
    expect(r).toHaveLength(2)
  })

  it('ne fusionne rien sans verbe reconnu', () => {
    const r = fusionne([
      tache('a', { verbe: null, recettes: ['dahl'] }),
      tache('b', { verbe: null, recettes: ['basquaise'] }),
    ])
    expect(r).toHaveLength(2)
  })

  it('refuse une fusion qui rendrait le plan circulaire', () => {
    // a précède x, x précède b : rapprocher a et b ferait dépendre a de lui-même.
    const r = fusionne([
      tache('a', { recettes: ['dahl'] }),
      tache('x', { verbe: 'cuire', recettes: ['dahl'], dependDe: ['a'] }),
      tache('b', { recettes: ['basquaise'], dependDe: ['x'] }),
    ])
    expect(r).toHaveLength(3)
  })

  it('reporte sur la tâche gardée ce qui dépendait de celle absorbée', () => {
    const r = fusionne([
      tache('a', { recettes: ['dahl'] }),
      tache('b', { recettes: ['basquaise'] }),
      tache('suite', { verbe: 'cuire', recettes: ['basquaise'], dependDe: ['b'] }),
    ])
    expect(r).toHaveLength(2)
    expect(r.find(t => t.id === 'suite')!.dependDe).toEqual(['a'])
  })

  it('fusionne trois recettes en une seule action', () => {
    const r = fusionne([
      tache('a', { quantiteG: 100, recettes: ['dahl'] }),
      tache('b', { quantiteG: 150, recettes: ['basquaise'] }),
      tache('c', { quantiteG: 250, recettes: ['curry'] }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].quantiteG).toBe(500)
    expect(r[0].recettes).toHaveLength(3)
  })

  it('laisse la quantité inconnue quand une des deux manque', () => {
    // Additionner 300 g et « on ne sait pas » ne donne pas 300 g.
    const [r] = fusionne([
      tache('a', { quantiteG: 300, recettes: ['dahl'] }),
      tache('b', { quantiteG: null, recettes: ['basquaise'] }),
    ])
    expect(r.quantiteG).toBeNull()
    expect(r.label).toBe('a')
  })
})

describe('le pipeline complet', () => {
  it('produit des actions ordonnançables depuis des étapes brutes', () => {
    const actions = actionsDeLaSession([
      etape('d1', { recetteId: 'dahl', quantiteG: 200 }),
      etape('d2', { recetteId: 'dahl', verbe: 'cuire', charge: 'passif',
        appareil: 'plaque', dureeMin: 25, dependDe: ['d1'] }),
      etape('b1', { recetteId: 'basquaise', quantiteG: 300 }),
    ])
    expect(actions).toHaveLength(2)
    const emince = actions.find(a => a.verbe === 'emincer')!
    expect(emince.quantiteG).toBe(500)
    expect(actions.find(a => a.verbe === 'cuire')!.dependDe).toEqual([emince.id])
  })
})
