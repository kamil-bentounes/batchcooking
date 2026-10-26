/**
 * Les lectures et les gestes du frigo : les repas posés sur les barquettes, les ingrédients rangés par
 * étagère, et ce qu'on fait d'un plat (le manger, le congeler, le sortir, le jeter, corriger ses dates,
 * le prendre en photo).
 *
 * Le calcul est dans `lib/frigo.ts` ; ici, la base. Chaque geste écrit ce que la base ne devine pas, et
 * laisse le reste à ses déclencheurs : manger consomme la barquette (`tg_meal_slot_consomme`), congeler ou
 * sortir recalcule la péremption (`tg_portion_peremption`).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import type { Ligne } from '../supabase.ts'
import type { Database } from '../base.types.ts'

type Update<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
import { jour } from '../semaine.ts'
import type { Repas } from '../semaine.ts'
import { prepare } from '../photo.ts'
import { enFrancais } from '../reseau.ts'
import { partsAChoisir, repasEnCours } from '../frigo.ts'
import type { Groupe, Part, Prevu } from '../frigo.ts'
import { maintenant } from '../horloge.ts'

export const CLE_FRIGO = {
  prevus: ['frigo', 'prevus'] as const,
  ingredients: ['stock', 'frigo'] as const,
  recettes: (ids: string[]) => ['frigo', 'recettes', [...ids].sort().join(',')] as const,
}

/** Les repas encore « prévus » qui portent une barquette encore là : ce qui dit « pour ce soir ». */
export function usePrevus() {
  return useQuery({
    queryKey: CLE_FRIGO.prevus,
    queryFn: async (): Promise<Prevu[]> =>
      ou(await supabase.from('meal_slot')
        .select('id, day, meal, user_profile_id, portion_id, portion!inner(state)')
        .eq('state', 'prevu')
        .in('portion.state', ['au_frais', 'decongelee']))
        .map(r => ({
          id: r.id, day: r.day, meal: r.meal,
          user_profile_id: r.user_profile_id, portion_id: r.portion_id,
        })),
    staleTime: 10_000,
  })
}

export type IngredientRange = Ligne<'stock_item'> & {
  groupe: string | null
  sousGroupe: string | null
}

/** Les ingrédients du foyer, avec le groupe de leur aliment (c'est lui qui les range sur une étagère). */
export function useIngredients() {
  return useQuery({
    queryKey: CLE_FRIGO.ingredients,
    queryFn: async (): Promise<IngredientRange[]> => {
      const lignes = ou(await supabase.from('stock_item')
        .select('*, food:food_id(ciqual_group, ciqual_subgroup)')
        .order('location').order('label')) as unknown as (Ligne<'stock_item'> & {
          food: { ciqual_group: string | null; ciqual_subgroup: string | null } | null
        })[]
      return lignes.map(({ food, ...l }) => ({
        ...l, groupe: food?.ciqual_group ?? null, sousGroupe: food?.ciqual_subgroup ?? null,
      }))
    },
    staleTime: 10_000,
  })
}

export type RecetteDuPlat = {
  id: string
  title: string | null
  image_url: string | null
  owner_household_id: string | null
}

/** Les recettes des plats du frigo : leur photo, et à qui elles sont (on ne photographie que les siennes). */
export function useRecettesDesPlats(ids: string[]) {
  return useQuery({
    queryKey: CLE_FRIGO.recettes(ids),
    enabled: ids.length > 0,
    queryFn: async (): Promise<Map<string, RecetteDuPlat>> =>
      new Map(ou(await supabase.from('recipe')
        .select('id, title, image_url, owner_household_id').in('id', ids))
        .map(r => [r.id, r as RecetteDuPlat])),
    staleTime: 60_000,
  })
}

/** Changer les barquettes d'un coup : une seule requête, `in (…)`. */
async function metsAJour(ids: string[], champs: Update<'portion'>) {
  if (ids.length === 0) return []
  return ou(await supabase.from('portion').update(champs).in('id', ids).select())
}

/** Les barquettes vont au congélateur : la base les date d'aujourd'hui et leur donne trois mois. */
export function useCongele() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => metsAJour(ids, { location: 'congelateur' }),
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Les barquettes sortent du congélateur : décongelées, à manger dans les vingt-quatre heures. */
export function useSortDuCongelo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => metsAJour(ids, { location: 'frigo' }),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useJetteDesParts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => metsAJour(ids, { state: 'jetee' }),
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Corriger les dates d'un groupe : `prepared_at`, `frozen_at` et `expires_at` s'appliquent à toutes ses parts. */
export function useModifieLesDates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, ...champs }: {
      ids: string[]; prepared_at?: string; frozen_at?: string; expires_at?: string
    }) => metsAJour(ids, champs),
    onSuccess: () => qc.invalidateQueries(),
  })
}

/**
 * « En manger une maintenant » : une case pour moi, aujourd'hui, au repas en cours, mangée, avec une part du
 * plat.
 *
 *  · la part est la libre la plus pressée ; s'il n'y en a plus de libre, la dernière qu'un repas réclamait —
 *    ce repas-là se retrouve alors sans barquette (il reste « prévu », on le recomposera depuis la semaine) ;
 *  · ma case du repas en cours, si elle existe, est réutilisée ; si elle est déjà « mangée », on le dit
 *    plutôt que d'écraser un repas noté (D33).
 */
export function useMangeMaintenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupe, prevus, moi }: { groupe: Groupe; prevus: Prevu[]; moi: string }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      const quand = maintenant()
      const jourDit = jour(quand)
      const repas: Repas = repasEnCours(quand)

      const existante = (await supabase.from('meal_slot').select('id, state, portion_id')
        .eq('user_profile_id', moi).eq('day', jourDit).eq('meal', repas).maybeSingle()).data
      if (existante?.state === 'mange') {
        throw new Error('Ton repas de maintenant est déjà noté mangé : change-le depuis la semaine.')
      }

      /* Ma case de ce repas porte déjà une part de ce plat : c'est celle-là qu'on mange. */
      const ids = new Set(groupe.parts.map(p => p.id))
      const part = existante?.portion_id && ids.has(existante.portion_id)
        ? existante.portion_id
        : partsAChoisir(groupe, prevus.filter(r => r.id !== existante?.id), 1)[0]?.id
      if (!part) throw new Error('Il n’y a plus de part de ce plat.')

      /* La part était réclamée par un autre repas : il la lâche. */
      const ailleurs = prevus.filter(r => r.portion_id === part && r.id !== existante?.id).map(r => r.id)
      if (ailleurs.length > 0) {
        ou(await supabase.from('meal_slot').update({ portion_id: null }).in('id', ailleurs).select())
      }

      const mange = { state: 'mange' as const, eaten_at: quand.toISOString(), portion_id: part }
      return existante
        ? ou(await supabase.from('meal_slot').update(mange).eq('id', existante.id).select().single())
        : ou(await supabase.from('meal_slot').insert({
          household_id: foyer, user_profile_id: moi, day: jourDit, meal: repas, ...mange,
        }).select().single())
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

// ── Les ingrédients ─────────────────────────────────────────────────────────

export function useModifieIngredient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...champs }: {
      id: string
      quantity?: number | null
      location?: 'frigo' | 'congelateur' | 'placard'
      expires_at?: string | null
    }) => {
      /* La contrainte `stock_item_congele_date` : une date de mise au froid au congélateur, et nulle part
         ailleurs. Déplacer un ingrédient la pose ou la retire. */
      const froid = champs.location === undefined ? {}
        : { frozen_at: champs.location === 'congelateur' ? maintenant().toISOString() : null }
      return ou(await supabase.from('stock_item').update({ ...champs, ...froid }).eq('id', id).select().single())
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

// ── La photo d'un plat ──────────────────────────────────────────────────────

const SEAU = 'photos-des-plats'

/** `<…>/object/public/photos-des-plats/<chemin>` → `<chemin>` : le fichier à retirer quand on change de photo. */
function cheminDansLeSeau(url: string | null): string | null {
  const m = url?.match(/\/storage\/v1\/object\/public\/photos-des-plats\/([^?#]+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * Photographier un plat : la photo est réduite côté client (JPEG, 1 400 px), envoyée dans le seau de son
 * foyer (migration 0121), et son adresse devient `recipe.image_url`. L'ancienne photo, si elle était de nous,
 * part du seau ; celle d'un site n'est qu'un lien, on n'y touche pas.
 */
export function usePhotoDuPlat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ recette, foyer, fichier, ancienne }: {
      recette: string; foyer: string; fichier: File; ancienne: string | null
    }) => {
      const photo = await prepare(fichier)
      const blob = await (await fetch(photo.dataUrl)).blob()
      const chemin = `${foyer}/${recette}-${Date.now()}.jpg`
      const envoi = await supabase.storage.from(SEAU).upload(chemin, blob, { contentType: 'image/jpeg' })
      if (envoi.error) throw new Error(enFrancais(envoi.error.message))
      const url = supabase.storage.from(SEAU).getPublicUrl(chemin).data.publicUrl
      const pose = await supabase.from('recipe').update({ image_url: url }).eq('id', recette).select()
      if (pose.error || (pose.data ?? []).length === 0) {
        // Rien ne pointe vers l'image envoyée : on la retire plutôt que de laisser un orphelin.
        await supabase.storage.from(SEAU).remove([chemin])
        throw new Error(pose.error ? enFrancais(pose.error.message) : 'Cette recette n’est pas à toi : on n’y pose pas de photo.')
      }
      const vieille = cheminDansLeSeau(ancienne)
      if (vieille) await supabase.storage.from(SEAU).remove([vieille])
      return url
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export type { Part }
