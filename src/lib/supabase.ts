import { createClient } from '@supabase/supabase-js'
import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import type { Database } from './base.types.ts'
import { fragmentRepare } from './lien.ts'

/* ⚠️ AVANT `createClient` : c'est lui qui lit l'URL pour y chercher la session.
   Un lien empoisonné (`#error=…#access_token=…`, voir `fragmentRepare`) y
   serait lu comme une erreur, et la session jetée. */
if (typeof window !== 'undefined') {
  const repare = fragmentRepare(window.location.hash)
  if (repare) {
    window.history.replaceState(window.history.state, '',
      window.location.pathname + window.location.search + repare)
  }
}

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
  return appelle<T>(name, body, data.session.access_token)
}

/**
 * Appelle une Edge Function SANS session : la seule qui l'accepte est
 * `accept-invite`, quand l'invitée crée son compte depuis son lien.
 */
export function callFunctionPublique<T = unknown>(name: string, body: unknown): Promise<T> {
  return appelle<T>(name, body, import.meta.env.VITE_SUPABASE_ANON_KEY)
}

/** Une erreur de fonction, avec son code quand elle en porte un. */
export class ErreurDeFonction extends Error {
  readonly code: string | null
  readonly statut: number
  constructor(message: string, code: string | null, statut: number) {
    super(message)
    this.code = code
    this.statut = statut
  }
}

async function appelle<T>(name: string, body: unknown, jeton: string): Promise<T> {
  const res = await fetch(fn(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jeton}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    /* Le corps d'erreur est du JSON : le jeter tel quel affichait
       `{"erreur":"Quota atteint : 20 dictées…","restantes":0}` à l'écran.
       On en sort la phrase, et on garde le texte brut quand il n'y en a pas. */
    const brut = await res.text()
    let message = brut
    let code: string | null = null
    try {
      const parsed = JSON.parse(brut) as { erreur?: string; message?: string; error?: string; code?: string }
      message = parsed.erreur ?? parsed.message ?? parsed.error ?? brut
      code = parsed.code ?? null
    } catch { /* pas du JSON : on garde le texte */ }
    throw new ErreurDeFonction(message, code, res.status)
  }
  return res.json()
}
