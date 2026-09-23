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
   * L'invitation part par le SMTP de l'application, pas par un service tiers.
   *
   * `inviteUserByEmail` envoie le gabarit « Invite user » du tableau de bord —
   * celui qu'on a écrit, avec la cocotte et le nom — et surtout : la personne
   * ARRIVE AUTHENTIFIÉE. Il n'y a donc plus d'inscription séparée, donc plus de
   * jeton à faire survivre à un aller-retour par mail, qui était exactement le
   * trou : `AcceptInvite` exigeait une session que l'invitée n'avait pas encore,
   * et le jeton se perdait dès qu'elle partait créer son compte.
   *
   * `data.invite_par` alimente `{{ .Data.invite_par }}` dans le gabarit, et
   * `redirectTo` ramène sur le lien qui porte le jeton du foyer.
   *
   * ⚠️ `redirectTo` est IGNORÉ EN SILENCE tant que l'URL n'est pas dans la
   *    liste d'autorisation du projet. Si l'invitée atterrit sur l'accueil sans
   *    rejoindre le foyer, c'est là qu'il faut regarder.
   */
  const { data: prenom } = await admin
    .from('user_profile').select('display_name').eq('id', userRes.user.id).maybeSingle()

  const { error: envoi } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: link,
    data: { invite_par: prenom?.display_name ?? 'Quelqu’un' },
  })

  /* Une adresse qui a déjà un compte fait échouer l'appel, et c'est le seul cas
     où l'on retombe sur le lien à transmettre soi-même. Ce n'est PAS de
     l'énumération de comptes : on n'apprend rien qu'on ne sache déjà, puisque
     c'est nous qui avons saisi l'adresse et décidé de l'inviter. */
  const compteExistant = !!envoi

  return reply({ token: inv.token, link, envoye: !compteExistant,
                 dejaUnCompte: compteExistant })
})
