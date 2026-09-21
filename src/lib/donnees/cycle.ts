/**
 * Le cycle : l'objet dont tout le lot 1 dépend (D42, D52).
 *
 * L'accueil ne fait rien d'autre que lire `cycle.state` et poser LA question du
 * moment. Les écrans ne décident pas d'eux-mêmes où l'on en est ; ils le
 * demandent ici.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import type { Ligne } from '../supabase.ts'

export type Cycle = Ligne<'cycle'>
export type Etat = Cycle['state']

export const CLE = {
  cycle: ['cycle'] as const,
  recettesDuCycle: (id: string | undefined) => ['cycle-recettes', id] as const,
}

/** L'ordre du parcours. Sert à l'accueil et aux fils d'Ariane, pas à la base. */
export const SEQUENCE: Etat[] = [
  'vide', 'selection', 'courses', 'pret', 'en_cuisine', 'dressage', 'semaine', 'cloture',
]

/** Ce que l'accueil doit dire, état par état. Un seul geste à la fois. */
export const GESTE: Record<Etat, { titre: string; action: string; vers: string }> = {
  vide: { titre: 'Rien de prévu', action: 'Choisir les recettes', vers: '/choisir' },
  selection: { titre: 'Recettes en cours de choix', action: 'Continuer à choisir', vers: '/choisir' },
  courses: { titre: 'Votre liste est prête', action: 'Je pars faire les courses', vers: '/magasin' },
  pret: { titre: 'Tout est là', action: 'Voir le plan de dimanche', vers: '/plan' },
  en_cuisine: { titre: 'Session en cours', action: 'Reprendre la cuisine', vers: '/cuisine' },
  dressage: { titre: 'Il reste à dresser', action: 'Dresser les barquettes', vers: '/dressage' },
  semaine: { titre: 'La semaine tourne', action: 'Voir la semaine', vers: '/semaine' },
  cloture: { titre: 'Semaine close', action: 'Lancer la suivante', vers: '/choisir' },
  interrompue: { titre: 'Session interrompue', action: 'Reprendre', vers: '/cuisine' },
}

/** Le lundi de la semaine qui contient `d`. En heure locale, jamais en UTC. */
export function lundiDe(d = new Date()): string {
  const j = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  // getDay() rend 0 le dimanche : on le ramène en fin de semaine.
  j.setDate(j.getDate() - ((j.getDay() + 6) % 7))
  return `${j.getFullYear()}-${String(j.getMonth() + 1).padStart(2, '0')}-${String(j.getDate()).padStart(2, '0')}`
}

/** Le lundi de la semaine PROCHAINE : celle qu'un cycle ouvert aujourd'hui couvre. */
export function lundiProchain(d = new Date()): string {
  const j = new Date(d)
  j.setDate(j.getDate() + 7)
  return lundiDe(j)
}

export function useCycle() {
  return useQuery({
    queryKey: CLE.cycle,
    queryFn: async (): Promise<Cycle | null> => {
      const id = ou(await supabase.rpc('current_cycle'))
      if (!id) return null
      return ou(await supabase.from('cycle').select('*').eq('id', id).single())
    },
    staleTime: 15_000,
  })
}

/**
 * Un cycle DÉSIGNÉ, et non « le mien ».
 *
 * `useCycle` passe par `current_cycle()`, qui ne connaît que le foyer de celui
 * qui demande. Un convive suit la session de quelqu'un d'autre : il lui faut
 * l'identifiant, et la RLS décide s'il a le droit (0037).
 */
export function useCycleParId(id: string | undefined) {
  return useQuery({
    queryKey: ['cycle-par-id', id] as const,
    enabled: !!id,
    queryFn: async (): Promise<Cycle | null> =>
      (await supabase.from('cycle').select('*').eq('id', id!).maybeSingle()).data,
    staleTime: 15_000,
  })
}

export function useOuvreCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ semaine = lundiProchain(), parts = 10 }:
      { semaine?: string; parts?: number } = {}) =>
      ou(await supabase.rpc('open_cycle', { p_week_of: semaine, p_servings: parts })),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE.cycle }),
  })
}

/**
 * Changer d'état. La base refuse les transitions impossibles (0013) : on ne
 * double PAS la machine à états ici, sinon les deux se contrediraient un jour.
 */
export function useChangeEtat() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, vers }: { id: string; vers: Etat }) =>
      ou(await supabase.from('cycle').update({ state: vers }).eq('id', id).select().single()),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useMajCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...champs }: { id: string } & Partial<Cycle>) =>
      ou(await supabase.from('cycle').update(champs).eq('id', id).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE.cycle }),
  })
}

/**
 * ⚠️ `recipe` est NULLABLE, et ce n'est pas une précaution de typage.
 *
 *    Une recette d'ami retenue dans le cycle cesse d'être lisible le jour où
 *    l'amitié est rompue ou le partage retiré — la jointure rend alors `null`
 *    pendant que la ligne du cycle, elle, survit. Sans ce `| null`, l'écran
 *    affichait « Recette » et la liste de courses perdait ses ingrédients sans
 *    un mot. On le dit.
 */
export type RecetteChoisie = Ligne<'cycle_recipe'> & {
  recipe: Pick<Ligne<'recipe'>,
    'id' | 'title' | 'yield_servings' | 'total_time_min' | 'source_name'> | null
}

export function useRecettesDuCycle(cycleId: string | undefined) {
  return useQuery({
    queryKey: CLE.recettesDuCycle(cycleId),
    enabled: !!cycleId,
    queryFn: async (): Promise<RecetteChoisie[]> => ou(
      await supabase.from('cycle_recipe')
        .select('*, recipe:recipe_id(id, title, yield_servings, total_time_min, source_name)')
        .eq('cycle_id', cycleId!).order('position')) as unknown as RecetteChoisie[],
  })
}

export function useChoisitRecette() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ cycleId, recipeId, parts }:
      { cycleId: string; recipeId: string; parts: number }) => {
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      return ou(await supabase.from('cycle_recipe').upsert({
        cycle_id: cycleId, household_id: foyer, recipe_id: recipeId, servings: parts,
      }, { onConflict: 'cycle_id,recipe_id' }).select().single())
    },
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useRetireRecette() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      ou(await supabase.from('cycle_recipe').delete().eq('id', id).select()),
    onSuccess: () => qc.invalidateQueries(),
  })
}
