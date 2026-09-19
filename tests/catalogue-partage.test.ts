/**
 * Le catalogue partagé, et ce qu'un foyer a le droit d'en faire.
 *
 * La migration 0033 a ouvert l'écriture sur la classe B pour qu'un foyer puisse
 * garder une recette collée. Deux trous s'en sont suivis, tous deux prouvés
 * avant correctif, et tous deux de la même nature : une porte ouverte pour un
 * usage légitime, empruntée pour autre chose.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, makeActor, type Actor } from './helpers/db'

let alice: Actor
let bob: Actor
let duCatalogue: string

beforeAll(async () => {
  alice = await makeActor('cat-alice')
  bob = await makeActor('cat-bob')
  const { data, error } = await admin().from('recipe').insert({
    title: 'Recette du catalogue mutualisé', origin: 'importee',
    owner_household_id: null, yield_servings: 4, plannable: true,
  }).select().single()
  expect(error, "l'amorce a échoué : le test serait vert à vide").toBeNull()
  duCatalogue = data!.id
})

describe('on ne s’approprie pas le catalogue', () => {
  it('refuse de changer le propriétaire d’une recette', async () => {
    // Le chemin de l'attaque : la policy d'UPDATE est `using (true)`, et celle
    // de DELETE ne regarde que le propriétaire. S'attribuer la recette suffisait
    // donc à pouvoir l'effacer — pour tous les foyers.
    await bob.client.from('recipe')
      .update({ owner_household_id: bob.householdId }).eq('id', duCatalogue)

    const { data } = await admin().from('recipe')
      .select('owner_household_id').eq('id', duCatalogue).single()
    expect(data!.owner_household_id, 'une recette du catalogue a changé de main')
      .toBeNull()
  })

  it('refuse d’en changer l’origine', async () => {
    await bob.client.from('recipe').update({ origin: 'manuelle' }).eq('id', duCatalogue)
    const { data } = await admin().from('recipe')
      .select('origin').eq('id', duCatalogue).single()
    expect(data!.origin).toBe('importee')
  })

  it('refuse de supprimer une recette du catalogue', async () => {
    const { data } = await bob.client.from('recipe')
      .delete().eq('id', duCatalogue).select()
    expect(data ?? [], 'une recette du catalogue a été supprimée').toHaveLength(0)

    const { data: encore } = await admin().from('recipe').select('id').eq('id', duCatalogue)
    expect(encore ?? []).toHaveLength(1)
  })

  it('laisse quand même chacun supprimer LA SIENNE', async () => {
    // Le correctif ne doit pas casser ce que 0033 est venu permettre.
    const { data: sienne } = await alice.client.from('recipe').insert({
      title: 'Collée par Alice', origin: 'manuelle',
      owner_household_id: alice.householdId, yield_servings: 2,
    }).select().single()
    expect(sienne, 'Alice ne peut plus garder sa recette').not.toBeNull()

    const { data } = await alice.client.from('recipe')
      .delete().eq('id', sienne!.id).select()
    expect(data ?? [], 'Alice ne peut plus supprimer la sienne').toHaveLength(1)
  })
})

describe('une recette privée reste privée', () => {
  let secrete: string

  it('ne se lit pas depuis un autre foyer', async () => {
    const { data } = await alice.client.from('recipe').insert({
      title: 'SECRET DU FOYER A', origin: 'manuelle',
      owner_household_id: alice.householdId, visibility: 'privee',
      yield_servings: 4, plannable: true,
    }).select().single()
    secrete = data!.id

    const { data: chezBob } = await bob.client.from('recipe')
      .select('id, title').eq('id', secrete)
    expect(chezBob ?? [], 'la recette privée d’un foyer a fuité').toHaveLength(0)
  })

  it('n’apparaît pas dans le catalogue des autres', async () => {
    // C'est la requête que l'écran « Choisir » exécute : elle ne filtrait ni
    // `visibility` ni `owner_household_id`, et 0033 est précisément ce qui a
    // rempli la table de recettes privées.
    const { data } = await bob.client.from('recipe')
      .select('id, title').eq('plannable', true).limit(200)
    expect((data ?? []).map(r => r.title), 'la recette privée est au catalogue')
      .not.toContain('SECRET DU FOYER A')
  })

  it('cache aussi ses ingrédients, ses étapes et ses macros', async () => {
    await admin().from('recipe_ingredient')
      .insert({ recipe_id: secrete, ordinal: 1, raw_text: 'ingrédient secret' })
    await admin().from('recipe_step')
      .insert({ recipe_id: secrete, ordinal: 1, text: 'étape secrète' })
    await admin().from('recipe_nutrition').insert({
      recipe_id: secrete, grams: 300, kcal: 500, protein_g: 20,
      fiber_g: 5, carb_g: 40, fat_g: 15, coverage: 1,
    })

    for (const t of ['recipe_ingredient', 'recipe_step', 'recipe_nutrition'] as const) {
      const { data } = await bob.client.from(t).select('recipe_id').eq('recipe_id', secrete)
      expect(data ?? [], `${t} d’une recette privée a fuité`).toHaveLength(0)
    }
  })

  it('reste visible pour son propre foyer', async () => {
    const { data } = await alice.client.from('recipe').select('title').eq('id', secrete)
    expect(data ?? [], 'Alice ne voit plus sa propre recette').toHaveLength(1)
  })

  it('devient visible si on la PARTAGE', async () => {
    await alice.client.from('recipe').update({ visibility: 'partagee' }).eq('id', secrete)
    const { data } = await bob.client.from('recipe').select('title').eq('id', secrete)
    expect(data ?? [], 'le partage explicite ne marche pas').toHaveLength(1)
  })
})

describe('les arcs de dépendance', () => {
  it('s’écrivent sous SA recette', async () => {
    // 0033 avait ouvert quatre tables et oublié celle-ci : l'import écrivait
    // son graphe et recevait un 42501, avalé en silence.
    const { data: r } = await alice.client.from('recipe').insert({
      title: 'Avec un graphe', origin: 'manuelle',
      owner_household_id: alice.householdId, yield_servings: 2,
    }).select().single()
    const { data: etapes } = await alice.client.from('recipe_step').insert([
      { recipe_id: r!.id, ordinal: 1, text: 'un' },
      { recipe_id: r!.id, ordinal: 2, text: 'deux' },
    ]).select()

    const { error } = await alice.client.from('recipe_step_dependency')
      .insert({ before_id: etapes![0].id, after_id: etapes![1].id })
    expect(error, `refusé : ${error?.message}`).toBeNull()
  })

  it('ne s’écrivent pas sous celle d’un autre', async () => {
    const { data: etapes } = await admin().from('recipe_step').insert([
      { recipe_id: duCatalogue, ordinal: 1, text: 'a' },
      { recipe_id: duCatalogue, ordinal: 2, text: 'b' },
    ]).select()
    const { error } = await bob.client.from('recipe_step_dependency')
      .insert({ before_id: etapes![0].id, after_id: etapes![1].id })
    expect(error, 'un arc a été écrit sous la recette d’un autre').not.toBeNull()
  })
})
