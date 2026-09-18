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
    echelle: null,
    dureeBaseMin: null,
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

  it('ne fusionne rien quand une quantité manque', () => {
    // Sans les deux quantités, on ne sait pas si c'est le même travail.
    const r = fusionne([
      tache('a', { quantiteG: 300, recettes: ['dahl'] }),
      tache('b', { quantiteG: null, recettes: ['basquaise'] }),
    ])
    expect(r).toHaveLength(2)
  })

  it('refuse une fusion qui rendrait le plan circulaire', () => {
    // a précède x, x précède b : rapprocher a et b ferait dépendre a de lui-même.
    const r = fusionne([
      tache('a', { quantiteG: 100, recettes: ['dahl'] }),
      tache('x', { verbe: 'cuire', quantiteG: null, recettes: ['dahl'], dependDe: ['a'] }),
      tache('b', { quantiteG: 100, recettes: ['basquaise'], dependDe: ['x'] }),
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

  it('recalcule depuis le total quand le référentiel dit comment (D19)', () => {
    // 300 + 500 = 800 g, soit 3,2 × la quantité de référence — donc le plafond.
    const [r] = fusionne([
      tache('a', { quantiteG: 300, dureeMin: 4, echelle: 'lineaire_plafonne',
        dureeBaseMin: 3, recettes: ['dahl'] }),
      tache('b', { quantiteG: 500, dureeMin: 6, echelle: 'lineaire_plafonne',
        dureeBaseMin: 3, recettes: ['basquaise'] }),
    ])
    expect(r.quantiteG).toBe(800)
    expect(r.dureeMin, 'la fusion a additionné au lieu de recalculer').toBe(9)
  })

  it('ne fait qu’un seul préchauffage de deux', () => {
    // Le même four préchauffé deux fois ne l'est qu'une.
    const [r] = fusionne([
      tache('p1', { verbe: 'préchauffer', appareil: 'four', actif: false,
        quantiteG: null, dureeMin: 12, echelle: 'constant', recettes: ['dahl'] }),
      tache('p2', { verbe: 'préchauffer', appareil: 'four', actif: false,
        quantiteG: null, dureeMin: 10, echelle: 'constant', recettes: ['basquaise'] }),
    ])
    expect(r.dureeMin, 'deux préchauffages ont été additionnés').toBe(12)
  })

  it('ne fusionne PAS deux cuissons dont on ignore les quantités', () => {
    // Deux gratins au four sont deux gratins. Sans quantité, on ne sait pas si
    // c'est le même travail : on préfère un plan trop long à un plan faux.
    const r = fusionne([
      tache('c1', { verbe: 'cuire', appareil: 'four', actif: false,
        quantiteG: null, dureeMin: 35, echelle: 'constant', recettes: ['dahl'] }),
      tache('c2', { verbe: 'cuire', appareil: 'four', actif: false,
        quantiteG: null, dureeMin: 35, echelle: 'constant', recettes: ['basquaise'] }),
    ])
    expect(r, 'deux cuissons distinctes ont été confondues').toHaveLength(2)
  })

  it('ne fusionne pas deux gestes dont l’échelle diffère', () => {
    const r = fusionne([
      tache('a', { echelle: 'constant', recettes: ['dahl'] }),
      tache('b', { echelle: 'lineaire_plafonne', recettes: ['basquaise'] }),
    ])
    expect(r).toHaveLength(2)
  })

  it('garde son libellé d’origine quand il n’a pas de quantité à annoncer', () => {
    const [r] = fusionne([
      tache('p1', { verbe: 'préchauffer', appareil: 'four', actif: false,
        quantiteG: null, recettes: ['dahl'] }),
      tache('p2', { verbe: 'préchauffer', appareil: 'four', actif: false,
        quantiteG: null, recettes: ['basquaise'] }),
    ])
    expect(r.quantiteG).toBeNull()
    expect(r.label).toBe('p1')
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
