/**
 * La semaine qu'on choisit (migration 0123) : `choisir_un_repas` pose, change ou saute un repas pour une ou
 * plusieurs personnes, en UNE transaction — jamais la même barquette dans deux cases, l'ancienne barquette
 * lâchée, rien d'écrit quand une personne manque de part.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin, makeActor, type Actor } from './helpers/db'

let kamil: Actor
let autre: Actor
let thauba: { client: ReturnType<typeof createClient>; userId: string }
const db = admin()

/* Une case est unique par personne, jour et repas : chaque test vit un autre jour, loin devant. */
let decalage = 0
beforeEach(() => { decalage += 10 })
const jourDans = (n: number) => new Date(Date.UTC(2041, 0, 1) + (decalage + n) * 86_400_000).toISOString().slice(0, 10)
const aujourdhui = () => jourDans(0)
let plat = 0
const nouveauPlat = () => `Plat ${Date.now()}-${++plat}`

beforeAll(async () => {
  kamil = await makeActor('choix-kamil')
  autre = await makeActor('choix-autre')
  const email = `choix-thauba-${Date.now()}@test.local`
  const { data: u, error } = await db.auth.admin.createUser({ email, password: 'test-password-12345', email_confirm: true })
  expect(error).toBeNull()
  const { error: pe } = await db.from('user_profile')
    .insert({ id: u!.user.id, household_id: kamil.householdId, display_name: 'Thauba' })
  expect(pe).toBeNull()
  const client = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  expect((await client.auth.signInWithPassword({ email, password: 'test-password-12345' })).error).toBeNull()
  thauba = { client, userId: u!.user.id }
})

type Spec = { pour?: 'kamil' | 'thauba' | null; expire?: number; lieu?: 'frigo' | 'congelateur'; etat?: string }
async function parts(label: string, specs: Spec[], foyer = kamil.householdId) {
  const { data, error } = await db.from('portion').insert(specs.map(s => {
    const froid = s.lieu === 'congelateur'
    return {
      household_id: foyer, label, grams: 500, kcal: 600, protein_g: 40, fiber_g: 5, carb_g: 60, fat_g: 20,
      location: s.lieu ?? 'frigo', state: s.etat ?? 'au_frais',
      frozen_at: froid ? new Date().toISOString() : null,
      for_user_id: s.pour === 'kamil' ? kamil.userId : s.pour === 'thauba' ? thauba.userId : null,
      expires_at: new Date(Date.now() + (s.expire ?? 2) * 86_400_000).toISOString(),
    }
  })).select()
  expect(error).toBeNull()
  return data!
}
async function pose(portionId: string | null, qui: string, jour: string, meal: string, etat = 'prevu') {
  const { data, error } = await db.from('meal_slot').insert({
    household_id: kamil.householdId, user_profile_id: qui, day: jour, meal, portion_id: portionId, state: etat,
    eaten_at: etat === 'mange' ? new Date().toISOString() : null,
  }).select().single()
  expect(error).toBeNull()
  return data!
}
const lePlat = (label: string, lieu = 'frigo', etat = 'au_frais') =>
  ({ type: 'plat', recipe_id: null, label, location: lieu, state: etat })
const choisit = (c: Actor['client'] | typeof thauba.client, jour: string, meal: string, users: string[], choix: object, today = aujourdhui()) =>
  c.rpc('choisir_un_repas', { p_day: jour, p_meal: meal, p_users: users, p_today: today, p_choix: choix })
const deux = () => [kamil.userId, thauba.userId]
const caseDe = async (qui: string, jour: string, meal: string) =>
  (await db.from('meal_slot').select('*').eq('user_profile_id', qui).eq('day', jour).eq('meal', meal).maybeSingle()).data
const extrasDe = async (slotId: string) => (await db.from('meal_extra').select('*').eq('meal_slot_id', slotId)).data!

describe('choisir un plat pour deux', () => {
  it('une barquette par personne, la plus pressée d’abord, la sienne avant celle de personne', async () => {
    const label = nouveauPlat()
    const [tard, deThauba, deTous, deKamil] = await parts(label, [
      { expire: 5 }, { pour: 'thauba', expire: 2 }, { pour: null, expire: 1 }, { pour: 'kamil', expire: 4 },
    ])
    const r = await choisit(kamil.client, aujourdhui(), 'diner', deux(), lePlat(label))
    expect(r.error).toBeNull()
    expect(r.data.poses[kamil.userId], 'Kamil n’a pas reçu SA barquette').toBe(deKamil.id)
    expect(r.data.poses[thauba.userId], 'Thauba n’a pas reçu SA barquette').toBe(deThauba.id)
    expect((await caseDe(kamil.userId, aujourdhui(), 'diner'))!.portion_id).toBe(deKamil.id)
    expect((await caseDe(thauba.userId, aujourdhui(), 'diner'))!.portion_id).toBe(deThauba.id)
    expect(deTous.id).not.toBe(tard.id)
  })

  it('celle de personne ensuite, la plus pressée d’abord ; celle d’un autre seulement s’il n’y a rien d’autre', async () => {
    const label = nouveauPlat()
    const [tard, tot, deThauba] = await parts(label, [{ pour: null, expire: 5 }, { pour: null, expire: 1 }, { pour: 'thauba', expire: 1 }])
    // Kamil seul : celle de personne la plus pressée, jamais celle de Thauba.
    const a = await choisit(kamil.client, aujourdhui(), 'dejeuner', [kamil.userId], lePlat(label))
    expect(a.data.poses[kamil.userId]).toBe(tot.id)
    const b = await choisit(kamil.client, aujourdhui(), 'diner', [kamil.userId], lePlat(label))
    expect(b.data.poses[kamil.userId]).toBe(tard.id)
    // Plus rien pour personne : celle de Thauba en dernier recours.
    const c = await choisit(kamil.client, jourDans(1), 'diner', [kamil.userId], lePlat(label))
    expect(c.data.poses[kamil.userId]).toBe(deThauba.id)
  })

  it('toutes personnes confondues : la barquette de Thauba ne part pas chez Kamil tant qu’il en reste une pour Kamil', async () => {
    const label = nouveauPlat()
    // Celle de Thauba est la plus pressée ; deux pour personne, une pour Kamil.
    const [deThauba, , deKamil] = await parts(label, [{ pour: 'thauba', expire: 1 }, { pour: null, expire: 2 }, { pour: 'kamil', expire: 3 }])
    // Thauba passe EN PREMIER dans la demande : sa part, pas celle de Kamil.
    const r = await choisit(kamil.client, aujourdhui(), 'diner', [thauba.userId, kamil.userId], lePlat(label))
    expect(r.data.poses[thauba.userId]).toBe(deThauba.id)
    expect(r.data.poses[kamil.userId]).toBe(deKamil.id)
  })

  it('une barquette réclamée par un autre repas à venir n’est pas libre ; un repas passé ne la retient pas', async () => {
    const label = nouveauPlat()
    const [reclamee, vieille, libre] = await parts(label, [{ expire: 1 }, { expire: 2 }, { expire: 3 }])
    await pose(reclamee.id, kamil.userId, jourDans(3), 'diner')
    const passee = await pose(vieille.id, thauba.userId, jourDans(-4), 'diner')
    const r = await choisit(kamil.client, jourDans(1), 'dejeuner', deux(), lePlat(label))
    expect(r.error).toBeNull()
    expect(Object.values(r.data.poses).sort()).toEqual([vieille.id, libre.id].sort())
    expect(Object.values(r.data.poses)).not.toContain(reclamee.id)
    // Le repas passé a lâché sa barquette : elle n'est jamais dans deux cases.
    expect((await db.from('meal_slot').select('portion_id').eq('id', passee.id).single()).data!.portion_id).toBeNull()
    const { data: toutes } = await db.from('meal_slot').select('portion_id').in('portion_id', [reclamee.id, vieille.id, libre.id])
    const ids = toutes!.map(x => x.portion_id)
    expect(new Set(ids).size, 'la même barquette dans deux cases').toBe(ids.length)
  })

  it('pas assez de barquettes libres pour deux : rien n’est écrit', async () => {
    const label = nouveauPlat()
    const [a, b] = await parts(label, [{ expire: 1 }, { expire: 2 }])
    await pose(b.id, kamil.userId, jourDans(5), 'diner')
    const r = await choisit(kamil.client, jourDans(1), 'diner', deux(), lePlat(label))
    expect(r.error?.message).toMatch(/pas assez de parts libres/)
    expect(await caseDe(kamil.userId, jourDans(1), 'diner')).toBeNull()
    expect(await caseDe(thauba.userId, jourDans(1), 'diner')).toBeNull()
    // La seule libre reste libre pour une seule personne.
    const un = await choisit(kamil.client, jourDans(1), 'diner', [kamil.userId], lePlat(label))
    expect(un.data.poses[kamil.userId]).toBe(a.id)
  })

  it('choisir le même plat sur une case qui le porte garde sa barquette', async () => {
    const label = nouveauPlat()
    const [pressee, mienne] = await parts(label, [{ expire: 1 }, { pour: 'kamil', expire: 4 }])
    await pose(mienne.id, kamil.userId, jourDans(1), 'diner')
    const r = await choisit(kamil.client, jourDans(1), 'diner', [kamil.userId], lePlat(label))
    expect(r.error).toBeNull()
    expect(r.data.poses[kamil.userId], 'sa propre barquette lui est reprise').toBe(mienne.id)
    expect(r.data.liberees).toEqual([])
    expect((await caseDe(kamil.userId, jourDans(1), 'diner'))!.portion_id).toBe(mienne.id)
    expect(pressee.id).toBeTruthy()
  })
})

describe('changer un repas', () => {
  it('l’ancienne barquette est lâchée : elle redevient libre, et la base dit où elle retourne', async () => {
    const lasagnes = nouveauPlat()
    const pizza = nouveauPlat()
    const [l1, l2] = await parts(lasagnes, [{ expire: 1 }, { expire: 2 }])
    const [p1, p2] = await parts(pizza, [{ expire: 1 }, { expire: 2 }])
    await choisit(kamil.client, jourDans(2), 'diner', deux(), lePlat(lasagnes))
    const r = await choisit(kamil.client, jourDans(2), 'diner', deux(), lePlat(pizza))
    expect(r.error).toBeNull()
    expect(r.data.liberees.map((x: { portion_id: string }) => x.portion_id).sort()).toEqual([l1.id, l2.id].sort())
    expect(r.data.liberees[0]).toMatchObject({ label: lasagnes, location: 'frigo', state: 'au_frais' })
    expect(Object.values(r.data.poses).sort()).toEqual([p1.id, p2.id].sort())
    // Les lasagnes ne sont plus réclamées : une autre case les prend.
    const encore = await choisit(kamil.client, jourDans(3), 'diner', deux(), lePlat(lasagnes))
    expect(encore.error).toBeNull()
    const { data: toutes } = await db.from('meal_slot').select('portion_id').in('portion_id', [l1.id, l2.id, p1.id, p2.id])
    const ids = toutes!.map(x => x.portion_id)
    expect(new Set(ids).size, 'la même barquette dans deux cases').toBe(ids.length)
  })

  it('un plat congelé lâché dit qu’il reste au congélateur', async () => {
    const wraps = nouveauPlat()
    const lasagnes = nouveauPlat()
    await parts(wraps, [{ lieu: 'congelateur', expire: 80 }, { lieu: 'congelateur', expire: 80 }])
    await parts(lasagnes, [{ expire: 1 }, { expire: 2 }])
    await choisit(kamil.client, jourDans(2), 'dejeuner', deux(), lePlat(wraps, 'congelateur'))
    const r = await choisit(kamil.client, jourDans(2), 'dejeuner', deux(), lePlat(lasagnes))
    expect(r.data.liberees).toHaveLength(2)
    expect(r.data.liberees[0]).toMatchObject({ label: wraps, location: 'congelateur' })
  })

  it('changer pour une seule personne ne touche pas à l’autre', async () => {
    const a = nouveauPlat()
    const b = nouveauPlat()
    await parts(a, [{ expire: 1 }, { expire: 2 }])
    await parts(b, [{ expire: 1 }])
    await choisit(kamil.client, jourDans(2), 'diner', deux(), lePlat(a))
    const avantThauba = (await caseDe(thauba.userId, jourDans(2), 'diner'))!
    const r = await choisit(kamil.client, jourDans(2), 'diner', [kamil.userId], lePlat(b))
    expect(r.error).toBeNull()
    expect(r.data.liberees).toHaveLength(1)
    expect((await caseDe(thauba.userId, jourDans(2), 'diner'))!.portion_id).toBe(avantThauba.portion_id)
    expect((await caseDe(kamil.userId, jourDans(2), 'diner'))!.portion_id).not.toBe(avantThauba.portion_id)
  })

  it('on peut changer le jour même', async () => {
    const a = nouveauPlat()
    const b = nouveauPlat()
    await parts(a, [{ expire: 1 }])
    await parts(b, [{ expire: 1 }])
    await choisit(kamil.client, aujourdhui(), 'dejeuner', [kamil.userId], lePlat(a))
    const r = await choisit(kamil.client, aujourdhui(), 'dejeuner', [kamil.userId], lePlat(b))
    expect(r.error).toBeNull()
    expect(r.data.liberees).toHaveLength(1)
  })

  it('un repas déjà mangé ne se change pas — et rien n’est écrit pour l’autre personne', async () => {
    const a = nouveauPlat()
    const b = nouveauPlat()
    const [pa] = await parts(a, [{ expire: 1 }])
    await parts(b, [{ expire: 1 }, { expire: 2 }])
    await pose(pa.id, thauba.userId, aujourdhui(), 'diner', 'mange')
    const r = await choisit(kamil.client, aujourdhui(), 'diner', deux(), lePlat(b))
    expect(r.error?.message).toMatch(/Thauba a déjà mangé/)
    expect(await caseDe(kamil.userId, aujourdhui(), 'diner')).toBeNull()
    const s = await choisit(kamil.client, aujourdhui(), 'diner', deux(), { type: 'saute' })
    expect(s.error?.message).toMatch(/déjà mangé/)
    expect((await caseDe(thauba.userId, aujourdhui(), 'diner'))!.state).toBe('mange')
  })

  it('un repas d’hier ne se choisit plus', async () => {
    const a = nouveauPlat()
    await parts(a, [{ expire: 1 }])
    const r = await choisit(kamil.client, jourDans(-1), 'diner', [kamil.userId], lePlat(a))
    expect(r.error?.message).toMatch(/d’hier/)
  })
})

describe('refus : barquette prise, mangée, jetée, d’un autre foyer', () => {
  it('toutes les barquettes sont réclamées : refusé, rien n’est écrit', async () => {
    const label = nouveauPlat()
    const [a] = await parts(label, [{ expire: 1 }])
    await pose(a.id, thauba.userId, jourDans(4), 'diner')
    const r = await choisit(kamil.client, jourDans(1), 'diner', [kamil.userId], lePlat(label))
    expect(r.error?.message).toMatch(/pas assez de parts libres/)
    expect(await caseDe(kamil.userId, jourDans(1), 'diner')).toBeNull()
    expect((await db.from('meal_slot').select('user_profile_id').eq('portion_id', a.id)).data).toHaveLength(1)
  })

  it('un plat dont les parts sont mangées ou jetées n’est pas un plat', async () => {
    const label = nouveauPlat()
    await parts(label, [{ etat: 'mangee' }, { etat: 'jetee' }])
    for (const etat of ['mangee', 'jetee']) {
      const r = await choisit(kamil.client, jourDans(1), 'diner', [kamil.userId], lePlat(label, 'frigo', etat))
      expect(r.error?.message, etat).toMatch(/pas lisible/)
    }
    // Et sous l'état « au frais », il n'y a rien : les parts mangées et jetées ne sont jamais candidates.
    const r = await choisit(kamil.client, jourDans(1), 'diner', [kamil.userId], lePlat(label))
    expect(r.error?.message).toMatch(/pas assez de parts libres/)
  })

  it('le plat d’un autre foyer est invisible : refusé', async () => {
    const label = nouveauPlat()
    await parts(label, [{ expire: 1 }], autre.householdId)
    const r = await choisit(kamil.client, jourDans(1), 'diner', [kamil.userId], lePlat(label))
    expect(r.error?.message).toMatch(/pas assez de parts libres/)
    expect(await caseDe(kamil.userId, jourDans(1), 'diner')).toBeNull()
  })

  it('une personne d’un autre foyer est refusée, et l’autre foyer ne peut rien poser chez nous', async () => {
    const label = nouveauPlat()
    await parts(label, [{ expire: 1 }])
    const r = await choisit(kamil.client, jourDans(1), 'diner', [autre.userId], lePlat(label))
    expect(r.error?.message).toMatch(/pas du foyer/)
    const r2 = await choisit(autre.client, jourDans(1), 'diner', [autre.userId], lePlat(label))
    expect(r2.error?.message).toMatch(/pas assez de parts libres/)
    const r3 = await choisit(autre.client, jourDans(1), 'diner', [kamil.userId], lePlat(label))
    expect(r3.error?.message).toMatch(/pas du foyer/)
    expect(await caseDe(kamil.userId, jourDans(1), 'diner')).toBeNull()
  })

  it('deux téléphones qui choisissent la dernière barquette en même temps : une seule la prend', async () => {
    const label = nouveauPlat()
    const [seule] = await parts(label, [{ expire: 1 }])
    const [a, b] = await Promise.all([
      choisit(kamil.client, jourDans(1), 'dejeuner', [kamil.userId], lePlat(label)),
      choisit(thauba.client, jourDans(1), 'diner', [thauba.userId], lePlat(label)),
    ])
    expect([a.error, b.error].filter(Boolean), 'exactement un refus').toHaveLength(1)
    const { data } = await db.from('meal_slot').select('user_profile_id').eq('portion_id', seule.id)
    expect(data, 'la même barquette dans deux cases').toHaveLength(1)
  })

  it('les paramètres bancals sont refusés', async () => {
    const label = nouveauPlat()
    await parts(label, [{ expire: 1 }])
    expect((await choisit(kamil.client, jourDans(1), 'brunch', [kamil.userId], lePlat(label))).error?.message).toMatch(/quel repas/)
    expect((await choisit(kamil.client, jourDans(1), 'diner', [], lePlat(label))).error?.message).toMatch(/pour qui/)
    expect((await choisit(kamil.client, jourDans(1), 'diner', [kamil.userId], { type: 'rien' })).error?.message).toMatch(/ce qu’on mange/)
    expect((await choisit(kamil.client, jourDans(1), 'diner', [kamil.userId], lePlat(label, 'placard'))).error?.message).toMatch(/pas lisible/)
    expect((await choisit(kamil.client, jourDans(500), 'diner', [kamil.userId], lePlat(label), aujourdhui())).error?.message).toMatch(/trop loin/)
    expect((await choisit(kamil.client, jourDans(1), 'diner', [kamil.userId], { type: 'repere', label: '  ', kcal: 100 })).error?.message).toMatch(/ce que c’est/)
  })
})

describe('sauter, ou prendre autre chose', () => {
  it('on saute : la case est « sautée », sans barquette, et l’ancienne est lâchée', async () => {
    const label = nouveauPlat()
    const [a] = await parts(label, [{ expire: 1 }])
    await choisit(kamil.client, jourDans(2), 'diner', [kamil.userId], lePlat(label))
    const r = await choisit(kamil.client, jourDans(2), 'diner', [kamil.userId], { type: 'saute' })
    expect(r.error).toBeNull()
    expect(r.data.liberees.map((x: { portion_id: string }) => x.portion_id)).toEqual([a.id])
    const c = (await caseDe(kamil.userId, jourDans(2), 'diner'))!
    expect(c).toMatchObject({ state: 'saute', portion_id: null, eaten_at: null })
  })

  it('un repère : une case « prévue » sans barquette, avec son extra', async () => {
    const r = await choisit(kamil.client, jourDans(2), 'dejeuner', deux(), {
      type: 'repere', label: 'Restaurant', kcal: 900, protein_g: 35,
    })
    expect(r.error).toBeNull()
    expect(r.data.liberees).toEqual([])
    for (const qui of deux()) {
      const c = (await caseDe(qui, jourDans(2), 'dejeuner'))!
      expect(c).toMatchObject({ state: 'prevu', portion_id: null })
      const e = await extrasDe(c.id)
      expect(e).toHaveLength(1)
      expect(e[0]).toMatchObject({ label: 'Restaurant', household_id: kamil.householdId })
      expect(Number(e[0].kcal)).toBe(900)
      expect(Number(e[0].protein_g)).toBe(35)
    }
  })

  it('changer un repère pour un autre : un seul extra reste ; pour un plat : plus aucun', async () => {
    const label = nouveauPlat()
    await parts(label, [{ expire: 1 }])
    await choisit(kamil.client, jourDans(2), 'dejeuner', [kamil.userId], { type: 'repere', label: 'Sandwich', kcal: 550, protein_g: 22 })
    await choisit(kamil.client, jourDans(2), 'dejeuner', [kamil.userId], { type: 'repere', label: 'Restaurant', kcal: 900, protein_g: 35, grams: 400 })
    const c = (await caseDe(kamil.userId, jourDans(2), 'dejeuner'))!
    expect((await extrasDe(c.id)).map(e => e.label)).toEqual(['Restaurant'])
    const r = await choisit(kamil.client, jourDans(2), 'dejeuner', [kamil.userId], lePlat(label))
    expect(r.error).toBeNull()
    expect(await extrasDe(c.id), 'le repas « autre chose » a laissé son extra').toEqual([])
    expect((await caseDe(kamil.userId, jourDans(2), 'dejeuner'))!.portion_id).not.toBeNull()
  })

  it('les en-plus d’une case avec barquette restent quand on change de plat, pas quand on saute', async () => {
    const a = nouveauPlat()
    const b = nouveauPlat()
    await parts(a, [{ expire: 1 }])
    await parts(b, [{ expire: 1 }])
    await choisit(kamil.client, jourDans(2), 'diner', [kamil.userId], lePlat(a))
    const c = (await caseDe(kamil.userId, jourDans(2), 'diner'))!
    await db.from('meal_extra').insert({ household_id: kamil.householdId, meal_slot_id: c.id, label: 'Yaourt', kcal: 60, protein_g: 4 })
    await choisit(kamil.client, jourDans(2), 'diner', [kamil.userId], lePlat(b))
    expect((await extrasDe(c.id)).map(e => e.label), 'un en-plus a disparu au changement de plat').toEqual(['Yaourt'])
    await choisit(kamil.client, jourDans(2), 'diner', [kamil.userId], { type: 'saute' })
    expect(await extrasDe(c.id)).toEqual([])
  })

  it('un repas sauté se choisit de nouveau', async () => {
    const label = nouveauPlat()
    await parts(label, [{ expire: 1 }])
    await choisit(kamil.client, jourDans(2), 'diner', [kamil.userId], { type: 'saute' })
    const r = await choisit(kamil.client, jourDans(2), 'diner', [kamil.userId], lePlat(label))
    expect(r.error).toBeNull()
    expect(await caseDe(kamil.userId, jourDans(2), 'diner')).toMatchObject({ state: 'prevu' })
  })
})
