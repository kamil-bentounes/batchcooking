/**
 * Nos aliments (migration 0124) : lire, ranger, modifier, retirer.
 *
 * Les valeurs pour 100 g et le poids d'une unité vivent ici, en base ; ce que « La semaine » et « en plus » écrivent est
 * une COPIE de l'unité (`lib/aliments/calcul.ts`) — jamais une référence.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import type { Ligne } from '../supabase.ts'
import { parNom } from '../aliments/ordre.ts'
import { phraseDeLEcriture } from '../aliments/brouillon.ts'
import type { Valeurs } from '../aliments/brouillon.ts'

export type Aliment = Ligne<'aliment'>

const CLE = ['aliments'] as const

/** Les aliments du foyer, par nom. */
export function useAliments() {
  return useQuery({
    queryKey: CLE,
    queryFn: async (): Promise<Aliment[]> => parNom(ou(await supabase.from('aliment').select('*'))),
    staleTime: 30_000,
  })
}

/** Une panne d'écriture se dit par la phrase de sa contrainte, pas par le nom de l'index. */
async function ecrit<T>(f: () => Promise<T>): Promise<T> {
  try { return await f() } catch (e) {
    throw new Error(phraseDeLEcriture(e instanceof Error ? e.message : String(e)))
  }
}

/** Ranger un nouvel aliment (`id` absent) ou en modifier un (`id` donné). */
export function useEnregistreAliment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, valeurs }: { id?: string; valeurs: Valeurs }): Promise<Aliment> => ecrit(async () => {
      if (id) return ou(await supabase.from('aliment').update(valeurs).eq('id', id).select().single())
      const foyer = ou(await supabase.rpc('current_household'))
      if (!foyer) throw new Error('Aucun foyer.')
      return ou(await supabase.from('aliment').insert({ ...valeurs, household_id: foyer }).select().single())
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE }),
  })
}

export function useRetireAliment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => ecrit(async () => ou(await supabase.from('aliment').delete().eq('id', id).select())),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLE }),
  })
}
