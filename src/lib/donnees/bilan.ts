/**
 * Le bilan d'un cycle (D54) et le SUIVI sur la durée (lot 6).
 *
 * Deux usages d'une même donnée, et c'est voulu : le bilan sert à décider du
 * cycle suivant — ce qu'on a jeté, ce qui est resté, ce qui a coûté plus cher
 * que prévu — le suivi sert à voir si, sur trois mois, ça tient.
 *
 * Et les deux se remplissent TOUT SEULS. C'est la contrepartie de la barquette
 * (D24) : on n'a rien saisi de la semaine, donc on peut tout mesurer. Le seul
 * effort demandé est un geste, cocher ce qu'on mange ; tout le reste est déjà
 * calculé depuis le dimanche.
 *
 * Les règles d'honnêteté vivent dans `lib/suivi.ts`, où elles s'éprouvent sans
 * base : un jour non renseigné n'est pas un jour à zéro (D33), et le payé ne se
 * mélange pas à l'estimé.
 */
import { useQuery } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import type { Ligne } from '../supabase.ts'
import { budget, iso, joursEntre, serie } from '../suivi.ts'
import type { Budget, Repas, Serie } from '../suivi.ts'

export type Personne = {
  userId: string
  nom: string
  cibleKcal: number | null
  cibleProtein: number | null
  serie: Serie
}

export type Bilan = {
  /** Barquettes dressées, mangées, jetées, encore là. */
  dressees: number
  mangees: number
  jetees: number
  restantes: number
  budget: Budget
  personnes: Personne[]
  /** Ce qui a plu, ce qui est resté : le retour vers le choix du mercredi. */
  recettes: { label: string; dressees: number; mangees: number; jetees: number }[]
}

export function useBilan(depuis: Date, jusqu: Date) {
  const a = iso(depuis)
  const b = iso(jusqu)

  return useQuery({
    queryKey: ['bilan', a, b],
    queryFn: async (): Promise<Bilan> => {
      const [portions, cases, articles, profils, objectifs, foyer] = await Promise.all([
        supabase.from('portion').select('*')
          .gte('prepared_at', `${a}T00:00:00Z`).lte('prepared_at', `${b}T23:59:59Z`),
        supabase.from('meal_slot').select('*, portion:portion_id(kcal, protein_g)')
          .gte('day', a).lte('day', b),
        supabase.from('shopping_item').select('est_price_eur, paid_price_eur, created_at')
          .gte('created_at', `${a}T00:00:00Z`).lte('created_at', `${b}T23:59:59Z`),
        supabase.from('user_profile').select('id, display_name'),
        supabase.from('nutrition_target').select('*').order('valid_from', { ascending: false }),
        supabase.from('household').select('food_budget_eur').limit(1).maybeSingle(),
      ])

      const p = ou(portions)
      const c = ou(cases) as unknown as (Ligne<'meal_slot'> & {
        portion: { kcal: number; protein_g: number } | null
      })[]

      // Les repas hors barquette (D34) : sans eux le tableau de bord ment de
      // ~900 kcal par jour, et il vaudrait mieux ne rien afficher.
      const extras = c.length > 0
        ? ou(await supabase.from('meal_extra').select('meal_slot_id, kcal, protein_g')
            .in('meal_slot_id', c.map(x => x.id)))
        : []
      const enPlus = new Map<string, { kcal: number; protein: number }>()
      for (const e of extras) {
        const v = enPlus.get(e.meal_slot_id) ?? { kcal: 0, protein: 0 }
        v.kcal += Number(e.kcal)
        v.protein += Number(e.protein_g)
        enPlus.set(e.meal_slot_id, v)
      }

      const repas: Repas[] = c.map(x => {
        const e = enPlus.get(x.id)
        return {
          day: x.day,
          user_profile_id: x.user_profile_id,
          state: x.state as Repas['state'],
          kcal: Number(x.portion?.kcal ?? 0) + (e?.kcal ?? 0),
          protein_g: Number(x.portion?.protein_g ?? 0) + (e?.protein ?? 0),
        }
      })

      const cibles = new Map<string, Ligne<'nutrition_target'>>()
      for (const o of ou(objectifs)) {
        if (!cibles.has(o.user_profile_id)) cibles.set(o.user_profile_id, o)
      }

      const jours = joursEntre(depuis, jusqu)
      const personnes: Personne[] = ou(profils).map(m => {
        const cible = cibles.get(m.id)
        const k = cible ? Number(cible.kcal) : null
        const pr = cible ? Number(cible.protein_g) : null
        return {
          userId: m.id,
          nom: m.display_name,
          cibleKcal: k,
          cibleProtein: pr,
          serie: serie(jours, repas, m.id, { kcal: k, protein: pr }),
        }
      })

      const parRecette = new Map<string, { dressees: number; mangees: number; jetees: number }>()
      for (const x of p) {
        const v = parRecette.get(x.label) ?? { dressees: 0, mangees: 0, jetees: 0 }
        v.dressees++
        if (x.state === 'mangee') v.mangees++
        if (x.state === 'jetee') v.jetees++
        parRecette.set(x.label, v)
      }

      return {
        dressees: p.length,
        mangees: p.filter(x => x.state === 'mangee').length,
        jetees: p.filter(x => x.state === 'jetee').length,
        restantes: p.filter(x => x.state === 'au_frais' || x.state === 'decongelee').length,
        budget: budget(ou(articles), p.length,
          ou(foyer)?.food_budget_eur === null || ou(foyer)?.food_budget_eur === undefined
            ? null
            : Number(ou(foyer)!.food_budget_eur)),
        personnes,
        recettes: [...parRecette.entries()]
          .map(([label, v]) => ({ label, ...v }))
          .sort((x, y) => y.dressees - x.dressees),
      }
    },
    staleTime: 30_000,
  })
}
