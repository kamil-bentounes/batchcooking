/**
 * Lire une photo du frigo (D28, D57).
 *
 * La photo est un ACCÉLÉRATEUR, jamais une autorité : ce qu'elle produit est
 * une proposition que l'écran fait valider article par article. Personne ne
 * remplit son inventaire à la main pendant trois mois — mais personne n'accepte
 * non plus qu'une app décrète qu'il reste 300 g de carottes.
 *
 * Trois choses que le modèle doit rendre, et qui ont chacune leur raison :
 *
 *  · la QUANTITÉ, en unités visibles — « 4 pots », pas « des yaourts ». Sans
 *    elle, l'inventaire ne sert ni aux courses ni aux macros.
 *  · la VARIÉTÉ — « yaourt aux fruits » et non « yaourt » : c'est ce qui permet
 *    de rattacher à CIQUAL, et un yaourt aux fruits n'a pas les mêmes macros
 *    qu'un nature.
 *  · la CONFIANCE — un paquet à moitié caché n'est pas un paquet identifié.
 *    L'écran trie par confiance et ne coche d'avance que ce qui est sûr.
 *
 * Aucun modèle de Groq ne voit : le relevé du 18/09/2026 ne liste que du texte
 * et de l'audio. C'est donc Gemini, et le repli est l'absence de repli — mieux
 * vaut « je n'ai pas su lire » qu'un inventaire inventé.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { preflight, reply } from '../_shared/cors.ts'
import { demande, fournisseurVision } from '../_shared/llm.ts'

/** Lectures de photo par foyer et par mois. Une photo coûte plus qu'un texte. */
const QUOTA_MENSUEL = 30

/** Au-delà, ce n'est plus une photo de frigo, c'est une charge utile. */
const TAILLE_MAX = 6 * 1024 * 1024

type Vu = {
  nom: string
  variete: string | null
  quantite: number | null
  unite: 'u' | 'g' | 'ml' | 'pot' | 'paquet' | 'bouteille' | 'barquette' | 'botte' | null
  lieu: 'frigo' | 'congelateur' | 'placard'
  confiance: number
  remarque: string | null
}

const SCHEMA = {
  type: 'object',
  properties: {
    articles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: {
            type: 'string',
            description: 'Le nom générique de l’aliment, au singulier : « yaourt », '
              + '« carotte », « lait ». Pas de marque.',
          },
          variete: {
            type: ['string', 'null'],
            description: 'Ce qui distingue ce produit d’un autre du même nom, et qui '
              + 'change ses valeurs nutritionnelles : « aux fruits », « demi-écrémé », '
              + '« 0 %», « fumé ». null si rien ne le distingue.',
          },
          quantite: {
            type: ['number', 'null'],
            description: 'Le nombre d’unités VISIBLES. Compte-les une par une. '
              + 'null si tu ne peux pas compter.',
          },
          unite: {
            type: ['string', 'null'],
            enum: ['u', 'g', 'ml', 'pot', 'paquet', 'bouteille', 'barquette', 'botte', null],
            description: 'L’unité de ce que tu comptes. « pot » pour un yaourt, '
              + '« u » pour un fruit.',
          },
          lieu: {
            type: 'string',
            enum: ['frigo', 'congelateur', 'placard'],
            description: 'Déduis-le de la photo : givre et sachets rigides = congélateur, '
              + 'clayettes et bacs = frigo, boîtes et conserves = placard.',
          },
          confiance: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: '1 quand l’étiquette est lisible. 0,5 quand tu devines par la '
              + 'forme. En dessous de 0,4, ne le liste pas du tout.',
          },
          remarque: {
            type: ['string', 'null'],
            description: 'Ce qui mérite d’être signalé : « à moitié caché », '
              + '« date visible : 24/09 », « emballage ouvert ». Sinon null.',
          },
        },
        required: ['nom', 'variete', 'quantite', 'unite', 'lieu', 'confiance', 'remarque'],
        additionalProperties: false,
      },
    },
    lisible: {
      type: 'boolean',
      description: 'false si la photo est floue, trop sombre, ou ne montre pas de '
        + 'nourriture. Dans ce cas, articles doit être vide.',
    },
    commentaire: {
      type: ['string', 'null'],
      description: 'Une phrase si quelque chose gêne la lecture. Sinon null.',
    },
  },
  required: ['articles', 'lisible', 'commentaire'],
  additionalProperties: false,
}

const SYSTEME = [
  'Tu inventories le contenu d’un réfrigérateur, d’un congélateur ou d’un placard',
  'à partir d’une photo. Tu décris ce que tu VOIS, tu ne devines pas ce qu’il',
  'devrait y avoir.',
  '',
  'Règles absolues :',
  '· COMPTE les unités visibles. « 4 pots de yaourt », jamais « des yaourts ».',
  '· Distingue les variétés : un yaourt aux fruits n’a pas les mêmes valeurs',
  '  nutritionnelles qu’un nature. C’est la variété qui compte, pas la marque.',
  '· Un article par LIGNE de produit, pas un par exemplaire : quatre pots',
  '  identiques font UN article de quantité 4.',
  '· Si tu hésites entre deux aliments, choisis le plus probable et baisse la',
  '  confiance. Si tu ne vois vraiment pas, ne le liste pas.',
  '· Tu écris en français, au singulier, sans marque commerciale.',
].join('\n')

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

  const mois = new Date().toISOString().slice(0, 8) + '01'
  const { data: usage } = await admin.from('llm_usage').select('calls, cost_eur')
    .eq('household_id', foyer).eq('month', mois).eq('kind', 'vision').maybeSingle()
  const deja = usage?.calls ?? 0
  if (deja >= QUOTA_MENSUEL) {
    return reply({
      erreur: `Quota atteint : ${QUOTA_MENSUEL} photos par mois. Il repart le 1er.`,
      restantes: 0,
    }, 429)
  }

  const f = fournisseurVision()
  if (!f) {
    return reply({
      erreur: 'Aucun modèle de vision configuré. Renseigne LLM_VISION_API_KEY.',
      restantes: QUOTA_MENSUEL - deja,
    }, 503)
  }

  const { image, lieu } = await req.json().catch(() => ({ image: null, lieu: null }))
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return reply({ erreur: 'Envoie une image en data URL (`data:image/jpeg;base64,…`).' }, 400)
  }
  if (image.length > TAILLE_MAX) {
    return reply({ erreur: 'Photo trop lourde. Réduis-la avant de l’envoyer.' }, 413)
  }

  const indice = ['frigo', 'congelateur', 'placard'].includes(lieu)
    ? `Cette photo a été prise dans : ${lieu}. Utilise-le comme valeur par défaut `
      + 'de « lieu », sauf si la photo dit clairement autre chose.'
    : 'Déduis le lieu de la photo.'

  const r = await demande<{ articles: Vu[]; lisible: boolean; commentaire: string | null }>(
    [f],
    [
      { role: 'system', content: SYSTEME },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Inventorie ce que tu vois. ${indice}` },
          { type: 'image_url', image_url: { url: image } },
        ],
      },
    ],
    SCHEMA,
    'inventaire',
    { vision: true },
  )

  if (!r.ok) return reply({ erreur: r.erreur, restantes: QUOTA_MENSUEL - deja }, 502)

  await admin.from('llm_usage').upsert({
    household_id: foyer, month: mois, kind: 'vision',
    calls: deja + 1, cost_eur: Number(usage?.cost_eur ?? 0),
  }, { onConflict: 'household_id,month,kind' })

  // Rien n'est écrit en base ici : l'écran fait valider article par article.
  // Une photo qui remplirait l'inventaire toute seule serait une photo qu'on
  // finirait par ne plus oser prendre.
  return reply({
    ...r.valeur,
    par: r.par,
    ms: r.ms,
    restantes: QUOTA_MENSUEL - deja - 1,
    quota: QUOTA_MENSUEL,
  })
})
