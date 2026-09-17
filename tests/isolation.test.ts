import { describe, it, expect, beforeAll } from 'vitest'
import { makeActor, makeOrphan, admin, type Actor } from './helpers/db'

let alice: Actor, bob: Actor
beforeAll(async () => { alice = await makeActor('alice'); bob = await makeActor('bob') })

describe('classe C — données de foyer', () => {
  it('un foyer ne voit que son propre household', async () => {
    const { data } = await alice.client.from('household').select('id')
    expect(data?.map(h => h.id)).toEqual([alice.householdId])
  })

  it("un foyer ne voit jamais les cibles d'un autre", async () => {
    // ⚠️ Assertion indispensable : sans elle, si l'amorce échoue, alice voit
    // 0 ligne et le test passe SANS RIEN AVOIR TESTÉ.
    const { error: seed } = await admin().from('nutrition_target').insert({
      user_profile_id: bob.userId,
      kcal: 2400, protein_g: 180, fiber_g: 30, carb_g: 250, fat_g: 70,
    })
    expect(seed, "l'amorce du test a échoué : le test serait vert à vide").toBeNull()

    const { data } = await alice.client
      .from('nutrition_target').select('*').eq('user_profile_id', bob.userId)
    expect(data ?? [], 'fuite entre foyers').toHaveLength(0)
  })

  it('les cibles sont historisées, pas écrasées', async () => {
    for (const kcal of [2000, 2100]) {
      const { error } = await alice.client.from('nutrition_target').insert({
        user_profile_id: alice.userId,
        kcal, protein_g: 150, fiber_g: 30, carb_g: 200, fat_g: 60,
      })
      expect(error).toBeNull()
    }
    const { data } = await alice.client
      .from('nutrition_target').select('kcal').eq('user_profile_id', alice.userId)
    expect(data!.length, 'une cible qui change ne doit pas effacer le passé')
      .toBeGreaterThanOrEqual(2)
  })

  it('un foyer ne peut pas écrire une cible chez un autre', async () => {
    const { error } = await alice.client.from('nutrition_target').insert({
      user_profile_id: bob.userId,
      kcal: 1, protein_g: 1, fiber_g: 1, carb_g: 1, fat_g: 1,
    })
    expect(error, 'écriture croisée acceptée').not.toBeNull()
  })

  // ↓↓↓ Les trois tests de SUPPRESSION. Sans eux, `for all` laissait un membre
  //     effacer son foyer entier, profils et cibles compris. ↓↓↓
  it('un membre ne peut PAS supprimer son foyer', async () => {
    await alice.client.from('household').delete().eq('id', alice.householdId)
    const { data } = await admin().from('household').select('id').eq('id', alice.householdId)
    expect(data, 'un membre a effacé son foyer et tout ce qui cascade derrière').toHaveLength(1)
  })

  it('un membre ne peut PAS supprimer un profil, pas même le sien', async () => {
    await alice.client.from('user_profile').delete().eq('id', alice.userId)
    const { data } = await admin().from('user_profile').select('id').eq('id', alice.userId)
    expect(data, "supprimer son profil permettrait de s'échapper du foyer").toHaveLength(1)
  })

  it('un membre ne peut PAS supprimer le profil de son colocataire', async () => {
    const a = admin()
    const u = await a.auth.admin.createUser({
      email: `colo-${Date.now()}@test.local`, password: 'test-password-12345', email_confirm: true })
    const { data: colo } = await a.from('user_profile')
      .insert({ id: u.data.user!.id, household_id: alice.householdId, display_name: 'colo' })
      .select().single()
    await alice.client.from('user_profile').delete().eq('id', colo!.id)
    const { data } = await a.from('user_profile').select('id').eq('id', colo!.id)
    expect(data, "un membre a supprimé le profil d'un autre").toHaveLength(1)
  })

  // ↓↓↓ Portée PERSONNE : le foyer partage la lecture, pas l'écriture. ↓↓↓
  it("un membre ne peut PAS supprimer les cibles d'un autre membre", async () => {
    const a = admin()
    const u = await a.auth.admin.createUser({
      email: `colo2-${Date.now()}@test.local`, password: 'test-password-12345', email_confirm: true })
    await a.from('user_profile').insert({
      id: u.data.user!.id, household_id: alice.householdId, display_name: 'colo2' })
    const { data: cible, error: seed } = await a.from('nutrition_target').insert({
      user_profile_id: u.data.user!.id,
      kcal: 2400, protein_g: 180, fiber_g: 30, carb_g: 250, fat_g: 70,
    }).select().single()
    expect(seed, "l'amorce a échoué : le test serait vert à vide").toBeNull()

    await alice.client.from('nutrition_target').delete().eq('id', cible!.id)
    const { data } = await a.from('nutrition_target').select('id').eq('id', cible!.id)
    expect(data, "un membre a effacé l'historique d'objectifs d'un autre").toHaveLength(1)
  })

  it('un membre ne peut PAS renommer un autre membre', async () => {
    const a = admin()
    const u = await a.auth.admin.createUser({
      email: `colo3-${Date.now()}@test.local`, password: 'test-password-12345', email_confirm: true })
    await a.from('user_profile').insert({
      id: u.data.user!.id, household_id: alice.householdId, display_name: 'intact' })

    await alice.client.from('user_profile')
      .update({ display_name: 'renommé de force' }).eq('id', u.data.user!.id)
    const { data } = await a.from('user_profile')
      .select('display_name').eq('id', u.data.user!.id).single()
    expect(data!.display_name, 'un membre a renommé un autre').toBe('intact')
  })

  it('un authentifié SANS profil ne voit aucune donnée de foyer', async () => {
    const { client: orphan } = await makeOrphan()
    for (const t of ['household', 'user_profile', 'nutrition_target', 'invitation']) {
      const { data } = await orphan.from(t).select('*')
      expect(data ?? [], `${t} visible par un orphelin`).toHaveLength(0)
    }
  })
})
