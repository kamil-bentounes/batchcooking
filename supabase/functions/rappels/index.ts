/**
 * Les rappels par mail.
 *
 * Deux entrées, deux clés :
 *
 *  · LE PASSAGE HORAIRE. `pg_cron` + `pg_net` appellent cette fonction à la minute 5 de chaque heure, avec le secret
 *    d'appel dans l'en-tête `x-rappels-secret` (comparé à temps constant à `RAPPELS_SECRET`). Elle lit ce qui est DÛ
 *    (`rappels_a_envoyer(now())`), RÉSERVE chaque rappel dans `rappel_envoye` (l'insertion unique est le verrou),
 *    envoie, et rend la réservation si l'envoi échoue : l'heure suivante réessaie. Voir `orchestre.ts`.
 *
 *  · L'ESSAI. Un POST authentifié par le JWT de la personne (`{ "essai": "<type>" }`) lui envoie UN mail d'exemple, à
 *    elle et à personne d'autre, sans rien écrire dans `rappel_envoye`.
 *
 * Les mails partent du Gmail de Kamil (« Popote »), par SMTP en TLS implicite, port 465, avec un mot de passe
 * d'application. Secrets de la fonction : `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `APP_BASE_URL`, `RAPPELS_SECRET`.
 *
 * Tout ce qui se teste (gabarits, textes, liens, ordre réserver-envoyer-libérer) vit dans `_shared/rappels/`, sans
 * Deno : cette fonction reste mince.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'
import { preflight, reply } from '../_shared/cors.ts'
import { exemple } from '../_shared/rappels/exemples.ts'
import { baseSure, lien } from '../_shared/rappels/liens.ts'
import { construis } from '../_shared/rappels/mails.ts'
import { envoieLesRappels } from '../_shared/rappels/orchestre.ts'
import { secretValide } from '../_shared/rappels/secret.ts'
import { estUnType } from '../_shared/rappels/types.ts'
import type { Mail, RappelDu } from '../_shared/rappels/types.ts'

const CORPS_MAX = 2_000

function transport() {
  const user = Deno.env.get('GMAIL_USER')
  const pass = Deno.env.get('GMAIL_APP_PASSWORD')
  if (!user || !pass) throw new Error('GMAIL_USER et GMAIL_APP_PASSWORD ne sont pas posés.')
  /* Le mot de passe d'application s'écrit parfois « abcd efgh ijkl mnop » : les espaces ne comptent pas. */
  const smtp = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user, pass: pass.replace(/\s+/g, '') },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  })
  return { user, smtp }
}

async function envoie(m: Mail & { a: string }, base: string) {
  const { user, smtp } = transport()
  await smtp.sendMail({
    from: { name: 'Popote', address: user },
    to: m.a,
    subject: m.sujet,
    text: m.texte,
    html: m.html,
    /* Un moyen de se retirer pour les messageries qui le montrent : l'écran des rappels. */
    headers: { 'List-Unsubscribe': `<${lien(base, '/rappels')}>` },
  })
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return reply('Method not allowed', 405)

  let base: string
  try { base = baseSure(Deno.env.get('APP_BASE_URL')) } catch { return reply('APP_BASE_URL n’est pas posé.', 503) }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // ── Le passage horaire ────────────────────────────────────────────────────
  const secret = req.headers.get('x-rappels-secret')
  if (secret !== null) {
    if (!Deno.env.get('RAPPELS_SECRET')) return reply('RAPPELS_SECRET n’est pas posé.', 503)
    if (!(await secretValide(secret, Deno.env.get('RAPPELS_SECRET')))) return reply('Non autorisé', 401)

    const bilan = await envoieLesRappels({
      base,
      maintenant: () => new Date(),
      dus: async () => {
        const { data, error } = await admin.rpc('rappels_a_envoyer', { p_maintenant: new Date().toISOString() })
        if (error) throw new Error(`rappels_a_envoyer : ${error.message}`)
        return (data ?? []) as RappelDu[]
      },
      reserve: async (r) => {
        const { data, error } = await admin.rpc('reserve_rappel', { p_user: r.user_id, p_type: r.type, p_cles: r.cles })
        if (error) throw new Error(`reserve_rappel : ${error.message}`)
        return data === true
      },
      libere: async (r) => {
        const { error } = await admin.rpc('libere_rappel', { p_user: r.user_id, p_type: r.type, p_cles: r.cles })
        if (error) throw new Error(`libere_rappel : ${error.message}`)
      },
      envoie: (m) => envoie(m, base),
      /* Ni adresse ni contenu dans les journaux : un type et un résultat. */
      journal: (l) => console.log(`rappels : ${l}`),
    })
    return reply(bilan)
  }

  // ── L'essai : un exemple, à soi seul ──────────────────────────────────────
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!jwt) return reply('Non authentifié', 401)
  const { data: u } = await admin.auth.getUser(jwt)
  const moi = u?.user
  if (!moi?.email) return reply('Non authentifié', 401)

  if (Number(req.headers.get('content-length') ?? 0) > CORPS_MAX) return reply('Corps trop gros', 413)
  const corps = await req.json().catch(() => null) as { essai?: unknown } | null
  if (!estUnType(corps?.essai)) return reply('Quel rappel ?', 400)

  const { data: profil } = await admin.from('user_profile').select('display_name').eq('id', moi.id).maybeSingle()
  if (!profil) return reply('Aucun foyer', 403)
  const prenom = (profil.display_name ?? '').trim() || 'toi'

  const maintenant = new Date()
  try {
    const mail = construis(corps.essai, exemple(corps.essai, maintenant, prenom, base), { base, maintenant, prenom, exemple: true })
    /* Le destinataire est l'adresse du jeton, jamais une adresse reçue dans le corps. */
    await envoie({ ...mail, a: moi.email }, base)
  } catch (e) {
    console.log(`rappels : essai ${corps.essai} : échec (${e instanceof Error ? e.name : 'erreur'})`)
    return reply('Le mail n’a pas pu partir. Réessaie dans un instant.', 502)
  }
  return reply({ ok: true })
})
