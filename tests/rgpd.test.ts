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

  it("n'oublie aucune table de données de foyer", async () => {
    // Ce test existe pour une raison précise : l'export a déjà pris du retard
    // sur le schéma une fois. Il doit échouer le jour où l'on ajoute une table
    // de classe C sans l'ajouter à `export_my_data`.
    const { data: tables } = await admin().rpc('tables_de_foyer')
    const { data: exporte } = await alice.client.rpc('export_my_data')
    const cles = new Set(Object.keys(exporte))

    // Correspondance table → clé de l'export. Le pluriel est celui du JSON.
    const attendu: Record<string, string> = {
      household: 'household', user_profile: 'profiles',
      nutrition_target: 'nutrition_targets', invitation: 'invitations',
      llm_usage: 'llm_usage', cycle: 'cycles', cycle_recipe: 'cycle_recipes',
      store: 'stores', aisle_order: 'aisle_order', shopping_item: 'shopping_items',
      shopping_trip: 'shopping_trips', shopping_habit: 'shopping_habits',
      session_task: 'session_tasks', session_appliance: 'session_appliances',
      duration_observation: 'duration_observations', portion: 'portions',
      portion_event: 'portion_events', meal_slot: 'meal_slots',
      meal_extra: 'meal_extras', frequent_food: 'frequent_foods',
      stock_item: 'stock_items',
    }

    const oubliees = (tables as { table_name: string }[])
      .map(t => t.table_name)
      // Ces deux-là n'ont pas de colonne household_id propre : elles suivent
      // leur parent, déjà exporté.
      .filter(t => !['session_task_recipe', 'session_task_dependency'].includes(t))
      .filter(t => !cles.has(attendu[t] ?? t))

    expect(oubliees, 'tables de foyer absentes de l’export').toEqual([])
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
