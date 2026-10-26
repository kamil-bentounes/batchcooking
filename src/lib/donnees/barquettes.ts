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
import type { Insertion, Ligne } from '../supabase.ts'
// Le calendrier et la répartition sont du calcul pur : ils vivent dans
// `lib/semaine.ts`, où ils s'éprouvent sans base.
import { jour, portionVivante } from '../semaine.ts'
import type { Repas } from '../semaine.ts'
import type { BarquetteRangee, LignePrise } from '../ranger.ts'
import type { Json } from '../base.types.ts'
import { maintenant } from '../horloge.ts'

export { NOM_REPAS, REPAS, bilanDuJour, jour } from '../semaine.ts'
export type { Repas } from '../semaine.ts'

export type Barquette = Ligne<'portion'>

/**
 * Une barquette à insérer, dont la PÉREMPTION est laissée à la base.
 *
 * `portion.expires_at` est `not null` et sans valeur par défaut : c'est le
 * trigger `portion_peremption` qui la pose, et lui seul connaît D29 — quatre
 * jours au frigo, trois mois au congélateur, vingt-quatre heures une fois
 * décongelée. Le typage généré, lui, ne voit que « not null sans défaut » et
 * exige donc la colonne. La recopier ici dupliquerait la règle à deux endroits,
 * ce qui est précisément ce qu'on veut éviter : on l'omet, et on le dit.
 *
 * Une date EXPLICITE reste possible — celle imprimée sur un emballage — et la
 * base la respecte alors plutôt que d'appliquer la règle (migration 0047).
 */
type PartAInserer = Omit<Insertion<'portion'>, 'expires_at'> & { expires_at?: string | null }
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

      const extras = cases.length === 0 ? [] : ou(await supabase.from('meal_extra').select('*')
        .in('meal_slot_id', cases.map(c => c.id)))
      const parCase = new Map<string, Ligne<'meal_extra'>[]>()
      for (const e of extras) {
        if (!parCase.has(e.meal_slot_id)) parCase.set(e.meal_slot_id, [])
        parCase.get(e.meal_slot_id)!.push(e)
      }
      return cases.map(c => ({ ...c, portion: portionVivante(c), extras: parCase.get(c.id) ?? [] }))
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
 * « On range » (D53) : la session devient des barquettes, sort du stock, et passe à la semaine —
 * UNE fonction de la base (`range_la_session`, 0120), une transaction.
 *
 * Le lieu est celui que l'hôte a choisi : combien de chaque recette restent au frigo, le reste au
 * congélateur. `rangeLe` est l'instant du rangement : il devient `prepared_at` de chaque barquette, et
 * `frozen_at` de celles du congélateur — la contrainte `portion_congele_date` lie les deux. Les dates de
 * péremption sont posées par la base, pas ici — deux téléphones ne doivent pas calculer deux échéances.
 *
 * Deux téléphones qui rangent en même temps ne doublent rien : la base verrouille le cycle, le second
 * appel attend et rend `deja: true`. `lots` peut être vide quand les barquettes existent déjà.
 */
export type Rangement = { deja: boolean; cree: boolean; portions: number; retirees: number }

export function useRangeLaSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ cycleId, lots, rangeLe, restes, retirer }: {
      cycleId: string; lots: ADresser[]
      /** ISO. */
      rangeLe: string
      /** « Il en reste … » : les corrections de l'écran. */
      restes: Record<string, number>
      /** Faux quand l'écran n'a pas pu lire ce que la session prend : on range sans toucher au stock. */
      retirer: boolean
    }): Promise<Rangement> => {
      const lignes = lots.flatMap(l => Array.from({ length: l.nombre }, () => ({
        recipe_id: l.recipeId,
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
      return ou(await supabase.rpc('range_la_session', {
        p_cycle: cycleId, p_lots: lignes, p_range_le: rangeLe, p_restes: restes, p_retirer: retirer,
      })) as unknown as Rangement
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Ce que le rangement de ce cycle a déjà écrit : les vraies barquettes, leur lieu, leur `prepared_at`. */
export function usePortionsDuCycle(cycleId: string | undefined) {
  return useQuery({
    queryKey: [...CLE.barquettes, 'du-cycle', cycleId],
    enabled: !!cycleId,
    queryFn: async (): Promise<BarquetteRangee[]> =>
      ou(await supabase.from('portion').select('recipe_id, label, location, prepared_at')
        .eq('cycle_id', cycleId!).order('created_at').order('id')),
    staleTime: 0,
  })
}

/**
 * Ce qu'on choisit de manger à un repas (`choisir_un_repas`, 0123) :
 *  · un PLAT du frigo ou du congélateur, désigné comme le frigo le regroupe (recette, libellé, lieu, état) ;
 *  · autre chose, sans barquette (un repère, une habitude) : la case reste « prévue » et porte un extra ;
 *  · rien : on saute ce repas.
 */
export type Choix =
  | { type: 'plat'; recipe_id: string | null; label: string; location: 'frigo' | 'congelateur'; state: string }
  | {
    type: 'repere'; label: string; kcal: number; protein_g: number
    grams?: number | null; fiber_g?: number; carb_g?: number; fat_g?: number; food_id?: string | null
  }
  | { type: 'saute' }

export type Choisi = {
  poses: Record<string, string>
  /** Les barquettes que le changement a lâchées : libres pour un autre jour, ou restées au congélateur. */
  liberees: { portion_id: string; recipe_id: string | null; label: string; location: string; state: string }[]
  /** Les repas passés qui réclamaient une barquette posée ici, et qui l'ont lâchée (0125). */
  lachees: { day: string; meal: string; user_profile_id: string }[]
  /** Les barquettes posées qui périment AVANT le repas : choisies faute de mieux, et dites (0125). */
  perime_avant: { user_profile_id: string; portion_id: string; expires_at: string }[]
}

/**
 * Choisir ou changer un repas, pour une ou plusieurs personnes : UNE fonction de la base, une transaction
 * (`choisir_un_repas`, 0123). Elle verrouille les barquettes du plat, pose une part libre dans la case de CHAQUE
 * personne (la sienne d'abord, puis celle de personne, puis celle d'un autre ; la plus pressée d'abord), lâche
 * l'ancienne, et refuse sans rien écrire s'il n'y en a pas assez. Le jour est le jour LOCAL (la base ne connaît pas
 * le fuseau) ; la promesse ne se résout qu'une fois l'écran relu.
 */
export function useChoisirUnRepas() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ jour: j, repas, personnes, choix }: {
      jour: string; repas: Repas; personnes: string[]; choix: Choix
    }): Promise<Choisi> =>
      ou(await supabase.rpc('choisir_un_repas', {
        p_day: j, p_meal: repas, p_users: personnes, p_today: jour(maintenant()), p_choix: choix as unknown as Json,
      })) as unknown as Choisi,
    onSuccess: () => qc.invalidateQueries(),
  })
}

/**
 * Ce que la session prend dans le stock (migration 0120) : une ligne par aliment du stock que les
 * recettes du cycle utilisent. `enabled` : l'écran ne la lit qu'à « On range ».
 */
export function useCeQueLaSessionPrend(cycleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...CLE.stock, 'session-prend', cycleId],
    enabled: !!cycleId && enabled,
    queryFn: async (): Promise<LignePrise[]> =>
      ou(await supabase.rpc('ce_que_la_session_prend', { p_cycle: cycleId! })) as LignePrise[],
    staleTime: 0,
  })
}

/**
 * Manger : un geste. Un PLAT passe par `mange_une_part` (0122) : la base verrouille d'abord les barquettes du plat, puis
 * la case — dans le même ordre que `choisir_un_repas`, donc sans interblocage entre deux téléphones — et la barquette
 * est consommée. Ma case qui porte déjà une part de ce plat reprend celle-là. « Autre chose » (un repère, sans
 * barquette) n'a rien à verrouiller : la case passe à « mangé », et son extra compte alors au bilan (`extraCompte`).
 */
export function useMange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: { id: string; day: string; meal: string; portion: Barquette | null }) => {
      const eatenAt = new Date().toISOString()
      const p = c.portion
      if (p && (p.location === 'frigo' || p.location === 'congelateur')) {
        return ou(await supabase.rpc('mange_une_part', {
          p_recipe: p.recipe_id as string, p_label: p.label, p_location: p.location, p_state: p.state,
          p_day: c.day, p_meal: c.meal, p_eaten_at: eatenAt,
        })) as unknown as Json
      }
      return ou(await supabase.from('meal_slot').update({ state: 'mange', eaten_at: eatenAt })
        .eq('id', c.id).eq('state', 'prevu').select().single()) as unknown as Json
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

/**
 * Remettre un moment « sauté » : la case s'en va (elle redevient « on ne sait pas », pas « rien mangé » : D33). Ne touche
 * qu'une case qui est encore « sautée » — jamais un repas qu'un autre téléphone vient de noter mangé.
 */
export function useRetireLaCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (caseId: string) =>
      ou(await supabase.from('meal_slot').delete().eq('id', caseId).eq('state', 'saute').select()),
    onSuccess: () => qc.invalidateQueries(),
  })
}

/** Ce qu'on a mangé en plus, ou à la place : le carré de chocolat compte aussi. */
/**
 * La case d'un repas, créée à la demande.
 *
 * Un déjeuner au restaurant n'a pas de barquette, donc pas de ligne — et sans
 * ligne, il n'y avait nulle part où le noter. Le batch cooking couvre les
 * dîners ; sans les deux autres repas le tableau de bord ment de ~900 kcal par
 * jour (D26), ce qui vaudrait moins que de ne rien afficher.
 *
 * On crée donc la case au moment où l'on a quelque chose à y mettre, dans
 * l'état `prevu` : elle ne compte pas encore comme renseignée, et c'est
 * l'extra qui la remplit.
 */
async function caseOuCree(
  virtuelle: { id: string; user_profile_id: string; day: string; meal: string },
): Promise<string> {
  if (!virtuelle.id.startsWith('vide:')) return virtuelle.id
  const foyer = ou(await supabase.rpc('current_household'))
  if (!foyer) throw new Error('Aucun foyer.')

  /*
   * ⚠️ On ne TOUCHE PAS à une case qui existe déjà.
   *
   * Un `upsert … set state = 'prevu'` sur une case déjà « mangée » lève un
   * 23514 (`meal_slot_mange_date` : mangé sans date), et sur une case « sautée »
   * il effaçait en silence un jour renseigné (D33). Le cas arrive dès que deux
   * téléphones regardent la même semaine, l'un cochant pendant que l'autre
   * ajoute un extra.
   *
   * `ignoreDuplicates` rend donc la ligne existante intacte, et on la relit.
   */
  const { data, error } = await supabase.from('meal_slot').upsert({
    household_id: foyer,
    user_profile_id: virtuelle.user_profile_id,
    day: virtuelle.day,
    meal: virtuelle.meal,
    state: 'prevu',
  }, { onConflict: 'household_id,user_profile_id,day,meal', ignoreDuplicates: true })
    .select('id').maybeSingle()
  if (error) throw new Error(error.message)
  if (data) return data.id

  // Elle existait : on la relit plutôt que de l'écraser.
  const { data: deja, error: e2 } = await supabase.from('meal_slot').select('id')
    .eq('user_profile_id', virtuelle.user_profile_id)
    .eq('day', virtuelle.day).eq('meal', virtuelle.meal).single()
  if (e2) throw new Error(e2.message)
  return deja.id
}

export function useAjouteExtra({ onSuccess }: { onSuccess?: () => void } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (e: {
      /** La case, réelle ou seulement affichée. */
      cas: { id: string; user_profile_id: string; day: string; meal: string }
      label: string; grammes?: number | null
      kcal: number; proteinG: number; fiberG?: number; carbG?: number; fatG?: number
      foodId?: string | null; memoriser?: boolean
    }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      const caseId = await caseOuCree(e.cas)
      const ligne = ou(await supabase.from('meal_extra').insert({
        household_id: foyer,
        meal_slot_id: caseId,
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
    onSuccess: () => { qc.invalidateQueries(); onSuccess?.() },
  })
}

/**
 * Retirer un extra (`retire_un_extra`, 0125) : et la case qu'il laisse vide, en une transaction. Une case « prévue » sans
 * barquette ni extra n'est rien : elle restait, masquée, et le petit déjeuner ni la collation ne se proposaient plus.
 */
export function useSupprimeExtra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => ou(await supabase.rpc('retire_un_extra', { p_id: id })),
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
      congeleLe?: string | null; perimeLe?: string | null
    }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      const lieu = s.lieu ?? 'frigo'
      return ou(await supabase.from('stock_item').insert({
        household_id: foyer, label: s.label.trim(), food_id: s.foodId ?? null,
        quantity: s.quantite ?? null, unit: s.unite ?? null, location: lieu,
        // La date de mise au froid ne vaut qu'au congélateur — la contrainte
        // `stock_item_congele_date` le dit aussi, et c'est elle qui fait courir
        // les trois mois.
        frozen_at: lieu === 'congelateur' ? (s.congeleLe ?? new Date().toISOString()) : null,
        expires_at: s.perimeLe ?? null,
      }).select().single())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE.stock }),
  })
}

/**
 * Poser une barquette qu'on n'a pas cuisinée.
 *
 * Un plat tout prêt acheté dehors est un REPAS : il se mange depuis la semaine
 * et pèse dans les calories du jour. Le ranger à l'inventaire l'aurait fait
 * disparaître du plan et compter pour zéro — ce que D33 interdit précisément.
 *
 * Trois choses posées ici et pas ailleurs :
 *
 *  · les macros arrivent déjà calculées. Cet écran ne devine pas : il reçoit
 *    ce qu'on a LU sur l'emballage, ou ce que la recette a calculé ;
 *  · la date de mise au froid est celle qu'on donne, pas `now()`. Un plat
 *    congelé le mois dernier n'a pas trois mois devant lui ;
 *  · une part = une ligne. C'est ce que le reste de l'app manipule — on ne
 *    mange pas « 0,4 barquette ».
 */
export function useAjouteBarquette() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (b: {
      label: string
      parts: number
      grammes: number
      kcal: number
      proteines?: number | null
      glucides?: number | null
      lipides?: number | null
      fibres?: number | null
      recetteId?: string | null
      achete?: boolean
      lieu: 'frigo' | 'congelateur'
      congeleLe?: string | null
      /** `null` = la base applique D29 : quatre jours au frigo, trois mois au
          froid. Une date n'a de sens que lorsqu'on en SAIT une — celle d'un
          emballage. */
      perimeLe?: string | null
    }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')

      const lignes: PartAInserer[] = Array.from(
        { length: Math.max(1, Math.round(b.parts)) }, () => ({
        household_id: foyer,
        recipe_id: b.recetteId ?? null,
        label: b.label.trim(),
        grams: b.grammes,
        kcal: b.kcal,
        protein_g: b.proteines ?? 0,
        carb_g: b.glucides ?? 0,
        fat_g: b.lipides ?? 0,
        fiber_g: b.fibres ?? 0,
        source: b.achete ? 'achete' : 'manuel',
        location: b.lieu,
        // La contrainte `portion_congele_date` lie les deux : au congélateur la
        // date existe, au frigo elle n'existe pas. On ne la contourne pas.
        frozen_at: b.lieu === 'congelateur'
          ? (b.congeleLe ?? new Date().toISOString()) : null,
        expires_at: b.perimeLe ?? undefined,
      }))
      return ou(await supabase.from('portion')
        .insert(lignes as Insertion<'portion'>[]).select())
    },
    onSuccess: () => qc.invalidateQueries(),
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
