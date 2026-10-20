/**
 * Le temps des mains (R6, R7). La base dit la même chose : voir
 * `tests/recettes.test.ts`, qui compare `tempsActif` au trigger.
 */
import { describe, expect, it } from 'vitest'
import { actifConnu, enTout, minutesDeMains, tempsActif } from './temps.ts'
import type { EtapeTemps } from './temps.ts'

const e = (load_type: string, duration_min: number | null, gesture_min: number | null): EtapeTemps =>
  ({ load_type, duration_min, gesture_min })

describe('les minutes de mains d’une étape', () => {
  it('une étape active compte sa durée', () => {
    expect(minutesDeMains(e('actif', 4, null))).toBe(4)
  })

  it('… ou ses gestes, s’ils la dépassent', () => {
    expect(minutesDeMains(e('actif', 4, 7))).toBe(7)
    expect(minutesDeMains(e('actif', 10, 3))).toBe(10)
  })

  it('une étape bloquante compte comme une active', () => {
    expect(minutesDeMains(e('bloquant', 6, 2))).toBe(6)
  })

  it('une étape passive ne compte que ses gestes', () => {
    expect(minutesDeMains(e('passif', 30, 1))).toBe(1)
    expect(minutesDeMains(e('passif', 30, null))).toBe(0)
  })

  it('accepte les nombres que PostgREST rend en chaîne', () => {
    expect(minutesDeMains({ load_type: 'actif', duration_min: '4', gesture_min: '7' })).toBe(7)
  })

  it('compte zéro pour ce qui n’est pas un nombre', () => {
    expect(minutesDeMains({ load_type: 'actif', duration_min: 'abc', gesture_min: null })).toBe(0)
    expect(minutesDeMains({ load_type: 'actif', duration_min: 'abc', gesture_min: '3' })).toBe(3)
    expect(minutesDeMains({ load_type: 'passif', duration_min: 5, gesture_min: Number.NaN })).toBe(0)
  })
})

describe('le temps actif d’une recette', () => {
  it('vaut zéro sans étape', () => {
    expect(tempsActif([])).toBe(0)
  })

  it('additionne les mains de chaque étape', () => {
    expect(tempsActif([e('actif', 8, null), e('passif', 25, null)])).toBe(8)
    expect(tempsActif([e('actif', 4, 7), e('passif', 30, 1.5)])).toBe(8.5)
  })
})

describe('un temps actif connu', () => {
  it('ne croit pas un zéro : aucune recette ne se fait sans les mains', () => {
    expect(actifConnu(0)).toBe(false)
    expect(actifConnu('0')).toBe(false)
    expect(actifConnu(null)).toBe(false)
    expect(actifConnu(0.5)).toBe(true)
    expect(actifConnu('12')).toBe(true)
  })
})

describe('« en tout » (R7)', () => {
  const etapes = [e('actif', 8, null), e('passif', 25, 1)]

  it('garde le total du site quand il tient', () => {
    expect(enTout(45, 9, etapes)).toBe(45)
  })

  it('prend nos étapes quand le site annonce moins que nos gestes', () => {
    expect(enTout(10, 19, etapes)).toBe(33)
  })

  it('prend nos étapes quand le site ne dit rien', () => {
    expect(enTout(null, 9, etapes)).toBe(33)
  })

  it('rend null quand personne ne sait', () => {
    expect(enTout(null, 0, [])).toBeNull()
  })

  it('garde le total du site quand il égale le temps actif', () => {
    expect(enTout(9, 9, etapes)).toBe(9)
    expect(enTout('9', '9', etapes)).toBe(9)
  })

  it('prend nos étapes quand le site annonce 0', () => {
    expect(enTout(0, 9, etapes)).toBe(33)
  })

  it('compte une étape passive au moins pour ses gestes', () => {
    expect(enTout(null, 3, [e('passif', 1, 3)])).toBe(3)
    expect(enTout(2, 3, [e('passif', 1, 3), e('actif', 2, null)])).toBe(5)
  })

  it('arrondit au dixième', () => {
    expect(enTout(null, 0.3, [e('actif', 0.1, null), e('actif', 0.2, null)])).toBe(0.3)
  })

  it('ne se laisse pas tromper par un total illisible', () => {
    expect(enTout('abc', 9, etapes)).toBe(33)
  })
})
