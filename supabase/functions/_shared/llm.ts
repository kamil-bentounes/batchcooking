/**
 * L'appel au modèle : schéma strict, repli, et rien qui traîne.
 *
 * Deux choses mesurées le 18 septembre 2026, sur Groq et Gemini :
 *
 *  · `response_format: {type:"json_object"}` sort du schéma **chez les trois
 *    modèles essayés** — champs manquants, énumérations inventées. C'est le mode
 *    « legacy » : il ne garantit que la syntaxe JSON, jamais la forme.
 *  · `{type:"json_schema", strict:true}` est conforme chez les trois, et
 *    PLUS RAPIDE sur Groq (1,2 s contre 1,6 s) : le décodage contraint masque
 *    les jetons interdits au lieu de les produire puis de les rattraper.
 *
 * Donc : schéma strict partout, et `json_object` seulement en repli pour un
 * fournisseur qui le refuserait.
 */

export type Fournisseur = {
  nom: string
  base: string
  modele: string
  cle: string
}

/** Les fournisseurs configurés, principal d'abord. */
export function fournisseurs(): Fournisseur[] {
  const principal = Deno.env.get('LLM_API_KEY')
  const repli = Deno.env.get('LLM_FALLBACK_API_KEY')
  return [
    principal && {
      nom: 'principal',
      base: Deno.env.get('LLM_BASE_URL') ?? 'https://api.openai.com/v1',
      modele: Deno.env.get('LLM_MODEL') ?? 'gpt-4o-mini',
      cle: principal,
    },
    repli && {
      nom: 'repli',
      base: Deno.env.get('LLM_FALLBACK_BASE_URL') ?? 'https://api.openai.com/v1',
      modele: Deno.env.get('LLM_FALLBACK_MODEL') ?? 'gpt-4o-mini',
      cle: repli,
    },
  ].filter(Boolean) as Fournisseur[]
}

/** Le fournisseur qui SAIT VOIR. Groq n'a aucun modèle multimodal (relevé). */
export function fournisseurVision(): Fournisseur | null {
  const cle = Deno.env.get('LLM_VISION_API_KEY')
  if (!cle) return null
  return {
    nom: 'vision',
    base: Deno.env.get('LLM_VISION_BASE_URL')
      ?? 'https://generativelanguage.googleapis.com/v1beta/openai',
    modele: Deno.env.get('LLM_VISION_MODEL') ?? 'gemini-3.5-flash',
    cle,
  }
}

export type Message = {
  role: 'system' | 'user'
  content: string | { type: string; text?: string; image_url?: { url: string } }[]
}

export type Resultat<T> =
  | { ok: true; valeur: T; par: string; ms: number; echecs: string[] }
  | { ok: false; erreur: string; echecs: string[] }

/**
 * Un fournisseur qui ne répond pas en 45 s ne répondra pas. Mesuré : un modèle
 * sain rend une recette en 1 à 7 s, une lecture de photo en 10 à 20 s.
 */
const DELAI_MS = 45_000
const DELAI_VISION_MS = 75_000

async function unAppel<T>(
  f: Fournisseur,
  messages: Message[],
  schema: Record<string, unknown>,
  nomSchema: string,
  delai: number,
): Promise<{ valeur?: T; erreur?: string }> {
  const corps = {
    model: f.modele,
    messages,
    temperature: 0.7,
    response_format: {
      type: 'json_schema',
      json_schema: { name: nomSchema, strict: true, schema },
    },
  }

  const res = await fetch(`${f.base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${f.cle}` },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(delai),
  })

  if (!res.ok) return { erreur: `HTTP ${res.status} ${(await res.text()).slice(0, 120)}` }

  const json = await res.json()
  const contenu = json.choices?.[0]?.message?.content
  if (!contenu) return { erreur: 'réponse vide' }

  try {
    // Le décodage contraint rend du JSON pur ; certains modèles l'encadrent
    // malgré tout. On prend le premier objet plutôt que d'échouer pour un
    // retour à la ligne.
    const d = contenu.indexOf('{')
    const fin = contenu.lastIndexOf('}')
    return { valeur: JSON.parse(contenu.slice(d, fin + 1)) as T }
  } catch {
    return { erreur: 'JSON illisible' }
  }
}

/**
 * Appelle le premier fournisseur qui répond.
 *
 * Le résultat porte `par` : un repli silencieux ferait croire pendant des
 * semaines que le principal va bien.
 */
export async function demande<T>(
  liste: Fournisseur[],
  messages: Message[],
  schema: Record<string, unknown>,
  nomSchema: string,
  { vision = false } = {},
): Promise<Resultat<T>> {
  const echecs: string[] = []
  if (liste.length === 0) return { ok: false, erreur: 'Aucun modèle configuré.', echecs }

  for (const f of liste) {
    const t0 = Date.now()
    try {
      const r = await unAppel<T>(
        f, messages, schema, nomSchema, vision ? DELAI_VISION_MS : DELAI_MS)
      if (r.valeur !== undefined) {
        return { ok: true, valeur: r.valeur, par: f.nom, ms: Date.now() - t0, echecs }
      }
      echecs.push(`${f.nom} : ${r.erreur}`)
    } catch (e) {
      echecs.push(`${f.nom} : ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { ok: false, erreur: `Aucun modèle n'a répondu (${echecs.join(' ; ')}).`, echecs }
}
