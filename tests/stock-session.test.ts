/**
 * Ce que la session prend dans le stock (migration 0120).
 *
 * Le 25/10/2026, 1 500 g de poireaux et 20 tortillas avaient servi aux recettes, et le frigo de
 * l'appli les montrait encore. `ce_que_la_session_prend` calcule ce qui part, `retire_du_stock`
 * l'applique — une seule fois, avec les corrections de l'écran.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, makeActor, type Actor } from './helpers/db'

let alice: Actor
let bob: Actor
/** Un aliment par test : deux tests ne se disputent jamais la même ligne de stock. */
let aliments: string[] = []
let semaine = 0

beforeAll(async () => {
  alice = await makeActor('stock-session-alice')
  bob = await makeActor('stock-session-bob')
  const { data, error } = await admin().from('food').select('id').order('id').limit(40)
  expect(error).toBeNull()
  aliments = data!.map(f => f.id)
})

/** Un cycle clos (l'état n'a pas d'importance pour le calcul ; un seul cycle vivant par foyer) et ses recettes. */
async function session(a: Actor, recettes: {
  parts: number; rendement: number | null
  lignes: { food: string; qty?: number | null; unit?: string | null; grammes?: number | null }[]
}[]) {
  semaine += 1
  const jour = new Date(Date.UTC(2030, 0, 1 + 7 * semaine)).toISOString().slice(0, 10)
  const { data: cycle, error } = await admin().from('cycle')
    .insert({ household_id: a.householdId, week_of: jour, state: 'cloture' }).select().single()
  expect(error, "l'amorce a échoué : le test serait vert à vide").toBeNull()
  for (const [i, r] of recettes.entries()) {
    const { data: recette, error: e1 } = await admin().from('recipe').insert({
      title: `Recette ${semaine}.${i}`, yield_servings: r.rendement, origin: 'manuelle',
      owner_household_id: a.householdId,
    }).select().single()
    expect(e1).toBeNull()
    const { error: e2 } = await admin().from('recipe_ingredient').insert(r.lignes.map((l, k) => ({
      recipe_id: recette!.id, ordinal: k + 1, raw_text: `ligne ${k + 1}`, food_id: l.food,
      qty: l.qty ?? null, unit: l.unit ?? null, grams_reference: l.grammes ?? null,
    })))
    expect(e2).toBeNull()
    const { error: e3 } = await admin().from('cycle_recipe').insert({
      cycle_id: cycle!.id, household_id: a.householdId, recipe_id: recette!.id,
      servings: r.parts, position: i,
    })
    expect(e3).toBeNull()
  }
  return cycle!.id as string
}

async function range(a: Actor, o: {
  label: string; food?: string | null; quantite?: number | null; unite?: string | null
  lieu?: 'frigo' | 'congelateur' | 'placard'; perime?: string | null
}) {
  const lieu = o.lieu ?? 'frigo'
  const { data, error } = await admin().from('stock_item').insert({
    household_id: a.householdId, label: o.label, food_id: o.food ?? null,
    quantity: o.quantite ?? null, unit: o.unite ?? null, location: lieu,
    frozen_at: lieu === 'congelateur' ? new Date().toISOString() : null,
    expires_at: o.perime ?? null,
  }).select().single()
  expect(error, "l'amorce du stock a échoué").toBeNull()
  return data!.id as string
}

async function stock(id: string) {
  const { data, error } = await admin().from('stock_item').select('*').eq('id', id).maybeSingle()
  expect(error).toBeNull()
  return data
}

async function prend(a: Actor, cycle: string) {
  const { data, error } = await a.client.rpc('ce_que_la_session_prend', { p_cycle: cycle })
  expect(error).toBeNull()
  return data!
}

describe('le calcul', () => {
  it('le cas réel : 1 000 g de poireaux × 6 parts / 4 = 1 500 g, le stock tombe à zéro', async () => {
    const [poireau] = aliments
    const cycle = await session(alice, [{
      parts: 6, rendement: 4, lignes: [{ food: poireau, qty: 1000, unit: 'g', grammes: 1000 }],
    }])
    const ligne = await range(alice, { label: 'Poireaux', food: poireau, quantite: 1500, unite: 'g' })

    const [l] = await prend(alice, cycle)
    expect(l).toMatchObject({ stock_item_id: ligne, libelle: 'Poireaux', calculable: true })
    expect(Number(l.prise)).toBe(1500)
    expect(Number(l.reste)).toBe(0)

    const { data: n, error } = await alice.client.rpc('retire_du_stock', { p_cycle: cycle })
    expect(error).toBeNull()
    expect(n).toBe(1)
    expect(await stock(ligne), 'une ligne à zéro est supprimée').toBeNull()
  })

  it('les ml se prennent comme des grammes ; un rendement inconnu vaut 1', async () => {
    const lait = aliments[1]
    const cycle = await session(alice, [{
      parts: 2, rendement: null, lignes: [{ food: lait, qty: 250, unit: 'ml', grammes: 250 }],
    }])
    const ligne = await range(alice, { label: 'Lait', food: lait, quantite: 1000, unite: 'ml' })
    const [l] = await prend(alice, cycle)
    expect(Number(l.prise)).toBe(500)
    expect(Number(l.reste)).toBe(500)

    ;(await alice.client.rpc('retire_du_stock', { p_cycle: cycle }))
    expect(Number((await stock(ligne))!.quantity)).toBe(500)
  })

  it('à l’unité : 20 tortillas comptées en qty, pas en grammes', async () => {
    const tortilla = aliments[2]
    const cycle = await session(alice, [{
      // 10 tortillas pour 2 parts, cuisinées pour 4 : 20. grams_reference est ignoré ici.
      parts: 4, rendement: 2, lignes: [{ food: tortilla, qty: 10, unit: null, grammes: 700 }],
    }])
    const ligne = await range(alice, { label: 'Tortillas', food: tortilla, quantite: 20 })
    const [l] = await prend(alice, cycle)
    expect(l.calculable).toBe(true)
    expect(Number(l.prise)).toBe(20)
    await alice.client.rpc('retire_du_stock', { p_cycle: cycle })
    expect(await stock(ligne)).toBeNull()
  })

  it('additionne les recettes du cycle qui partagent un aliment', async () => {
    const oeuf = aliments[3]
    const cycle = await session(alice, [
      { parts: 4, rendement: 4, lignes: [{ food: oeuf, qty: 6, unit: null }] },
      { parts: 2, rendement: 1, lignes: [{ food: oeuf, qty: 1, unit: 'u' }] },
    ])
    await range(alice, { label: 'Œufs', food: oeuf, quantite: 12 })
    const [l] = await prend(alice, cycle)
    expect(Number(l.prise)).toBe(8)
    expect(Number(l.reste)).toBe(4)
  })

  it('ne prend pas plus que le stock', async () => {
    const [, , , , beurre] = aliments
    const cycle = await session(alice, [{
      parts: 4, rendement: 4, lignes: [{ food: beurre, qty: 500, unit: 'g', grammes: 500 }],
    }])
    await range(alice, { label: 'Beurre', food: beurre, quantite: 250, unite: 'g' })
    const [l] = await prend(alice, cycle)
    expect(Number(l.prise)).toBe(250)
    expect(Number(l.reste)).toBe(0)
  })

  it('deux lignes du même aliment se partagent le besoin, la plus pressée d’abord', async () => {
    const farine = aliments[5]
    const cycle = await session(alice, [{
      parts: 4, rendement: 4, lignes: [{ food: farine, qty: 300, unit: 'g', grammes: 300 }],
    }])
    const tard = await range(alice, { label: 'Farine (placard)', food: farine, quantite: 200,
      unite: 'g', lieu: 'placard', perime: '2031-01-01T00:00:00Z' })
    const tot = await range(alice, { label: 'Farine (ouverte)', food: farine, quantite: 200,
      unite: 'g', lieu: 'placard', perime: '2030-06-01T00:00:00Z' })

    const lignes = await prend(alice, cycle)
    const parId = new Map(lignes.map(l => [l.stock_item_id, l]))
    expect(Number(parId.get(tot)!.prise), 'la plus pressée part en entier').toBe(200)
    expect(Number(parId.get(tard)!.prise), 'la seconde ne prend que le reste du besoin').toBe(100)

    await alice.client.rpc('retire_du_stock', { p_cycle: cycle })
    expect(await stock(tot)).toBeNull()
    expect(Number((await stock(tard))!.quantity)).toBe(100)
  })
})

describe('ce qu’elle ne touche pas', () => {
  it('une ligne sans quantité, un pot, ou un autre aliment : intacts', async () => {
    const [ail, pot, autre, sel] = [aliments[6], aliments[7], aliments[8], aliments[9]]
    const cycle = await session(alice, [{
      parts: 4, rendement: 4, lignes: [
        { food: ail, qty: 2, unit: null }, { food: pot, qty: 1, unit: 'pot', grammes: 125 },
        { food: sel, qty: null, unit: null },
      ],
    }])
    const sansQuantite = await range(alice, { label: 'Ail', food: ail, quantite: null })
    const enPot = await range(alice, { label: 'Yaourt', food: pot, quantite: 4, unite: 'pot' })
    const horsRecette = await range(alice, { label: 'Confiture', food: autre, quantite: 1, unite: 'u' })
    const sansAliment = await range(alice, { label: 'Yaourt dessert', food: null, quantite: 6, unite: 'u' })
    const sansLigne = await range(alice, { label: 'Sel', food: sel, quantite: 500, unite: 'g' })

    const lignes = await prend(alice, cycle)
    const ids = lignes.map(l => l.stock_item_id)
    expect(ids).toContain(sansQuantite)
    expect(lignes.find(l => l.stock_item_id === sansQuantite)!.calculable).toBe(false)
    expect(lignes.find(l => l.stock_item_id === enPot)!.calculable, 'un pot n’est pas calculable').toBe(false)
    expect(lignes.find(l => l.stock_item_id === sansLigne)!.calculable,
      'sans poids de recette, rien à calculer').toBe(false)
    expect(ids, 'ni hors recette').not.toContain(horsRecette)
    expect(ids, 'ni sans aliment').not.toContain(sansAliment)

    const { data: n } = await alice.client.rpc('retire_du_stock', { p_cycle: cycle })
    expect(n).toBe(0)
    for (const id of [sansQuantite, enPot, horsRecette, sansAliment, sansLigne]) {
      expect(await stock(id), 'la ligne a disparu').not.toBeNull()
    }
    expect(Number((await stock(enPot))!.quantity)).toBe(4)
    expect(Number((await stock(sansLigne))!.quantity)).toBe(500)
  })
})

describe('les corrections de l’écran', () => {
  async function cas() {
    const aliment = aliments[10 + semaine]
    const cycle = await session(alice, [{
      parts: 4, rendement: 4, lignes: [{ food: aliment, qty: 1000, unit: 'g', grammes: 1000 }],
    }])
    const ligne = await range(alice, { label: 'Carottes', food: aliment, quantite: 1500, unite: 'g' })
    return { cycle, ligne }
  }

  it('« il en reste 800 » l’emporte sur le calcul (500)', async () => {
    const { cycle, ligne } = await cas()
    const { data: n, error } = await alice.client.rpc('retire_du_stock',
      { p_cycle: cycle, p_restes: { [ligne]: 800 } })
    expect(error).toBeNull()
    expect(n).toBe(1)
    expect(Number((await stock(ligne))!.quantity)).toBe(800)
  })

  it('« il en reste 0 » supprime la ligne', async () => {
    const { cycle, ligne } = await cas()
    await alice.client.rpc('retire_du_stock', { p_cycle: cycle, p_restes: { [ligne]: 0 } })
    expect(await stock(ligne)).toBeNull()
  })

  it('un reste plus grand que le stock laisse la ligne telle quelle ; un négatif la supprime', async () => {
    const a = await cas()
    const { data: n } = await alice.client.rpc('retire_du_stock',
      { p_cycle: a.cycle, p_restes: { [a.ligne]: 99_999 } })
    expect(n, 'rien n’a changé').toBe(0)
    expect(Number((await stock(a.ligne))!.quantity)).toBe(1500)

    const b = await cas()
    await alice.client.rpc('retire_du_stock', { p_cycle: b.cycle, p_restes: { [b.ligne]: -5 } })
    expect(await stock(b.ligne)).toBeNull()
  })

  it('une correction sur une ligne d’un autre foyer, ou inconnue, est ignorée', async () => {
    const { cycle, ligne } = await cas()
    const chezBob = await range(bob, { label: 'Carottes de Bob', quantite: 10, unite: 'g' })
    const { error } = await alice.client.rpc('retire_du_stock', {
      p_cycle: cycle,
      p_restes: { [chezBob]: 0, '00000000-0000-0000-0000-000000000000': 3 },
    })
    expect(error).toBeNull()
    expect(await stock(chezBob), 'le stock de Bob n’a pas bougé').not.toBeNull()
    expect(Number((await stock(ligne))!.quantity)).toBe(500)
  })

  it('refuse un reste qui n’est pas un nombre, sans rien retirer', async () => {
    const { cycle, ligne } = await cas()
    const { error } = await alice.client.rpc('retire_du_stock',
      { p_cycle: cycle, p_restes: { [ligne]: 'beaucoup' } })
    expect(error?.message).toMatch(/pas un nombre/)
    expect(Number((await stock(ligne))!.quantity)).toBe(1500)
    const { data } = await admin().from('cycle').select('stock_retire_le').eq('id', cycle).single()
    expect(data!.stock_retire_le, 'une écriture refusée ne marque pas la session').toBeNull()
  })
})

describe('l’idempotence', () => {
  it('ne retire jamais deux fois : le second appel ne fait rien', async () => {
    const aliment = aliments[30]
    const cycle = await session(alice, [{
      parts: 4, rendement: 4, lignes: [{ food: aliment, qty: 600, unit: 'g', grammes: 600 }],
    }])
    const ligne = await range(alice, { label: 'Riz', food: aliment, quantite: 1000, unite: 'g' })

    const premier = await alice.client.rpc('retire_du_stock', { p_cycle: cycle })
    expect(premier.data).toBe(1)
    expect(Number((await stock(ligne))!.quantity)).toBe(400)
    const { data: c } = await admin().from('cycle').select('stock_retire_le').eq('id', cycle).single()
    expect(c!.stock_retire_le).not.toBeNull()

    // Du riz racheté entre-temps : la session ne le reprend pas.
    await admin().from('stock_item').update({ quantity: 1400 }).eq('id', ligne)
    const second = await alice.client.rpc('retire_du_stock', { p_cycle: cycle })
    expect(second.error).toBeNull()
    expect(second.data).toBe(0)
    expect(Number((await stock(ligne))!.quantity)).toBe(1400)
  })
})

describe('l’isolation entre foyers', () => {
  it('un autre foyer ne lit rien et ne retire rien', async () => {
    const aliment = aliments[31]
    const cycle = await session(alice, [{
      parts: 4, rendement: 4, lignes: [{ food: aliment, qty: 100, unit: 'g', grammes: 100 }],
    }])
    const ligne = await range(alice, { label: 'Sucre', food: aliment, quantite: 500, unite: 'g' })

    expect(await prend(bob, cycle), 'Bob lit le stock d’Alice').toEqual([])
    const { error } = await bob.client.rpc('retire_du_stock', { p_cycle: cycle })
    expect(error?.message).toMatch(/introuvable/i)
    expect(Number((await stock(ligne))!.quantity)).toBe(500)
    const { data } = await admin().from('cycle').select('stock_retire_le').eq('id', cycle).single()
    expect(data!.stock_retire_le).toBeNull()
  })

  it('un cycle qui n’existe pas : rien à lire, une erreur claire à l’écriture', async () => {
    const inconnu = '00000000-0000-0000-0000-000000000000'
    expect(await prend(alice, inconnu)).toEqual([])
    const { error } = await alice.client.rpc('retire_du_stock', { p_cycle: inconnu })
    expect(error?.message).toMatch(/introuvable/i)
  })

  it('l’anonyme n’a aucune des deux fonctions', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const anonyme = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } })
    const a = await anonyme.rpc('ce_que_la_session_prend',
      { p_cycle: '00000000-0000-0000-0000-000000000000' })
    const b = await anonyme.rpc('retire_du_stock', { p_cycle: '00000000-0000-0000-0000-000000000000' })
    expect(a.error, 'lecture ouverte à l’anonyme').not.toBeNull()
    expect(b.error, 'écriture ouverte à l’anonyme').not.toBeNull()
  })
})
