/**
 * Le foyer : qui en est, ce que chacun vise, ce qu'on a comme appareils.
 *
 * Tout le reste de l'app en dépend — les portions (D25), l'ordonnancement (D8),
 * la liste de courses (D56) — donc c'est chargé une fois et gardé longtemps.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import type { Ligne } from '../supabase.ts'

export type Membre = Ligne<'user_profile'> & {
  objectif: Ligne<'nutrition_target'> | null
}

export type Foyer = {
  id: string
  nom: string
  plafondLlmEur: number
  membres: Membre[]
}

export const CLE = {
  foyer: ['foyer'] as const,
  magasins: ['magasins'] as const,
  appareils: ['appareils'] as const,
}

async function chargeFoyer(): Promise<Foyer | null> {
  const id = ou(await supabase.rpc('current_household'))
  if (!id) return null

  const [maison, profils, objectifs] = await Promise.all([
    supabase.from('household').select('*').eq('id', id).single(),
    supabase.from('user_profile').select('*').order('created_at'),
    // Les objectifs sont historisés (un INSERT par changement) : on ne garde
    // que le dernier de chaque personne.
    supabase.from('nutrition_target_courante').select('*').order('valid_from', { ascending: false }),
  ])

  const h = ou(maison)
  // La vue rend UNE ligne par personne, et toutes ses colonnes nullables au
  // typage : on écarte ce qui ne peut pas arriver plutôt que de forcer.
  const derniers = new Map<string, Ligne<'nutrition_target'>>()
  for (const o of ou(objectifs)) {
    if (o.user_profile_id) derniers.set(o.user_profile_id, o as Ligne<'nutrition_target'>)
  }

  return {
    id: h.id,
    nom: h.name,
    plafondLlmEur: Number(h.llm_monthly_cap_eur),
    membres: ou(profils).map(p => ({ ...p, objectif: derniers.get(p.id) ?? null })),
  }
}

export function useFoyer() {
  return useQuery({ queryKey: CLE.foyer, queryFn: chargeFoyer, staleTime: 5 * 60_000 })
}

/** Le catalogue d'appareils, commun à tous les foyers (classe A). */
export function useAppareils() {
  return useQuery({
    queryKey: CLE.appareils,
    queryFn: async () => ou(await supabase.from('appliance_catalog').select('*').order('label')),
    staleTime: Infinity,
  })
}

export function useMagasins() {
  return useQuery({
    queryKey: CLE.magasins,
    queryFn: async () => ou(await supabase.from('store').select('*')
      .order('is_default', { ascending: false }).order('position').order('name')),
    staleTime: 5 * 60_000,
  })
}

export function useCreeMagasin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ nom, parDefaut }: { nom: string; parDefaut: boolean }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      // Un seul magasin par défaut : l'index partiel l'impose, on retire donc
      // l'ancien AVANT d'écrire le nouveau plutôt que d'essuyer un conflit.
      if (parDefaut) {
        ou(await supabase.from('store').update({ is_default: false })
          .eq('household_id', foyer).eq('is_default', true).select())
      }
      return ou(await supabase.from('store')
        .insert({ household_id: foyer, name: nom.trim(), is_default: parDefaut })
        .select().single())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE.magasins }),
  })
}

export function useSupprimeMagasin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      ou(await supabase.from('store').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE.magasins }),
  })
}

/** L'objectif d'un membre ramené à une part de repas (D25). */
export function objectifDe(m: Membre): { kcal: number; proteinG: number } {
  return {
    kcal: Number(m.objectif?.kcal ?? 0),
    proteinG: Number(m.objectif?.protein_g ?? 0),
  }
}
