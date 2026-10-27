/**
 * Les lectures et les gestes du frigo : les repas posés sur les barquettes, les ingrédients rangés par
 * étagère, et ce qu'on fait d'un plat (le manger, le congeler, le sortir, le jeter, corriger ses dates,
 * le prendre en photo).
 *
 * Le calcul est dans `lib/frigo.ts` ; ici, la base. Chaque geste écrit ce que la base ne devine pas, et
 * laisse le reste à ses déclencheurs : manger consomme la barquette (`tg_meal_slot_consomme`), congeler ou
 * sortir recalcule la péremption (`tg_portion_peremption`). Manger, jeter et retirer touchent aussi aux REPAS
 * qui réclament la part : ce sont des fonctions de la base (`mange_une_part`, `ecarte_des_parts`, 0122), une
 * transaction chacune, pas trois requêtes du client.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import type { Ligne } from '../supabase.ts'
import type { Database } from '../base.types.ts'

type Update<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
import { jour } from '../semaine.ts'
import { prepare } from '../photo.ts'
import { enFrancais, photoEnFrancais } from '../reseau.ts'
import { peremptionDeplacee, repasEnCours } from '../frigo.ts'
import type { ChampsDates, Groupe, Part, Prevu } from '../frigo.ts'
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
    /* Seulement ce qui est encore au congélateur : un lien « C'est fait » rouvert, ou deux appareils, ne ramènent
       pas au frigo (et ne redatent pas) une barquette déjà sortie. */
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return []
      return ou(await supabase.from('portion').update({ location: 'frigo' }).in('id', ids).eq('location', 'congelateur').select())
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Les repas que le geste vient de priver de leur part, tels que la base les rend. */
export type RepasLibere = { day: string; meal: string; user_profile_id: string }
export type Ecarte = { n: number; libere: RepasLibere[] }

/**
 * Jeter ou retirer des parts, et lâcher les repas qui les réclamaient (`ecarte_des_parts`, 0122) :
 *  · `jeter` : la part est jetée, elle compte comme gaspillée ;
 *  · `retirer` : la part est supprimée, ni mangée ni jetée (une barquette mangée en douce ne doit pas rester).
 */
export function useEcarteDesParts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, geste }: { ids: string[]; geste: 'jeter' | 'retirer' }): Promise<Ecarte> =>
      ou(await supabase.rpc('ecarte_des_parts', {
        p_ids: ids, p_geste: geste, p_day: jour(maintenant()),
      })) as unknown as Ecarte,
    onSuccess: () => qc.invalidateQueries(),
  })
}

/**
 * Corriger les dates d'un groupe : ce que `ecrituresDesDates` a calculé, une requête par écriture différente
 * (les parts qui n'ont rien à changer n'en font pas).
 */
export function useModifieLesDates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ecritures: { ids: string[]; champs: ChampsDates }[]) => {
      for (const e of ecritures) await metsAJour(e.ids, e.champs)
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

/**
 * « En manger une maintenant » : une case pour moi, aujourd'hui, au repas en cours, mangée, avec une part du
 * plat — en UNE fonction de la base (`mange_une_part`, 0122), qui verrouille les parts du plat :
 *
 *  · la part est d'abord celle qui est POUR MOI (`for_user_id`), puis celle de personne, celle d'un autre en
 *    dernier recours ; à destinataire égal, une libre avant une réclamée par un repas à venir ;
 *  · le repas qui la réclamait la lâche (il reste « prévu », sans barquette) et la base dit lequel ;
 *  · ma case du repas en cours est réutilisée ; si elle est déjà « mangée », la base refuse plutôt que d'écraser
 *    un repas noté (D33) ;
 *  · deux membres qui mangent la dernière part libre en même temps : le second attend, puis la trouve prise.
 */
export function useMangeMaintenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupe }: { groupe: Groupe }) => {
      const quand = maintenant()
      return ou(await supabase.rpc('mange_une_part', {
        /* `p_recipe` est nul pour un plat sans recette : le type généré ne le sait pas (argument sans défaut). */
        p_recipe: groupe.recipeId as string, p_label: groupe.label, p_location: groupe.location,
        p_state: groupe.state, p_day: jour(quand), p_meal: repasEnCours(quand), p_eaten_at: quand.toISOString(),
      })) as unknown as { portion_id: string; libere: RepasLibere[] }
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

// ── Les ingrédients ─────────────────────────────────────────────────────────

export function useModifieIngredient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, avant, ...champs }: {
      id: string
      quantity?: number | null
      location?: 'frigo' | 'congelateur' | 'placard'
      expires_at?: string | null
      /** Où il était : de quoi recalculer sa péremption quand on le déplace. */
      avant?: string
    }) => {
      /* La contrainte `stock_item_congele_date` : une date de mise au froid au congélateur, et nulle part
         ailleurs. Déplacer un ingrédient la pose ou la retire. */
      const froid = champs.location === undefined ? {}
        : { frozen_at: champs.location === 'congelateur' ? maintenant().toISOString() : null }
      /* Et sa péremption suit le lieu comme celle d'une barquette (+90 j au froid, 24 h à la sortie), sauf si
         la même écriture en donne une. */
      const deplace = champs.location !== undefined && avant !== undefined && champs.expires_at === undefined
        ? peremptionDeplacee(avant, champs.location, maintenant()) : null
      return ou(await supabase.from('stock_item').update({ ...champs, ...froid, ...deplace }).eq('id', id).select().single())
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
      const photo = await prepare(fichier).catch(e => { throw new Error(photoEnFrancais(e)) })
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
