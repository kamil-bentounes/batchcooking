/**
 * Lire un ticket de caisse (lot 5).
 *
 * Il n'existe aucune API de prix pour un particulier, et les bases
 * communautaires sont trouées. Le ticket, lui, est exact, daté, à la bonne
 * enseigne, et déjà dans la poche : c'est la meilleure source de prix qu'on
 * puisse avoir, et la seule qui donne NOS prix plutôt qu'une moyenne nationale.
 *
 * Trois choses sur lesquelles ce prompt insiste, parce que ce sont les trois
 * façons de se tromper sur un ticket :
 *
 *  · **Le libellé TEL QU'IMPRIMÉ.** « PDT CHARLOTTE 2.5KG » n'est pas « pommes
 *    de terre ». Le développer ici ferait perdre l'information qui permet de
 *    reconnaître le même produit au ticket suivant ; c'est l'application qui
 *    rapproche, et elle sait le faire.
 *  · **Les REMISES.** Une ligne « REMISE -0,50 » suit le produit qu'elle
 *    concerne. La compter comme un article rendrait un prix négatif ; l'ignorer
 *    ferait apprendre un prix trop haut. Elle se déduit du produit précédent.
 *  · **Ce qui n'est pas un achat.** Sous-totaux, points de fidélité, rendu
 *    monnaie, moyen de paiement : rien de tout cela n'est un article.
 *
 * Rien n'est écrit en base ici. Le rapprochement avec la liste se fait côté
 * application, sous les yeux de quelqu'un : un prix appris de travers se
 * propage ensuite à toutes les estimations.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { preflight, reply } from '../_shared/cors.ts'
import { demande, fournisseursVision } from '../_shared/llm.ts'
import { SCHEMA, SYSTEME } from './prompt.ts'
import type { Ligne } from './prompt.ts'
import { reconcilie } from './lignes.ts'

/** Lectures de ticket par foyer et par mois. Un cycle par semaine, deux ou
    trois enseignes : trente couvre largement, et laisse de quoi réessayer. */
const QUOTA_MENSUEL = 30

/** Au-delà, ce n'est plus un ticket, c'est une charge utile. */
const TAILLE_MAX = 6 * 1024 * 1024

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
    .eq('household_id', foyer).eq('month', mois).eq('kind', 'ticket').maybeSingle()
  const deja = usage?.calls ?? 0
  if (deja >= QUOTA_MENSUEL) {
    return reply({
      erreur: `Quota atteint : ${QUOTA_MENSUEL} tickets par mois. Il repart le 1er.`,
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

  const { image, enseigne } = await req.json().catch(() => ({ image: null }))
  if (typeof image !== 'string' || !image.startsWith('data:image/')) {
    return reply({ erreur: 'Envoie une image en data URL (`data:image/jpeg;base64,…`).' }, 400)
  }
  if (image.length > TAILLE_MAX) {
    return reply({ erreur: 'Photo trop lourde. Réduis-la avant de l’envoyer.' }, 413)
  }

  // Dire l'enseigne quand on la connaît évite au modèle de la deviner sur un
  // logo coupé — et n'enlève rien : il la lit quand même si elle est visible.
  const indice = typeof enseigne === 'string' && enseigne.trim()
    ? `Ticket pris chez : ${enseigne.trim()}.`
    : 'L’enseigne est à lire en haut du ticket.'

  const r = await demande<{
    enseigne: string | null; date: string | null; lignes: Ligne[]
    total_eur: number | null; lisible: boolean; commentaire: string | null
  }>(
    vus,
    [
      { role: 'system', content: SYSTEME },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Lis ce ticket de caisse.\n\n<contexte>\n${indice}\n</contexte>` },
          { type: 'image_url', image_url: { url: image } },
        ],
      },
    ],
    SCHEMA,
    'ticket',
    { vision: true },
  )

  if (!r.ok) return reply({ erreur: r.erreur, restantes: QUOTA_MENSUEL - deja }, 502)

  await admin.from('llm_usage').upsert({
    household_id: foyer, month: mois, kind: 'ticket',
    calls: deja + 1, cost_eur: Number(usage?.cost_eur ?? 0),
  }, { onConflict: 'household_id,month,kind' })

  // Remises déduites quand l'arithmétique le prouve, prix négatifs écartés.
  // Ce qui reste comme écart entre la somme des lignes et le total imprimé est
  // LA mesure de qualité de la lecture : l'écran l'affiche, et c'est ce qui
  // permet de repérer une ligne manquée sans relire tout le papier.
  const total = r.valeur.total_eur === null ? null : Number(r.valeur.total_eur)
  const { lignes, somme, ecart, remisesDeduites } = reconcilie(r.valeur.lignes ?? [], total)

  return reply({
    ...r.valeur,
    lignes,
    somme,
    ecart,
    remisesDeduites,
    par: r.par,
    ms: r.ms,
    restantes: QUOTA_MENSUEL - deja - 1,
    quota: QUOTA_MENSUEL,
  })
})
