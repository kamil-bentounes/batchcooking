import { describe, expect, it } from 'vitest'
import { PARTS_MAX_CYCLE, PARTS_MAX_RECETTE, avecLesParts, lireParts, lireSaisie, parts } from './parts.ts'

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

describe('lireSaisie', () => {
  it('ne change rien tant que le champ est vide : on réécrit, on ne revient pas à « 1 »', () => {
    expect(lireSaisie('', 20, 4)).toEqual({ commit: null, refus: null })
    expect(lireSaisie('  ', 20, 4)).toEqual({ commit: null, refus: null })
  })

  it('« effacer puis 12 » donne 12, pas 112', () => {
    // Le champ affiche ce qu'on a tapé : « 1 », puis « 12 ». Seule la valeur lue compte.
    expect(lireSaisie('1', 20, 4)).toEqual({ commit: 1, refus: null })
    expect(lireSaisie('12', 20, 1)).toEqual({ commit: 12, refus: null })
  })

  it('n’écrit pas deux fois la valeur déjà en place', () => {
    expect(lireSaisie('4', 20, 4)).toEqual({ commit: null, refus: null })
  })

  it('refuse sans écrire, et dit pourquoi', () => {
    expect(lireSaisie('2.5', 20, 4)).toEqual({
      commit: null, refus: 'Les parts se comptent en nombres entiers.' })
    expect(lireSaisie('21', 20, 4)).toEqual({ commit: null, refus: 'Pas plus de 20 parts.' })
    expect(lireSaisie('0', 20, 4)).toEqual({ commit: null, refus: 'Il faut au moins 1 part.' })
  })
})

describe('avecLesParts (le chiffre bouge avant la base)', () => {
  const liste = [{ recipe_id: 'a', servings: 4 }, { recipe_id: 'b', servings: 2 }]

  it('ne change que la recette visée, sans toucher la liste d’origine', () => {
    const l = avecLesParts(liste, 'a', 5)
    expect(l).toEqual([{ recipe_id: 'a', servings: 5 }, { recipe_id: 'b', servings: 2 }])
    expect(liste[0].servings).toBe(4)
  })

  it('deux appuis rapides sur « + » à 4 parts donnent 6 : chacun part de la dernière valeur posée', () => {
    let affiche = liste
    for (let appui = 0; appui < 2; appui++) {
      const courant = affiche.find(c => c.recipe_id === 'a')!.servings
      affiche = avecLesParts(affiche, 'a', courant + 1)
    }
    expect(affiche.find(c => c.recipe_id === 'a')!.servings).toBe(6)
  })

  it('une recette absente de la liste n’ajoute rien', () => {
    expect(avecLesParts(liste, 'z', 9)).toEqual(liste)
  })
})
