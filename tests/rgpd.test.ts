import { describe, it, expect, beforeAll } from 'vitest'
import { makeActor, admin, type Actor } from './helpers/db'

let alice: Actor
beforeAll(async () => {
  alice = await makeActor('alice-rgpd')
  const { error } = await alice.client.from('nutrition_target').insert({
    user_profile_id: alice.userId,
    kcal: 2000, protein_g: 150, fiber_g: 30, carb_g: 200, fat_g: 60,
  })
  expect(error).toBeNull()
})

describe('RGPD', () => {
  it("exporte les données du foyer, et rien d'autre", async () => {
    const { data, error } = await alice.client.rpc('export_my_data')
    expect(error).toBeNull()
    expect(data.household.id).toBe(alice.householdId)
    expect(data.nutrition_targets.length).toBeGreaterThanOrEqual(1)
    expect(data.profiles.every((p: any) => p.household_id === alice.householdId)).toBe(true)
  })

  it('supprime le compte et ses données en cascade', async () => {
    const victim = await makeActor('victime')
    await victim.client.from('nutrition_target').insert({
      user_profile_id: victim.userId,
      kcal: 1, protein_g: 1, fiber_g: 1, carb_g: 1, fat_g: 1,
    })
    const { error } = await victim.client.rpc('delete_my_account')
    expect(error).toBeNull()

    const a = admin()
    const { data: prof } = await a.from('user_profile').select('id').eq('id', victim.userId)
    expect(prof, 'le profil doit avoir disparu').toHaveLength(0)
    const { data: tg } = await a.from('nutrition_target')
      .select('id').eq('user_profile_id', victim.userId)
    expect(tg, 'les cibles doivent avoir disparu en cascade').toHaveLength(0)
    const { data: u } = await a.auth.admin.getUserById(victim.userId)
    expect(u.user, "le compte d'authentification doit avoir disparu").toBeNull()
  })
})
