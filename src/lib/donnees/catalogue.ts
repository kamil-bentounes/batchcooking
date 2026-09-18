/**
 * Chercher une recette (lot 4, §10.0 et §10.1).
 *
 * L'ordre du parcours est une exigence, pas une préférence : **le gratuit
 * d'abord, toujours**. On filtre le catalogue — déterministe, instantané — et
 * l'IA n'intervient que sur un bouton explicite, à côté des résultats.
 *
 * Deux règles portent tout le reste :
 *
 *  · **Le temps ACTIF, pas le temps total.** Dix minutes de gestes et quarante
 *    de four ne font pas cinquante minutes de travail. C'est le filtre le plus
 *    utile et personne ne l'a, parce qu'il exige de connaître la charge de
 *    chaque étape (D19, D30).
 *  · **La borne DÉFAVORABLE, jamais la moyenne** (D18). « Au moins 30 g de
 *    protéines » se lit sur la borne basse, « au plus 600 kcal » sur la borne
 *    haute. Filtrer sur la moyenne ferait passer des recettes qui ne tiennent
 *    pas la promesse.
 */
import { useQuery } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'

export type Filtres = {
  texte: string
  /** Minutes actives au plus. `null` = peu importe. */
  tempsActifMax: number | null
  /** Grammes de protéines au moins, sur la borne BASSE. */
  proteinesMin: number | null
  /** Kilocalories au plus, sur la borne HAUTE. */
  kcalMax: number | null
  /** Recettes réalisables avec ces appareils seulement. Vide = peu importe. */
  appareils: string[]
  /** `true` = seulement ce qui se congèle. `null` = peu importe. */
  congelable: boolean | null
  /**
   * D28 : une BASCULE, pas un filtre imposé. En mode « tout », chaque recette
   * affiche ses manques ; en mode « ce qu'on a », on ne montre que le faisable.
   */
  avecCeQuOnA: boolean
  /** Écarte les recettes déjà cuisinées par le foyer. */
  jamaisFaites: boolean
}

export const FILTRES_VIDES: Filtres = {
  texte: '',
  tempsActifMax: null,
  proteinesMin: null,
  kcalMax: null,
  appareils: [],
  congelable: null,
  avecCeQuOnA: false,
  jamaisFaites: false,
}

export type Candidate = {
  id: string
  title: string | null
  yield_servings: number | null
  total_time_min: number | null
  active_time_min: number | null
  appliances: string[]
  freezable: boolean | null
  step_count: number
  source_name: string | null
  origin: string
  nutrition: {
    kcal: number
    protein_g: number
    kcal_margin: number
    protein_g_margin: number
    fiber_g: number
    coverage: number
  } | null
  /** Ingrédients que le foyer n'a pas. Rempli seulement si l'on sait. */
  manques: string[]
}

/** Les bornes affichables d'une recette. Jamais la moyenne (D18). */
export function bornes(c: Candidate) {
  if (!c.nutrition) return null
  return {
    proteinesMin: Math.round(c.nutrition.protein_g - c.nutrition.protein_g_margin),
    proteinesMax: Math.round(c.nutrition.protein_g + c.nutrition.protein_g_margin),
    kcalMin: Math.round(c.nutrition.kcal - c.nutrition.kcal_margin),
    kcalMax: Math.round(c.nutrition.kcal + c.nutrition.kcal_margin),
    sur: c.nutrition.coverage,
  }
}

/**
 * Le candidat passe-t-il les filtres que la base ne sait pas appliquer ?
 *
 * Extrait pour être éprouvé : c'est ici que vit la règle de la BORNE
 * DÉFAVORABLE, et une inversion de signe y passerait inaperçue — l'écran
 * afficherait simplement quelques recettes de trop.
 */
export function retient(c: Candidate, f: Filtres, dejaFaites: Set<string>): boolean {
  if (f.jamaisFaites && dejaFaites.has(c.id)) return false

  // Une recette sans macros connues n'est pas écartée par défaut : elle ne
  // l'est que si l'on filtre justement sur ce qu'on ignore.
  if (f.proteinesMin === null && f.kcalMax === null) return true
  const b = bornes(c)
  if (!b) return false

  // Protéines : la borne BASSE doit atteindre le seuil. « Au moins 30 g »
  // écarte une recette annoncée entre 28 et 34.
  if (f.proteinesMin !== null && b.proteinesMin < f.proteinesMin) return false
  // Calories : la borne HAUTE doit rester sous le plafond.
  if (f.kcalMax !== null && b.kcalMax > f.kcalMax) return false
  return true
}

/** Combien de filtres sont posés. Sert à dire « Affiner · 3 ». */
export function nombreDeFiltres(f: Filtres): number {
  return [f.tempsActifMax, f.proteinesMin, f.kcalMax, f.congelable].filter(x => x !== null).length
    + (f.appareils.length > 0 ? 1 : 0)
    + (f.avecCeQuOnA ? 1 : 0)
    + (f.jamaisFaites ? 1 : 0)
}

type LigneBrute = Omit<Candidate, 'nutrition' | 'manques'> & {
  recipe_nutrition: Candidate['nutrition'] | Candidate['nutrition'][] | null
}

const LIMITE = 80

export function useCatalogue(f: Filtres) {
  return useQuery({
    queryKey: ['catalogue', f],
    staleTime: 20_000,
    queryFn: async (): Promise<Candidate[]> => {
      // ── Ce que le foyer a, et ce qu'il a déjà cuisiné ─────────────────────
      // On n'interroge que si le filtre le demande : ces deux requêtes ne
      // servent à rien dans le cas courant, et l'écran se rafraîchit à chaque
      // frappe dans la recherche.
      const aliments = new Set<string>()
      if (f.avecCeQuOnA) {
        for (const s of ou(await supabase.from('stock_item').select('food_id'))) {
          if (s.food_id) aliments.add(s.food_id)
        }
      }
      const dejaFaites = new Set<string>()
      if (f.jamaisFaites) {
        for (const r of ou(await supabase.from('cycle_recipe').select('recipe_id'))) {
          dejaFaites.add(r.recipe_id)
        }
      }

      // ── La requête, filtrée par la BASE ───────────────────────────────────
      // Les bornes sont des colonnes générées (migration 0029) : sans cela,
      // « au moins 30 g de protéines » ne cherchait que parmi les 240 recettes
      // les plus rapides, et pouvait rendre « rien » alors que des centaines
      // qualifiaient.
      const surMacros = f.proteinesMin !== null || f.kcalMax !== null
      let q = supabase.from('recipe')
        .select(`id, title, yield_servings, total_time_min, active_time_min,
                 appliances, freezable, step_count, source_name, origin,
                 recipe_nutrition${surMacros ? '!inner' : ''}(kcal, protein_g,
                                  kcal_margin, protein_g_margin, fiber_g, coverage)`)
        .not('title', 'is', null)
        .eq('plannable', true)

      // La borne DÉFAVORABLE, jamais la moyenne (D18).
      if (f.proteinesMin !== null) {
        q = q.gte('recipe_nutrition.protein_g_min', f.proteinesMin)
      }
      if (f.kcalMax !== null) q = q.lte('recipe_nutrition.kcal_max', f.kcalMax)

      if (f.texte.trim()) q = q.ilike('title', `%${f.texte.trim()}%`)
      if (f.tempsActifMax !== null) q = q.lte('active_time_min', f.tempsActifMax)
      if (f.congelable === true) q = q.eq('freezable', true)
      // Un appareil non coché ne doit apparaître dans AUCUNE étape : `contains`
      // ne sait pas dire cela, `overlaps` avec le complément si.
      if (f.appareils.length > 0) {
        const interdits = ['four', 'plaques', 'air_fryer', 'micro_ondes', 'autocuiseur', 'blender', 'batteur', 'robot_cuiseur']
          .filter(a => !f.appareils.includes(a))
        if (interdits.length > 0) q = q.not('appliances', 'ov', `{${interdits.join(',')}}`)
      }

      const lignes = ou(await q.order('active_time_min', { ascending: true, nullsFirst: false })
        .limit(LIMITE * 3)) as unknown as LigneBrute[]

      // ── Ce que PostgREST ne sait pas filtrer ──────────────────────────────
      const resultats: Candidate[] = []
      for (const l of lignes) {
        // La jointure rend un objet ou un tableau selon la cardinalité déduite.
        const n = Array.isArray(l.recipe_nutrition)
          ? l.recipe_nutrition[0] ?? null
          : l.recipe_nutrition
        const c: Candidate = { ...l, nutrition: n ?? null, manques: [] }

        if (!retient(c, f, dejaFaites)) continue
        resultats.push(c)
        if (resultats.length >= LIMITE * 2) break
      }

      // ── Les manques, quand le foyer a un inventaire ───────────────────────
      if (aliments.size > 0 && resultats.length > 0) {
        const ing = ou(await supabase.from('recipe_ingredient')
          .select('recipe_id, food_id, raw_text')
          .in('recipe_id', resultats.slice(0, LIMITE).map(r => r.id)))

        const parRecette = new Map<string, string[]>()
        for (const i of ing) {
          if (i.food_id && aliments.has(i.food_id)) continue
          if (!i.food_id) continue          // non rattaché : on ne sait pas, on se tait
          if (!parRecette.has(i.recipe_id)) parRecette.set(i.recipe_id, [])
          parRecette.get(i.recipe_id)!.push(i.raw_text)
        }
        for (const c of resultats) c.manques = parRecette.get(c.id) ?? []

        // D28 : la bascule filtre, elle ne masque pas en mode « tout ».
        if (f.avecCeQuOnA) {
          return resultats.filter(c => c.manques.length === 0).slice(0, LIMITE)
        }
        // Le plus faisable d'abord : c'est l'ordre utile quand on a un frigo.
        resultats.sort((a, b) => a.manques.length - b.manques.length)
      }

      return resultats.slice(0, LIMITE)
    },
  })
}

/** Combien de recettes au total, pour dire « 128 recettes » avant de filtrer. */
export function useTailleCatalogue() {
  return useQuery({
    queryKey: ['catalogue-taille'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count, error } = await supabase.from('recipe')
        .select('id', { count: 'exact', head: true }).eq('plannable', true)
      if (error) throw new Error(error.message)
      return count ?? 0
    },
  })
}
