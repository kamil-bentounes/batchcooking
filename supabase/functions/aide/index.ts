/**
 * « Demande à Popote » : l'aide intégrée.
 *
 * Il répond à une question SUR L'APPLI, d'après un manuel — pas d'après le code, pas d'après les données de la
 * personne. Trois principes, tous tenus :
 *
 *  · Il ne voit JAMAIS les chiffres du foyer. La question arrive seule, avec la dernière question et sa réponse ;
 *    aucune lecture de la base n'est faite pour lui. Un assistant qui connaîtrait les revenus de l'un répondrait
 *    à l'autre.
 *  · Il ne cherche que dans le manuel : quatre pages au plus, choisies par `choisis`, plus celle des limites.
 *    Ce qu'il dit est ensuite CONTRÔLÉ (`controle`) : un chiffre ou un libellé que les pages ne contiennent pas
 *    est signalé à l'écran, il n'est pas laissé passer.
 *  · Il propose, il n'agit pas. Au plus un écran à ouvrir, pris dans une liste fermée.
 *
 * Le manuel est `manuel.generated.ts`, produit par `npm run manuel:genere` depuis `docs/aide/` — et le
 * déploiement refuse de partir si une page n'a pas été relue depuis que le code dont elle dépend a changé.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { preflight, reply } from '../_shared/cors.ts'
import { demande, fournisseurs } from '../_shared/llm.ts'
import { choisis } from '../_shared/manuel.ts'
import { controle, messageDe, schemaDe, SYSTEME, type Sortie } from './prompt.ts'
import { PAGES } from './manuel.generated.ts'

/** Par foyer et par mois : deux personnes qui s'informent, pas un robot. */
const QUOTA_MENSUEL = 300

const QUESTION_MAX = 500
const COUPE_PRECEDENT = 800

export type Corps = {
  question?: unknown
  precedent?: { question?: unknown; reponse?: unknown } | null
  ecran?: unknown
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

  const corps: Corps = await req.json().catch(() => ({}))
  const question = typeof corps.question === 'string' ? corps.question.trim() : ''
  if (question.length < 3) return reply({ erreur: 'Pose ta question en quelques mots.' }, 400)
  if (question.length > QUESTION_MAX) {
    return reply({ erreur: `Une question de ${QUESTION_MAX} caractères au plus.` }, 413)
  }

  const p = corps.precedent
  const precedent = p && typeof p.question === 'string' && typeof p.reponse === 'string'
    ? { question: p.question.slice(0, COUPE_PRECEDENT), reponse: p.reponse.slice(0, COUPE_PRECEDENT) }
    : null

  /* L'écran ne sert qu'à départager des pages : il ne passe pas par le modèle, et une route inconnue est ignorée. */
  const ecran = typeof corps.ecran === 'string'
    && PAGES.some(pg => pg.ecrans.includes(corps.ecran as string)) ? corps.ecran : undefined

  /* On CONSOMME d'abord, on regarde ensuite — voir `charges` : lire puis incrémenter laisserait passer N appels
     simultanés. Un appel refusé a consommé son jeton, c'est le bon sens du compromis. */
  const { data: consomme, error: eQuota } = await admin
    .rpc('llm_consomme', { p_household: profil.household_id, p_kind: 'aide' })
  if (eQuota) return reply({ erreur: 'Le compteur d’usage est indisponible.' }, 503)
  const deja = (consomme ?? 1) - 1
  if (deja >= QUOTA_MENSUEL) {
    return reply({ erreur: `Quota atteint : ${QUOTA_MENSUEL} questions par mois. Il repart le 1er.` }, 429)
  }

  const fs = fournisseurs()
  if (fs.length === 0) return reply({ erreur: 'Aucun modèle configuré.' }, 503)

  const jointes = choisis(PAGES, {
    question, precedente: precedent?.question, ecran,
  })

  const r = await demande<Sortie>(
    fs,
    [
      { role: 'system', content: SYSTEME },
      { role: 'user', content: messageDe({ question, precedent, pages: jointes }) },
    ],
    schemaDe(jointes.map(pg => pg.id)),
    'aide',
  )
  if (!r.ok) return reply({ erreur: 'L’aide ne répond pas pour le moment. Réessaie dans un instant.' }, 502)

  return reply({
    ...controle(r.valeur, jointes, question),
    restantes: QUOTA_MENSUEL - deja - 1,
  })
})
