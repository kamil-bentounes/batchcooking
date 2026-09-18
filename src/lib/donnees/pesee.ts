/**
 * La pesée : ce qu'il reste à peser, et ce que le foyer en apprend (lot 0c).
 *
 * Ce fichier n'apprend rien lui-même — la médiane, le rejet des aberrantes et
 * le seuil d'activation sont un trigger (migration 0025). Deux téléphones
 * pèsent la même semaine, et un invariant du produit ne peut pas dépendre de
 * celui qui a saisi (D50). Ici on ne fait que demander et enregistrer.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import { nomCourt, regroupe } from '../pesee.ts'
import type { APeser, Connu, LigneAPeser } from '../pesee.ts'

export const CLE = {
  aPeser: (cycleId: string | undefined) => ['a-peser', cycleId] as const,
  connus: ['poids-connus'] as const,
  pesees: (foodId: string) => ['pesees', foodId] as const,
}

/** Ce que le foyer sait peser, avec l'avancement de ce qu'il apprend. */
export function usePoidsConnus() {
  return useQuery({
    queryKey: CLE.connus,
    queryFn: async (): Promise<Connu[]> => {
      const l = ou(await supabase.from('household_unit_weight')
        .select('food_id, grams, observations, seuil, actif'))
      return l.map(c => ({ ...c, grams: Number(c.grams) }))
    },
    staleTime: 30_000,
  })
}

/**
 * Ce qu'il reste à peser pour les recettes de ce cycle.
 *
 * Une ligne au COMPTE, c'est `qty` posée et `unit` vide : « 2 oignons ». Ce
 * sont exactement les lignes que l'application ne sait pas convertir seule, et
 * donc celles dont dépend la promesse de macros.
 */
export function useAPeser(cycleId: string | undefined) {
  return useQuery({
    queryKey: CLE.aPeser(cycleId),
    enabled: !!cycleId,
    queryFn: async (): Promise<APeser[]> => {
      const choisies = ou(await supabase.from('cycle_recipe')
        .select('recipe_id').eq('cycle_id', cycleId!))
      if (choisies.length === 0) return []

      const lignes = ou(await supabase.from('recipe_ingredient')
        .select('recipe_id, food_id, raw_text, qty, food:food_id(name)')
        .in('recipe_id', choisies.map(c => c.recipe_id))
        .not('qty', 'is', null)
        .is('unit', null)
        .not('food_id', 'is', null)) as unknown as (LigneAPeser & {
          food: { name: string } | null
        })[]

      const connus = ou(await supabase.from('household_unit_weight')
        .select('food_id, grams, observations, seuil, actif'))
        .map(c => ({ ...c, grams: Number(c.grams) }))

      const ids = [...new Set(lignes.map(l => l.food_id))]
      const refs = ids.length === 0 ? [] : ou(await supabase.from('unit_weight')
        .select('food_id, grams, confidence').in('food_id', ids))

      // Le plus sûr l'emporte : deux libellés du même aliment ne pèsent pas
      // pareil, et l'écran n'en montre qu'un.
      const references = new Map<string, number>()
      for (const r of [...refs].sort((a, b) => Number(a.confidence) - Number(b.confidence))) {
        if (r.food_id) references.set(r.food_id, Number(r.grams))
      }

      return regroupe(
        lignes.map(l => ({ ...l, nom: nomCourt(l.food?.name ?? l.raw_text) })),
        connus, references)
    },
    staleTime: 15_000,
  })
}

/** Les pesées déjà faites pour cet aliment, pour pouvoir en effacer une. */
export function usePesees(foodId: string) {
  return useQuery({
    queryKey: CLE.pesees(foodId),
    queryFn: async () => ou(await supabase.from('weighing')
      .select('id, qty_observed, unit_observed, grams, at')
      .eq('food_id', foodId).order('at', { ascending: false })),
    staleTime: 10_000,
  })
}

export function usePese() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      foodId: string; quantite: number; grammes: number
      unite?: string; cycleId?: string | null; ingredientId?: string | null
    }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      return ou(await supabase.from('weighing').insert({
        household_id: foyer,
        food_id: p.foodId,
        cycle_id: p.cycleId ?? null,
        recipe_ingredient_id: p.ingredientId ?? null,
        qty_observed: p.quantite,
        unit_observed: p.unite ?? 'u',
        grams: p.grammes,
      }).select().single())
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

/**
 * Efface une pesée.
 *
 * Une faute de frappe se corrige en effaçant, pas en pesant trois fois de plus
 * pour noyer l'erreur dans la médiane. Le trigger recalcule tout.
 */
export function useOubliePesee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      ou(await supabase.from('weighing').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries(),
  })
}
