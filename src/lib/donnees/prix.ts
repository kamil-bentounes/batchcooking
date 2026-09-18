/**
 * Les prix : les apprendre du ticket, s'en servir pour la liste suivante (lot 5).
 *
 * La boucle tient en quatre temps, et c'est tout le lot :
 *
 *   photo du ticket → le modèle lit les lignes → on les rapproche de la liste
 *   → la base apprend le prix de chaque produit CHEZ CHAQUE ENSEIGNE
 *
 * Ce qui s'écrit ici est délibérément mince : l'apprentissage du prix et le
 * report sur `shopping_item.paid_price_eur` sont faits par un trigger (migration
 * 0024). Deux téléphones peuvent enregistrer le même ticket, et un invariant du
 * produit ne peut pas dépendre de celui qui a appuyé (D50).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import { estimation } from '../prix.ts'
import { jour } from './barquettes.ts'
import type { LigneTicket, Rapprochement } from '../prix.ts'


export type TicketLu = {
  enseigne: string | null
  date: string | null
  lignes: LigneTicket[]
  total_eur: number | null
  somme: number
  ecart: number | null
  /** `true` quand des remises annoncées ont été déduites après coup (lot 5). */
  remisesDeduites: boolean
  lisible: boolean
  commentaire: string | null
  restantes: number
  quota: number
  ms: number
}

/**
 * Enregistre un ticket et ce qu'il enseigne.
 *
 * On écrit TOUTES les lignes retenues, y compris celles qu'on n'a pas su
 * rattacher à la liste : un prix de sacs poubelle vaut d'être appris même si
 * personne ne les avait notés. Ce qui n'est pas rapproché apprend un prix sans
 * remplir de `paid_price_eur` — ce qui est exactement le bon comportement.
 */
export function useEnregistreTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: {
      cycleId: string | null
      storeId: string | null
      date: string | null
      total: number | null
      brut: unknown
      rapprochements: Rapprochement[]
      /** Les index des lignes que la personne a retenues. */
      retenus: Set<number>
    }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')

      // La sortie que ce ticket solde, quand elle existe : c'est elle qui porte
      // le total dans le bilan.
      let tripId: string | null = null
      if (t.cycleId && t.storeId) {
        const { data } = await supabase.from('shopping_trip').select('id')
          .eq('cycle_id', t.cycleId).eq('store_id', t.storeId).maybeSingle()
        tripId = data?.id ?? null
      }

      const ticket = ou(await supabase.from('receipt').insert({
        household_id: foyer,
        store_id: t.storeId,
        trip_id: tripId,
        // ⚠️ JAMAIS `toISOString().slice(0,10)` : à 23 h en France, cela rend
        //    la veille — et le 1er du mois à 00 h 30, le mois précédent, c'est-à-dire
        //    précisément la colonne sur laquelle le budget borne.
        bought_at: t.date ?? jour(new Date()),
        total_eur: t.total,
        raw: t.brut as never,
      }).select().single())

      const lignes = t.rapprochements
        .map((r, i) => ({ r, i }))
        .filter(({ i }) => t.retenus.has(i))
        .map(({ r }) => ({
          receipt_id: ticket.id,
          household_id: foyer,
          label: r.ligne.label,
          quantity: r.ligne.quantity ?? null,
          unit: r.ligne.unit ?? null,
          // Une remise supérieure au prix donnerait un montant négatif, qu'on
          // n'apprend pas — et une ligne à zéro apprendrait « c'est gratuit ».
          price_eur: Math.max(0.01, r.ligne.price_eur),
          shopping_item_id: r.article?.id ?? null,
          food_id: r.article?.food_id ?? null,
          confidence: Math.round(r.score * 100) / 100,
        }))

      if (lignes.length > 0) {
        /*
         * ⚠️ Le ticket porte déjà son TOTAL. Si les lignes sont refusées — une
         *    quantité lue à zéro, un prix devenu négatif après déduction d'une
         *    remise — il resterait en base, compté au budget, sans avoir rien
         *    appris. La personne recommence, et le budget double.
         *
         *    On le retire donc plutôt que de laisser une trace à moitié écrite.
         */
        const { error } = await supabase.from('receipt_line').insert(lignes)
        if (error) {
          await supabase.from('receipt').delete().eq('id', ticket.id)
          throw new Error(error.message)
        }
      }

      // Le total de la sortie : c'est ce chiffre que le bilan compare à
      // l'estimation. On préfère le total IMPRIMÉ à la somme des lignes — une
      // ligne manquée ne doit pas faire croire qu'on a moins dépensé.
      if (tripId && t.total !== null) {
        ou(await supabase.from('shopping_trip')
          .update({ total_eur: t.total, finished_at: new Date().toISOString() })
          .eq('id', tripId).select().single())
      }

      return { ticket, lignes: lignes.length }
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

/**
 * Remplit les prix estimés de la liste avec ce qu'on a déjà payé.
 *
 * On n'écrase JAMAIS une estimation posée à la main : quelqu'un qui a corrigé
 * un prix en sait plus que la moyenne. Et on ne touche pas aux articles déjà
 * payés — leur prix n'est plus une estimation.
 */
export function useEstimeListe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cycleId: string) => {
      const prix = ou(await supabase.from('price_knowledge').select('*'))
      if (prix.length === 0) return { remplis: 0, sur: 0 }

      const articles = ou(await supabase.from('shopping_item')
        .select('id, label, food_id, quantity, unit, store_id, est_price_eur, paid_price_eur')
        .eq('cycle_id', cycleId))

      const aRemplir = articles.filter(
        a => a.est_price_eur === null && a.paid_price_eur === null)

      let remplis = 0
      for (const a of aRemplir) {
        const e = estimation(a, prix.map(p => ({
          label: p.label ?? '',
          food_id: p.food_id,
          store_id: p.store_id,
          unit: p.unit ?? 'u',
          avg_price_eur: p.avg_price_eur ?? 0,
          last_price_eur: p.last_price_eur ?? 0,
          observations: p.observations ?? 1,
        })), a.store_id)
        if (!e) continue
        ou(await supabase.from('shopping_item')
          .update({ est_price_eur: e.euros }).eq('id', a.id).select().single())
        remplis++
      }
      return { remplis, sur: aRemplir.length }
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}
