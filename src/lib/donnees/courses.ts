/**
 * La liste de courses (D43 à D46, D49, D55 à D59).
 *
 * Aucune API de drive n'existe pour un particulier : la liste est faite pour
 * être tenue à la main, dans le magasin. Trois conséquences, toutes visibles
 * dans ce fichier :
 *
 *   · elle se GÉNÈRE depuis les recettes choisies, puis se corrige librement ;
 *   · elle est GROUPÉE par magasin puis par rayon, dans l'ordre appris du
 *     geste — pas dans l'ordre des recettes, qui ne veut rien dire sur place ;
 *   · cocher REMPLIT l'inventaire (D49) : on ne saisit pas deux fois ce qu'on
 *     vient d'acheter.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ou, ouNul, supabase } from '../supabase.ts'
import type { Ligne } from '../supabase.ts'
import { rayonDe } from '../rayons.ts'
import { estimation } from '../prix.ts'

export type Article = Ligne<'shopping_item'>

export const CLE = {
  liste: (cycleId: string | undefined) => ['courses', cycleId] as const,
  suggestions: ['suggestions'] as const,
  habitudes: ['habitudes'] as const,
  rayons: ['rayons'] as const,
}

export function useListe(cycleId: string | undefined) {
  return useQuery({
    queryKey: CLE.liste(cycleId),
    enabled: !!cycleId,
    queryFn: async () => ou(await supabase.from('shopping_item').select('*')
      .eq('cycle_id', cycleId!).order('created_at')),
    staleTime: 5_000,
  })
}

/** L'ordre appris des rayons, magasin par magasin (D58). */
export function useOrdreDesRayons() {
  return useQuery({
    queryKey: CLE.rayons,
    queryFn: async () => ou(await supabase.from('aisle_order').select('*')),
    staleTime: 60_000,
  })
}

// L'ordre du magasin et le budget sont du calcul pur : ils vivent dans
// `lib/liste.ts`, où ils s'éprouvent sans base.
export { budget, organise } from '../liste.ts'
export type { Groupe, Sortie } from '../liste.ts'

type LigneRecette = {
  recipe_id: string
  food_id: string | null
  raw_text: string
  qty: number | null
  unit: string | null
  grams_reference: number | null
  food: { name: string; ciqual_group: string | null } | null
}

/**
 * Génère la liste depuis les recettes choisies.
 *
 * On NE retranche PAS ce qu'il y a déjà au frigo : l'inventaire annote, il ne
 * filtre pas (D28). Croire qu'il reste 300 g de carottes et rentrer sans en
 * acheter parce que l'app l'a décidé, c'est une soirée gâchée.
 */
export function useGenereListe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cycleId: string) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')

      const choisies = ou(await supabase.from('cycle_recipe')
        .select('recipe_id, servings, recipe:recipe_id(yield_servings)')
        .eq('cycle_id', cycleId))
      if (choisies.length === 0) throw new Error('Aucune recette choisie.')

      const magasinDefaut = ouNul(await supabase.from('store').select('id')
        .eq('is_default', true).maybeSingle())

      const ingredients = ou(await supabase.from('recipe_ingredient')
        .select('recipe_id, food_id, raw_text, qty, unit, grams_reference, food:food_id(name, ciqual_group)')
        .in('recipe_id', choisies.map(c => c.recipe_id))) as unknown as LigneRecette[]

      /*
       * Ce que le foyer a PESÉ (lot 0c) prime sur le référentiel partagé.
       *
       * Sans cela la boucle de pesée ne servait à rien : peser trois fois ses
       * oignons faisait disparaître la ligne de l'écran « Peser » et ne
       * changeait aucun gramme. C'est ici que ça compte — « 2 oignons » devient
       * 236 g pour CE foyer, et la liste de courses le dit.
       */
      const pesesDuFoyer = new Map<string, number>()
      for (const w of ou(await supabase.from('household_unit_weight')
        .select('food_id, grams').eq('actif', true))) {
        pesesDuFoyer.set(w.food_id, Number(w.grams))
      }

      // Facteur d'échelle par recette : on cuisine `servings` parts d'une
      // recette qui en rend `yield_servings`.
      const facteur = new Map(choisies.map(c => {
        const rend = (c.recipe as { yield_servings: number | null } | null)?.yield_servings
        return [c.recipe_id, rend && rend > 0 ? c.servings / rend : 1]
      }))

      // Regroupement : même aliment = une ligne, quantités additionnées. À
      // défaut d'aliment rattaché, on regroupe sur le texte brut normalisé.
      type Cumul = {
        label: string; food_id: string | null; groupe: string | null
        grammes: number | null; unite: string | null; quantite: number | null
        /** Ce qu'on n'a pas su convertir et qu'on refuse de perdre. */
        nonConverti: number
      }
      const cumuls = new Map<string, Cumul>()
      for (const i of ingredients) {
        const f = facteur.get(i.recipe_id) ?? 1
        const cle = i.food_id ?? `brut:${i.raw_text.toLowerCase().trim()}`
        const nom = i.food?.name ?? i.raw_text
        const c = cumuls.get(cle) ?? {
          label: nom, food_id: i.food_id, groupe: i.food?.ciqual_group ?? null,
          grammes: null, unite: null, quantite: null, nonConverti: 0,
        }
        // Le poids appris par le foyer, quand il en a un : c'est LUI qui fait
        // qu'« 2 oignons » vaut quelque chose.
        const pese = i.food_id && i.unit === null && i.qty !== null
          ? pesesDuFoyer.get(i.food_id) ?? null
          : null

        if (pese !== null) {
          c.grammes = (c.grammes ?? 0) + Number(i.qty) * pese * f
        } else if (i.grams_reference !== null) {
          c.grammes = (c.grammes ?? 0) + Number(i.grams_reference) * f
        } else if (i.qty !== null) {
          // Sans conversion en grammes, on additionne à l'unité près, et
          // seulement entre unités identiques.
          if (c.unite === null || c.unite === i.unit) {
            c.unite = i.unit
            c.quantite = (c.quantite ?? 0) + Number(i.qty) * f
          } else {
            c.nonConverti += Number(i.qty) * f
          }
        }
        cumuls.set(cle, c)
      }

      // On repart de zéro sur les lignes issues des recettes, jamais sur celles
      // ajoutées à la main : les effacer serait perdre le travail de quelqu'un.
      ou(await supabase.from('shopping_item').delete()
        .eq('cycle_id', cycleId).eq('source', 'recette').select())

      // Ce que le foyer a déjà payé pour ces produits (lot 5). C'est la seule
      // source de prix qu'on ait : il n'existe aucune API pour un particulier,
      // et une moyenne nationale ne dirait rien de NOTRE enseigne.
      const appris = ou(await supabase.from('price_knowledge').select('*'))
      const connus = appris.map(p => ({
        label: p.label ?? '', food_id: p.food_id, store_id: p.store_id,
        unit: p.unit ?? 'u', avg_price_eur: p.avg_price_eur ?? 0,
        last_price_eur: p.last_price_eur ?? 0, observations: p.observations ?? 1,
      }))

      const magasin = magasinDefaut ? magasinDefaut.id : null
      const lignes = [...cumuls.values()].map(c => {
        const quantite = c.grammes ?? c.quantite ?? null
        const unite = c.grammes !== null ? 'g' : c.unite
        // Un compte qu'on n'a su ni convertir ni additionner ne DISPARAÎT pas :
        // « 500 g de poireaux » et « 2 poireaux » faisaient 500 g, et les deux
        // poireaux s'évaporaient sans un mot. On le dit dans le libellé, où ça
        // se corrige d'un geste dans le magasin.
        const reste = c.grammes !== null && c.quantite !== null
          ? c.quantite + c.nonConverti
          : c.nonConverti
        const prix = connus.length === 0 ? null : estimation(
          { label: c.label, food_id: c.food_id, quantity: quantite, unit: unite },
          connus, magasin)
        return {
          cycle_id: cycleId,
          household_id: foyer,
          store_id: magasin,
          food_id: c.food_id,
          label: reste > 0
            ? `${c.label} (+ ${Math.round(reste)} à compter)`
            : c.label,
          aisle: rayonDe({ groupe: c.groupe, libelle: c.label }),
          quantity: quantite,
          unit: unite,
          est_price_eur: prix?.euros ?? null,
          source: 'recette' as const,
        }
      }).filter(l => l.label.trim().length > 0)

      return ou(await supabase.from('shopping_item').insert(lignes).select())
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useAjouteArticle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: {
      cycleId: string | null; label: string; storeId?: string | null
      rayon?: string | null; quantite?: number | null; unite?: string | null
      prix?: number | null; source?: Article['source']
    }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      return ou(await supabase.from('shopping_item').insert({
        cycle_id: a.cycleId,
        household_id: foyer,
        store_id: a.storeId ?? null,
        label: a.label.trim(),
        aisle: a.rayon ?? rayonDe({ libelle: a.label }),
        quantity: a.quantite ?? null,
        unit: a.unite ?? null,
        est_price_eur: a.prix ?? null,
        source: a.source ?? 'manuel',
      }).select().single())
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useMajArticle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...champs }: { id: string } & Partial<Article>) =>
      ou(await supabase.from('shopping_item').update(champs).eq('id', id).select().single()),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useSupprimeArticle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      ou(await supabase.from('shopping_item').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries(),
  })
}

/**
 * Cocher un article (D49).
 *
 * Tout ce que ce geste déclenche — le rang, l'entrée à l'inventaire, l'ordre
 * des rayons, l'habitude retenue — est fait par la base (migration 0021). Le
 * client ne fait que poser la date : deux téléphones cochent la même liste, et
 * un invariant du produit ne peut pas dépendre de celui qui a appuyé.
 */
export function useCoche() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ article, coche }: { article: Article; coche: boolean }) =>
      ou(await supabase.from('shopping_item')
        .update({ checked_at: coche ? new Date().toISOString() : null })
        .eq('id', article.id).select().single()),
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Le catalogue « Compléter ma liste » (D43). */
export function useSuggestions() {
  return useQuery({
    queryKey: CLE.suggestions,
    queryFn: async () => ou(await supabase.from('suggested_item').select('*')
      .order('category').order('position')),
    staleTime: Infinity,
  })
}

export function useHabitudes() {
  return useQuery({
    queryKey: CLE.habitudes,
    queryFn: async () => ou(await supabase.from('shopping_habit').select('*')
      .order('times_added', { ascending: false }).limit(30)),
    staleTime: 60_000,
  })
}

/** Ouvre la sortie dans un magasin, pour que le bilan sache ce qu'elle a coûté. */
export function useSortie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ cycleId, storeId, total }:
      { cycleId: string; storeId: string; total?: number }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      return ou(await supabase.from('shopping_trip').upsert({
        cycle_id: cycleId, household_id: foyer, store_id: storeId,
        ...(total === undefined ? {} : { total_eur: total, finished_at: new Date().toISOString() }),
      }, { onConflict: 'cycle_id,store_id' }).select().single())
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}
