import { createClient } from '@supabase/supabase-js'
import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import type { Database } from './base.types.ts'

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

/** Une ligne de table, telle que la base la rend. Évite de retyper à la main. */
export type Ligne<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type Insertion<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

/* On prend le type de la bibliothèque plutôt que d'en recopier la forme : son
   union discriminée (succès | échec) ne s'infère correctement que telle quelle,
   et `select()` la rend aussi bien pour une ligne que pour une liste. */

/**
 * PostgREST rend `{ data, error }`. Tout le code qui suit veut des exceptions :
 * TanStack Query sait quoi en faire, un `if (error)` recopié partout non.
 *
 * `ou` exige une réponse ; `ouNul` accepte l'absence. Les deux existent parce
 * que `maybeSingle()` rend légitimement `null`, et que confondre « rien trouvé »
 * avec « la requête a échoué » est la façon la plus sûre de masquer un bug.
 */
export function ou<T>({ data, error }: PostgrestSingleResponse<T>): T {
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('La base n’a rien rendu.')
  return data
}

/* `maybeSingle()` porte déjà le null dans son type : on le laisse passer plutôt
   que de le redéclarer, ce que l'inférence ne saurait pas démêler. */
export function ouNul<T>({ data, error }: PostgrestSingleResponse<T>): T {
  if (error) throw new Error(error.message)
  return data
}

export const fn = (name: string) =>
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`

/** Appelle une Edge Function avec le jeton de la session courante. */
export async function callFunction<T = unknown>(name: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Connecte-toi d’abord.')
  const res = await fetch(fn(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    /* Le corps d'erreur est du JSON : le jeter tel quel affichait
       `{"erreur":"Quota atteint : 20 dictées…","restantes":0}` à l'écran.
       On en sort la phrase, et on garde le texte brut quand il n'y en a pas. */
    const brut = await res.text()
    let message = brut
    try {
      const parsed = JSON.parse(brut) as { erreur?: string; message?: string; error?: string }
      message = parsed.erreur ?? parsed.message ?? parsed.error ?? brut
    } catch { /* pas du JSON : on garde le texte */ }
    throw new Error(message)
  }
  return res.json()
}
