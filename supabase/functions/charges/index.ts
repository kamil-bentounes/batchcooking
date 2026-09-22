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

type Proposee = {
  libelle: string
  catalogue_libelle: string | null
  montant_cents: number | null
  periodicite: 'mensuel' | 'trimestriel' | 'annuel'
  portee: 'commun' | 'perso'
  variable: boolean
  confiance: number
  remarque: string | null
}

const SCHEMA = {
  type: 'object',
  properties: {
    charges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          libelle: { type: 'string', description: 'Le nom de la charge, en français, court.' },
          catalogue_libelle: {
            type: ['string', 'null'],
            description: 'Le libellé EXACT d’une ligne du catalogue fourni si elle '
              + 'correspond, sinon null. Ne jamais inventer un libellé approchant.',
          },
          montant_cents: {
            type: ['integer', 'null'],
            description: 'Le montant EN CENTIMES pour la périodicité indiquée. '
              + '100 euros par trimestre = 10000 avec periodicite=trimestriel. '
              + 'null si la personne n’a pas donné de montant.',
          },
          periodicite: { type: 'string', enum: ['mensuel', 'trimestriel', 'annuel'] },
          portee: {
            type: 'string', enum: ['commun', 'perso'],
            description: 'commun si la personne dit « on », « nous », « on partage » ; '
              + 'perso si elle dit « je », « mon », ou si la nature de la charge '
              + 'l’impose (un forfait mobile, un crédit personnel).',
          },
          variable: {
            type: 'boolean',
            description: 'true si la personne dit que le montant change — « à la '
              + 'consommation », « ça varie », « autour de ». Sinon false.',
          },
          confiance: {
            type: 'number',
            description: 'De 0 à 1. Basse quand le montant ou la périodicité sont devinés.',
          },
          remarque: {
            type: ['string', 'null'],
            description: 'Ce qui mérite d’être signalé à la personne, en une phrase. null sinon.',
          },
        },
        required: ['libelle', 'catalogue_libelle', 'montant_cents', 'periodicite',
                   'portee', 'variable', 'confiance', 'remarque'],
        additionalProperties: false,
      },
    },
    oublis: {
      type: 'array',
      items: { type: 'string' },
      description: 'Les libellés EXACTS du catalogue dont la personne n’a pas parlé '
        + 'et qui concernent presque tout le monde. Cinq au maximum, les plus '
        + 'coûteux d’abord. Jamais une ligne déjà citée.',
    },
    questions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Les questions à poser en UNE salve pour lever une ambiguïté réelle. '
        + 'Trois au maximum. Vide s’il n’y en a pas — ne pas meubler.',
    },
  },
  required: ['charges', 'oublis', 'questions'],
  additionalProperties: false,
}

const SYSTEME = [
  'Tu ranges la dictée d’une personne qui décrit les charges de son foyer.',
  '',
  'RÈGLES ABSOLUES :',
  '— Tu RECOPIES ce qui est dit. Tu n’inventes aucun montant. Si la personne ne',
  '  donne pas de chiffre pour une charge, montant_cents vaut null : une ligne',
  '  sans montant qu’elle complètera vaut mieux qu’un chiffre inventé.',
  '— Les montants sont EN CENTIMES, entiers. « 10,70 » donne 1070. « 1450 »',
  '  donne 145000. Jamais de virgule, jamais de flottant.',
  '— La périodicité est celle que la personne DIT. « 300 au trimestre » donne',
  '  30000 avec periodicite=trimestriel, et surtout PAS 10000 par mois : la',
  '  division, c’est l’application qui la fait.',
  '— catalogue_libelle ne vaut un libellé du catalogue que s’il correspond',
  '  VRAIMENT. Dans le doute, null : une ligne libre est moins grave qu’une',
  '  ligne rattachée au mauvais poste.',
  '',
  'CE QUI EST UTILE :',
  '— Une personne qui dit « l’assurance » sans préciser laquelle mérite une',
  '  question, pas une supposition.',
  '— Les oublis sont ton principal apport : tu as le catalogue entier sous les',
  '  yeux, elle non. Signale ce qui manque et qui coûte cher.',
  '— Si elle donne un montant annuel pour une chose mensuelle, ou l’inverse,',
  '  dis-le dans remarque plutôt que de corriger en silence.',
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
  const { data: usage } = await admin.from('llm_usage').select('calls')
    .eq('household_id', foyer).eq('month', mois).eq('kind', 'charges').maybeSingle()
  const deja = usage?.calls ?? 0
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

  const { texte, section } = await req.json().catch(() => ({ texte: null, section: null }))
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

  if (!r.ok) return reply({ erreur: r.erreur, restantes: QUOTA_MENSUEL - deja }, 502)

  await admin.rpc('llm_consomme', { p_household: foyer, p_kind: 'charges' })

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
