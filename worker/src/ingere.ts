/**
 * De la page web aux lignes de la base.
 *
 * C'est l'assemblage : l'extraction JSON-LD donne le brut, `ingredient.ts` et
 * `aliment.ts` résolvent les ingrédients, `etape.ts` analyse les gestes. Ici on
 * ne fait que coudre — et surtout, on décide de ce qui est PLANIFIABLE.
 *
 * `plannable` est la seule chose qui compte pour le lot 1 : une recette dont on
 * ne sait pas ordonnancer les étapes ne doit pas apparaître à la sélection du
 * mercredi, où elle produirait un plan faux.
 */
import { agrege, parPart, pour100De } from '../../src/lib/nutrition/macros.ts'
import type { Agregat } from '../../src/lib/nutrition/macros.ts'
import { analyser } from './ingredient.ts'
import { rattacher } from './aliment.ts'
import type { AlimentIndexe } from './aliment.ts'
import { analyserEtape, dependances } from './etape.ts'
import type { EtapeAnalysee, Referentiel } from './etape.ts'
import type { RecetteBrute } from './jsonld.ts'

export interface Conversion {
  unit_label: string
  ciqual_subgroup: string | null
  grams: number
}

export interface Contexte {
  referentiel: Referentiel
  aliments: AlimentIndexe[]
  conversions: Conversion[]
  /** `food_id` → sous-groupe CIQUAL, pour choisir la bonne conversion. */
  sousGroupes: Map<string, string | null>
  /** `food_id` → g/ml, quand la densité est connue. */
  densites: Map<string, number>
  /** `food_id` → valeurs pour 100 g. Sert à calculer les macros de la recette. */
  nutriments?: Map<string, unknown>
  /** sous-groupe → grammes typiques, pour les lignes sans quantité. */
  typiques?: Map<string, number>
}

export interface IngredientPret {
  ordinal: number
  raw_text: string
  food_id: string | null
  qty: number | null
  unit: string | null
  grams_reference: number | null
  resolution_source: 'reference' | 'aucune'
  confidence: number
}

export interface EtapePrete {
  ordinal: number
  text: string
  verb: string | null
  quantity_g: number | null
  duration_min: number | null
  duration_source: 'declaree' | 'defaut' | null
  appliance_type: string | null
  temperature_c: number | null
  temperature_source: 'declaree' | 'defaut' | null
  load_type: 'actif' | 'passif' | 'bloquant' | null
  confidence: number
}

/** Les macros par part, quand la recette est assez résolue pour qu'elles valent. */
export interface NutritionPrete {
  grams: number
  kcal: number
  protein_g: number
  fiber_g: number
  carb_g: number
  fat_g: number
  kcal_margin: number
  protein_g_margin: number
  coverage: number
}

export interface RecettePrete {
  recipe: {
    source_url: string
    source_name: string | null
    origin: 'importee'
    title: string | null
    yield_servings: number | null
    total_time_min: number | null
    prep_time_min: number | null
    cook_time_min: number | null
    license_note: string | null
    plannable: boolean
    freezable: boolean | null
  }
  ingredients: IngredientPret[]
  /** Étapes ordonnançables seulement : les « bon appétit » sont écartés ici. */
  etapes: EtapePrete[]
  /** Paires (ordinal avant, ordinal après), dans l'espace des étapes retenues. */
  dependances: [number, number][]
  /**
   * Les macros par part. `null` quand trop de lignes manquent : une valeur
   * calculée sur la moitié d'une recette est pire qu'aucune valeur, parce
   * qu'elle sert ensuite à filtrer (D18).
   */
  nutrition: NutritionPrete | null
  /** Ce qui manque, pour le journal d'ingestion. */
  motifs: string[]
}

/**
 * « Se congèle ou non » (D27).
 *
 * Aucune source ne le porte. On le déduit du titre et des ingrédients, et on
 * rend `null` — jamais `false` — quand rien ne tranche : « on ne sait pas » et
 * « ça ne se congèle pas » ne doivent pas se confondre dans un filtre.
 */
export function seCongele(titre: string | null, ingredients: IngredientPret[]): boolean | null {
  const t = (titre ?? '').toLowerCase()
  const tout = t + ' ' + ingredients.map(i => i.raw_text.toLowerCase()).join(' ')

  // Ce qui ne survit pas au congélateur : l'eau des crudités fait éclater les
  // cellules, les émulsions tranchent, les fritures ramollissent.
  if (/\bsalade|crudit|carpaccio|tartare|mayonnaise|vinaigrette|fritur|frites\b/.test(tout)) return false
  if (/\bcrème fraîche|fromage blanc|yaourt\b/.test(tout) && /\bsalade|sauce froide/.test(tout)) return false

  // Ce qui se congèle sans discussion.
  if (/\bsoupe|velouté|potage|gratin|lasagne|dahl|curry|chili|ragoût|blanquette/.test(tout)) return true
  if (/\bmijot|compote|purée|bolognaise|hachis|tajine|boulettes?\b/.test(tout)) return true

  return null
}

/** Un millilitre d'eau pèse un gramme. Faute de densité, c'est le moins faux. */
const DENSITE_PAR_DEFAUT = 1

function enGrammes(
  ligne: ReturnType<typeof analyser>,
  foodId: string | null,
  ctx: Contexte,
): number | null {
  if (ligne.qte === null) return null
  const sousGroupe = foodId ? ctx.sousGroupes.get(foodId) ?? null : null

  switch (ligne.forme) {
    case 'masse': {
      const u = (ligne.unite ?? 'g').toLowerCase()
      if (/^(kg|kilo)/.test(u)) return ligne.qte * 1000
      if (u === 'mg') return ligne.qte / 1000
      return ligne.qte
    }
    case 'volume': {
      const u = (ligne.unite ?? 'ml').toLowerCase()
      const ml = /^(l|litre)/.test(u) ? ligne.qte * 1000
        : /^cl/.test(u) ? ligne.qte * 10
        : /^dl/.test(u) ? ligne.qte * 100
        : ligne.qte
      const densite = foodId ? ctx.densites.get(foodId) ?? DENSITE_PAR_DEFAUT : DENSITE_PAR_DEFAUT
      return Math.round(ml * densite * 10) / 10
    }
    case 'cuillere': {
      if (!ligne.unite) return null
      // Le sous-groupe l'emporte sur la valeur générale : une cuillère d'huile
      // ne pèse pas une cuillère de sel.
      const precise = ctx.conversions.find(
        c => c.unit_label === ligne.unite && c.ciqual_subgroup === sousGroupe)
      const generale = ctx.conversions.find(
        c => c.unit_label === ligne.unite && c.ciqual_subgroup === null)
      const g = precise?.grams ?? generale?.grams
      return g === undefined ? null : Math.round(ligne.qte * g * 10) / 10
    }
    // « 2 oignons » : il faudrait `unit_weight`, qui n'est pas encore rempli.
    // On rend `null` plutôt qu'un chiffre inventé — les macros afficheront une
    // fourchette, et c'est exactement ce qu'il faut (D18).
    default:
      return null
  }
}

export function preparerIngredients(brute: RecetteBrute, ctx: Contexte): IngredientPret[] {
  return brute.ingredients.map((brut, i) => {
    const ligne = analyser(brut)
    // Une ligne de section (« Pour la garniture : ») n'est pas un ingrédient.
    if (ligne.forme === 'section') {
      return {
        ordinal: i + 1, raw_text: brut, food_id: null, qty: null, unit: null,
        grams_reference: null, resolution_source: 'aucune' as const, confidence: 0,
      }
    }
    const corr = rattacher(ligne.aliment, ctx.aliments)
    const grammes = enGrammes(ligne, corr?.foodId ?? null, ctx)
    return {
      ordinal: i + 1,
      raw_text: brut,
      food_id: corr?.foodId ?? null,
      qty: ligne.qte,
      unit: ligne.unite,
      grams_reference: grammes,
      resolution_source: corr ? 'reference' as const : 'aucune' as const,
      // Le score du rattachement peut dépasser 1 (bonus de tête de nom) ; la
      // base attend une confiance entre 0 et 1. On borne plutôt que d'échouer.
      confidence: Math.min(1, Math.max(0, corr?.score ?? 0)),
    }
  })
}

/**
 * Les grammes que cette étape met en jeu, déduits des ingrédients qu'elle cite.
 *
 * C'est ce qui rend la FUSION possible (D35) : sans quantité, on ne sait pas si
 * « émincez les oignons » du dahl et celui de la basquaise sont le même travail,
 * et l'optimiseur les laisse séparés. L'étape cite rarement un poids ; la liste
 * d'ingrédients, elle, le porte presque toujours.
 *
 * On ne retient qu'un ingrédient cité NOMMÉMENT, et seulement s'il est pesé.
 */
export function quantiteCitee(texte: string, ingredients: IngredientPret[]): number | null {
  const plie = pliureSimple(texte)
  let total = 0
  let vu = false
  for (const g of ingredients) {
    if (g.grams_reference === null || g.food_id === null) continue
    const nom = pliureSimple(analyser(g.raw_text).aliment)
    // Trois lettres suffiraient à confondre « riz » et « paprika » : on exige un
    // mot entier d'au moins quatre lettres.
    if (nom.length < 4) continue
    const racine = nom.split(/\s+/)[0]
    if (racine.length < 4) continue
    if (new RegExp(`\\b${racine}`).test(plie)) { total += g.grams_reference; vu = true }
  }
  return vu ? Math.round(total) : null
}

const pliureSimple = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').toLowerCase()

/**
 * Une recette est PLANIFIABLE quand son plan ne mentira pas.
 *
 * Deux conditions, et elles sont volontairement sévères : on préfère garder une
 * recette hors du choix du mercredi plutôt que de la faire entrer dans une
 * session avec des durées inventées.
 */
export const SEUIL_ETAPES_DATEES = 0.8
export const MINIMUM_ETAPES = 2

export function estPlanifiable(etapes: EtapePrete[]): { oui: boolean; motifs: string[] } {
  const motifs: string[] = []
  if (etapes.length < MINIMUM_ETAPES) {
    motifs.push(`seulement ${etapes.length} étape(s) exploitable(s)`)
  }
  const datees = etapes.filter(e => e.duration_min !== null && e.duration_min > 0)
  const taux = etapes.length > 0 ? datees.length / etapes.length : 0
  if (taux < SEUIL_ETAPES_DATEES) {
    motifs.push(`${Math.round(taux * 100)} % d'étapes datées, il en faut ${SEUIL_ETAPES_DATEES * 100} %`)
  }
  return { oui: motifs.length === 0, motifs }
}

function enEtapePrete(
  e: EtapeAnalysee, ordinal: number, quantiteDeduite: number | null,
): EtapePrete {
  return {
    ordinal,
    text: e.brut,
    verb: e.verbe,
    // Écrite dans l'étape d'abord ; à défaut, déduite des ingrédients cités.
    quantity_g: e.quantiteG ?? quantiteDeduite,
    duration_min: e.dureeMin,
    duration_source: e.sourceDuree,
    appliance_type: e.appareil,
    temperature_c: e.temperatureC,
    temperature_source: e.sourceTemperature,
    load_type: e.charge,
    confidence: e.confiance,
  }
}

export function preparer(brute: RecetteBrute, ctx: Contexte): RecettePrete {
  const ingredients = preparerIngredients(brute, ctx)

  const analysees = brute.etapes.map(t => analyserEtape(t, ctx.referentiel))
  const liens = dependances(analysees)

  // On renumérote sur les seules étapes retenues : le graphe doit parler des
  // étapes qui existent, pas des indices du texte d'origine.
  const gardees: number[] = []
  analysees.forEach((e, i) => { if (e.estAction) gardees.push(i) })
  const rang = new Map(gardees.map((i, n) => [i, n + 1]))

  const etapes = gardees.map((i, n) =>
    enEtapePrete(analysees[i], n + 1, quantiteCitee(analysees[i].brut, ingredients)))
  const arcs: [number, number][] = []
  for (const i of gardees) {
    for (const avant of liens[i]) {
      const a = rang.get(Number(avant))
      const b = rang.get(i)
      if (a !== undefined && b !== undefined && a !== b) arcs.push([a, b])
    }
  }

  // ── Les macros par part, pour les filtres (D18) ──────────────────────────
  let nutrition: NutritionPrete | null = null
  if (ctx.nutriments) {
    const lignes = ingredients.map(g => ({
      grammes: g.grams_reference,
      grammesTypiques: g.food_id
        ? ctx.typiques?.get(ctx.sousGroupes.get(g.food_id) ?? '') ?? null
        : null,
      pour100: g.food_id ? pour100De(ctx.nutriments.get(g.food_id)) : null,
    }))
    const a: Agregat = agrege(lignes)
    const grammesPlat = lignes.reduce(
      (s2, l) => s2 + (l.pour100 ? (l.grammes ?? l.grammesTypiques ?? 0) : 0), 0)
    const parts = Math.max(1, brute.parts ?? 1)

    if (a.couverture >= 0.75 && grammesPlat > 0) {
      const p = parPart(a, grammesPlat, grammesPlat / parts)
      nutrition = {
        grams: Math.round(grammesPlat / parts),
        kcal: p.valeur.kcal,
        protein_g: p.valeur.proteinG,
        fiber_g: p.valeur.fiberG,
        carb_g: p.valeur.carbG,
        fat_g: p.valeur.fatG,
        kcal_margin: p.marge.kcal,
        protein_g_margin: p.marge.proteinG,
        coverage: Math.round(a.couverture * 100) / 100,
      }
    }
  }

  const { oui, motifs } = estPlanifiable(etapes)
  const sansAliment = ingredients.filter(g => g.food_id === null).length
  if (sansAliment > ingredients.length / 2) {
    motifs.push(`${sansAliment} ingrédient(s) sur ${ingredients.length} non rattachés`)
  }

  return {
    recipe: {
      source_url: brute.url,
      source_name: brute.source,
      origin: 'importee',
      title: brute.titre,
      yield_servings: brute.parts,
      total_time_min: brute.totalMin,
      prep_time_min: brute.prepMin,
      cook_time_min: brute.cuissonMin,
      // L'attribution n'est pas une politesse : on republie le travail d'autrui.
      freezable: seCongele(brute.titre, ingredients),
      license_note: brute.licence
        ?? (brute.source ? `Recette importée depuis ${brute.source} — ${brute.url}` : brute.url),
      plannable: oui,
    },
    ingredients,
    etapes,
    dependances: arcs,
    nutrition,
    motifs,
  }
}
