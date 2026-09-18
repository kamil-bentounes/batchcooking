/**
 * Par quoi commencer à peser — et ce qu'on refuse d'enregistrer.
 *
 * Deux choses seulement, mais ce sont celles qui décident si la boucle tient :
 * l'ORDRE (trente lignes à peser, personne ne les fait ; les trois qui servent
 * partout, si) et le REJET des aberrantes annoncé AVANT l'enregistrement.
 */
import { describe, expect, it } from 'vitest'
import { poidsRetenu, regroupe, seraRetenue } from './pesee.ts'
import type { Connu, LigneAPeser } from './pesee.ts'

const ligne = (p: Partial<LigneAPeser>): LigneAPeser => ({
  food_id: 'oignon', nom: 'Oignon, cru', raw_text: '2 oignons',
  recipe_id: 'r1', qty: 2, ...p,
})

describe('par quoi commencer', () => {
  it('met en tête ce qui sert dans le plus de recettes', () => {
    const a = regroupe([
      ligne({ food_id: 'ail', nom: 'Ail, cru', recipe_id: 'r1' }),
      ligne({ food_id: 'oignon', recipe_id: 'r1' }),
      ligne({ food_id: 'oignon', recipe_id: 'r2' }),
      ligne({ food_id: 'oignon', recipe_id: 'r3' }),
    ], [], new Map())
    expect(a[0].food_id).toBe('oignon')
    expect(a[0].recettes).toBe(3)
  })

  it('ne compte pas deux fois la même recette', () => {
    // Une recette qui cite l'oignon deux fois n'en a pas besoin de deux.
    const a = regroupe([
      ligne({ recipe_id: 'r1', raw_text: '2 oignons' }),
      ligne({ recipe_id: 'r1', raw_text: '1 oignon rouge' }),
    ], [], new Map())
    expect(a[0].recettes).toBe(1)
  })

  it('préfère finir une série commencée, à égalité d’usage', () => {
    // Finir une série de deux coûte une pesée ; en commencer une autre, trois.
    const connus: Connu[] = [
      { food_id: 'carotte', grams: 80, observations: 2, seuil: 3, actif: false },
    ]
    const a = regroupe([
      ligne({ food_id: 'ail', nom: 'Ail' }),
      ligne({ food_id: 'carotte', nom: 'Carotte' }),
    ], connus, new Map())
    expect(a[0].food_id).toBe('carotte')
    expect(a[0].progres).toEqual({ faites: 2, seuil: 3 })
  })

  it('écarte ce que le foyer sait déjà', () => {
    // C'est toute la promesse : la friction DÉCROÎT.
    const connus: Connu[] = [
      { food_id: 'oignon', grams: 118, observations: 3, seuil: 3, actif: true },
    ]
    expect(regroupe([ligne({})], connus, new Map())).toEqual([])
  })

  it('prend le texte le plus court comme exemple', () => {
    const a = regroupe([
      ligne({ raw_text: '2 oignons jaunes émincés finement' }),
      ligne({ raw_text: '2 oignons', recipe_id: 'r2' }),
    ], [], new Map())
    expect(a[0].exemple).toBe('2 oignons')
  })

  it('porte la référence quand elle existe, et null sinon', () => {
    const a = regroupe([ligne({})], [], new Map([['oignon', 110]]))
    expect(a[0].reference).toBe(110)
    expect(regroupe([ligne({ food_id: 'topinambour' })], [], new Map())[0].reference).toBeNull()
  })
})

describe('l’aberrante annoncée avant d’enregistrer', () => {
  it('accepte ce qui tient dans les bornes', () => {
    expect(seraRetenue(220, 2, 110), 'deux oignons de 110 g refusés').toBe(true)
    expect(seraRetenue(90, 2, 110)).toBe(true)     // 45 g : petit mais plausible
    expect(seraRetenue(500, 2, 110)).toBe(true)    // 250 g : gros mais plausible
  })

  it('rejette la faute de frappe', () => {
    // 1,2 kg pour un oignon : le doigt a glissé sur la balance.
    expect(seraRetenue(1200, 1, 110)).toBe(false)
    // 8 g : on a pesé la peau.
    expect(seraRetenue(8, 1, 110)).toBe(false)
  })

  it('ne filtre rien quand aucune référence n’existe', () => {
    // C'est le cas où l'apprentissage sert le plus : filtrer sur rien
    // reviendrait à filtrer sur la première observation, qui peut être fausse.
    expect(seraRetenue(1200, 1, null)).toBe(true)
  })

  it('refuse une quantité nulle plutôt que de diviser par zéro', () => {
    expect(seraRetenue(100, 0, 110)).toBe(false)
  })
})

describe('le poids qui fait foi', () => {
  const appris = (actif: boolean): Connu =>
    ({ food_id: 'oignon', grams: 118, observations: 3, seuil: 3, actif })

  it('est celui du foyer dès qu’il est actif', () => {
    expect(poidsRetenu(appris(true), 110)).toBe(118)
  })

  it('reste la référence tant que le seuil n’est pas atteint', () => {
    // Deux pesées ne font pas une médiane : la référence prime, et l'écran
    // affiche le compteur.
    expect(poidsRetenu(appris(false), 110)).toBe(110)
  })

  it('est null quand on ne sait rien', () => {
    // Un chiffre inventé vaudrait moins qu'une fourchette honnête (D18).
    expect(poidsRetenu(undefined, null)).toBeNull()
  })
})
