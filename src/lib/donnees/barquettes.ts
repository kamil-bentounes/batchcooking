/**
 * Les barquettes, la semaine et les repas (D24, D33, D36 à D41, D53, D54).
 *
 * La session ne produit pas des recettes, elle produit des BARQUETTES. Manger,
 * c'est cocher une barquette — un geste. C'est ce qui fait tenir le suivi là où
 * tous les journaux alimentaires échouent : personne ne saisit ses repas
 * pendant trois mois.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import type { Ligne } from '../supabase.ts'
// Le calendrier et la répartition sont du calcul pur : ils vivent dans
// `lib/semaine.ts`, où ils s'éprouvent sans base.
import { jour } from '../semaine.ts'
import type { Repas } from '../semaine.ts'

export { NOM_REPAS, REPAS, bilanDuJour, jour, repartitionAuto } from '../semaine.ts'
export type { Repas } from '../semaine.ts'

export type Barquette = Ligne<'portion'>
export type Case = Ligne<'meal_slot'> & { portion: Barquette | null; extras: Ligne<'meal_extra'>[] }

export const CLE = {
  barquettes: ['barquettes'] as const,
  semaine: (du: string, au: string) => ['semaine', du, au] as const,
  stock: ['stock'] as const,
  frequents: ['frequents'] as const,
}

export function useBarquettes(inclureMangees = false) {
  return useQuery({
    queryKey: [...CLE.barquettes, inclureMangees],
    queryFn: async () => {
      const q = supabase.from('portion').select('*').order('expires_at')
      return ou(await (inclureMangees ? q : q.in('state', ['au_frais', 'decongelee'])))
    },
    staleTime: 10_000,
  })
}

export function useStock() {
  return useQuery({
    queryKey: CLE.stock,
    queryFn: async () => ou(await supabase.from('stock_item').select('*')
      .order('location').order('label')),
    staleTime: 10_000,
  })
}

export function useFrequents() {
  return useQuery({
    queryKey: CLE.frequents,
    queryFn: async () => ou(await supabase.from('frequent_food').select('*')
      .order('times_used', { ascending: false }).limit(40)),
    staleTime: 60_000,
  })
}

export function useSemaine(du: Date, jours = 7) {
  const debut = jour(du)
  const finDate = new Date(du)
  finDate.setDate(finDate.getDate() + jours - 1)
  const fin = jour(finDate)

  return useQuery({
    queryKey: CLE.semaine(debut, fin),
    queryFn: async (): Promise<Case[]> => {
      const cases = ou(await supabase.from('meal_slot')
        .select('*, portion:portion_id(*)')
        .gte('day', debut).lte('day', fin)
        .order('day').order('meal')) as unknown as (Ligne<'meal_slot'> & { portion: Barquette | null })[]
      if (cases.length === 0) return []

      const extras = ou(await supabase.from('meal_extra').select('*')
        .in('meal_slot_id', cases.map(c => c.id)))
      const parCase = new Map<string, Ligne<'meal_extra'>[]>()
      for (const e of extras) {
        if (!parCase.has(e.meal_slot_id)) parCase.set(e.meal_slot_id, [])
        parCase.get(e.meal_slot_id)!.push(e)
      }
      return cases.map(c => ({ ...c, extras: parCase.get(c.id) ?? [] }))
    },
    staleTime: 10_000,
  })
}

export type ADresser = {
  recipeId: string | null
  label: string
  nombre: number
  grammes: number
  kcal: number
  proteinG: number
  fiberG: number
  carbG: number
  fatG: number
  forUserId: string | null
  location: 'frigo' | 'congelateur'
  coutEur?: number | null
  margeKcal?: number | null
  margeProteinG?: number | null
}

/**
 * Le dressage (D53) : la session devient des barquettes.
 *
 * Le lieu suit la planification (D40) : ce qui est prévu dans les quatre jours
 * va au frigo, le reste au congélateur. Les dates de péremption sont posées par
 * la base, pas ici — deux téléphones ne doivent pas calculer deux échéances.
 */
export function useDresse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ cycleId, lots }: { cycleId: string; lots: ADresser[] }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')

      const lignes = lots.flatMap(l => Array.from({ length: l.nombre }, () => ({
        household_id: foyer,
        cycle_id: cycleId,
        recipe_id: l.recipeId,
        label: l.label,
        grams: l.grammes,
        kcal: l.kcal,
        protein_g: l.proteinG,
        fiber_g: l.fiberG,
        carb_g: l.carbG,
        fat_g: l.fatG,
        kcal_margin: l.margeKcal ?? null,
        protein_g_margin: l.margeProteinG ?? null,
        cost_eur: l.coutEur ?? null,
        for_user_id: l.forUserId,
        location: l.location,
      })))
      if (lignes.length === 0) throw new Error('Rien à dresser.')
      return ou(await supabase.from('portion').insert(lignes).select())
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

/**
 * Distribue les barquettes sur la semaine (D39).
 *
 * Sans cette étape, personne ne sait ce qu'on mange ce soir — c'est exactement
 * le trou qu'avait l'app avant qu'on remette le cycle au centre.
 */
export function useDistribue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ cycleId, cases }: {
      cycleId: string
      cases: { userId: string; jour: string; repas: Repas; portionId: string | null }[]
    }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      return ou(await supabase.from('meal_slot').upsert(cases.map(c => ({
        household_id: foyer,
        cycle_id: cycleId,
        user_profile_id: c.userId,
        day: c.jour,
        meal: c.repas,
        portion_id: c.portionId,
        state: 'prevu' as const,
      })), { onConflict: 'household_id,user_profile_id,day,meal' }).select())
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Manger : un geste. La base met la barquette à jour toute seule (trigger). */
export function useMange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (caseId: string) =>
      ou(await supabase.from('meal_slot').update({
        state: 'mange', eaten_at: new Date().toISOString(),
      }).eq('id', caseId).select().single()),
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Sauter un repas, explicitement. « Rien » n'est PAS « on ne sait pas » (D33). */
export function useSaute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (caseId: string) =>
      ou(await supabase.from('meal_slot').update({ state: 'saute', eaten_at: null })
        .eq('id', caseId).select().single()),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useDeplaceBarquette() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, vers }: { id: string; vers: 'frigo' | 'congelateur' }) =>
      // expires_at est recalculée par le trigger : sortir du congélateur, c'est
      // décongeler, et une part décongelée se mange le lendemain.
      ou(await supabase.from('portion').update({ location: vers }).eq('id', id).select().single()),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useJette() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      ou(await supabase.from('portion').update({ state: 'jetee' }).eq('id', id).select().single()),
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Le bouton supprimer, partout, sans exception : c'est une demande explicite. */
export function useSupprimeBarquette() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      ou(await supabase.from('portion').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Ce qu'on a mangé en plus, ou à la place : le carré de chocolat compte aussi. */
export function useAjouteExtra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (e: {
      caseId: string; label: string; grammes?: number | null
      kcal: number; proteinG: number; fiberG?: number; carbG?: number; fatG?: number
      foodId?: string | null; memoriser?: boolean
    }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      const ligne = ou(await supabase.from('meal_extra').insert({
        household_id: foyer,
        meal_slot_id: e.caseId,
        label: e.label.trim(),
        food_id: e.foodId ?? null,
        grams: e.grammes ?? null,
        kcal: e.kcal,
        protein_g: e.proteinG,
        fiber_g: e.fiberG ?? 0,
        carb_g: e.carbG ?? 0,
        fat_g: e.fatG ?? 0,
      }).select().single())

      // D38 : ce qu'on remange sans cesse mérite d'être à deux gestes.
      if (e.memoriser && e.grammes) {
        ou(await supabase.from('frequent_food').upsert({
          household_id: foyer, label: e.label.trim(), food_id: e.foodId ?? null,
          grams: e.grammes, kcal: e.kcal, protein_g: e.proteinG,
          fiber_g: e.fiberG ?? 0, carb_g: e.carbG ?? 0, fat_g: e.fatG ?? 0,
          last_used_at: new Date().toISOString(),
        }, { onConflict: 'household_id,label' }).select())
      }
      return ligne
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useSupprimeExtra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      ou(await supabase.from('meal_extra').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** L'inventaire hors barquettes : ce qu'on ajoute à la main (D57). */
export function useAjouteStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (s: {
      label: string; quantite?: number | null; unite?: string | null
      lieu?: 'frigo' | 'congelateur' | 'placard'; foodId?: string | null
    }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      return ou(await supabase.from('stock_item').insert({
        household_id: foyer, label: s.label.trim(), food_id: s.foodId ?? null,
        quantity: s.quantite ?? null, unit: s.unite ?? null, location: s.lieu ?? 'frigo',
      }).select().single())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE.stock }),
  })
}

export function useSupprimeStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      ou(await supabase.from('stock_item').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE.stock }),
  })
}
