/**
 * Inventer une recette (« Envie spéciale »).
 *
 * C'est le SEUL appel LLM que l'utilisateur déclenche volontairement, donc le
 * seul dont il doit voir le compteur — affiché avant, pas après (D11).
 *
 * Trois règles qui ne se négocient pas :
 *
 *  1. Le modèle ne voit JAMAIS d'objectif nominatif (D22, données de santé). Il
 *     reçoit « au moins 30 g de protéines, au plus 620 kcal », jamais « Kamil,
 *     78 kg, en sèche ». Le prompt est construit ici, côté serveur, pour que le
 *     client ne puisse pas y glisser autre chose.
 *  2. Le quota est vérifié AVANT l'appel et incrémenté après : un quota vérifié
 *     après ne sert à rien.
 *  3. Le résultat est marqué « jamais testée » et ne porte que des fourchettes.
 *     Personne n'a jamais cuisiné cette recette, pas même le modèle.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { preflight, reply } from '../_shared/cors.ts'

/** Générations par foyer et par mois. Affiché à l'écran avant de lancer. */
const QUOTA_MENSUEL = 10

type Demande = {
  envie?: string
  /** `frigo` | `courses` | `libre` — jusqu'où on s'autorise à sortir des placards. */
  perimetre?: 'frigo' | 'courses' | 'libre'
  proteinesMin?: number
  kcalMax?: number
  minutesMax?: number
  appareils?: string[]
  parts?: number
}

type RecetteInventee = {
  titre: string
  parts: number
  ingredients: { nom: string; quantite: number | null; unite: string | null }[]
  etapes: { texte: string; minutes: number | null; appareil: string | null; charge: string }[]
  kcalParPart: [number, number]
  proteinesParPart: [number, number]
  minutesActives: number
  manquants: string[]
  note?: string
}

const SCHEMA = `{
  "titre": "string",
  "parts": number,
  "ingredients": [{ "nom": "string", "quantite": number|null, "unite": "g"|"ml"|"u"|null }],
  "etapes": [{ "texte": "string", "minutes": number|null,
               "appareil": "four"|"plaque"|"air_fryer"|"micro_ondes"|"fait_tout"|null,
               "charge": "actif"|"passif"|"bloquant" }],
  "kcalParPart": [bas, haut],
  "proteinesParPart": [bas, haut],
  "minutesActives": number,
  "manquants": ["ingrédient absent des placards"],
  "note": "string, facultative"
}`

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return reply('Method not allowed', 405)

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!jwt) return reply('Non authentifié', 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: userRes } = await admin.auth.getUser(jwt)
  if (!userRes?.user) return reply('Non authentifié', 401)

  const { data: profil } = await admin.from('user_profile')
    .select('household_id').eq('id', userRes.user.id).maybeSingle()
  if (!profil) return reply('Aucun foyer', 403)
  const foyer = profil.household_id

  // ── Quota, AVANT l'appel ───────────────────────────────────────────────────
  const mois = new Date().toISOString().slice(0, 8) + '01'
  const { data: usage } = await admin.from('llm_usage').select('calls, cost_eur')
    .eq('household_id', foyer).eq('month', mois).eq('kind', 'generation').maybeSingle()
  const deja = usage?.calls ?? 0
  if (deja >= QUOTA_MENSUEL) {
    return reply({
      erreur: `Quota atteint : ${QUOTA_MENSUEL} générations par mois. Il se remet à zéro le 1er.`,
      restantes: 0,
    }, 429)
  }

  const cle = Deno.env.get('LLM_API_KEY')
  if (!cle) {
    return reply({
      erreur: 'Aucun modèle configuré. Renseigne LLM_API_KEY côté serveur.',
      restantes: QUOTA_MENSUEL - deja,
    }, 503)
  }

  const d: Demande = await req.json().catch(() => ({}))
  const perimetre = d.perimetre ?? 'frigo'

  // ── Ce que le modèle a le droit de voir ────────────────────────────────────
  // Des libellés d'aliments et des bornes chiffrées. Rien d'autre : ni prénom,
  // ni poids, ni objectif de quiconque.
  let placards: string[] = []
  if (perimetre !== 'libre') {
    const { data: stock } = await admin.from('stock_item')
      .select('label, quantity, unit').eq('household_id', foyer).limit(60)
    placards = (stock ?? []).map(s =>
      s.quantity ? `${s.label} (${Math.round(Number(s.quantity))} ${s.unit ?? ''})`.trim() : s.label)
  }

  const contraintes = [
    d.proteinesMin ? `au moins ${Math.round(d.proteinesMin)} g de protéines par part` : null,
    d.kcalMax ? `au plus ${Math.round(d.kcalMax)} kcal par part` : null,
    d.minutesMax ? `au plus ${Math.round(d.minutesMax)} minutes de travail actif` : null,
    d.appareils?.length ? `uniquement avec : ${d.appareils.join(', ')}` : null,
  ].filter(Boolean)

  const perimetreTexte = perimetre === 'frigo'
    ? `N'utilise QUE ces ingrédients : ${placards.join(', ') || 'aucun'}. Si c'est impossible, dis-le dans "manquants".`
    : perimetre === 'courses'
      ? `Pars de ces ingrédients : ${placards.join(', ') || 'aucun'}. Tu peux en ajouter AU PLUS TROIS, listés dans "manquants".`
      : 'Tu es libre des ingrédients. Liste tout ce qu\'il faut acheter dans "manquants".'

  const prompt = [
    'Tu inventes une recette de batch cooking, gourmande et réaliste.',
    d.envie ? `Envie exprimée : « ${String(d.envie).slice(0, 300)} ».` : null,
    perimetreTexte,
    contraintes.length ? `Contraintes : ${contraintes.join(' ; ')}.` : null,
    `Prévois ${Math.max(1, Math.min(12, d.parts ?? 2))} parts.`,
    'Donne des quantités en grammes chaque fois que c\'est possible.',
    'Les valeurs nutritionnelles sont des FOURCHETTES : tu estimes, tu ne mesures pas.',
    'Réponds UNIQUEMENT par un objet JSON de cette forme, sans texte autour :',
    SCHEMA,
  ].filter(Boolean).join('\n')

  // ── L'appel ────────────────────────────────────────────────────────────────
  const base = Deno.env.get('LLM_BASE_URL') ?? 'https://api.openai.com/v1'
  const modele = Deno.env.get('LLM_MODEL') ?? 'gpt-4o-mini'
  let brut: string
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cle}` },
      body: JSON.stringify({
        model: modele,
        messages: [
          { role: 'system', content: 'Tu réponds toujours par un unique objet JSON valide.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) return reply({ erreur: `Le modèle a refusé : ${await res.text()}` }, 502)
    const json = await res.json()
    brut = json.choices?.[0]?.message?.content ?? ''
  } catch (e) {
    return reply({ erreur: `Modèle injoignable : ${e instanceof Error ? e.message : e}` }, 502)
  }

  let recette: RecetteInventee
  try {
    // Certains modèles encadrent malgré tout leur JSON : on prend le premier objet.
    const debut = brut.indexOf('{')
    const fin = brut.lastIndexOf('}')
    recette = JSON.parse(brut.slice(debut, fin + 1))
  } catch {
    return reply({ erreur: 'Réponse illisible du modèle. Réessaie.' }, 502)
  }
  if (!recette?.titre || !Array.isArray(recette.ingredients)) {
    return reply({ erreur: 'Réponse incomplète du modèle. Réessaie.' }, 502)
  }

  // ── Le compteur, après ─────────────────────────────────────────────────────
  // On repose cost_eur tel quel : un upsert remplace la ligne entière, et
  // remettre le coût à zéro chaque mois ferait mentir le plafond du foyer.
  await admin.from('llm_usage').upsert({
    household_id: foyer, month: mois, kind: 'generation',
    calls: deja + 1, cost_eur: Number(usage?.cost_eur ?? 0),
  }, { onConflict: 'household_id,month,kind' })

  return reply({ recette, restantes: QUOTA_MENSUEL - deja - 1, quota: QUOTA_MENSUEL })
})
