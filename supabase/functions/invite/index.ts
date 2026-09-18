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
    // Expirée : on la prolonge au lieu d'en créer une seconde.
    const { data: prolongee } = await admin.from('invitation')
      .update({ expires_at: new Date(Date.now() + 7 * 864e5).toISOString() })
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

  const link = `${Deno.env.get('APP_BASE_URL')}/invite/${inv.token}`
  const key = Deno.env.get('RESEND_API_KEY')

  if (key) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'invitation@batchcooking.local',
        to: [email],
        subject: 'Invitation à rejoindre le foyer',
        html: `<p>Vous êtes invité·e.</p><p><a href="${link}">Rejoindre le foyer</a></p>
               <p>Ce lien expire dans 7 jours.</p>`,
      }),
    })
    // L'invitation reste valide si l'e-mail échoue : le lien est renvoyable.
    if (!r.ok) console.error('Resend a échoué :', await r.text())
  }

  return reply({ token: inv.token, link })
})
