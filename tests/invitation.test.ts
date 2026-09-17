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
