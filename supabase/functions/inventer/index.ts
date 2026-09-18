/**
 * Inventer une recette (« Envie spéciale »).
 *
 * C'est le SEUL appel LLM que l'utilisateur déclenche volontairement, donc le
 * seul dont il doit voir le compteur — affiché avant, pas après (D11).
 *
 * Quatre règles qui ne se négocient pas :
 *
 *  1. Le modèle ne voit JAMAIS d'objectif nominatif (D22). Il reçoit « au moins
 *     30 g de protéines », jamais « Kamil, 78 kg, en sèche ». Le prompt est
 *     construit ICI, côté serveur, pour qu'aucun client ne puisse le réécrire.
 *  2. Le quota est vérifié AVANT l'appel et incrémenté après : un quota vérifié
 *     après ne sert à rien. Un échec ne consomme rien.
 *  3. Le résultat est marqué « jamais testée » et ne porte que des fourchettes.
 *     Personne n'a jamais cuisiné cette recette, pas même le modèle.
 *  4. Un fournisseur qui tombe ne fait pas tomber l'écran : le repli prend le
 *     relais, et la réponse dit lequel a répondu.
 *
 * Le prompt suit ce que la mesure a montré : rôle et tâche dans les premiers
 * jetons, données séparées des instructions par des balises, contraintes en
 * liste, et surtout **un schéma strict** plutôt qu'une description de format —
 * `json_object` sortait du schéma chez les trois modèles essayés.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { preflight, reply } from '../_shared/cors.ts'
import { demande, fournisseurs } from '../_shared/llm.ts'

/** Générations par foyer et par mois. Affiché à l'écran AVANT de lancer. */
const QUOTA_MENSUEL = 10

type Demande = {
  envie?: string
  /** `frigo` | `courses` | `libre` — jusqu'où on sort des placards. */
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
  etapes: {
    texte: string
    minutes: number
    appareil: string | null
    charge: 'actif' | 'passif' | 'bloquant'
  }[]
  kcalParPart: number[]
  proteinesParPart: number[]
  minutesActives: number
  manquants: string[]
  note: string | null
}

/**
 * Le schéma, imposé par décodage contraint.
 *
 * `strict: true` exige que TOUTE propriété figure dans `required` et que
 * `additionalProperties` vaille false — d'où les `null` explicites plutôt que
 * des champs optionnels. C'est plus verbeux, et c'est ce qui rend la réponse
 * exploitable sans validation de notre côté.
 */
const SCHEMA = {
  type: 'object',
  properties: {
    titre: { type: 'string', description: 'Nom du plat, en français, sans marque.' },
    parts: { type: 'integer', minimum: 1, maximum: 12 },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          quantite: { type: ['number', 'null'] },
          unite: { type: ['string', 'null'], enum: ['g', 'ml', 'u', null] },
        },
        required: ['nom', 'quantite', 'unite'],
        additionalProperties: false,
      },
    },
    etapes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          texte: { type: 'string', description: 'Un seul geste, à l’impératif.' },
          minutes: { type: 'number', minimum: 1 },
          appareil: {
            type: ['string', 'null'],
            enum: ['four', 'plaques', 'air_fryer', 'micro_ondes', 'autocuiseur', 'blender', null],
            description: 'null pour un geste à la main.',
          },
          charge: {
            type: 'string',
            enum: ['actif', 'passif', 'bloquant'],
            description: 'actif = les mains prises ; passif = rien à faire ; '
              + 'bloquant = il faut rester à côté.',
          },
        },
        required: ['texte', 'minutes', 'appareil', 'charge'],
        additionalProperties: false,
      },
    },
    kcalParPart: {
      type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2,
      description: 'Fourchette [bas, haut]. Une estimation, jamais une mesure.',
    },
    proteinesParPart: {
      type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2,
      description: 'Fourchette [bas, haut], en grammes.',
    },
    minutesActives: { type: 'number', description: 'Somme des étapes actives et bloquantes.' },
    manquants: {
      type: 'array', items: { type: 'string' },
      description: 'Ingrédients absents des placards. Vide si tout y est.',
    },
    note: { type: ['string', 'null'], description: 'Un conseil court, ou null.' },
  },
  required: ['titre', 'parts', 'ingredients', 'etapes', 'kcalParPart',
    'proteinesParPart', 'minutesActives', 'manquants', 'note'],
  additionalProperties: false,
}

/** Rôle et tâche d'abord : l'attention des modèles penche vers les premiers jetons. */
const SYSTEME = [
  'Tu es un cuisinier qui compose des plats de batch cooking : gourmands,',
  'réalistes, faisables un dimanche après-midi.',
  '',
  'Règles absolues :',
  '· Tu écris en français. Jamais un mot d’anglais dans un titre ou une étape.',
  '· Une étape = UN geste, à l’impératif. Pas de « puis », pas de « pendant ce temps ».',
  '· Les valeurs nutritionnelles sont des FOURCHETTES estimées. Tu ne mesures rien.',
  '· Tu donnes des grammes chaque fois que c’est possible.',
  '· Tu respectes les contraintes chiffrées. Si c’est impossible, tu t’en approches',
  '  et tu l’écris dans « note ».',
].join('\n')

function consigne(d: Demande, placards: string[]): string {
  const perimetre = d.perimetre ?? 'frigo'

  const avecQuoi = perimetre === 'frigo'
    ? 'N’utilise QUE les ingrédients listés dans <placards>. Si la recette en exige '
      + 'un autre, nomme-le dans « manquants » — ne l’ajoute pas en silence.'
    : perimetre === 'courses'
      ? 'Pars des ingrédients de <placards>. Tu peux en ajouter AU PLUS TROIS, '
        + 'qui doivent tous figurer dans « manquants ».'
      : 'Tu es libre des ingrédients. Liste dans « manquants » tout ce qu’il faut acheter.'

  const contraintes = [
    d.proteinesMin ? `au moins ${Math.round(d.proteinesMin)} g de protéines par part` : null,
    d.kcalMax ? `au plus ${Math.round(d.kcalMax)} kcal par part` : null,
    d.minutesMax ? `au plus ${Math.round(d.minutesMax)} minutes actives au total` : null,
    d.appareils?.length
      ? `n’utilise que ces appareils : ${d.appareils.join(', ')} (ou aucun)`
      : null,
    `${Math.max(1, Math.min(12, d.parts ?? 2))} parts`,
  ].filter(Boolean)

  // Les données sont séparées des instructions par des balises : sans cela, un
  // libellé d'aliment malicieux se lirait comme une consigne.
  return [
    'Compose une recette.',
    '',
    '<envie>',
    (d.envie ?? 'peu importe, fais-toi plaisir').slice(0, 300),
    '</envie>',
    '',
    '<placards>',
    placards.length > 0 ? placards.join('\n') : '(vides)',
    '</placards>',
    '',
    '<contraintes>',
    ...contraintes.map(c => `- ${c}`),
    '</contraintes>',
    '',
    avecQuoi,
  ].join('\n')
}

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
      erreur: `Quota atteint : ${QUOTA_MENSUEL} générations par mois. Il repart le 1er.`,
      restantes: 0,
    }, 429)
  }

  const liste = fournisseurs()
  if (liste.length === 0) {
    return reply({
      erreur: 'Aucun modèle configuré. Renseigne LLM_API_KEY côté serveur.',
      restantes: QUOTA_MENSUEL - deja,
    }, 503)
  }

  const d: Demande = await req.json().catch(() => ({}))

  // ── Ce que le modèle a le droit de voir ────────────────────────────────────
  // Des libellés d'aliments et des bornes chiffrées. Ni prénom, ni poids,
  // ni objectif de quiconque.
  let placards: string[] = []
  if ((d.perimetre ?? 'frigo') !== 'libre') {
    const { data: stock } = await admin.from('stock_item')
      .select('label, quantity, unit').eq('household_id', foyer).limit(60)
    placards = (stock ?? []).map(s =>
      s.quantity ? `${s.label} (${Math.round(Number(s.quantity))} ${s.unit ?? ''})`.trim() : s.label)
  }

  const r = await demande<RecetteInventee>(
    liste,
    [
      { role: 'system', content: SYSTEME },
      { role: 'user', content: consigne(d, placards) },
    ],
    SCHEMA,
    'recette',
  )

  if (!r.ok) return reply({ erreur: r.erreur, restantes: QUOTA_MENSUEL - deja }, 502)

  // ── Le compteur, après, et seulement en cas de succès ──────────────────────
  // On repose cost_eur tel quel : un upsert remplace la ligne entière, et
  // remettre le coût à zéro ferait mentir le plafond du foyer.
  await admin.from('llm_usage').upsert({
    household_id: foyer, month: mois, kind: 'generation',
    calls: deja + 1, cost_eur: Number(usage?.cost_eur ?? 0),
  }, { onConflict: 'household_id,month,kind' })

  return reply({
    recette: r.valeur,
    par: r.par,
    ms: r.ms,
    echecs: r.echecs,
    restantes: QUOTA_MENSUEL - deja - 1,
    quota: QUOTA_MENSUEL,
  })
})
