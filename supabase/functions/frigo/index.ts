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
 * et de l'audio. Le repli n'est donc pas un autre fournisseur mais un autre
 * MODÈLE Gemini — le quota gratuit est de 20 requêtes par jour ET PAR MODÈLE,
 * si bien qu'enchaîner trois modèles porte le budget à 60 photos par jour.
 *
 * Le prompt est la variante gagnante d'un A/B sur une vraie photo de frigo :
 * faire SITUER chaque produit avant de le compter (champ « ou ») sépare deux
 * groupes distincts du même yaourt là où l'ancien prompt les fusionnait, et
 * reconnaît un beurre entamé là où il voyait un citron.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { preflight, reply } from '../_shared/cors.ts'
import { demande, fournisseursVision } from '../_shared/llm.ts'

/** Lectures de photo par foyer et par mois. Une photo coûte plus qu'un texte. */
const QUOTA_MENSUEL = 30

/** Au-delà, ce n'est plus une photo de frigo, c'est une charge utile. */
const TAILLE_MAX = 6 * 1024 * 1024

type Vu = {
  ou: string
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
          ou: {
            type: 'string',
            description: 'Où se trouve cet article dans l’image, en quelques mots : '
              + '« étagère du haut, à gauche », « dans la porte, en bas ». '
              + 'Écris-le AVANT de compter : c’est ce qui évite de fusionner deux '
              + 'groupes distincts du même produit.',
          },
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
        required: ['ou', 'nom', 'variete', 'quantite', 'unite', 'lieu', 'confiance', 'remarque'],
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
  '<role>',
  'Tu dresses l’inventaire d’un réfrigérateur, d’un congélateur ou d’un placard',
  'à partir d’une photo, pour une application de cuisine qui s’en sert pour faire',
  'les courses et calculer des apports nutritionnels.',
  '</role>',
  '',
  '<pourquoi>',
  'Ce que tu rends sera affiché à quelqu’un qui validera chaque ligne. Un article',
  'oublié se rattrape d’un geste ; un article inventé fait acheter en double et',
  'fausse des calculs. Dans le doute, baisse la confiance plutôt que d’omettre,',
  'et n’invente jamais ce que tu ne vois pas.',
  '</pourquoi>',
  '',
  '<methode>',
  'Procède dans cet ordre, sans sauter d’étape :',
  '1. Parcours l’image zone par zone : chaque étagère, chaque bac, chaque',
  '   rangement de porte.',
  '2. Pour chaque produit trouvé, écris D’ABORD où il se trouve dans le champ',
  '   « ou ». Situer avant de compter réduit fortement les erreurs de comptage.',
  '3. Compte alors les exemplaires de CE produit, un par un.',
  '4. Lis l’étiquette si elle est lisible : elle donne la variété et le poids.',
  '</methode>',
  '',
  '<regles>',
  '· Regroupe par LIGNE de produit : quatre pots identiques font un article de',
  '  quantité 4, parce qu’une liste de courses parle de produits, pas d’unités.',
  '· Donne la variété (« aux fruits », « demi-écrémé », « 0 % ») : elle change',
  '  les valeurs nutritionnelles, et c’est elle qui permet de rattacher',
  '  l’aliment à une table de composition.',
  '· Écris en français, au singulier, avec le nom générique de l’aliment.',
  '· Mets dans « remarque » ce qu’une étiquette indique et que les autres champs',
  '  ne portent pas : poids, date, « emballage ouvert », « à moitié caché ».',
  '· Liste les boissons et les plats préparés comme les autres aliments.',
  '· Ignore ce qui ne se mange pas : bacs, clayettes, tasses, ustensiles.',
  '</regles>',
  '',
  '<exemple>',
  'Pour une étagère portant quatre pots de yaourt à la fraise et une brique de lait :',
  '[',
  '  {"ou":"étagère du milieu, à gauche","nom":"yaourt","variete":"à la fraise",',
  '   "quantite":4,"unite":"pot","lieu":"frigo","confiance":0.95,"remarque":"pack de 4"},',
  '  {"ou":"étagère du milieu, à droite","nom":"lait","variete":"demi-écrémé",',
  '   "quantite":1,"unite":"bouteille","lieu":"frigo","confiance":1,"remarque":"brique de 1 L"}',
  ']',
  '</exemple>',
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

  const vus = fournisseursVision()
  if (vus.length === 0) {
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
    ? `Photo prise dans : ${lieu}.`
    : 'Déduis le lieu de la photo.'

  const r = await demande<{ articles: Vu[]; lisible: boolean; commentaire: string | null }>(
    vus,
    [
      { role: 'system', content: SYSTEME },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Inventorie cette photo.\n\n<contexte>\n${indice}\n</contexte>` },
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
