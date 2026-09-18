/**
 * Ce que la BASE doit tenir quand un ticket est enregistré (lot 5).
 *
 * Trois choses ne peuvent pas dépendre du client, parce que deux téléphones
 * enregistrent la même sortie et qu'un client peut être vieux d'une version :
 *
 *  · une ligne de ticket ENSEIGNE un prix, ramené au kilo ou au litre quand on
 *    sait ce qu'on a acheté — « 2,30 € » ne veut rien dire sans savoir si c'est
 *    pour 200 g ou pour un kilo ;
 *  · un prix revu se MOYENNE, pour qu'une promotion isolée n'emporte pas tout ;
 *  · le prix payé REMONTE sur l'article de la liste, parce que c'est lui que le
 *    bilan lit.
 *
 * Et par-dessus, l'isolation : les prix d'un foyer ne sont les prix de personne
 * d'autre.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, makeActor, type Actor } from './helpers/db'

let alice: Actor
let bob: Actor
let magasin: string
let cycleAlice: string

async function ticketPour(a: Actor, champs: Record<string, unknown> = {}) {
  const { data, error } = await admin().from('receipt').insert({
    household_id: a.householdId, bought_at: '2026-09-18', ...champs,
  }).select().single()
  expect(error, "l'amorce a échoué : le test serait vert à vide").toBeNull()
  return data!.id as string
}

async function ligne(ticket: string, champs: Record<string, unknown>) {
  const { data, error } = await admin().from('receipt_line').insert({
    receipt_id: ticket, household_id: alice.householdId,
    label: 'ARTICLE', price_eur: 1, ...champs,
  }).select().single()
  expect(error, "l'amorce a échoué : le test serait vert à vide").toBeNull()
  return data!
}

async function prixDe(foyer: string, label: string) {
  const { data } = await admin().from('household_price')
    .select('*').eq('household_id', foyer).ilike('label', label).maybeSingle()
  return data
}

beforeAll(async () => {
  alice = await makeActor('prix-alice')
  bob = await makeActor('prix-bob')
  const { data: m } = await admin().from('store')
    .insert({ household_id: alice.householdId, name: 'Enseigne A', is_default: true })
    .select().single()
  magasin = m!.id
  const { data: c } = await admin().from('cycle')
    .insert({ household_id: alice.householdId, week_of: '2029-01-01' }).select().single()
  cycleAlice = c!.id
})

describe('une ligne de ticket enseigne un prix', () => {
  it('ramène un poids au kilo', async () => {
    // Sans cela, « 6,49 € » se comparerait au prix d'un kilo la fois suivante.
    const t = await ticketPour(alice, { store_id: magasin })
    await ligne(t, { label: 'FIL PLT 500G', quantity: 500, unit: 'g', price_eur: 6.49 })

    const p = await prixDe(alice.householdId, 'FIL PLT 500G')
    expect(p, 'aucun prix appris').not.toBeNull()
    expect(p!.unit).toBe('kg')
    expect(Number(p!.avg_price_eur)).toBeCloseTo(12.98, 2)
  })

  it('ramène un volume au litre', async () => {
    const t = await ticketPour(alice, { store_id: magasin })
    await ligne(t, { label: 'LAIT 1.5L', quantity: 1500, unit: 'ml', price_eur: 1.8 })

    const p = await prixDe(alice.householdId, 'LAIT 1.5L')
    expect(p!.unit).toBe('l')
    expect(Number(p!.avg_price_eur)).toBeCloseTo(1.2, 2)
  })

  it('divise par le nombre d’unités', async () => {
    const t = await ticketPour(alice, { store_id: magasin })
    await ligne(t, { label: 'YT NATURE X8', quantity: 8, unit: 'u', price_eur: 2.16 })

    const p = await prixDe(alice.householdId, 'YT NATURE X8')
    expect(p!.unit).toBe('u')
    expect(Number(p!.avg_price_eur)).toBeCloseTo(0.27, 2)
  })

  it('garde le prix tel quel quand la quantité est inconnue', async () => {
    // Inventer une quantité serait pire que de retenir un prix d'article.
    const t = await ticketPour(alice, { store_id: magasin })
    await ligne(t, { label: 'PAIN', quantity: null, unit: null, price_eur: 1.1 })

    const p = await prixDe(alice.householdId, 'PAIN')
    expect(p!.unit).toBe('u')
    expect(Number(p!.avg_price_eur)).toBeCloseTo(1.1, 2)
  })
})

describe('le prix se moyenne', () => {
  it('lisse deux relevés et retient le dernier', async () => {
    // Une promotion isolée ne doit pas emporter la moyenne, mais « tu l'as payé
    // 2,00 € la dernière fois » doit rester vérifiable.
    const t1 = await ticketPour(alice, { store_id: magasin })
    await ligne(t1, { label: 'BEURRE', price_eur: 3 })
    const t2 = await ticketPour(alice, { store_id: magasin })
    await ligne(t2, { label: 'BEURRE', price_eur: 2 })

    const p = await prixDe(alice.householdId, 'BEURRE')
    expect(Number(p!.avg_price_eur)).toBeCloseTo(2.5, 2)
    expect(Number(p!.last_price_eur)).toBeCloseTo(2, 2)
    expect(p!.observations).toBe(2)
  })

  it('ne confond pas deux enseignes', async () => {
    // Le même produit n'y vaut pas le même prix : deux lignes, pas une moyenne.
    const { data: autre } = await admin().from('store')
      .insert({ household_id: alice.householdId, name: 'Enseigne B' }).select().single()
    const t = await ticketPour(alice, { store_id: autre!.id })
    await ligne(t, { label: 'BEURRE', price_eur: 4 })

    const { data } = await admin().from('household_price')
      .select('store_id, avg_price_eur').eq('household_id', alice.householdId).ilike('label', 'BEURRE')
    expect(data!.length, 'les deux enseignes ont été fondues').toBe(2)
  })

  it('ne distingue pas la casse', async () => {
    // « Beurre » et « BEURRE » sont le même achat : deux lignes feraient deux
    // moyennes, et l'estimation prendrait la moins observée.
    const t = await ticketPour(alice, { store_id: magasin })
    await ligne(t, { label: 'beurre', price_eur: 2.5 })

    const { data } = await admin().from('household_price')
      .select('observations').eq('household_id', alice.householdId)
      .eq('store_id', magasin).ilike('label', 'beurre')
    expect(data!.length).toBe(1)
    expect(data![0].observations).toBe(3)
  })
})

describe('le prix payé remonte sur la liste', () => {
  it('remplit paid_price_eur de l’article rapproché', async () => {
    const { data: article } = await admin().from('shopping_item').insert({
      cycle_id: cycleAlice, household_id: alice.householdId,
      store_id: magasin, label: 'poulet',
    }).select().single()

    const t = await ticketPour(alice, { store_id: magasin })
    await ligne(t, { label: 'FIL PLT', price_eur: 6.49, shopping_item_id: article!.id })

    const { data } = await admin().from('shopping_item')
      .select('paid_price_eur').eq('id', article!.id).single()
    expect(Number(data!.paid_price_eur), 'le prix payé n’est pas remonté').toBeCloseTo(6.49, 2)
  })

  it('apprend aussi un prix sans article rapproché', async () => {
    // Un prix de sacs poubelle vaut d'être appris même si personne ne les
    // avait notés sur la liste.
    const t = await ticketPour(alice, { store_id: magasin })
    await ligne(t, { label: 'SACS POUBELLE 30L', price_eur: 3.2, shopping_item_id: null })
    expect(await prixDe(alice.householdId, 'SACS POUBELLE 30L')).not.toBeNull()
  })
})

describe('le rattachement au foyer', () => {
  it('redérive le foyer depuis le ticket, quoi qu’on déclare', async () => {
    const t = await ticketPour(alice, { store_id: magasin })
    const { data } = await admin().from('receipt_line').insert({
      receipt_id: t, household_id: bob.householdId,   // mensonge
      label: 'MENSONGE', price_eur: 1,
    }).select().single()
    expect(data!.household_id, 'le foyer déclaré a été cru sur parole')
      .toBe(alice.householdId)
  })

  it('refuse une ligne accrochée à un ticket qui n’existe pas', async () => {
    const { error } = await admin().from('receipt_line').insert({
      receipt_id: '00000000-0000-0000-0000-000000000000',
      household_id: alice.householdId, label: 'Fantôme', price_eur: 1,
    })
    expect(error).not.toBeNull()
  })

  it('refuse un prix négatif', async () => {
    // Une remise n'est pas une ligne : la compter comme telle apprendrait un
    // prix négatif, qui se propagerait à toutes les estimations.
    const t = await ticketPour(alice, { store_id: magasin })
    const { error } = await admin().from('receipt_line')
      .insert({ receipt_id: t, household_id: alice.householdId, label: 'REMISE', price_eur: -0.5 })
    expect(error).not.toBeNull()
  })
})

describe('le trigger n’écrit pas chez les autres', () => {
  /*
   * `tg_receipt_line_apprend` est `security definer` — il doit l'être, pour
   * écrire dans `household_price` sans que le client ait ce droit. Mais
   * `security definer` CONTOURNE la RLS : sans vérification explicite, la
   * clause `where id = ...` suffit à écrire n'importe où.
   *
   * Ces deux tests ont ÉCHOUÉ avant le correctif de la migration 0027.
   */
  it('refuse de remplir le prix payé d’un article d’un autre foyer', async () => {
    const { data: cycleB } = await admin().from('cycle')
      .insert({ household_id: bob.householdId, week_of: '2031-01-06' }).select().single()
    const { data: articleB } = await admin().from('shopping_item').insert({
      cycle_id: cycleB!.id, household_id: bob.householdId, label: 'poulet de Bob',
    }).select().single()

    const t = await ticketPour(alice, { store_id: magasin })
    await alice.client.from('receipt_line').insert({
      receipt_id: t, household_id: alice.householdId,
      label: 'DÉTOURNEMENT', price_eur: 99, shopping_item_id: articleB!.id,
    })

    const { data } = await admin().from('shopping_item')
      .select('paid_price_eur').eq('id', articleB!.id).single()
    expect(data!.paid_price_eur, 'un foyer a écrit dans la liste d’un autre').toBeNull()
  })

  it('ignore une enseigne qui appartient à un autre foyer', async () => {
    // Sinon le prix appris serait rangé sous une enseigne invisible, et
    // l'estimation le proposerait ensuite comme venant « d'ailleurs ».
    const { data: magasinB } = await admin().from('store')
      .insert({ household_id: bob.householdId, name: 'Enseigne de Bob' }).select().single()
    const t = await ticketPour(alice, { store_id: magasinB!.id })
    await ligne(t, { label: 'EMPRUNT', price_eur: 2.5 })

    const p = await prixDe(alice.householdId, 'EMPRUNT')
    expect(p!.store_id, 'un prix a été rangé sous l’enseigne d’un autre foyer').toBeNull()
  })
})

describe('le quota se compte sans en perdre', () => {
  it('incrémente atomiquement, même en parallèle', async () => {
    // Le code lisait `calls` puis écrivait `calls + 1` : deux appels simultanés
    // lisaient la même valeur et un appel sur deux ne comptait pas.
    const a = admin()
    await Promise.all(Array.from({ length: 8 }, () =>
      a.rpc('llm_consomme', { p_household: alice.householdId, p_kind: 'ticket' })))

    const mois = new Date().toISOString().slice(0, 8) + '01'
    const { data } = await a.from('llm_usage').select('calls')
      .eq('household_id', alice.householdId).eq('month', mois).eq('kind', 'ticket').single()
    expect(data!.calls, 'des appels simultanés se sont écrasés').toBe(8)
  })
})

describe('l’isolation entre foyers', () => {
  it('laisse le foyer lire ses propres prix', async () => {
    const { data } = await alice.client.from('price_knowledge').select('label')
    expect(data!.length, 'le foyer ne voit pas ses propres prix').toBeGreaterThan(0)
  })

  it('ne laisse fuir ni les tickets ni les prix', async () => {
    for (const table of ['receipt', 'receipt_line', 'household_price'] as const) {
      const { data } = await bob.client.from(table)
        .select('household_id').eq('household_id', alice.householdId)
      expect(data ?? [], `fuite de ${table} entre foyers`).toHaveLength(0)
    }
    const { data: vue } = await bob.client.from('price_knowledge')
      .select('label').eq('household_id', alice.householdId)
    expect(vue ?? [], 'la vue des prix fuit entre foyers').toHaveLength(0)
  })

  it('empêche d’écrire un ticket chez un autre foyer', async () => {
    const { error } = await bob.client.from('receipt')
      .insert({ household_id: alice.householdId, bought_at: '2026-09-18' })
    expect(error, 'un ticket a été écrit chez un autre foyer').not.toBeNull()
  })

  it('empêche d’effacer les prix d’un autre foyer', async () => {
    const { data } = await bob.client.from('household_price')
      .delete().eq('household_id', alice.householdId).select()
    expect(data ?? [], 'des prix ont été effacés chez un autre foyer').toHaveLength(0)
  })

  it('emporte les tickets avec le foyer', async () => {
    const jetable = await makeActor('prix-jetable')
    const t = await ticketPour(jetable)
    await admin().from('receipt_line')
      .insert({ receipt_id: t, household_id: jetable.householdId, label: 'X', price_eur: 1 })
    await admin().from('household').delete().eq('id', jetable.householdId)

    const { data } = await admin().from('receipt_line').select('id').eq('receipt_id', t)
    expect(data ?? [], 'des lignes ont survécu à leur foyer').toHaveLength(0)
  })
})
