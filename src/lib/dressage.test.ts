import { describe, expect, it } from 'vitest'
import { phraseSansObjectifs } from './donnees/foyer.ts'
import { barquettes, enGrasLesPrenoms, etiquettesCourtes } from './dressage.ts'

describe('les étiquettes courtes de la rangée de compteurs', () => {
  it('le premier mot suffit quand il distingue', () => {
    expect(etiquettesCourtes(['Lasagnes au saumon-poireaux ww', 'Pizza vietnamienne protéinée', 'Wrap']))
      .toEqual(['Lasagnes', 'Pizza', 'Wrap'])
  })
  it('deux recettes qui commencent pareil prennent le mot utile suivant, petits mots compris', () => {
    expect(etiquettesCourtes(['Poulet rôti aux herbes', 'Poulet au citron', 'Dahl de lentilles']))
      .toEqual(['Poulet rôti', 'Poulet au citron', 'Dahl'])
    expect(etiquettesCourtes(['Salade de riz', 'Salade de pâtes', 'Soupe']))
      .toEqual(['Salade de riz', 'Salade de pâtes', 'Soupe'])
  })
  it('jamais un petit mot en fin d’étiquette', () => {
    for (const e of etiquettesCourtes(['Poulet au citron', 'Poulet aux herbes', 'Gratin de courgettes', 'Gratin de patates'])) {
      expect(e).not.toMatch(/\s(au|aux|de|du|des|la|le|les|et|en)$/)
    }
  })
  it('à défaut, le titre entier ; un titre vide reste tel quel', () => {
    expect(etiquettesCourtes(['Poulet au citron', 'Poulet au citron vert', ''])).toEqual(['Poulet au citron', 'Poulet au citron vert', ''])
    expect(etiquettesCourtes(['Wrap', 'Wrap'])).toEqual(['Wrap', 'Wrap'])
  })
})

describe('les prénoms en gras dans la phrase des objectifs', () => {
  const phrase = (prenoms: string[]) => phraseSansObjectifs(prenoms)!
  it('met le prénom en gras et garde le reste', () => {
    const p = phrase(['Thauba'])
    const s = enGrasLesPrenoms(p, ['Thauba'])
    expect(s[0]).toEqual({ texte: 'Thauba', gras: true })
    expect(s.map(x => x.texte).join('')).toBe(p)
    expect(s.filter(x => x.gras)).toHaveLength(1)
  })
  it('deux prénoms : les deux en gras, « et » non', () => {
    const p = phrase(['Kamil', 'Thauba'])
    const s = enGrasLesPrenoms(p, ['Kamil', 'Thauba'])
    expect(s.filter(x => x.gras).map(x => x.texte)).toEqual(['Kamil', 'Thauba'])
    expect(s.map(x => x.texte).join('')).toBe(p)
  })
  it('un prénom court ne met pas en gras un morceau d’un autre mot', () => {
    const p = phrase(['A'])
    const s = enGrasLesPrenoms(p, ['A'])
    expect(s.filter(x => x.gras)).toEqual([{ texte: 'A', gras: true }])
    const e = phrase(['Et'])
    expect(enGrasLesPrenoms(e, ['Et']).filter(x => x.gras)).toEqual([{ texte: 'Et', gras: true }])
    /* « n » est dans « n’a », « encore », « objectifs » : seul le premier mot, le prénom, est en gras. */
    expect(enGrasLesPrenoms(phrase(['n']), ['n']).filter(x => x.gras)).toHaveLength(1)
  })
  it('« Sans prénom » reste un seul mot en gras', () => {
    const p = phrase(['Sans prénom'])
    const s = enGrasLesPrenoms(p, ['Sans prénom'])
    expect(s.filter(x => x.gras)).toEqual([{ texte: 'Sans prénom', gras: true }])
    expect(s.map(x => x.texte).join('')).toBe(p)
  })
  it('une phrase qui ne commence pas par les prénoms revient telle quelle', () => {
    const t = 'Rien à voir : Thauba n’a pas…'
    expect(enGrasLesPrenoms(t, ['Thauba'])).toEqual([{ texte: t, gras: false }])
    expect(enGrasLesPrenoms(t, [])).toEqual([{ texte: t, gras: false }])
  })
})

describe('barquettes', () => {
  it('0 et 1 au singulier, le reste au pluriel', () => {
    expect([0, 1, 2, 30].map(barquettes)).toEqual(['0 barquette', '1 barquette', '2 barquettes', '30 barquettes'])
  })
})
