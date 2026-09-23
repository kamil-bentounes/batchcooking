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

  /*
   * ⚠️ ON CONSOMME LE JETON D'ABORD, et la condition `accepted_at is null` fait
   *    la course pour nous.
   *
   *    L'ordre inverse — rattacher puis marquer — laissait deux POST simultanés
   *    avec le même jeton réussir tous les deux : mesuré, le foyer passait de
   *    un à trois membres. « Usage unique » n'était pas une propriété du
   *    système, seulement une intention.
   *
   *    `update … select` ne rend une ligne que si la condition tenait AU MOMENT
   *    de l'écriture : c'est le verrou, et il est atomique.
   */
  const { data: consommee, error: ce } = await admin.from('invitation')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', inv.id).is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .select().maybeSingle()
  if (ce) return reply(ce.message, 500)
  if (!consommee) return reply('Invitation déjà utilisée', 409)

  /* ⚠️ PAS de prénom fabriqué depuis l'adresse.
     `thauba-1790147184836@…` donnait `display_name = 'thauba-1790147184836'`,
     et l'écran d'arrivée PRÉ-REMPLISSAIT le champ « Ton prénom » avec ça : on
     valide sans regarder, et c'est ce que l'autre lit sur chaque ligne de
     charge pendant des mois. Un champ vide se remplit ; un champ faux se
     garde. */
  /* ⚠️ `entre_le` au PREMIER DU MOIS PROCHAIN, pas aujourd'hui.
     La colonne vaut `current_date` par défaut, et `tg_membre_rejoint_les_communes`
     l'inscrit aussitôt à toutes les charges communes puis refige chaque mois à
     partir de là — le mois EN COURS compris. Mesuré : au seul clic
     « Rejoindre le foyer », avant même d'avoir posé un mot de passe, elle se
     voyait 854 € pour un mois où elle n'habite pas encore là, et le virement de
     l'hôte se divisait en silence.

     On invite quelqu'un AVANT qu'il arrive : le premier du mois prochain est
     le défaut conservateur — il ne touche à aucun mois déjà annoncé. Et
     l'écran de profil, où elle atterrit immédiatement, lui demande la vraie
     date avec l'avertissement qui va avec. */
  const arrivee = new Date()
  arrivee.setUTCDate(1)
  arrivee.setUTCMonth(arrivee.getUTCMonth() + 1)

  const { error: pe } = await admin.from('user_profile').insert({
    id: user.id,
    household_id: inv.household_id,
    display_name: '',
    entre_le: arrivee.toISOString().slice(0, 10),
  })
  if (pe) {
    // Le rattachement a échoué : on rend le jeton, sinon l'invitation est
    // perdue pour de bon et personne ne peut plus rejoindre le foyer.
    await admin.from('invitation').update({ accepted_at: null }).eq('id', inv.id)
    return reply(pe.message, 500)
  }

  return reply({ household_id: inv.household_id })
})
