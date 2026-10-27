/**
 * La fonction `rappels`, sans Deno : tout ce qui décide (le secret, le JWT, la limite des essais, les codes de réponse,
 * l'ordre des appels) vit ici, avec ses dépendances INJECTÉES (le client de la base, le transport SMTP, l'horloge, le
 * journal, l'environnement). `functions/rappels/index.ts` ne fait que les brancher ; `tests/rappels-service.test.ts` les
 * remplace par des faux.
 *
 * Deux entrées, deux clés :
 *
 *  · LE PASSAGE HORAIRE. `pg_cron` + `pg_net` appellent la fonction à la minute 5 de chaque heure, avec le secret
 *    d'appel dans l'en-tête `x-rappels-secret` (comparé à temps constant à `RAPPELS_SECRET`). Elle prépare la base
 *    (`prepare_les_rappels` : ouvre les mois du budget, purge), lit ce qui est DÛ (`rappels_a_envoyer`), RÉSERVE
 *    chaque rappel, envoie, puis note le résultat (`note_la_passe`). Un seul transport SMTP pour toute la passe, fermé
 *    à la fin. Elle répond 500 quand un rappel a échoué (le nombre, jamais le contenu) : la panne se voit.
 *
 *  · L'ESSAI. Un POST authentifié par le JWT de la personne (`{ "essai": "<type>" }`) lui envoie UN mail d'exemple, à
 *    l'adresse du jeton et à personne d'autre. Un exemple par type, par membre et par heure : au-delà, 429.
 */
import { preflight, reply } from '../cors.ts'
import { exemple } from './exemples.ts'
import { baseSure } from './liens.ts'
import { construis } from './mails.ts'
import { envoieLesRappels } from './orchestre.ts'
import { secretValide } from './secret.ts'
import { avantLesDonnees, optionsDuMail } from './smtp.ts'
import type { OptionsDuMail } from './smtp.ts'
import { prenomSur } from './texte.ts'
import { estUnType } from './types.ts'
import type { RappelDu } from './types.ts'

/** Le temps qu'un essai se donne pour partir. Le client attend AU MOINS autant (`useEssaiRappel`). */
export const DELAI_ESSAI_MS = 20_000
const CORPS_MAX = 2_000

type Reponse<T> = PromiseLike<{ data: T; error: { message: string } | null }>

/** Ce que la fonction demande à la base : un sous-ensemble du client `supabase-js`, avec la clé de service. */
export type ClientAdmin = {
  rpc(nom: string, args?: Record<string, unknown>): Reponse<unknown>
  auth: { getUser(jwt: string): PromiseLike<{ data: { user: { id: string; email?: string | null } | null } }> }
  from(table: string): {
    select(colonnes: string): {
      eq(colonne: string, valeur: string): { maybeSingle(): Reponse<{ display_name?: string | null } | null> }
    }
  }
}

export type Transport = {
  envoie(options: OptionsDuMail): Promise<unknown>
  /** Connexion et authentification, sans rien envoyer. */
  verifie(): Promise<unknown>
  ferme(): void
}

export type Dependances = {
  env: (nom: string) => string | undefined
  creeClient: (url: string, cle: string) => ClientAdmin
  creeTransport: (utilisateur: string, motDePasse: string) => Transport
  maintenant: () => Date
  /** Ni adresse, ni secret, ni contenu : un type, un résultat, un nombre. */
  journal: (ligne: string) => void
}

/** « 2026-10-26T19 » : l'heure (UTC) qui borne les essais. */
export const heureDEssai = (d: Date) => d.toISOString().slice(0, 13)

export const cleDEssai = (type: string, d: Date) => `essai:${type}:${heureDEssai(d)}`

export const MESSAGE_ESSAI_TROP_TOT =
  'Tu as déjà demandé cet exemple pendant cette heure. Réessaie dans un moment : un exemple par rappel et par heure.'

/** Rejette au bout de `ms` : un envoi suspendu ne bloque pas la réponse. */
function avecDelai<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined
  const delai = new Promise<never>((_, no) => { t = setTimeout(() => no(Object.assign(new Error('Délai dépassé'), { code: 'DELAI' })), ms) })
  return Promise.race([p, delai]).finally(() => clearTimeout(t))
}

export async function sert(req: Request, dep: Dependances): Promise<Response> {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return reply('Method not allowed', 405)

  let base: string
  try { base = baseSure(dep.env('APP_BASE_URL')) } catch { return reply('APP_BASE_URL n’est pas posé.', 503) }

  const url = dep.env('SUPABASE_URL')
  const cle = dep.env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !cle) return reply('La base n’est pas configurée.', 503)
  const admin = dep.creeClient(url, cle)

  /* Un transport par appel, créé au premier besoin, fermé à la fin (`pool` : une connexion pour toute la passe). */
  let transport: Transport | null = null
  const lien = () => {
    if (transport) return transport
    const user = dep.env('GMAIL_USER'), pass = dep.env('GMAIL_APP_PASSWORD')
    if (!user || !pass) throw new Error('GMAIL_USER et GMAIL_APP_PASSWORD ne sont pas posés.')
    /* Le mot de passe d'application s'écrit parfois « abcd efgh ijkl mnop » : les espaces ne comptent pas. */
    transport = dep.creeTransport(user, pass.replace(/\s+/g, ''))
    return transport
  }
  const expediteur = () => dep.env('GMAIL_USER') ?? ''

  try {
    // ── Le passage horaire ──────────────────────────────────────────────────
    const secret = req.headers.get('x-rappels-secret')
    if (secret !== null) {
      if (!dep.env('RAPPELS_SECRET')) return reply('RAPPELS_SECRET n’est pas posé.', 503)
      if (!(await secretValide(secret, dep.env('RAPPELS_SECRET')))) return reply('Non autorisé', 401)
      return await passage(admin, dep, base, lien, expediteur)
    }

    // ── L'essai : un exemple, à soi seul ────────────────────────────────────
    return await essai(req, admin, dep, base, lien, expediteur)
  } finally {
    try { (transport as Transport | null)?.ferme() } catch { /* déjà fermé */ }
  }
}

async function passage(
  admin: ClientAdmin, dep: Dependances, base: string, lien: () => Transport, expediteur: () => string,
): Promise<Response> {
  /* Les mois du budget s'ouvrent à la demande de l'écran : sans cela, un mois que personne n'a ouvert n'a ni facture
     à confirmer ni ligne « au fil », et les rappels du budget ne le voient pas. Une préparation en erreur n'arrête
     pas les rappels de la cuisine : elle est comptée, et la passe répond 500. */
  let preparationEnErreur = 0
  try {
    const { error } = await admin.rpc('prepare_les_rappels', { p_maintenant: dep.maintenant().toISOString() })
    if (error) throw new Error(error.message)
  } catch {
    preparationEnErreur = 1
    dep.journal('préparation en erreur : les mois du budget n’ont peut-être pas été ouverts')
  }

  let bilan
  try {
    bilan = await envoieLesRappels({
      base,
      maintenant: dep.maintenant,
      dus: async () => {
        const { data, error } = await admin.rpc('rappels_a_envoyer', { p_maintenant: dep.maintenant().toISOString() })
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
      pret: async () => { await lien().verifie() },
      envoie: async (m) => { await lien().envoie(optionsDuMail(m, expediteur(), base)) },
      journal: (l) => dep.journal(`rappels : ${l}`),
    })
  } catch {
    /* La lecture de ce qui est dû a échoué : rien n'est parti, rien n'est réservé. */
    dep.journal('rappels : la lecture de ce qui est dû a échoué')
    await note(admin, dep, 'erreur', 0, 0, 0)
    return reply({ erreur: 'La lecture des rappels a échoué.' }, 500)
  }

  const echecs = bilan.echecs + preparationEnErreur
  await note(admin, dep, echecs > 0 ? 'echecs' : 'ok', bilan.dus, bilan.envoyes, echecs)
  /* Une panne se voit : 500 dès qu'un rappel ou la préparation a échoué, avec le nombre et jamais le contenu. */
  return reply({ ...bilan, echecs }, echecs > 0 ? 500 : 200)
}

/** Le résultat de la passe, dans `rappel_passe` : au mieux, sans jamais faire échouer la passe. */
async function note(admin: ClientAdmin, dep: Dependances, statut: string, dus: number, envoyes: number, echecs: number) {
  try {
    await admin.rpc('note_la_passe', { p_statut: statut, p_dus: dus, p_envoyes: envoyes, p_echecs: echecs })
  } catch { dep.journal('rappels : le journal de la passe n’a pas pu être écrit') }
}

async function essai(
  req: Request, admin: ClientAdmin, dep: Dependances, base: string, lien: () => Transport, expediteur: () => string,
): Promise<Response> {
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!jwt) return reply('Non authentifié', 401)
  const { data: u } = await admin.auth.getUser(jwt)
  const moi = u?.user
  if (!moi?.email) return reply('Non authentifié', 401)

  if (Number(req.headers.get('content-length') ?? 0) > CORPS_MAX) return reply('Corps trop gros', 413)
  const corps = await req.json().catch(() => null) as { essai?: unknown } | null
  if (!estUnType(corps?.essai)) return reply('Quel rappel ?', 400)
  const type = corps.essai

  const { data: profil } = await admin.from('user_profile').select('display_name').eq('id', moi.id).maybeSingle()
  if (!profil) return reply('Aucun foyer', 403)
  const prenom = prenomSur(profil.display_name, 'toi')

  /* Les mails ne sont pas configurés : on le dit avant de réserver quoi que ce soit. */
  let envoie: Transport
  try { envoie = lien() } catch { return reply('Les mails ne sont pas configurés.', 503) }

  /* UN exemple par type, par membre et par heure : la clé se RÉSERVE avant d'envoyer (l'insertion unique est le
     verrou), comme un vrai rappel. Sans cela, l'écran serait un robinet à mails depuis le Gmail de Kamil. */
  const maintenant = dep.maintenant()
  const cles = [cleDEssai(type, maintenant)]
  const reserve = await admin.rpc('reserve_rappel', { p_user: moi.id, p_type: type, p_cles: cles })
  if (reserve.error) {
    dep.journal(`rappels : essai ${type} : réservation impossible`)
    return reply('Le mail n’a pas pu partir. Réessaie dans un instant.', 502)
  }
  if (reserve.data !== true) return reply(MESSAGE_ESSAI_TROP_TOT, 429)

  /* Un exemple n'est pas un rappel : on rend la clé dès que le mail n'est SÛREMENT pas parti, pour qu'on puisse
     réessayer ; dans le doute elle reste, et l'heure suivante réessaiera. */
  const rend = async () => {
    try { await admin.rpc('libere_rappel', { p_user: moi.id, p_type: type, p_cles: cles }) } catch { /* l'heure suivante */ }
  }
  let mail
  try {
    mail = construis(type, exemple(type, maintenant, prenom, base), { base, maintenant, prenom, exemple: true })
  } catch {
    dep.journal(`rappels : essai ${type} : le gabarit a échoué`)
    await rend()
    return reply('Le mail n’a pas pu partir. Réessaie dans un instant.', 502)
  }
  try {
    /* Le destinataire est l'adresse du jeton, jamais une adresse reçue dans le corps. */
    await avecDelai(envoie.envoie(optionsDuMail({ ...mail, a: moi.email }, expediteur(), base)), DELAI_ESSAI_MS)
  } catch (e) {
    dep.journal(`rappels : essai ${type} : échec (${e instanceof Error ? e.name : 'erreur'})`)
    if (avantLesDonnees(e)) await rend()
    return reply('Le mail n’a pas pu partir. Réessaie dans un instant.', 502)
  }
  return reply({ ok: true })
}
