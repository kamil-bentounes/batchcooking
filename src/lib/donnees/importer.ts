/**
 * Coller sa propre recette.
 *
 * Le découpage du texte est fait par l'Edge Function `importer` — le modèle
 * sépare, le déterministe lit. Ici on ne fait que deux choses : demander, puis
 * ENREGISTRER sous la même forme qu'une recette ingérée.
 *
 * La même forme, c'est ce qui compte : les filtres du catalogue, l'ordonnanceur
 * et les macros avec leur fourchette marchent alors dessus sans rien savoir de
 * sa provenance.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import { agrege, parPart, pour100De } from '../nutrition/macros.ts'

export type IngredientLu = {
  ordinal: number
  raw_text: string
  food_id: string | null
  food_nom: string | null
  qty: number | null
  unit: string | null
  grams_reference: number | null
  confidence: number
}

export type EtapeLue = {
  ordinal: number
  text: string
  verb: string | null
  duration_min: number | null
  duration_source: 'declaree' | 'defaut' | null
  appliance_type: string | null
  temperature_c: number | null
  load_type: 'actif' | 'passif' | 'bloquant' | null
  confidence: number
}

export type RecetteLue = {
  titre: string | null
  parts: number | null
  ingredients: IngredientLu[]
  etapes: EtapeLue[]
  aCompleter: string[]
  restantes: number
  quota: number
  ms: number
  par: string
}

/**
 * Les macros par part, calculées comme à l'ingestion.
 *
 * ⚠️ Elles se CALCULENT, elles ne se demandent pas à un modèle. C'est ce qui
 *    permet d'afficher « 28–34 g de protéines » plutôt qu'un chiffre inventé,
 *    et c'est ce que le filtre « au moins 30 g » lit (D18). En dessous de 75 %
 *    de couverture, on ne rend RIEN : une valeur calculée sur la moitié d'une
 *    recette est pire que pas de valeur, puisqu'elle sert ensuite à filtrer.
 */
async function macros(ingredients: IngredientLu[], parts: number) {
  const ids = [...new Set(ingredients.map(i => i.food_id).filter((x): x is string => !!x))]
  if (ids.length === 0) return null

  const aliments = ou(await supabase.from('food')
    .select('id, nutrients, ciqual_subgroup').in('id', ids))
  const parId = new Map(aliments.map(a => [a.id, a]))
  const typiques = new Map((ou(await supabase.from('typical_quantity')
    .select('ciqual_subgroup, grams'))).map(t => [t.ciqual_subgroup, Number(t.grams)]))

  const lignes = ingredients.map(i => {
    const a = i.food_id ? parId.get(i.food_id) : null
    return {
      grammes: i.grams_reference === null ? null : Number(i.grams_reference),
      grammesTypiques: a ? typiques.get(a.ciqual_subgroup ?? '') ?? null : null,
      pour100: a ? pour100De(a.nutrients) : null,
    }
  })

  const a = agrege(lignes)
  const grammesPlat = lignes.reduce(
    (s, l) => s + (l.pour100 ? (l.grammes ?? l.grammesTypiques ?? 0) : 0), 0)
  if (a.couverture < 0.75 || grammesPlat <= 0) return null

  const p = parPart(a, grammesPlat, grammesPlat / Math.max(1, parts))
  return {
    grams: Math.round(grammesPlat / Math.max(1, parts)),
    kcal: p.valeur.kcal, protein_g: p.valeur.proteinG,
    fiber_g: p.valeur.fiberG, carb_g: p.valeur.carbG, fat_g: p.valeur.fatG,
    kcal_margin: p.marge.kcal, protein_g_margin: p.marge.proteinG,
    coverage: Math.round(a.couverture * 100) / 100,
  }
}

export function useEnregistreImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: {
      titre: string
      parts: number
      ingredients: IngredientLu[]
      etapes: EtapeLue[]
      note: string | null
    }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      if (!r.titre.trim()) throw new Error('Il lui faut un titre.')
      if (r.etapes.length === 0) throw new Error('Une recette sans étape ne se planifie pas.')

      /*
       * `plannable` dit si l'ordonnanceur saura en faire quelque chose. Sans
       * durée, il ne peut pas : la recette existe, elle se lit, mais elle ne
       * part pas au plan du dimanche. On le dit plutôt que de la laisser
       * produire un plan faux.
       */
      const datees = r.etapes.filter(e => e.duration_min !== null).length
      const recette = ou(await supabase.from('recipe').insert({
        title: r.titre.trim(),
        origin: 'manuelle',
        owner_household_id: foyer,
        visibility: 'privee',
        yield_servings: Math.max(1, r.parts),
        total_time_min: r.etapes.reduce((s, e) => s + (e.duration_min ?? 0), 0) || null,
        plannable: datees === r.etapes.length && r.etapes.length > 0,
        import_note: r.note?.trim() || null,
        license_note: 'Collée par le foyer.',
      }).select().single())

      if (r.ingredients.length > 0) {
        ou(await supabase.from('recipe_ingredient').insert(
          r.ingredients.map((i, n) => ({
            recipe_id: recette.id,
            ordinal: n + 1,
            raw_text: i.raw_text,
            food_id: i.food_id,
            qty: i.qty,
            unit: i.unit,
            grams_reference: i.grams_reference,
            resolution_source: i.food_id ? 'reference' as const : 'aucune' as const,
            confidence: i.confidence,
          }))).select())
      }

      // L'ordre du texte fait foi, comme à l'ingestion : une étape suit la
      // précédente tant que personne n'a saisi de graphe.
      const posees = ou(await supabase.from('recipe_step').insert(
        r.etapes.map((e, n) => ({
          recipe_id: recette.id,
          ordinal: n + 1,
          text: e.text,
          verb: e.verb,
          duration_min: e.duration_min,
          duration_source: e.duration_source,
          appliance_type: e.appliance_type,
          temperature_c: e.temperature_c,
          load_type: e.load_type ?? 'actif',
          confidence: e.confidence,
        }))).select('id, ordinal'))

      const parOrdinal = new Map(posees.map(s => [s.ordinal, s.id]))
      const arcs = posees.slice(1)
        .map(s => ({ before_id: parOrdinal.get(s.ordinal - 1), after_id: s.id }))
        .filter((a): a is { before_id: string; after_id: string } => !!a.before_id)
      if (arcs.length > 0) {
        await supabase.from('recipe_step_dependency').insert(arcs)
      }

      const n = await macros(r.ingredients, r.parts)
      if (n) await supabase.from('recipe_nutrition').insert({ recipe_id: recette.id, ...n })

      return { recette, macros: n, plannable: datees === r.etapes.length }
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}
