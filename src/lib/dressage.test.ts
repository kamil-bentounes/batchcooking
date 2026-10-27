import { describe, expect, it } from 'vitest'
import { barquettes, enGrasLesPrenoms, etiquettesCourtes } from './dressage.ts'

describe('les étiquettes courtes de la rangée de compteurs', () => {
  it('le premier mot suffit quand il distingue', () => {
    expect(etiquettesCourtes(['Lasagnes au saumon-poireaux ww', 'Pizza vietnamienne protéinée', 'Wrap']))
      .toEqual(['Lasagnes', 'Pizza', 'Wrap'])
  })
  it('deux recettes qui commencent pareil prennent deux mots', () => {
    expect(etiquettesCourtes(['Poulet rôti aux herbes', 'Poulet au citron', 'Dahl de lentilles']))
      .toEqual(['Poulet rôti', 'Poulet au', 'Dahl'])
  })
  it('à défaut, le titre entier ; un titre vide reste tel quel', () => {
    expect(etiquettesCourtes(['Poulet au citron', 'Poulet au citron vert', ''])).toEqual(['Poulet au citron', 'Poulet au citron vert', ''])
  })
})

describe('les prénoms en gras dans la phrase des objectifs', () => {
  const phrase = 'Thauba n’a pas encore fixé ses objectifs : ses barquettes sont dressées à parts égales.'
  it('met le prénom en gras et garde le reste', () => {
    const s = enGrasLesPrenoms(phrase, ['Thauba'])
    expect(s[0]).toEqual({ texte: 'Thauba', gras: true })
    expect(s.map(x => x.texte).join('')).toBe(phrase)
    expect(s.filter(x => x.gras)).toHaveLength(1)
  })
  it('deux prénoms, un prénom absent, aucun prénom', () => {
    const deux = enGrasLesPrenoms('Kamil et Thauba n’ont pas encore fixé leurs objectifs.', ['Kamil', 'Thauba'])
    expect(deux.filter(x => x.gras).map(x => x.texte)).toEqual(['Kamil', 'Thauba'])
    expect(enGrasLesPrenoms(phrase, ['Léa'])).toEqual([{ texte: phrase, gras: false }])
    expect(enGrasLesPrenoms(phrase, [])).toEqual([{ texte: phrase, gras: false }])
  })
  it('un prénom à caractères spéciaux ne casse pas l’expression', () => {
    const s = enGrasLesPrenoms('A.(b) n’a pas…', ['A.(b)'])
    expect(s[0]).toEqual({ texte: 'A.(b)', gras: true })
  })
})

describe('barquettes', () => {
  it('0 et 1 au singulier, le reste au pluriel', () => {
    expect([0, 1, 2, 30].map(barquettes)).toEqual(['0 barquette', '1 barquette', '2 barquettes', '30 barquettes'])
  })
})
