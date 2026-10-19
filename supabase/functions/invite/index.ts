import { createClient } from 'jsr:@supabase/supabase-js@2'
import { preflight, reply } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre
  if (req.method !== 'POST') return reply('Method not allowed', 405)

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!jwt) return reply('Non authentifié', 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: userRes } = await admin.auth.getUser(jwt)
  if (!userRes?.user) return reply('Non authentifié', 401)

  const { data: profile } = await admin
    .from('user_profile').select('household_id').eq('id', userRes.user.id).maybeSingle()
  if (!profile) return reply('Aucun foyer', 403)

  const { email: brut } = await req.json().catch(() => ({ email: null }))
  if (typeof brut !== 'string' || !brut.trim()) return reply('Email manquant', 400)

  /*
   * ⚠️ `ilike` interprète `%` et `_` : l'entrée brute était donc un MOTIF.
   *    `invite({ email: 'victime-%@test.local' })` rendait le jeton d'une
   *    invitation qu'on n'avait pas créée — et l'envoyait à l'adresse à jokers
   *    si Resend est configuré. On valide la forme, puis on compare à l'égalité
   *    sur la casse basse : une adresse n'est pas un motif.
   */
  const email = brut.trim().toLowerCase()
  if (!/^[^\s@%_]+@[^\s@%_]+\.[^\s@%_]+$/.test(email)) {
    return reply('Adresse e-mail invalide', 400)
  }

  // Une invitation déjà en attente pour cette adresse n'est pas une erreur :
  // on rend le lien existant. L'index unique invitation_pending_unique garantit
  // qu'il n'y en a qu'une, et l'utilisateur veut le lien, pas un message.
  const { data: dejaLa } = await admin.from('invitation')
    .select('*').eq('household_id', profile.household_id)
    .eq('email', email).is('accepted_at', null).maybeSingle()

  let inv = dejaLa
  if (inv && new Date(inv.expires_at) < new Date()) {
    /* ⚠️ TRENTE jours, et un jeton NEUF.
       Sept jours passaient sous le rabot de `tg_invitation_borne` tant que la
       durée par défaut valait sept jours ; depuis qu'elle vaut trente, toute
       prolongation était ramenée à une date PASSÉE, en silence, et l'index
       partiel interdisait d'en créer une seconde — une invitation expirée ne
       pouvait plus jamais être relancée.

       Et le jeton change : l'ancien lien est parti par mail il y a un mois, il
       n'a pas à revivre parce qu'on en renvoie un. */
    const { data: prolongee } = await admin.from('invitation')
      .update({
        expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
        token: crypto.randomUUID(),
      })
      .eq('id', inv.id).select().single()
    inv = prolongee
  }

  if (!inv) {
    const { data: creee, error } = await admin.from('invitation')
      .insert({ household_id: profile.household_id, email, created_by: userRes.user.id })
      .select().single()
    if (error) return reply(error.message, 409)
    inv = creee
  }

  const base = Deno.env.get('APP_BASE_URL') ?? ''
  const link = `${base}/invite/${inv.token}`

  /*
   * ⚠️ PLUS DE MAIL, et plus de compte créé à l'envoi (décision du 19/10/2026).
   *
   *    `inviteUserByEmail` créait le compte de l'invitée et lui envoyait un lien
   *    de connexion Supabase : mort au bout d'UNE heure, consommé par les
   *    antivirus de messagerie, parti par un serveur limité à deux mails par
   *    heure et souvent rangé en indésirables. Cinq invitées n'ont jamais
   *    dépassé la création de compte ; le 30 septembre, l'une a ouvert un mail
   *    vieux de huit jours.
   *
   *    Le lien `/invite/<jeton>` suffit désormais : trente jours, usage unique.
   *    L'invitée y choisit son mot de passe et `accept-invite` crée son compte.
   *    L'hôte le lui transmet lui-même — un message arrive, lui.
   *
   *    `envoye` et `dejaUnCompte` restent, à faux, pour l'ancien paquet que sert
   *    le service worker au premier chargement : il affiche alors « Invitation
   *    créée… Envoie-lui le lien ci-dessous », ce qui est exactement vrai.
   */
  return reply({ token: inv.token, link, envoye: false, dejaUnCompte: false })
})
