/**
 * Lire l'étiquette d'un plat tout prêt.
 *
 * Trois provenances possibles pour les calories d'une barquette, et une seule
 * demande un modèle :
 *
 *  · un ALIMENT — le référentiel CIQUAL les connaît ;
 *  · un plat de NOTRE batch cooking — la recette les calcule, au gramme ;
 *  · un plat ACHETÉ dehors — personne ne les connaît, sauf l'emballage.
 *
 * C'est de la LECTURE, pas de l'estimation. La différence n'est pas
 * théorique : deviner des calories en regardant un plat se trompe d'un facteur
 * deux sans jamais le dire, alors qu'un tableau nutritionnel imprimé est du
 * texte. On demande donc au modèle de RECOPIER ce qu'il voit, et de dire
 * franchement quand il ne voit rien — un champ nul vaut mieux qu'un nombre
 * inventé, parce qu'un nombre inventé, lui, entrera dans le bilan du jour.
 *
 * ⚠️ PLUSIEURS photos, et c'est le cœur du sujet. Le tableau nutritionnel est
 *    sur une face, le poids net sur une autre, la DLC imprimée sur le dessus ou
 *    sur la tranche. Une seule photo oblige à choisir laquelle on perd.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { preflight, reply } from '../_shared/cors.ts'
import { demande, fournisseursVision } from '../_shared/llm.ts'

/** Lectures d'étiquette par foyer et par mois. */
const QUOTA_MENSUEL = 40

/** Au-delà, ce n'est plus une étiquette, c'est une charge utile. */
const TAILLE_MAX = 6 * 1024 * 1024

/** Trois suffisent : face avant, tableau nutritionnel, DLC. */
const PHOTOS_MAX = 3

type Lecture = {
  nom: string | null
  marque: string | null
  /** Le poids net de la barquette, en grammes. */
  poids_g: number | null
  /** Le nombre de parts annoncé par l'emballage, s'il l'annonce. */
  parts: number | null
  /** Les valeurs telles qu'imprimées, POUR 100 G. C'est la forme légale. */
  kcal_100g: number | null
  proteines_100g: number | null
  glucides_100g: number | null
  lipides_100g: number | null
  fibres_100g: number | null
  /** Et pour une portion, quand l'emballage donne AUSSI cette colonne. */
  kcal_portion: number | null
  /** La date imprimée, telle qu'elle est lisible. `null` si aucune. */
  dlc: string | null
  lisible: boolean
  confiance: number
  commentaire: string | null
}

const SCHEMA = {
  type: 'object',
  properties: {
    nom: { type: ['string', 'null'], description: 'Le nom du plat, tel qu’écrit sur l’emballage.' },
    marque: { type: ['string', 'null'], description: 'La marque, si elle est lisible.' },
    poids_g: {
      type: ['number', 'null'],
      description: 'Le poids NET en grammes, tel qu’imprimé. Pas le poids égoutté, '
        + 'pas le poids brut avec l’emballage. null si tu ne le vois pas.',
    },
    parts: {
      type: ['number', 'null'],
      description: 'Le nombre de portions annoncé par l’emballage (« 2 portions »). '
        + 'null si l’emballage n’en annonce aucun — ne le devine pas.',
    },
    kcal_100g: {
      type: ['number', 'null'],
      description: 'Les kilocalories POUR 100 G, telles qu’imprimées. Attention : '
        + 'le tableau donne d’abord des kJ puis des kcal. Prends les KCAL. '
        + 'null si le tableau n’est pas lisible.',
    },
    proteines_100g: { type: ['number', 'null'], description: 'Protéines en g pour 100 g.' },
    glucides_100g: { type: ['number', 'null'], description: 'Glucides en g pour 100 g.' },
    lipides_100g: { type: ['number', 'null'], description: 'Lipides en g pour 100 g.' },
    fibres_100g: { type: ['number', 'null'], description: 'Fibres en g pour 100 g.' },
    kcal_portion: {
      type: ['number', 'null'],
      description: 'Les kcal pour UNE PORTION, si le tableau porte cette seconde '
        + 'colonne. null sinon — ne la calcule pas toi-même.',
    },
    dlc: {
      type: ['string', 'null'],
      description: 'La date limite imprimée, au format AAAA-MM-JJ. Les emballages '
        + 'français écrivent JJ/MM/AAAA : convertis. null si aucune date n’est lisible.',
    },
    lisible: {
      type: 'boolean',
      description: 'false si aucune des photos ne montre d’emballage exploitable.',
    },
    confiance: {
      type: 'number',
      description: 'De 0 à 1. Ce qui compte est la lisibilité du TABLEAU : une belle '
        + 'photo de face avant avec un tableau flou mérite une confiance basse.',
    },
    commentaire: {
      type: ['string', 'null'],
      description: 'Une phrase, en français, seulement s’il manque quelque chose '
        + 'd’utile : « le tableau est coupé », « le poids net n’apparaît pas ».',
    },
  },
  required: ['nom', 'poids_g', 'kcal_100g', 'lisible', 'confiance'],
  additionalProperties: false,
}

const SYSTEME = `Tu lis l'emballage d'un plat préparé et tu RECOPIES ce qui y est imprimé.

Tu ne calcules rien, tu ne devines rien, tu n'estimes rien. Si une valeur n'est
pas lisible sur les photos, tu rends null. Un null est une réponse utile ; un
nombre inventé entrera dans le suivi nutritionnel de quelqu'un et le faussera
sans que personne ne s'en aperçoive.

Les photos peuvent montrer des faces différentes du même emballage : combine-les.
Le tableau nutritionnel est en général au dos, le poids net sur la face avant,
la date sur le dessus ou la tranche.

Deux pièges à éviter :
· le tableau donne l'énergie en kJ ET en kcal. Tu prends les kcal (le plus petit
  des deux nombres, environ 4,2 fois plus petit) ;
· « pour 100 g » et « par portion » sont deux colonnes distinctes. Tu remplis
  les champs _100g avec la PREMIÈRE, et kcal_portion seulement si la SECONDE
  existe vraiment.

Réponds en français.`

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
  const { data: usage } = await admin.from('llm_usage').select('calls')
    .eq('household_id', foyer).eq('month', mois).eq('kind', 'etiquette').maybeSingle()
  const deja = usage?.calls ?? 0
  if (deja >= QUOTA_MENSUEL) {
    return reply({
      erreur: `Quota atteint : ${QUOTA_MENSUEL} étiquettes par mois. Il repart le 1er.`,
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

  const { images } = await req.json().catch(() => ({ images: null }))
  const lot: unknown[] = Array.isArray(images) ? images : []
  if (lot.length === 0) {
    return reply({ erreur: 'Envoie une à trois images en data URL.' }, 400)
  }
  if (lot.length > PHOTOS_MAX) {
    return reply({ erreur: `Trois photos au maximum : la face, le tableau, la date.` }, 400)
  }
  if (!lot.every(i => typeof i === 'string' && i.startsWith('data:image/'))) {
    return reply({ erreur: 'Chaque image doit être une data URL (`data:image/jpeg;base64,…`).' }, 400)
  }
  // ⚠️ La somme, pas chaque image : trois photos de 5 Mo passeraient une à une.
  const poids = (lot as string[]).reduce((s, i) => s + i.length, 0)
  if (poids > TAILLE_MAX) {
    return reply({ erreur: 'Photos trop lourdes. Réduis-les avant de les envoyer.' }, 413)
  }

  const r = await demande<Lecture>(
    vus,
    [
      { role: 'system', content: SYSTEME },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: lot.length === 1
              ? 'Lis cet emballage.'
              : `Lis cet emballage. Les ${lot.length} photos montrent le même produit `
                + `sous des angles différents : combine-les.`,
          },
          ...(lot as string[]).map(url => ({
            type: 'image_url' as const, image_url: { url },
          })),
        ],
      },
    ],
    SCHEMA,
    'etiquette',
    { vision: true },
  )

  if (!r.ok) return reply({ erreur: r.erreur, restantes: QUOTA_MENSUEL - deja }, 502)

  await admin.rpc('llm_consomme', { p_household: foyer, p_kind: 'etiquette' })

  // Rien n'est écrit en base : l'écran montre ce qui a été lu, et c'est la
  // personne qui valide. Une étiquette mal lue qui entrerait toute seule dans
  // le suivi nutritionnel serait bien pire qu'une saisie à la main.
  return reply({
    ...r.valeur,
    restantes: QUOTA_MENSUEL - deja - 1,
    quota: QUOTA_MENSUEL,
  })
})
