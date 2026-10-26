/**
 * Nos aliments (migration 0124) : ce que le foyer mange, avec ses vraies valeurs pour 100 g.
 *
 *  · la RLS : un autre foyer ne voit rien, n'écrit rien, ne change rien, ne retire rien ;
 *  · les bornes : on ne range pas une étiquette lue en kJ, ni un poids nul, ni deux fois le même nom ;
 *  · le geste : une unité (« un pot ») s'écrit dans `meal_extra` avec les vraies valeurs, par
 *    `choisir_un_repas`, et compte dans le bilan comme un repère ;
 *  · l'export RGPD les emporte.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, makeActor, type Actor } from './helpers/db'

let kamil: Actor
let autre: Actor
const db = admin()

beforeAll(async () => {
  kamil = await makeActor('aliments-kamil')
  autre = await makeActor('aliments-autre')
})

/* Le yaourt dessert protéiné du foyer : 76 kcal, 10 g de protéines… pour 100 g, dans un pot de 125 g. */
const yaourt = (o: Record<string, unknown> = {}) => ({
  label: 'Yaourt dessert protéiné', kcal_100g: 76, protein_100g: 10, carb_100g: 5.6, fat_100g: 1.4, fiber_100g: 0,
  unite: 'pot', unite_g: 125, ...o,
})
let n = 0
const nom = (base = 'Aliment') => `${base} ${Date.now()}-${++n}`
const cree = (a: Actor, o: Record<string, unknown> = {}) =>
  a.client.from('aliment').insert({ household_id: a.householdId, ...yaourt({ label: nom('Yaourt') }), ...o }).select().single()

describe('la RLS du foyer', () => {
  it('un foyer lit les siens, jamais ceux d’un autre', async () => {
    const mien = (await cree(kamil)).data!
    const leur = (await cree(autre)).data!
    const { data: vus } = await kamil.client.from('aliment').select('id')
    const ids = (vus ?? []).map(x => x.id)
    expect(ids).toContain(mien.id)
    expect(ids, 'un aliment d’un autre foyer est visible').not.toContain(leur.id)
    const { data: direct } = await kamil.client.from('aliment').select('id').eq('id', leur.id)
    expect(direct).toHaveLength(0)
  })

  it('on n’écrit pas au nom d’un autre foyer', async () => {
    const { error } = await kamil.client.from('aliment')
      .insert({ household_id: autre.householdId, ...yaourt({ label: nom() }) })
    expect(error?.message).toMatch(/row-level security/)
  })

  it('on ne déplace pas un aliment vers un autre foyer, et on ne modifie ni ne retire celui d’un autre', async () => {
    const mien = (await cree(kamil)).data!
    const leur = (await cree(autre)).data!

    const deplace = await kamil.client.from('aliment').update({ household_id: autre.householdId }).eq('id', mien.id)
    expect(deplace.error?.message).toMatch(/row-level security/)

    // Rien n'est touché chez l'autre : la ligne est invisible, donc ni changée ni retirée.
    await kamil.client.from('aliment').update({ kcal_100g: 1 }).eq('id', leur.id)
    await kamil.client.from('aliment').delete().eq('id', leur.id)
    const { data: intact } = await db.from('aliment').select('kcal_100g').eq('id', leur.id).single()
    expect(Number(intact!.kcal_100g)).toBe(76)
  })

  it('l’anonyme ne voit rien', async () => {
    const { data } = await db.from('aliment').select('id').limit(1)
    expect(data!.length).toBeGreaterThan(0) // le service voit tout…
    const anon = (await import('@supabase/supabase-js')).createClient(
      process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const { data: rien } = await anon.from('aliment').select('id')
    expect(rien ?? []).toHaveLength(0) // … l'anonyme rien.
  })

  it('le foyer modifie et retire les siens', async () => {
    const a = (await cree(kamil)).data!
    const maj = await kamil.client.from('aliment').update({ kcal_100g: 80, unite_g: 150 }).eq('id', a.id).select().single()
    expect(maj.error).toBeNull()
    expect(Number(maj.data!.kcal_100g)).toBe(80)
    expect(new Date(maj.data!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(a.updated_at).getTime())
    const del = await kamil.client.from('aliment').delete().eq('id', a.id).select()
    expect(del.error).toBeNull()
    expect(del.data).toHaveLength(1)
  })
})

describe('les bornes', () => {
  const refus = async (o: Record<string, unknown>, motif: RegExp) => {
    const { error } = await cree(kamil, o)
    expect(error?.message, JSON.stringify(o)).toMatch(motif)
  }

  it('un aliment complet entre, avec ses défauts (« pot », source « main »)', async () => {
    const { data, error } = await kamil.client.from('aliment')
      .insert({ household_id: kamil.householdId, label: nom('Skyr'), kcal_100g: 57, unite_g: 140 }).select().single()
    expect(error).toBeNull()
    expect(data!.unite).toBe('pot')
    expect(data!.source).toBe('main')
    expect(Number(data!.protein_100g)).toBe(0)
    expect(data!.code_barres).toBeNull()
  })

  it('les calories : ni négatives, ni au-delà de 900 pour 100 g (des kJ pris pour des kcal)', async () => {
    await refus({ kcal_100g: -1 }, /aliment_kcal_100g_check/)
    await refus({ kcal_100g: 901 }, /aliment_kcal_100g_check/)
    expect((await cree(kamil, { label: nom('Huile'), kcal_100g: 900, protein_100g: 0, carb_100g: 0, fat_100g: 100 })).error).toBeNull()
    expect((await cree(kamil, { label: nom('Eau'), kcal_100g: 0, protein_100g: 0, carb_100g: 0, fat_100g: 0 })).error).toBeNull()
  })

  it('les macros : ni négatives, ni au-delà de 100 g, ni plus de 105 g à elles trois', async () => {
    await refus({ protein_100g: -0.1 }, /aliment_protein_100g_check/)
    await refus({ carb_100g: 101 }, /aliment_carb_100g_check/)
    await refus({ fat_100g: 100.1 }, /aliment_fat_100g_check/)
    await refus({ fiber_100g: -1 }, /aliment_fiber_100g_check/)
    await refus({ protein_100g: 50, carb_100g: 50, fat_100g: 10 }, /aliment_macros_plausibles/)
  })

  it('l’unité pèse entre 1 g et 5 kg et porte un nom', async () => {
    await refus({ unite_g: 0 }, /aliment_unite_g_check/)
    await refus({ unite_g: -125 }, /aliment_unite_g_check/)
    await refus({ unite_g: 5001 }, /aliment_unite_g_check/)
    await refus({ unite: '   ' }, /aliment_unite_check/)
    await refus({ unite: 'x'.repeat(21) }, /aliment_unite_check/)
  })

  it('le nom : ni vide, ni de plus de 80 caractères', async () => {
    await refus({ label: '   ' }, /aliment_label_check/)
    await refus({ label: 'x'.repeat(81) }, /aliment_label_check/)
  })

  it('la provenance : main, etiquette ou code_barres, rien d’autre', async () => {
    for (const source of ['main', 'etiquette', 'code_barres']) {
      expect((await cree(kamil, { label: nom('Source'), source })).error, source).toBeNull()
    }
    await refus({ source: 'devine' }, /aliment_source_check/)
  })

  it('le code-barres : 8 à 14 chiffres', async () => {
    await refus({ code_barres: '12345' }, /aliment_code_barres_check/)
    await refus({ code_barres: '30334900047AB' }, /aliment_code_barres_check/)
    await refus({ code_barres: '123456789012345' }, /aliment_code_barres_check/)
    expect((await cree(kamil, { label: nom('Code'), code_barres: '3033490004743' })).error).toBeNull()
  })

  it('un nom, une fois par foyer — sans tenir compte de la casse ni des espaces — mais libre chez un autre foyer', async () => {
    const base = nom('Fromage blanc')
    expect((await cree(kamil, { label: base })).error).toBeNull()
    const double = await cree(kamil, { label: `  ${base.toUpperCase()} ` })
    expect(double.error?.message).toMatch(/aliment_label_unique/)
    expect((await cree(autre, { label: base })).error, 'un autre foyer a le droit au même nom').toBeNull()
  })

  it('un code-barres, une fois par foyer ; plusieurs aliments sans code-barres', async () => {
    const code = String(40_000_000_000 + Math.floor(Math.random() * 1_000_000_000))
    expect((await cree(kamil, { label: nom('A'), code_barres: code })).error).toBeNull()
    expect((await cree(kamil, { label: nom('B'), code_barres: code })).error?.message).toMatch(/aliment_code_barres_unique/)
    expect((await cree(autre, { label: nom('C'), code_barres: code })).error).toBeNull()
    expect((await cree(kamil, { label: nom('D') })).error).toBeNull()
    expect((await cree(kamil, { label: nom('E') })).error).toBeNull()
  })
})

describe('un geste : une unité, avec les vraies valeurs', () => {
  /* Les mêmes jours que la feuille de choix : la case est unique par personne, jour et repas. */
  let decalage = 0
  const jourDans = (k: number) => new Date(Date.UTC(2043, 0, 1) + (decalage + k) * 86_400_000).toISOString().slice(0, 10)

  it('« un pot » du yaourt dessert protéiné vaut 95 kcal et 12,5 g, écrits par `choisir_un_repas`', async () => {
    decalage += 10
    const a = (await cree(kamil, { label: nom('Yaourt dessert protéiné') })).data!
    const g = Number(a.unite_g)
    const unite = {
      label: a.label, grams: g,
      kcal: Math.round(Number(a.kcal_100g) * g / 100),
      protein_g: Math.round(Number(a.protein_100g) * g / 10) / 10,
      carb_g: Math.round(Number(a.carb_100g) * g / 10) / 10,
      fat_g: Math.round(Number(a.fat_100g) * g / 10) / 10,
      fiber_g: Math.round(Number(a.fiber_100g) * g / 10) / 10,
    }
    expect(unite).toMatchObject({ grams: 125, kcal: 95, protein_g: 12.5, carb_g: 7, fat_g: 1.8 })

    const r = await kamil.client.rpc('choisir_un_repas', {
      p_day: jourDans(0), p_meal: 'collation', p_users: [kamil.userId], p_today: jourDans(0),
      p_choix: { type: 'repere', ...unite },
    })
    expect(r.error).toBeNull()

    const { data: slot } = await db.from('meal_slot').select('id, state, portion_id')
      .eq('user_profile_id', kamil.userId).eq('day', jourDans(0)).eq('meal', 'collation').single()
    expect(slot!.state).toBe('prevu')
    expect(slot!.portion_id).toBeNull()
    const { data: extras } = await db.from('meal_extra').select('*').eq('meal_slot_id', slot!.id)
    expect(extras).toHaveLength(1)
    expect(extras![0]).toMatchObject({ label: a.label, household_id: kamil.householdId })
    expect(Number(extras![0].grams)).toBe(125)
    expect(Number(extras![0].kcal)).toBe(95)
    expect(Number(extras![0].protein_g)).toBe(12.5)
    expect(Number(extras![0].carb_g)).toBe(7)
    expect(Number(extras![0].fat_g)).toBe(1.8)
  })

  it('l’extra est une COPIE : corriger l’aliment ensuite ne réécrit pas le repas d’hier', async () => {
    decalage += 10
    const a = (await cree(kamil, { label: nom('Copie') })).data!
    await kamil.client.rpc('choisir_un_repas', {
      p_day: jourDans(0), p_meal: 'collation', p_users: [kamil.userId], p_today: jourDans(0),
      p_choix: { type: 'repere', label: a.label, grams: 125, kcal: 95, protein_g: 12.5 },
    })
    await kamil.client.from('aliment').update({ kcal_100g: 200 }).eq('id', a.id)
    const { data: slot } = await db.from('meal_slot').select('id')
      .eq('user_profile_id', kamil.userId).eq('day', jourDans(0)).eq('meal', 'collation').single()
    const { data: extras } = await db.from('meal_extra').select('kcal').eq('meal_slot_id', slot!.id)
    expect(Number(extras![0].kcal)).toBe(95)
  })
})

describe('l’export RGPD', () => {
  it('emporte nos aliments, et seulement les nôtres', async () => {
    const mien = (await cree(kamil, { label: nom('Exporté') })).data!
    const leur = (await cree(autre, { label: nom('Pas à lui') })).data!
    const { data, error } = await kamil.client.rpc('export_my_data')
    expect(error).toBeNull()
    const ids = (data.aliments as { id: string }[]).map(x => x.id)
    expect(ids).toContain(mien.id)
    expect(ids).not.toContain(leur.id)
  })
})
