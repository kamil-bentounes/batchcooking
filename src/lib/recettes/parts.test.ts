import { describe, expect, it } from 'vitest'
import { PARTS_MAX_CYCLE, PARTS_MAX_RECETTE, lireParts, parts } from './parts.ts'

describe('parts', () => {
  it('écrit le singulier jusqu’à 1, le pluriel au-delà', () => {
    expect(parts(1)).toBe('1 part')
    expect(parts(2)).toBe('2 parts')
    expect(parts(4)).toBe('4 parts')
    expect(parts(12)).toBe('12 parts')
  })

  it('met zéro au singulier, comme le français', () => {
    expect(parts(0)).toBe('0 part')
  })
})

describe('lireParts', () => {
  it('accepte un entier dans les bornes', () => {
    expect(lireParts('1', 20)).toEqual({ etat: 'ok', valeur: 1 })
    expect(lireParts(' 12 ', 20)).toEqual({ etat: 'ok', valeur: 12 })
    expect(lireParts('20', 20)).toEqual({ etat: 'ok', valeur: 20 })
  })

  it('ne dit rien d’un champ vide : on est en train de taper', () => {
    expect(lireParts('', 20)).toEqual({ etat: 'vide' })
    expect(lireParts('   ', 20)).toEqual({ etat: 'vide' })
  })

  it('refuse un décimal, avec point ou virgule', () => {
    for (const t of ['2.5', '2,5', '1.0']) {
      expect(lireParts(t, 20)).toEqual({ etat: 'refus', message: 'Les parts se comptent en nombres entiers.' })
    }
  })

  it('refuse zéro, un négatif, du texte et une notation scientifique', () => {
    expect(lireParts('0', 20)).toMatchObject({ etat: 'refus', message: 'Il faut au moins 1 part.' })
    for (const t of ['-3', 'abc', '1e2', '+4']) {
      expect(lireParts(t, 20), t).toMatchObject({ etat: 'refus' })
    }
  })

  it('refuse au-dessus du maximum, et le dit', () => {
    expect(lireParts('21', 20)).toEqual({ etat: 'refus', message: 'Pas plus de 20 parts.' })
    expect(lireParts('41', PARTS_MAX_CYCLE)).toEqual({ etat: 'refus', message: 'Pas plus de 40 parts.' })
    expect(lireParts('999999999999999999999', 20)).toMatchObject({ etat: 'refus' })
  })

  it('garde les maxima que les champs annonçaient', () => {
    expect(PARTS_MAX_RECETTE).toBe(20)
    expect(PARTS_MAX_CYCLE).toBe(40)
  })
})
