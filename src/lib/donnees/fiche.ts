/**
 * La fiche (i) d'une recette, chargée à l'ouverture (R2).
 *
 * Une requête : la source, les ingrédients, les étapes. La liste légère a déjà
 * le reste — photo, temps, parts, macros — et la fiche s'ouvre dessus sans
 * attendre.
 */
import { useQuery } from '@tanstack/react-query'
import { ouNul, supabase } from '../supabase.ts'

export type EtapeDeFiche = {
  ordinal: number
  text: string
  duration_min: number | null
  load_type: 'actif' | 'passif' | 'bloquant' | null
  appliance_type: string | null
  gesture_min: number | null
}

export type Fiche = {
  id: string
  source_name: string | null
  source_url: string | null
  ingredients: { ordinal: number; raw_text: string }[]
  etapes: EtapeDeFiche[]
}

type Brute = Pick<Fiche, 'id' | 'source_name' | 'source_url'> & {
  recipe_ingredient: Fiche['ingredients'] | null
  recipe_step: EtapeDeFiche[] | null
}

const parOrdinal = <T extends { ordinal: number }>(l: T[]) =>
  [...l].sort((a, b) => a.ordinal - b.ordinal)

export function useFiche(id: string | null) {
  return useQuery({
    queryKey: ['fiche', id],
    enabled: id !== null,
    staleTime: 10 * 60_000,
    // Une recette devenue illisible ne le redeviendra pas en réessayant.
    retry: 1,
    queryFn: async (): Promise<Fiche> => {
      const r = ouNul(await supabase.from('recipe')
        .select(`id, source_name, source_url,
                 recipe_ingredient(ordinal, raw_text),
                 recipe_step(ordinal, text, duration_min, load_type, appliance_type, gesture_min)`)
        .eq('id', id!).maybeSingle()) as unknown as Brute | null
      // La recette d'un ami dont le partage vient d'être retiré : elle était dans
      // la liste, elle n'est plus lisible.
      if (!r) throw new Error('Cette recette n’est plus accessible.')
      return {
        id: r.id,
        source_name: r.source_name,
        source_url: r.source_url,
        ingredients: parOrdinal(r.recipe_ingredient ?? []),
        etapes: parOrdinal(r.recipe_step ?? []),
      }
    },
  })
}
