/**
 * Les filtres du catalogue — et surtout la règle de la BORNE DÉFAVORABLE.
 *
 * Une inversion de signe y passerait inaperçue : l'écran afficherait quelques
 * recettes de trop, et quelqu'un ferait ses courses pour un plat qui ne tient
 * pas sa promesse de protéines. C'est exactement ce qu'un test attrape et
 * qu'une relecture laisse passer.
 */
import { describe, expect, it } from 'vitest'
import { FILTRES_VIDES, bornes, nombreDeFiltres, retient } from './catalogue.ts'
import type { Candidate, Filtres } from './catalogue.ts'

function recette(p: Partial<Candidate> = {}): Candidate {
  return {
    id: 'r1',
    title: 'Dahl',
    yield_servings: 4,
    total_time_min: 45,
    active_time_min: 12,
    appliances: ['plaques'],
    freezable: true,
    step_count: 5,
    source_name: 'exemple.fr',
    origin: 'importee',
    owner_household_id: null,
    ajoutePar: null,
    dUnAmi: false,
    nutrition: {
      kcal: 520, protein_g: 31, kcal_margin: 40, protein_g_margin: 3,
      fiber_g: 12, coverage: 0.92,
    },
    manques: [],
    ...p,
  }
}

const filtres = (p: Partial<Filtres> = {}): Filtres => ({ ...FILTRES_VIDES, ...p })
const RIEN = new Set<string>()

describe('les bornes affichées', () => {
  it('encadrent la valeur centrale', () => {
    const b = bornes(recette())!
    expect(b.proteinesMin).toBe(28)
    expect(b.proteinesMax).toBe(34)
    expect(b.kcalMin).toBe(480)
    expect(b.kcalMax).toBe(560)
  })

  it('se réduisent à un point quand tout est pesé', () => {
    const b = bornes(recette({ nutrition: {
      kcal: 500, protein_g: 30, kcal_margin: 0, protein_g_margin: 0,
      fiber_g: 10, coverage: 1,
    } }))!
    expect(b.proteinesMin).toBe(b.proteinesMax)
  })

  it('rendent null quand on ne sait rien', () => {
    expect(bornes(recette({ nutrition: null }))).toBeNull()
  })
})

describe('la borne défavorable (D18)', () => {
  it('écarte une recette annoncée 28–34 quand on demande au moins 30 g', () => {
    // La moyenne est de 31 g : filtrer dessus la ferait passer, et le plat
    // pourrait n'en contenir que 28.
    expect(retient(recette(), filtres({ proteinesMin: 30 }), RIEN)).toBe(false)
  })

  it('garde la même recette si l’on demande au moins 28 g', () => {
    expect(retient(recette(), filtres({ proteinesMin: 28 }), RIEN)).toBe(true)
  })

  it('écarte une recette annoncée 480–560 kcal quand on plafonne à 520', () => {
    // Là aussi la moyenne passerait : 520 exactement.
    expect(retient(recette(), filtres({ kcalMax: 520 }), RIEN)).toBe(false)
  })

  it('garde la même recette si l’on plafonne à 560', () => {
    expect(retient(recette(), filtres({ kcalMax: 560 }), RIEN)).toBe(true)
  })

  it('applique les deux bornes ensemble', () => {
    expect(retient(recette(), filtres({ proteinesMin: 28, kcalMax: 560 }), RIEN)).toBe(true)
    expect(retient(recette(), filtres({ proteinesMin: 28, kcalMax: 500 }), RIEN)).toBe(false)
  })
})

describe('ce qu’on ne sait pas', () => {
  it('ne se fait pas écarter par défaut', () => {
    // Une recette sans macros connues reste visible tant qu'on ne filtre pas
    // justement sur ce qu'on ignore.
    expect(retient(recette({ nutrition: null }), filtres(), RIEN)).toBe(true)
  })

  it('se fait écarter dès qu’on filtre dessus', () => {
    // Sinon l'écran promettrait « au moins 30 g » sur une recette dont on
    // ignore tout.
    expect(retient(recette({ nutrition: null }), filtres({ proteinesMin: 30 }), RIEN)).toBe(false)
    expect(retient(recette({ nutrition: null }), filtres({ kcalMax: 600 }), RIEN)).toBe(false)
  })
})

describe('jamais essayée', () => {
  it('écarte ce que le foyer a déjà cuisiné', () => {
    const faites = new Set(['r1'])
    expect(retient(recette(), filtres({ jamaisFaites: true }), faites)).toBe(false)
    expect(retient(recette({ id: 'r2' }), filtres({ jamaisFaites: true }), faites)).toBe(true)
  })

  it('ne fait rien quand le filtre n’est pas posé', () => {
    expect(retient(recette(), filtres(), new Set(['r1']))).toBe(true)
  })
})

describe('le compteur de filtres', () => {
  it('ne compte pas la recherche texte', () => {
    expect(nombreDeFiltres(filtres({ texte: 'dahl' }))).toBe(0)
  })

  it('compte chaque filtre posé une fois', () => {
    expect(nombreDeFiltres(filtres({
      tempsActifMax: 25, proteinesMin: 30, kcalMax: 600,
      appareils: ['four', 'plaques'], congelable: true,
      avecCeQuOnA: true, jamaisFaites: true,
    }))).toBe(7)
  })

  it('ne compte pas une liste d’appareils vide', () => {
    expect(nombreDeFiltres(filtres({ appareils: [] }))).toBe(0)
  })
})
