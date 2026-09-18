/**
 * SONDE JETABLE — à effacer. Sert seulement à prouver des défauts trouvés en revue.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, makeActor, type Actor } from './helpers/db'
import { estimation } from '../src/lib/prix.ts'

let alice: Actor
let bob: Actor

beforeAll(async () => {
  alice = await makeActor('probe-alice')
  bob = await makeActor('probe-bob')
})

describe('A · une case de repas peut consommer la barquette d’un AUTRE foyer', () => {
  it('tg_meal_slot_consomme ne vérifie pas le foyer de la portion', async () => {
    const { data: part } = await admin().from('portion').insert({
      household_id: bob.householdId, label: 'Chili de Bob', grams: 350,
      kcal: 600, protein_g: 40, fiber_g: 8, carb_g: 50, fat_g: 20,
    }).select().single()
    expect(part!.state).toBe('au_frais')

    const { error } = await alice.client.from('meal_slot').insert({
      household_id: alice.householdId,
      user_profile_id: alice.userId,
      day: '2026-09-18', meal: 'diner',
      portion_id: part!.id,
      state: 'mange', eaten_at: new Date().toISOString(),
    })
    expect(error, 'l’insertion a été refusée').toBeNull()

    const { data: apres } = await admin().from('portion')
      .select('state').eq('id', part!.id).single()
    expect(apres!.state, 'la barquette de Bob a été mangée par Alice').toBe('au_frais')

    const { data: journal } = await admin().from('portion_event')
      .select('kind, household_id, by_user_id').eq('portion_id', part!.id)
    console.log('journal de la portion de Bob :', JSON.stringify(journal))
  })
})

describe('B · cocher un article peut réécrire l’ordre des rayons d’un AUTRE foyer', () => {
  it('tg_shopping_check écrit dans aisle_order du foyer propriétaire du magasin', async () => {
    const { data: magasinDeBob } = await admin().from('store')
      .insert({ household_id: bob.householdId, name: `Lidl de Bob ${Date.now()}` })
      .select().single()

    // Bob a appris que « Frais » est son rayon n° 1.
    await admin().from('aisle_order').insert({
      household_id: bob.householdId, store_id: magasinDeBob!.id,
      aisle: 'Frais', position: 1,
    })

    const { error } = await alice.client.from('shopping_item').insert({
      household_id: alice.householdId,
      store_id: magasinDeBob!.id,
      label: 'sabotage', aisle: 'Frais',
      checked_at: new Date().toISOString(),
    })
    expect(error, 'l’insertion a été refusée').toBeNull()

    const { data: apres } = await admin().from('aisle_order')
      .select('household_id, position').eq('store_id', magasinDeBob!.id).eq('aisle', 'Frais')
    console.log('aisle_order de Bob après le geste d’Alice :', JSON.stringify(apres))
    expect(Number(apres![0].position), 'la position apprise de Bob a bougé').toBe(1)
  })
})

describe('C · la moyenne de prix mélange des unités différentes', () => {
  it('un même libellé lu une fois en kg, une fois sans quantité', async () => {
    const { data: magasin } = await admin().from('store')
      .insert({ household_id: alice.householdId, name: `Carrefour ${Date.now()}` })
      .select().single()
    const { data: ticket1 } = await admin().from('receipt').insert({
      household_id: alice.householdId, store_id: magasin!.id, bought_at: '2026-09-01',
    }).select().single()
    const { data: ticket2 } = await admin().from('receipt').insert({
      household_id: alice.householdId, store_id: magasin!.id, bought_at: '2026-09-08',
    }).select().single()

    // Semaine 1 : la caisse imprime le poids pesé. 3,75 € les 2,5 kg = 1,50 €/kg.
    await admin().from('receipt_line').insert({
      receipt_id: ticket1!.id, household_id: alice.householdId,
      label: 'PDT CHARLOTTE', quantity: 2.5, unit: 'kg', price_eur: 3.75,
    })
    const { data: apres1 } = await admin().from('household_price')
      .select('unit, avg_price_eur, observations')
      .eq('household_id', alice.householdId).ilike('label', 'PDT CHARLOTTE').single()
    console.log('après le 1er ticket :', JSON.stringify(apres1))

    // Semaine 2 : même sac, même prix — mais le modèle n'a pas lu la quantité.
    await admin().from('receipt_line').insert({
      receipt_id: ticket2!.id, household_id: alice.householdId,
      label: 'PDT CHARLOTTE', quantity: null, unit: null, price_eur: 3.75,
    })
    const { data: apres2 } = await admin().from('household_price')
      .select('unit, avg_price_eur, last_price_eur, observations')
      .eq('household_id', alice.householdId).ilike('label', 'PDT CHARLOTTE').single()
    console.log('après le 2e ticket :', JSON.stringify(apres2))

    expect(Number(apres2!.avg_price_eur), 'la moyenne mélange €/kg et €/sac')
      .toBeCloseTo(1.5, 2)
  })
})

describe('D · estimation() dépend de l’ordre des lignes rendues par la base', () => {
  it('deux prix appris à score égal : le gagnant dépend de l’ordre', () => {
    const entier = {
      label: 'LAIT ENTIER 1L', food_id: null, store_id: null, unit: 'u',
      avg_price_eur: 1.29, last_price_eur: 1.29, observations: 3,
    }
    const demi = {
      label: 'LAIT DEMI ECREME 1L', food_id: null, store_id: null, unit: 'u',
      avg_price_eur: 0.89, last_price_eur: 0.89, observations: 3,
    }
    const article = { label: 'lait', food_id: null, quantity: null, unit: null }
    const a = estimation(article, [entier, demi], null)
    const b = estimation(article, [demi, entier], null)
    console.log('ordre 1 :', JSON.stringify(a), ' ordre 2 :', JSON.stringify(b))
    expect(a!.euros, 'le prix estimé dépend de l’ordre des lignes').toBe(b!.euros)
  })
})
