/**
 * Les filtres du catalogue — et surtout la règle de la BORNE DÉFAVORABLE.
 *
 * Une inversion de signe y passerait inaperçue : l'écran afficherait quelques
 * recettes de trop, et quelqu'un ferait ses courses pour un plat qui ne tient
 * pas sa promesse de protéines. C'est exactement ce qu'un test attrape et
 * qu'une relecture laisse passer.
 *
 * Depuis la liste B (R1), TOUS les filtres vivent ici, côté client : la
 * recherche, le temps, les appareils, « se congèle » compris.
 */
import { describe, expect, it } from 'vitest'
import {
  FILTRES_VIDES, bornes, manquesDe, nombreDeFiltres, partsAProposer, retient, trie,
} from './catalogue.ts'
import type { Candidate, Contexte, Filtres } from './catalogue.ts'

function recette(p: Partial<Candidate> = {}): Candidate {
  return {
    id: 'r1',
    title: 'Dahl',
    image_url: null,
    yield_servings: 4,
    total_time_min: 45,
    active_time_min: 12,
    appliances: ['plaques'],
    freezable: true,
    owner_household_id: null,
    ajoutePar: null,
    dUnAmi: false,
    nutrition: {
      kcal: 520, protein_g: 31, kcal_margin: 40, protein_g_margin: 3,
      fiber_g: 12, coverage: 0.92,
    },
    ...p,
  }
}

const filtres = (p: Partial<Filtres> = {}): Filtres => ({ ...FILTRES_VIDES, ...p })
const RIEN: Contexte = { dejaFaites: new Set(), faisables: null }
const ctx = (p: Partial<Contexte> = {}): Contexte => ({ ...RIEN, ...p })

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

describe('la borne exacte, pas la borne affichée', () => {
  const macros = (kcal: number, protein_g: number, kcal_margin = 0, protein_g_margin = 0) =>
    ({ kcal, protein_g, kcal_margin, protein_g_margin, fiber_g: 1, coverage: 1 })

  it('ne laisse pas un arrondi faire passer 29,6 g sous un seuil de 30', () => {
    // bornes() affiche 30 ; la borne réelle est 29,6, et c'est elle qu'on promet.
    const r = recette({ nutrition: macros(500, 29.6) })
    expect(bornes(r)!.proteinesMin).toBe(30)
    expect(retient(r, filtres({ proteinesMin: 30 }), RIEN)).toBe(false)
  })

  it('ne laisse pas un arrondi faire passer 600,4 kcal sous un plafond de 600', () => {
    const r = recette({ nutrition: macros(600.4, 30) })
    expect(bornes(r)!.kcalMax).toBe(600)
    expect(retient(r, filtres({ kcalMax: 600 }), RIEN)).toBe(false)
  })

  it('applique la marge à la valeur exacte : 29,6 − 0,5 passe 29 mais pas 29,2', () => {
    const r = recette({ nutrition: macros(500, 29.6, 0, 0.5) })
    expect(retient(r, filtres({ proteinesMin: 29 }), RIEN)).toBe(true)
    expect(retient(r, filtres({ proteinesMin: 29.2 }), RIEN)).toBe(false)
  })

  it('garde une recette pile sur le seuil, malgré les flottants', () => {
    // 16,4 − 0,4 vaut 15,999999999999998 en flottant : la borne est bien 16.
    const r = recette({ nutrition: macros(500, 16.4, 0, 0.4) })
    expect(retient(r, filtres({ proteinesMin: 16 }), RIEN)).toBe(true)
    expect(retient(r, filtres({ proteinesMin: 16.1 }), RIEN)).toBe(false)
    // 20,1 + 0,1 vaut 20,200000000000003.
    const k = recette({ nutrition: macros(20.1, 30, 0.1, 0) })
    expect(retient(k, filtres({ kcalMax: 20.2 }), RIEN)).toBe(true)
    expect(retient(k, filtres({ kcalMax: 20.1 }), RIEN)).toBe(false)
  })
})

describe('ce qu’on ne sait pas', () => {
  it('ne se fait pas écarter par défaut', () => {
    expect(retient(recette({ nutrition: null }), filtres(), RIEN)).toBe(true)
  })

  it('se fait écarter dès qu’on filtre dessus', () => {
    expect(retient(recette({ nutrition: null }), filtres({ proteinesMin: 30 }), RIEN)).toBe(false)
    expect(retient(recette({ nutrition: null }), filtres({ kcalMax: 600 }), RIEN)).toBe(false)
  })
})

describe('jamais essayée', () => {
  it('écarte ce que le foyer a déjà cuisiné', () => {
    const faites = ctx({ dejaFaites: new Set(['r1']) })
    expect(retient(recette(), filtres({ jamaisFaites: true }), faites)).toBe(false)
    expect(retient(recette({ id: 'r2' }), filtres({ jamaisFaites: true }), faites)).toBe(true)
  })

  it('ne fait rien quand le filtre n’est pas posé', () => {
    expect(retient(recette(), filtres(), ctx({ dejaFaites: new Set(['r1']) }))).toBe(true)
  })
})

describe('la recherche', () => {
  it('ignore les accents et la casse', () => {
    expect(retient(recette({ title: 'Pâtes à la crème' }), filtres({ texte: 'PATES' }), RIEN))
      .toBe(true)
  })

  it('trouve « d’agneau » en tapant l’apostrophe du clavier, et inversement', () => {
    const tajine = recette({ title: 'Tajine d’agneau' })
    expect(retient(tajine, filtres({ texte: 'd\'agneau' }), RIEN)).toBe(true)
    expect(retient(recette({ title: 'Tajine d\'agneau' }), filtres({ texte: 'd’agneau' }), RIEN))
      .toBe(true)
  })

  it('cherche chaque mot, dans n’importe quel ordre : « tarte poireaux » trouve « Tarte aux poireaux »', () => {
    // Le catalogue entier se cherche au titre : taper deux mots est le cas ordinaire, et la
    // phrase entière, collée telle quelle, ne trouvait rien dès qu'un mot s'intercalait.
    const tarte = recette({ title: 'Tarte aux poireaux' })
    expect(retient(tarte, filtres({ texte: 'tarte poireaux' }), RIEN)).toBe(true)
    expect(retient(tarte, filtres({ texte: 'poireaux  TARTE' }), RIEN)).toBe(true)
    expect(retient(recette({ title: 'Poulet à l’ail & au citron' }),
      filtres({ texte: 'poulet ail' }), RIEN)).toBe(true)
    expect(retient(tarte, filtres({ texte: 'tarte courgettes' }), RIEN)).toBe(false)
  })

  it('écarte ce qui ne contient pas le texte', () => {
    expect(retient(recette({ title: 'Dahl' }), filtres({ texte: 'poulet' }), RIEN)).toBe(false)
  })
})

describe('le temps des mains', () => {
  it('garde ce qui tient dans le temps, écarte ce qui le dépasse', () => {
    expect(retient(recette({ active_time_min: 12 }), filtres({ tempsActifMax: 20 }), RIEN)).toBe(true)
    expect(retient(recette({ active_time_min: 25 }), filtres({ tempsActifMax: 20 }), RIEN)).toBe(false)
  })

  it('écarte un temps inconnu : on ne promet pas ce qu’on n’a pas compté', () => {
    expect(retient(recette({ active_time_min: 0 }), filtres({ tempsActifMax: 20 }), RIEN)).toBe(false)
    expect(retient(recette({ active_time_min: null }), filtres({ tempsActifMax: 20 }), RIEN)).toBe(false)
  })

  it('ne l’écarte pas quand on ne filtre pas sur le temps', () => {
    expect(retient(recette({ active_time_min: 0 }), filtres(), RIEN)).toBe(true)
  })
})

describe('les appareils', () => {
  it('garde une recette qui n’exige que ce qu’on a coché', () => {
    expect(retient(recette({ appliances: ['plaques'] }),
      filtres({ appareils: ['plaques', 'four'] }), RIEN)).toBe(true)
  })

  it('écarte une recette qui exige un appareil non coché', () => {
    expect(retient(recette({ appliances: ['plaques', 'four'] }),
      filtres({ appareils: ['plaques'] }), RIEN)).toBe(false)
  })

  it('ignore un code qu’on ne dessine pas, comme la base le faisait', () => {
    expect(retient(recette({ appliances: ['plaques', 'cheminee'] }),
      filtres({ appareils: ['plaques'] }), RIEN)).toBe(true)
  })
})

describe('se congèle', () => {
  it('écarte « on ne sait pas » autant que « non »', () => {
    expect(retient(recette({ freezable: true }), filtres({ congelable: true }), RIEN)).toBe(true)
    expect(retient(recette({ freezable: null }), filtres({ congelable: true }), RIEN)).toBe(false)
    expect(retient(recette({ freezable: false }), filtres({ congelable: true }), RIEN)).toBe(false)
  })
})

describe('avec ce que j’ai', () => {
  it('ne garde que les recettes faisables', () => {
    const f = filtres({ avecCeQuOnA: true })
    expect(retient(recette(), f, ctx({ faisables: new Set(['r1']) }))).toBe(true)
    expect(retient(recette(), f, ctx({ faisables: new Set(['r2']) }))).toBe(false)
  })

  it('ne garde rien tant qu’on ne sait pas', () => {
    expect(retient(recette(), filtres({ avecCeQuOnA: true }), RIEN)).toBe(false)
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

describe('l’ordre', () => {
  it('trie par temps actif, l’inconnu à la fin, puis par titre', () => {
    const t = trie([
      recette({ id: 'a', title: 'B', active_time_min: 12 }),
      recette({ id: 'b', title: 'Zéro', active_time_min: 0 }),
      recette({ id: 'c', title: 'A', active_time_min: 12 }),
      recette({ id: 'd', title: 'Vite', active_time_min: 5 }),
      recette({ id: 'e', title: 'Rien', active_time_min: null }),
    ])
    expect(t.map(r => r.id)).toEqual(['d', 'c', 'a', 'e', 'b'])
  })
})

describe('les manques', () => {
  it('listent les ingrédients reconnus absents du placard', () => {
    const m = manquesDe([
      { recipe_id: 'r1', food_id: 'oignon', raw_text: '2 oignons' },
      { recipe_id: 'r1', food_id: 'lentilles', raw_text: '400 g de lentilles' },
      { recipe_id: 'r1', food_id: null, raw_text: 'sel' },
      { recipe_id: 'r2', food_id: 'oignon', raw_text: '1 oignon' },
    ], new Set(['oignon']))
    expect(m.get('r1')).toEqual(['400 g de lentilles'])
    expect(m.get('r2')).toBeUndefined()
  })
})

describe('les parts proposées', () => {
  it('proposent ce qui manque, borné par le rendement', () => {
    expect(partsAProposer(10, 4, 4)).toBe(4)
    expect(partsAProposer(10, 0, 6)).toBe(6)
  })

  it('proposent 2 quand tout est couvert, 1 au moins', () => {
    expect(partsAProposer(10, 10, 6)).toBe(2)
    expect(partsAProposer(10, 12, 6)).toBe(1)
  })
})
