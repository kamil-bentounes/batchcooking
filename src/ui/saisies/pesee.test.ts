import { describe, expect, it } from 'vitest'
import { phraseDesSeuils, recettesDit, restantesApres, seuilDe } from './pesee.ts'

describe('le seuil d’un aliment', () => {
  it('3 avec un poids de référence, 5 sans', () => {
    expect(seuilDe({ progres: null, reference: 110 })).toBe(3)
    expect(seuilDe({ progres: null, reference: null })).toBe(5)
  })
  it('la base l’emporte quand elle l’a dit', () => {
    expect(seuilDe({ progres: { faites: 1, seuil: 5 }, reference: 110 })).toBe(5)
    expect(seuilDe({ progres: { faites: 2, seuil: 3 }, reference: null })).toBe(3)
  })
  it('« encore N après » suit le seuil', () => {
    expect(restantesApres({ progres: null, reference: null })).toBe(5)
    expect(restantesApres({ progres: null, reference: 60 })).toBe(3)
    expect(restantesApres({ progres: { faites: 4, seuil: 5 }, reference: null })).toBe(1)
  })
})

describe('l’en-tête de la liste', () => {
  it('un seuil commun', () => {
    expect(phraseDesSeuils([3, 3, 3])).toBe('trois pesées par aliment')
    expect(phraseDesSeuils([5])).toBe('cinq pesées par aliment')
  })
  it('deux seuils : les deux se disent', () => {
    expect(phraseDesSeuils([5, 3, 3])).toBe('trois pesées par aliment, cinq sans poids de référence')
  })
  it('rien à dire sans aliment', () => expect(phraseDesSeuils([])).toBeNull())
})

describe('les recettes', () => {
  it('se disent tant que l’aliment n’est pas commencé', () => {
    expect(recettesDit({ recettes: 2, progres: null })).toBe('2 recettes')
    expect(recettesDit({ recettes: 1, progres: null })).toBe('1 recette')
    expect(recettesDit({ recettes: 2, progres: { faites: 1, seuil: 3 } })).toBeNull()
  })
})
