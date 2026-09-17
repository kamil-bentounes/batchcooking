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

  const { data: userRes, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userRes.user) return reply('Non authentifié', 401)
  const user = userRes.user

  const { token } = await req.json().catch(() => ({ token: null }))
  if (!token) return reply('Token manquant', 400)

  const { data: inv } = await admin.from('invitation').select('*').eq('token', token).maybeSingle()
  if (!inv) return reply('Invitation inconnue', 404)
  if (inv.accepted_at) return reply('Invitation déjà utilisée', 409)
  if (new Date(inv.expires_at) < new Date()) return reply('Invitation expirée', 410)

  const { data: existing } = await admin
    .from('user_profile').select('id').eq('id', user.id).maybeSingle()
  if (existing) return reply('Déjà rattaché à un foyer', 409)

  const { error: pe } = await admin.from('user_profile').insert({
    id: user.id,
    household_id: inv.household_id,
    display_name: (user.email ?? 'invité').split('@')[0],
  })
  if (pe) return reply(pe.message, 500)

  await admin.from('invitation')
    .update({ accepted_at: new Date().toISOString() }).eq('id', inv.id)

  return reply({ household_id: inv.household_id })
})
