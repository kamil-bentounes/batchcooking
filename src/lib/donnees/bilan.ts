/**
 * Le bilan (D54).
 *
 * Il ne sert pas à se féliciter : il sert à décider du cycle suivant. Ce qu'on a
 * jeté, ce qu'on n'a pas mangé, ce qui a coûté plus cher que prévu — chacun de
 * ces chiffres change une décision du mercredi d'après.
 *
 * Et il se remplit TOUT SEUL. C'est la contrepartie de la barquette : on n'a
 * rien saisi de la semaine, donc on peut tout mesurer.
 */
import { useQuery } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import type { Ligne } from '../supabase.ts'

export type Bilan = {
  /** Barquettes dressées, mangées, jetées, encore là. */
  dressees: number
  mangees: number
  jetees: number
  restantes: number
  /** Ce que les courses ont coûté : estimé d'abord, réel s'il a été saisi. */
  estimeEur: number
  payeEur: number | null
  /** Moyennes par personne et par jour, sur les seuls jours renseignés. */
  parPersonne: {
    userId: string
    nom: string
    kcalMoyen: number
    proteinMoyen: number
    joursRenseignes: number
    cibleKcal: number | null
    cibleProtein: number | null
  }[]
  /** kcal par jour, pour la courbe. Les jours non renseignés valent null. */
  courbe: { jour: string; kcal: number | null }[]
  /** Ce qui a plu, ce qui est resté : le retour vers le choix du mercredi. */
  recettes: { label: string; dressees: number; mangees: number; jetees: number }[]
}

export function useBilan(depuis: Date, jusqu: Date) {
  const a = iso(depuis)
  const b = iso(jusqu)

  return useQuery({
    queryKey: ['bilan', a, b],
    queryFn: async (): Promise<Bilan> => {
      const [portions, cases, articles, profils, objectifs] = await Promise.all([
        supabase.from('portion').select('*')
          .gte('prepared_at', `${a}T00:00:00Z`).lte('prepared_at', `${b}T23:59:59Z`),
        supabase.from('meal_slot').select('*, portion:portion_id(kcal, protein_g)')
          .gte('day', a).lte('day', b),
        supabase.from('shopping_item').select('est_price_eur, paid_price_eur, created_at')
          .gte('created_at', `${a}T00:00:00Z`).lte('created_at', `${b}T23:59:59Z`),
        supabase.from('user_profile').select('id, display_name'),
        supabase.from('nutrition_target').select('*').order('valid_from', { ascending: false }),
      ])

      const p = ou(portions)
      const c = ou(cases) as unknown as (Ligne<'meal_slot'> & {
        portion: { kcal: number; protein_g: number } | null
      })[]
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

      const art = ou(articles)
      const payes = art.filter(x => x.paid_price_eur !== null)

      const cibles = new Map<string, Ligne<'nutrition_target'>>()
      for (const o of ou(objectifs)) if (!cibles.has(o.user_profile_id)) cibles.set(o.user_profile_id, o)

      const jours = joursEntre(depuis, jusqu)
      const parPersonne = ou(profils).map(m => {
        const siens = c.filter(x => x.user_profile_id === m.id)
        const renseignes = jours.filter(j =>
          siens.some(x => x.day === j && x.state !== 'prevu'))
        const total = siens.filter(x => x.state === 'mange').reduce((s, x) => {
          const e = enPlus.get(x.id)
          return {
            kcal: s.kcal + Number(x.portion?.kcal ?? 0) + (e?.kcal ?? 0),
            protein: s.protein + Number(x.portion?.protein_g ?? 0) + (e?.protein ?? 0),
          }
        }, { kcal: 0, protein: 0 })
        const n = Math.max(1, renseignes.length)
        const cible = cibles.get(m.id)
        return {
          userId: m.id,
          nom: m.display_name,
          // Diviser par les jours RENSEIGNÉS, jamais par la période : sinon un
          // week-end non saisi ferait passer quelqu'un pour sous-alimenté (D33).
          kcalMoyen: Math.round(total.kcal / n),
          proteinMoyen: Math.round(total.protein / n),
          joursRenseignes: renseignes.length,
          cibleKcal: cible ? Number(cible.kcal) : null,
          cibleProtein: cible ? Number(cible.protein_g) : null,
        }
      })

      const courbe = jours.map(j => {
        const duJour = c.filter(x => x.day === j && x.state === 'mange')
        const connu = c.some(x => x.day === j && x.state !== 'prevu')
        return {
          jour: j,
          kcal: connu
            ? Math.round(duJour.reduce((s, x) =>
                s + Number(x.portion?.kcal ?? 0) + (enPlus.get(x.id)?.kcal ?? 0), 0))
            : null,
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
        estimeEur: arrondi(art.reduce((s, x) => s + Number(x.est_price_eur ?? 0), 0)),
        payeEur: payes.length > 0
          ? arrondi(payes.reduce((s, x) => s + Number(x.paid_price_eur), 0))
          : null,
        parPersonne,
        courbe,
        recettes: [...parRecette.entries()]
          .map(([label, v]) => ({ label, ...v }))
          .sort((x, y) => y.dressees - x.dressees),
      }
    },
    staleTime: 30_000,
  })
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function joursEntre(a: Date, b: Date): string[] {
  const liste: string[] = []
  const d = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const fin = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  while (d <= fin) {
    liste.push(iso(d))
    d.setDate(d.getDate() + 1)
  }
  return liste
}

function arrondi(n: number): number {
  return Math.round(n * 100) / 100
}
