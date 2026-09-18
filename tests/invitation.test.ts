import { describe, it, expect, beforeAll } from 'vitest'
import { makeActor, makeOrphan, admin, accessToken, type Actor } from './helpers/db'

let alice: Actor
beforeAll(async () => { alice = await makeActor('alice-invit') })

const fn = (name: string) => `${process.env.VITE_SUPABASE_URL}/functions/v1/${name}`

describe('invitation', () => {
  it('un foyer crée une invitation pour lui-même', async () => {
    const { data, error } = await alice.client.from('invitation')
      .insert({ household_id: alice.householdId, email: 'copine@test.local' })
      .select().single()
    expect(error).toBeNull()
    expect(data!.token).toBeTruthy()
    expect(new Date(data!.expires_at).getTime()).toBeGreaterThan(Date.now())
  })

  it('un foyer ne peut pas inviter chez un autre foyer', async () => {
    const other = await makeActor('other-invit')
    const { error } = await alice.client.from('invitation')
      .insert({ household_id: other.householdId, email: 'pirate@test.local' })
    expect(error, 'invitation croisée acceptée').not.toBeNull()
  })

  it('répond au préflight CORS', async () => {
    const res = await fetch(fn('accept-invite'), {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type',
      },
    })
    expect(res.status, 'sans préflight, le front ne peut rien appeler').toBeLessThan(300)
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy()
  })

  it("accept-invite rattache l'invité au foyer et consomme le token", async () => {
    const a = admin()
    const { data: inv } = await a.from('invitation')
      .insert({ household_id: alice.householdId, email: `nouveau-${Date.now()}@test.local` })
      .select().single()

    const { client: guest } = await makeOrphan()
    const res = await fetch(fn('accept-invite'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await accessToken(guest)}`,
      },
      body: JSON.stringify({ token: inv!.token }),
    })
    expect(res.status, await res.clone().text()).toBe(200)

    const { data: hh } = await guest.rpc('current_household')
    expect(hh).toBe(alice.householdId)

    const { data: after } = await a.from('invitation')
      .select('accepted_at').eq('id', inv!.id).single()
    expect(after!.accepted_at, 'le token doit être consommé').not.toBeNull()
  })

  it('refuse un token expiré', async () => {
    const { data: inv } = await admin().from('invitation').insert({
      household_id: alice.householdId, email: `tard-${Date.now()}@test.local`,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    }).select().single()

    const { client: guest } = await makeOrphan()
    const res = await fetch(fn('accept-invite'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await accessToken(guest)}`,
      },
      body: JSON.stringify({ token: inv!.token }),
    })
    expect(res.status).toBe(410)
  })
})

describe('l’invitation est vraiment à usage unique', () => {
  /*
   * Trois défauts trouvés en relisant le lot 0a, tous prouvés avant correctif.
   * « Usage unique » et « valable 7 jours » étaient des intentions, pas des
   * propriétés du système.
   */
  it('ne se consomme qu’UNE fois, même sur deux appels simultanés', async () => {
    const hote = await makeActor('inv-hote')
    const { data: inv } = await hote.client.from('invitation')
      .insert({ household_id: hote.householdId, email: `double-${Date.now()}@test.local` })
      .select().single()

    const { client: a } = await makeOrphan()
    const { client: b } = await makeOrphan()
    const appelle = async (c: typeof a) => {
      const { data: s } = await c.auth.getSession()
      const r = await fetch(fn('accept-invite'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${s!.session!.access_token}`,
        },
        body: JSON.stringify({ token: inv!.token }),
      })
      return r.status
    }

    const [x, y] = await Promise.all([appelle(a), appelle(b)])
    expect([x, y].filter(s => s === 200).length,
      'deux personnes ont utilisé le même jeton').toBe(1)

    const { data: membres } = await admin().from('user_profile')
      .select('id').eq('household_id', hote.householdId)
    expect(membres!.length, 'le foyer a gagné deux membres pour une invitation').toBe(2)
  })

  it('ne se ressuscite pas une fois acceptée', async () => {
    const hote = await makeActor('inv-mort')
    const { data: inv } = await admin().from('invitation').insert({
      household_id: hote.householdId, email: `mort-${Date.now()}@test.local`,
      accepted_at: new Date().toISOString(),
    }).select().single()

    await hote.client.from('invitation')
      .update({ accepted_at: null, expires_at: '2999-01-01' }).eq('id', inv!.id)

    const { data } = await admin().from('invitation')
      .select('accepted_at').eq('id', inv!.id).single()
    expect(data!.accepted_at, 'une invitation acceptée a été rouverte').not.toBeNull()
  })

  it('ne se prolonge pas en jeton perpétuel', async () => {
    const hote = await makeActor('inv-eternel')
    const { data: inv } = await hote.client.from('invitation')
      .insert({ household_id: hote.householdId, email: `long-${Date.now()}@test.local` })
      .select().single()

    await hote.client.from('invitation')
      .update({ expires_at: '2999-01-01' }).eq('id', inv!.id)

    const { data } = await admin().from('invitation')
      .select('expires_at').eq('id', inv!.id).single()
    expect(new Date(data!.expires_at).getFullYear(),
      'une invitation a été rendue perpétuelle').toBeLessThan(2100)
  })
})

describe('supprimer son compte', () => {
  it('marche aussi quand le foyer compte deux personnes', async () => {
    // `invitation.created_by` référençait `auth.users` sans clause de
    // suppression : dès qu'on avait invité quelqu'un, supprimer son compte
    // levait un 23503 et annulait TOUTE la transaction — ni compte, ni profil,
    // ni cibles. Le test du dépôt passait parce que sa victime était seule.
    const hote = await makeActor('sup-hote')
    const { data: inv } = await hote.client.from('invitation')
      .insert({ household_id: hote.householdId, email: `part-${Date.now()}@test.local` })
      .select().single()
    expect(inv, "l'amorce a échoué : le test serait vert à vide").not.toBeNull()

    const { error } = await hote.client.rpc('delete_my_account')
    expect(error, `la suppression a échoué : ${error?.message}`).toBeNull()

    const { data: prof } = await admin().from('user_profile').select('id').eq('id', hote.userId)
    expect(prof ?? [], 'le profil a survécu').toHaveLength(0)
  })
})
