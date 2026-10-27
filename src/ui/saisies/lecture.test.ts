import { describe, expect, it } from 'vitest'
import {
  cocheesDAvance, dateFr, ecartDit, euros, quotaDit, regroupeParLieu, resumeDeLaPhoto, tempsDeLecture, uniteAffichee,
  type Vu,
} from './lecture.ts'

const vu = (o: Partial<Vu>): Vu => ({
  ou: 'étagère du haut', nom: 'Lait', variete: null, quantite: 1, unite: 'u', lieu: 'frigo',
  confiance: 0.9, remarque: null, ...o,
})

describe('ce qui est coché d’avance', () => {
  it('seulement ce dont le modèle est sûr (0,8 et plus)', () => {
    const s = cocheesDAvance([{ confiance: 0.95 }, { confiance: 0.8 }, { confiance: 0.79 }, { confiance: 0.1 }])
    expect([...s]).toEqual([0, 1])
  })
  it('une confiance absente ou illisible ne se coche pas', () => {
    expect(cocheesDAvance([{ confiance: Number.NaN }, { confiance: undefined as unknown as number }]).size).toBe(0)
  })
})

describe('l’unité affichée', () => {
  it('met au pluriel au-delà d’un', () => {
    expect(uniteAffichee('pot', 4)).toBe('pots')
    expect(uniteAffichee('pot', 1)).toBe('pot')
    expect(uniteAffichee('u', 2)).toBe('pièces')
    expect(uniteAffichee('u', 1)).toBe('pièce')
  })
  it('laisse les mesures et les inconnues telles quelles', () => {
    expect(uniteAffichee('g', 500)).toBe('g')
    expect(uniteAffichee('L', 2)).toBe('L')
    expect(uniteAffichee(null, 2)).toBe('')
  })
})

describe('le regroupement par lieu', () => {
  it('garde l’indice d’origine et l’ordre frigo, congélateur, placard', () => {
    const g = regroupeParLieu([
      vu({ nom: 'Pois', lieu: 'congelateur' }), vu({ nom: 'Lait' }), vu({ nom: 'Riz', lieu: 'placard' }), vu({ nom: 'Œufs' }),
    ])
    expect(g.map(x => x.lieu)).toEqual(['frigo', 'congelateur', 'placard'])
    expect(g[0].items.map(x => [x.a.nom, x.i])).toEqual([['Lait', 1], ['Œufs', 3]])
  })
  it('n’invente pas un lieu vide', () => {
    expect(regroupeParLieu([vu({})]).length).toBe(1)
    expect(regroupeParLieu([])).toEqual([])
  })
})

describe('le temps de lecture', () => {
  it('se dit seulement s’il est mesuré', () => {
    expect(tempsDeLecture(14_200)).toBe('14 s')
    expect(tempsDeLecture(300)).toBe('1 s')
    expect(tempsDeLecture(0)).toBeNull()
    expect(tempsDeLecture(undefined)).toBeNull()
    expect(tempsDeLecture(Number.NaN)).toBeNull()
  })
  it('le résumé n’a pas de « s » sans durée', () => {
    expect(resumeDeLaPhoto(9, 7, 14_000)).toBe('articles vus · 7 retenus · 14 s')
    expect(resumeDeLaPhoto(9, 7, undefined)).toBe('articles vus · 7 retenus')
    expect(resumeDeLaPhoto(1, 1, 0)).toBe('article vu · 1 retenu')
    expect(resumeDeLaPhoto(3, 0, null)).toBe('articles vus · 0 retenu')
  })
})

describe('le ticket', () => {
  it('l’écart se dit en valeur absolue, sous un centime il se tait', () => {
    expect(ecartDit(-1.2)).toBe('écart de 1,20 € avec le total imprimé')
    expect(ecartDit(0.3)).toBe('écart de 0,30 € avec le total imprimé')
    expect(ecartDit(0.004)).toBeNull()
    expect(ecartDit(null)).toBeNull()
  })
  it('la date ISO se lit en français, le reste tel quel', () => {
    expect(dateFr('2026-10-26')).toBe('26/10/2026')
    expect(dateFr('26/10/26')).toBe('26/10/26')
  })
  it('les euros portent la virgule', () => expect(euros(30.78)).toBe('30,78 €'))
  it('le quota vient de la fonction', () => {
    expect(quotaDit(2, 'photo')).toBe('2 photos restantes ce mois-ci.')
    expect(quotaDit(1, 'ticket')).toBe('1 ticket restant ce mois-ci.')
    expect(quotaDit(3, 'ticket')).toBe('3 tickets restants ce mois-ci.')
    expect(quotaDit(0, 'photo')).toBe('0 photo restante ce mois-ci.')
    expect(quotaDit(undefined, 'photo')).toBeNull()
  })
})
