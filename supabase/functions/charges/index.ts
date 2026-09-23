/**
 * Ranger une dictée de charges dans le catalogue.
 *
 * La corvée du budget n'est pas de décider, c'est de SAISIR : cinquante lignes
 * à parcourir, un montant et une périodicité chacune. C'est exactement ce qu'un
 * modèle fait bien, et c'est le seul endroit du budget où il a sa place.
 *
 * Trois principes, tous tenus :
 *
 *  · Il PROPOSE, il n'écrit rien. Comme la photo du frigo (D28, D57), la dictée
 *    est un accélérateur, jamais une autorité. L'écran fait valider ligne à
 *    ligne, et rien ne part en base sans un geste.
 *  · Le CATALOGUE est sa liste de contrôle. Il a les cinquante-deux lignes sous
 *    les yeux, donc il peut dire ce qu'on n'a PAS dit — la mutuelle, les
 *    cadeaux, le contrôle technique. C'est là que la dictée gagne vraiment :
 *    elle rattrape les oublis, ce qu'un formulaire ne fait jamais.
 *  · Il pose UNE salve de questions, pas une conversation. Un aller-retour
 *    borné attrape l'essentiel ; un chat sans fin lasse avant la moitié.
 *
 * Il ne voit jamais les revenus : ce sont des charges qu'on lui dicte, pas des
 * salaires. La clé de partage se décide entre deux personnes, pas dans un
 * prompt.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { preflight, reply } from '../_shared/cors.ts'
import { demande, fournisseurs } from '../_shared/llm.ts'

/** Dictées par foyer et par mois. On remplit ses charges une fois, pas trente. */
const QUOTA_MENSUEL = 20

/** Au-delà, ce n'est plus une dictée, c'est un roman. */
const TEXTE_MAX = 8_000

import { SCHEMA, SYSTEME, type Proposee } from './prompt.ts'

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

  /* ⚠️ On CONSOMME d'abord, on regarde ensuite.
   *
   *    Lire le compteur puis l'incrémenter laisse passer N appels simultanés :
   *    ils lisent tous la même valeur. `llm_consomme` est atomique et REND le
   *    compteur à jour — c'est lui le portillon, pas la lecture. Un appel
   *    refusé a donc consommé son jeton, ce qui est le bon sens du
   *    compromis : mieux vaut compter un appel de trop que d'en laisser
   *    passer dix. */
  const { data: consomme, error: eQuota } = await admin
    .rpc('llm_consomme', { p_household: foyer, p_kind: 'charges' })
  if (eQuota) return reply({ erreur: 'Le compteur d’usage est indisponible.' }, 503)
  const deja = (consomme ?? 1) - 1
  if (deja >= QUOTA_MENSUEL) {
    return reply({
      erreur: `Quota atteint : ${QUOTA_MENSUEL} dictées par mois. Il repart le 1er.`,
      restantes: 0,
    }, 429)
  }

  const fs = fournisseurs()
  if (fs.length === 0) {
    return reply({ erreur: 'Aucun modèle configuré.', restantes: QUOTA_MENSUEL - deja }, 503)
  }

  const { texte, section: sectionBrute } = await req.json()
    .catch(() => ({ texte: null, section: null }))

  /* ⚠️ La section est interpolée dans le prompt : elle doit venir d'une LISTE
     FERMÉE, pas de ce que l'appelant envoie. C'est le vrai point d'injection de
     cette fonction — le texte dicté, lui, est délimité et annoncé comme des
     données. */
  const SECTIONS = ['Logement', 'Auto', 'Abonnements', 'Santé', 'Crédits',
                    'Impôts', 'Vie courante']
  const section = SECTIONS.includes(sectionBrute) ? sectionBrute : null
  if (typeof texte !== 'string' || texte.trim().length < 10) {
    return reply({ erreur: 'Dicte au moins une phrase.' }, 400)
  }
  if (texte.length > TEXTE_MAX) {
    return reply({ erreur: 'C’est trop long d’un coup. Fais-le section par section.' }, 413)
  }

  /* Le catalogue vient de la BASE, pas du prompt : il est la liste de contrôle
     du modèle, et il doit rester la même des deux côtés. Le figer dans le
     prompt le ferait dériver à la première ligne ajoutée. */
  const { data: catalogue } = await admin.from('catalogue_charge')
    .select('section, libelle, periode, portee')
    .order('ordre')
  const liste = (catalogue ?? [])
    .filter(l => !section || l.section === section)
    .map(l => `${l.section} | ${l.libelle} | ${l.periode} | ${l.portee}`)
    .join('\n')

  const r = await demande<{ charges: Proposee[]; oublis: string[]; questions: string[] }>(
    fs,
    [
      { role: 'system', content: SYSTEME },
      {
        role: 'user',
        content: `<catalogue>\n${liste}\n</catalogue>\n\n`
          + `<dictee>\n${texte.trim()}\n</dictee>\n\n`
          + (section ? `La personne parle de la section « ${section} ».\n` : '')
          + 'Range cette dictée.',
      },
    ],
    SCHEMA,
    'charges',
  )

  if (!r.ok) return reply({ erreur: r.erreur, restantes: QUOTA_MENSUEL - deja - 1 }, 502)

  /* Rien n'est écrit en base : l'écran fait valider ligne à ligne. Une dictée
     qui remplirait le budget toute seule serait une dictée qu'on n'oserait
     plus lancer. */
  return reply({
    ...r.valeur,
    par: r.par,
    ms: r.ms,
    restantes: QUOTA_MENSUEL - deja - 1,
    quota: QUOTA_MENSUEL,
  })
})
