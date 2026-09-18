/**
 * L'assemblage : d'une page à des lignes de base.
 *
 * Ce qui est éprouvé ici, c'est la DÉCISION — `plannable`. Une recette dont le
 * plan mentirait ne doit pas apparaître au choix du mercredi : elle y produirait
 * une session fausse, et c'est le genre d'erreur qu'on ne voit qu'une fois le
 * four allumé.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { indexer } from '../src/aliment.ts'
import { pliure } from '../src/etape.ts'
import { estPlanifiable, preparer, preparerIngredients } from '../src/ingere.ts'
import type { Contexte, EtapePrete } from '../src/ingere.ts'
import type { RecetteBrute } from '../src/jsonld.ts'

const seed = JSON.parse(
  readFileSync(new URL('../../seed/conversions.json', import.meta.url), 'utf8'))
const ciqual = JSON.parse(
  readFileSync(new URL('../../seed/ciqual.json', import.meta.url), 'utf8'))

const aliments = indexer(ciqual.map((a: { code: string; nom: string; etat: string }) => ({
  id: a.code, name: a.nom, state: a.etat,
})))
const sousGroupes = new Map<string, string | null>(
  ciqual.map((a: { code: string; sous_groupe: string | null }) => [a.code, a.sous_groupe]))

const CTX: Contexte = {
  referentiel: {
    durees: seed.default_duration,
    alias: seed.verbe_alias.alias,
    nonActions: seed.non_action.motifs.map((m: string) => new RegExp(pliure(m), 'i')),
    temperatures: seed.default_temperature,
  },
  aliments,
  conversions: seed.unit_conversion,
  sousGroupes,
  densites: new Map(),
}

function brute(p: Partial<RecetteBrute> = {}): RecetteBrute {
  return {
    url: 'https://exemple.fr/r/1',
    titre: 'Poulet basquaise',
    source: 'Exemple',
    parts: 4,
    totalMin: 75,
    prepMin: 25,
    cuissonMin: 50,
    ingredients: ['500 g de poulet', '2 poivrons', '1 c. à soupe d’huile d’olive'],
    etapes: [
      'Émincez les oignons.',
      'Faites revenir le poulet 8 minutes.',
      'Laissez mijoter 35 minutes.',
      'Bon appétit !',
    ],
    licence: null,
    ...p,
  }
}

const etape = (p: Partial<EtapePrete> = {}): EtapePrete => ({
  ordinal: 1, text: 'x', verb: 'émincer', quantity_g: null,
  duration_min: 5, duration_source: 'defaut', appliance_type: null,
  temperature_c: null, temperature_source: null, load_type: 'actif', confidence: 0.7,
  ...p,
})

describe('les ingrédients', () => {
  it('convertit une masse en grammes', () => {
    const [g] = preparerIngredients(brute({ ingredients: ['500 g de poulet'] }), CTX)
    expect(g.grams_reference).toBe(500)
  })

  it('convertit les kilos', () => {
    const [g] = preparerIngredients(brute({ ingredients: ['1,5 kg de pommes de terre'] }), CTX)
    expect(g.grams_reference).toBe(1500)
  })

  it('convertit une cuillère avec la valeur du sous-groupe', () => {
    // Une cuillère d'huile pèse 13,5 g, pas 15 : le sous-groupe l'emporte.
    const [g] = preparerIngredients(
      brute({ ingredients: ['2 c. à soupe d’huile d’olive'] }), CTX)
    expect(g.grams_reference).toBeGreaterThan(20)
    expect(g.grams_reference).toBeLessThan(31)
  })

  it('convertit un volume, un millilitre pour un gramme faute de densité', () => {
    const [g] = preparerIngredients(brute({ ingredients: ['20 cl de crème'] }), CTX)
    expect(g.grams_reference).toBe(200)
  })

  it('rend null pour un compte : on n’invente pas le poids d’un oignon', () => {
    const [g] = preparerIngredients(brute({ ingredients: ['2 oignons'] }), CTX)
    expect(g.grams_reference, 'un poids a été inventé').toBeNull()
    expect(g.qty).toBe(2)
  })

  it('rend null pour une ligne sans quantité', () => {
    const [g] = preparerIngredients(brute({ ingredients: ['Sel et poivre'] }), CTX)
    expect(g.grams_reference).toBeNull()
  })

  it('rattache l’aliment quand il le reconnaît', () => {
    const [g] = preparerIngredients(brute({ ingredients: ['500 g de carotte'] }), CTX)
    expect(g.food_id, 'la carotte n’a pas été rattachée').not.toBeNull()
    expect(g.resolution_source).toBe('reference')
    expect(g.confidence).toBeGreaterThan(0.34)
  })

  it('borne la confiance : la base la veut entre 0 et 1', () => {
    // Le bonus de tête de nom fait dépasser 1 sur les correspondances franches.
    for (const l of preparerIngredients(brute({
      ingredients: ['500 g de carotte', '2 c. à soupe de sel', '1 oignon'],
    }), CTX)) {
      expect(l.confidence).toBeGreaterThanOrEqual(0)
      expect(l.confidence).toBeLessThanOrEqual(1)
    }
  })

  it('refuse de rattacher plutôt que de se tromper', () => {
    const [g] = preparerIngredients(
      brute({ ingredients: ['1 pincée de zoubidou'] }), CTX)
    expect(g.food_id).toBeNull()
    expect(g.resolution_source).toBe('aucune')
  })

  it('garde le texte brut, toujours', () => {
    const lignes = preparerIngredients(brute(), CTX)
    expect(lignes.map(l => l.raw_text)).toEqual(brute().ingredients)
  })
})

describe('les étapes retenues', () => {
  it('écarte les phrases qui ne sont pas des gestes', () => {
    const r = preparer(brute(), CTX)
    expect(r.etapes).toHaveLength(3)
    expect(r.etapes.map(e => e.text)).not.toContain('Bon appétit !')
  })

  it('renumérote sur les seules étapes gardées', () => {
    const r = preparer(brute({
      etapes: ['Bon appétit !', 'Émincez les oignons.', 'Enfournez 25 min.'],
    }), CTX)
    expect(r.etapes.map(e => e.ordinal)).toEqual([1, 2])
  })

  it('construit un graphe qui ne parle que des étapes gardées', () => {
    const r = preparer(brute(), CTX)
    const ordinaux = new Set(r.etapes.map(e => e.ordinal))
    for (const [a, b] of r.dependances) {
      expect(ordinaux.has(a), `dépendance vers une étape absente : ${a}`).toBe(true)
      expect(ordinaux.has(b), `dépendance depuis une étape absente : ${b}`).toBe(true)
    }
  })

  it('enchaîne dans l’ordre du texte', () => {
    const r = preparer(brute(), CTX)
    expect(r.dependances).toEqual([[1, 2], [2, 3]])
  })
})

describe('la décision « planifiable »', () => {
  it('accepte une recette dont les étapes sont datées', () => {
    expect(preparer(brute(), CTX).recipe.plannable).toBe(true)
  })

  it('refuse une recette d’une seule étape', () => {
    const { oui, motifs } = estPlanifiable([etape()])
    expect(oui).toBe(false)
    expect(motifs.join(' ')).toMatch(/étape/)
  })

  it('refuse quand trop d’étapes n’ont pas de durée', () => {
    const { oui, motifs } = estPlanifiable([
      etape(), etape({ duration_min: null }), etape({ duration_min: null }),
    ])
    expect(oui).toBe(false)
    expect(motifs.join(' ')).toMatch(/datées/)
  })

  it('dit POURQUOI elle refuse : un rejet muet ne se corrige pas', () => {
    const r = preparer(brute({
      etapes: ['Dans un saladier.', 'Bon appétit !'],
    }), CTX)
    expect(r.recipe.plannable).toBe(false)
    expect(r.motifs.length).toBeGreaterThan(0)
  })

  it('signale une recette dont les ingrédients ne se rattachent pas', () => {
    const r = preparer(brute({
      ingredients: ['1 zoubidou', '2 machins', '3 trucs'],
    }), CTX)
    expect(r.motifs.join(' ')).toMatch(/non rattachés/)
  })
})

describe('l’attribution', () => {
  it('garde une licence déclarée', () => {
    const r = preparer(brute({ licence: 'CC BY-SA 4.0' }), CTX)
    expect(r.recipe.license_note).toBe('CC BY-SA 4.0')
  })

  it('à défaut, cite la source et l’adresse — on republie le travail d’autrui', () => {
    const r = preparer(brute(), CTX)
    expect(r.recipe.license_note).toContain('Exemple')
    expect(r.recipe.license_note).toContain('https://exemple.fr/r/1')
  })

  it('cite au moins l’adresse quand la source est muette', () => {
    const r = preparer(brute({ source: null }), CTX)
    expect(r.recipe.license_note).toContain('https://exemple.fr/r/1')
  })
})
