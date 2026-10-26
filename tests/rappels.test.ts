/**
 * Les rappels par mail (migration 0126), côté base : qui règle quoi, qui peut appeler, ce qui est DÛ et quand
 * (à l'heure de Paris, changements d'heure compris), et jamais deux fois.
 *
 * Tout se joue en 2030 : la base borne les mois du budget à cinq ans, et 2030 donne deux dimanches de
 * changement d'heure (31 mars, 27 octobre). Chaque test a son foyer, et `rappels_a_envoyer` prend l'instant en
 * paramètre : rien ne dépend de l'horloge de la machine.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { admin, type Actor } from './helpers/db'
import { foyerSolo, membre, ou, poseCharge, type Foyer } from './helpers/budget'

const db = admin()

type Due = {
  user_id: string; email: string; prenom: string; type: string; cle: string; cles: string[]
  donnees: Record<string, any>
}
const TYPES = [
  'sortir_du_congelateur', 'barquette_perime', 'choisir_les_repas', 'noter_les_depenses',
  'confirmer_les_charges', 'cloturer_le_mois', 'facture_annuelle',
]

/** Ce qui est dû à cet instant, pour ces personnes seulement (la base de test est partagée). */
async function du(iso: string, qui: string[], type?: string): Promise<Due[]> {
  const r = await db.rpc('rappels_a_envoyer', { p_maintenant: iso })
  expect(r.error, r.error?.message).toBeNull()
  return (r.data as Due[]).filter(x => qui.includes(x.user_id) && (!type || x.type === type))
}

async function active(userId: string, type: string, actif = true) {
  ou(await db.from('rappel_reglage').upsert({ user_id: userId, type, actif }).select())
}

type Duo = { k: Foyer; t: Actor }
/** Un foyer de deux : Kamil (revenu posé) et Thauba (sans revenu, sauf demande). */
async function duo(o: { revenuThauba?: number } = {}): Promise<Duo> {
  const k = await foyerSolo('Kamil', { revenu: 370_000 })
  const t = await membre(k, 'Thauba', o.revenuThauba ? { revenu: o.revenuThauba } : {})
  return { k, t }
}

let n = 0
async function portion(foyer: string, o: {
  label: string; lieu?: 'frigo' | 'congelateur'; etat?: string; expire?: string; pour?: string | null
}) {
  const congelee = o.lieu === 'congelateur'
  return ou(await db.from('portion').insert({
    household_id: foyer, label: o.label, grams: 500, kcal: 600, protein_g: 40, fiber_g: 5, carb_g: 60, fat_g: 20,
    location: o.lieu ?? 'frigo', state: o.etat ?? 'au_frais',
    frozen_at: congelee ? '2030-05-01T10:00:00Z' : null,
    expires_at: o.expire ?? (congelee ? '2030-08-01T10:00:00Z' : '2030-06-20T10:00:00Z'),
    for_user_id: o.pour ?? null,
  }).select().single()) as { id: string }
}
async function repas(foyer: string, qui: string, jour: string, meal: string, portionId: string | null, etat = 'prevu') {
  return ou(await db.from('meal_slot').insert({
    household_id: foyer, user_profile_id: qui, day: jour, meal, portion_id: portionId, state: etat,
    eaten_at: etat === 'mange' ? '2030-06-01T12:00:00Z' : null,
  }).select().single()) as { id: string }
}

/* Des instants précis. Paris est à UTC+2 l'été, UTC+1 l'hiver. */
const MARDI_19H = '2030-06-11T17:00:00Z'       // mardi 11 juin, 19 h 00 à Paris (heure d'été)
const MARDI_18H59 = '2030-06-11T16:59:00Z'

describe('les réglages : chacun les siens', () => {
  let d: Duo
  beforeAll(async () => { d = await duo() })

  it('un membre règle et relit ses rappels ; il ne voit pas ceux de l’autre', async () => {
    ou(await d.k.client.from('rappel_reglage').insert({ user_id: d.k.userId, type: 'sortir_du_congelateur', actif: true }).select())
    ou(await d.t.client.from('rappel_reglage').insert({ user_id: d.t.userId, type: 'choisir_les_repas', actif: true }).select())

    const kamil = ou(await d.k.client.from('rappel_reglage').select('user_id, type, actif'))
    expect(kamil).toEqual([{ user_id: d.k.userId, type: 'sortir_du_congelateur', actif: true }])
    const thauba = ou(await d.t.client.from('rappel_reglage').select('user_id, type, actif'))
    expect(thauba).toEqual([{ user_id: d.t.userId, type: 'choisir_les_repas', actif: true }])
  })

  it('un membre n’écrit pas pour l’autre (même foyer)', async () => {
    const r = await d.k.client.from('rappel_reglage').insert({ user_id: d.t.userId, type: 'noter_les_depenses', actif: true })
    expect(r.error, 'Kamil a écrit un réglage pour Thauba').not.toBeNull()

    /* Mettre à jour ou supprimer la ligne de l'autre : la RLS la lui cache, rien n'est touché. */
    const maj = ou(await d.k.client.from('rappel_reglage').update({ actif: false })
      .eq('user_id', d.t.userId).select())
    expect(maj).toEqual([])
    const supp = ou(await d.k.client.from('rappel_reglage').delete().eq('user_id', d.t.userId).select())
    expect(supp).toEqual([])
    const chez = ou(await db.from('rappel_reglage').select('actif').eq('user_id', d.t.userId).eq('type', 'choisir_les_repas'))
    expect(chez).toEqual([{ actif: true }])
  })

  it('le membre et le type d’une ligne ne se déplacent pas', async () => {
    const vers = await d.k.client.from('rappel_reglage').update({ user_id: d.t.userId })
      .eq('user_id', d.k.userId).eq('type', 'sortir_du_congelateur').select()
    expect(vers.error, 'la ligne a changé de membre').not.toBeNull()
    const type = await d.k.client.from('rappel_reglage').update({ type: 'barquette_perime' })
      .eq('user_id', d.k.userId).eq('type', 'sortir_du_congelateur').select()
    expect(type.error, 'la ligne a changé de type').not.toBeNull()
  })

  it('un type inconnu est refusé', async () => {
    const r = await d.k.client.from('rappel_reglage').insert({ user_id: d.k.userId, type: 'spam', actif: true })
    expect(r.error).not.toBeNull()
  })

  it('un anonyme ne lit rien', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    const r = await anon.from('rappel_reglage').select('*')
    expect(r.error || r.data!.length === 0, 'un anonyme lit des réglages').toBeTruthy()
  })

  it('« envoyé » n’est ni lisible ni écrivable côté client', async () => {
    ou(await db.from('rappel_envoye').insert({ user_id: d.k.userId, type: 'sortir_du_congelateur', cle: '2030-06-12' }).select())
    const lu = await d.k.client.from('rappel_envoye').select('*')
    expect(lu.error || lu.data!.length === 0, 'le client lit rappel_envoye').toBeTruthy()
    const ecrit = await d.k.client.from('rappel_envoye').insert({ user_id: d.k.userId, type: 'barquette_perime', cle: 'x' })
    expect(ecrit.error, 'le client écrit rappel_envoye').not.toBeNull()
  })
})

describe('qui peut appeler', () => {
  let d: Duo
  beforeAll(async () => { d = await duo() })

  it('rappels_a_envoyer, reserve_rappel et libere_rappel sont refusés au client et à l’anonyme', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    for (const c of [d.k.client, anon]) {
      expect((await c.rpc('rappels_a_envoyer', { p_maintenant: MARDI_19H })).error, 'rappels_a_envoyer').not.toBeNull()
      expect((await c.rpc('reserve_rappel', { p_user: d.k.userId, p_type: 'choisir_les_repas', p_cles: ['x'] })).error, 'reserve_rappel').not.toBeNull()
      expect((await c.rpc('libere_rappel', { p_user: d.k.userId, p_type: 'choisir_les_repas', p_cles: ['x'] })).error, 'libere_rappel').not.toBeNull()
      expect((await c.rpc('rappel_actifs', { p_type: 'choisir_les_repas' })).error, 'rappel_actifs').not.toBeNull()
      expect((await c.rpc('appelle_les_rappels')).error, 'appelle_les_rappels').not.toBeNull()
    }
  })

  it('le rôle de service y accède', async () => {
    expect((await db.rpc('rappels_a_envoyer', { p_maintenant: MARDI_19H })).error).toBeNull()
  })
})

describe('coupé par défaut', () => {
  it('rien n’est dû à qui n’a rien activé, même quand tout est dû', async () => {
    const d = await duo()
    const wrap = await portion(d.k.householdId, { label: 'Wraps', lieu: 'congelateur' })
    await repas(d.k.householdId, d.k.userId, '2030-06-12', 'diner', wrap.id)
    expect(await du(MARDI_19H, [d.k.userId, d.t.userId])).toEqual([])
  })

  it('seul celui qui a activé reçoit ; couper arrête tout', async () => {
    const d = await duo()
    const wrap = await portion(d.k.householdId, { label: 'Wraps', lieu: 'congelateur' })
    await repas(d.k.householdId, d.k.userId, '2030-06-12', 'diner', wrap.id)

    await active(d.k.userId, 'sortir_du_congelateur')
    const dus = await du(MARDI_19H, [d.k.userId, d.t.userId])
    expect(dus.map(x => x.user_id)).toEqual([d.k.userId])
    expect(dus[0].email).toBe(d.k.email.toLowerCase())
    expect(dus[0].prenom).toBe('Kamil')

    await active(d.k.userId, 'sortir_du_congelateur', false)
    expect(await du(MARDI_19H, [d.k.userId, d.t.userId])).toEqual([])
  })
})

describe('sortir_du_congelateur : la veille à 19 h', () => {
  it('regroupe par plat, dit pour qui et combien il en reste, à partir de 19 h et jusqu’à minuit', async () => {
    const d = await duo()
    const f = d.k.householdId
    // Quatre wraps pour demain (midi et soir, pour deux), trois autres restent au congélateur.
    const wraps = await Promise.all([0, 1, 2, 3, 4, 5, 6].map(() => portion(f, { label: 'Wraps poulet', lieu: 'congelateur' })))
    await repas(f, d.k.userId, '2030-06-12', 'dejeuner', wraps[0].id)
    await repas(f, d.t.userId, '2030-06-12', 'dejeuner', wraps[1].id)
    await repas(f, d.k.userId, '2030-06-12', 'diner', wraps[2].id)
    await repas(f, d.t.userId, '2030-06-12', 'diner', wraps[3].id)
    // Ce qui NE compte PAS : le frigo, un autre jour, un repas déjà mangé.
    const frigo = await portion(f, { label: 'Soupe', lieu: 'frigo' })
    await repas(f, d.k.userId, '2030-06-12', 'petit_dejeuner', frigo.id)
    await repas(f, d.k.userId, '2030-06-13', 'dejeuner', (await portion(f, { label: 'Autre jour', lieu: 'congelateur' })).id)
    await repas(f, d.k.userId, '2030-06-12', 'collation', (await portion(f, { label: 'Mangé', lieu: 'congelateur' })).id, 'mange')
    // Une barquette jetée que la case pointe encore : il n'y a plus rien à sortir.
    await repas(f, d.t.userId, '2030-06-12', 'collation', (await portion(f, { label: 'Jetée', lieu: 'congelateur', etat: 'jetee' })).id)

    await active(d.k.userId, 'sortir_du_congelateur')
    await active(d.t.userId, 'sortir_du_congelateur')
    const ids = [d.k.userId, d.t.userId]

    expect(await du(MARDI_18H59, ids), 'avant 19 h').toEqual([])
    const dus = await du(MARDI_19H, ids)
    expect(dus.map(x => x.user_id).sort()).toEqual([...ids].sort())
    for (const x of dus) {
      expect(x.type).toBe('sortir_du_congelateur')
      expect(x.cle).toBe('2030-06-12')
      expect(x.cles).toEqual(['2030-06-12'])
      expect(x.donnees.jour).toBe('2030-06-12')
      const plats = x.donnees.plats as any[]
      expect(plats.map(p => p.label)).toEqual(['Wraps poulet'])
      const w = plats[0]
      expect(w.n, 'quatre wraps, regroupés en un plat').toBe(4)
      expect([...w.portion_ids].sort()).toEqual([wraps[0].id, wraps[1].id, wraps[2].id, wraps[3].id].sort())
      expect(w.repas).toEqual([
        { meal: 'dejeuner', pour: ['Kamil', 'Thauba'] },
        { meal: 'diner', pour: ['Kamil', 'Thauba'] },
      ])
      expect(w.restant, 'il en restera trois au congélateur').toBe(3)
    }
    expect(await du('2030-06-11T21:59:00Z', ids), '23 h 59 : le passage manqué se rattrape').toHaveLength(2)
    expect(await du('2030-06-11T22:00:00Z', ids), 'minuit passé : c’est un autre jour').toEqual([])
  })

  it('deux plats pour demain : deux entrées, dans l’ordre des repas', async () => {
    const d = await duo()
    const f = d.k.householdId
    const a = await portion(f, { label: 'Pizza', lieu: 'congelateur' })
    const b = await portion(f, { label: 'Burger', lieu: 'congelateur' })
    await repas(f, d.k.userId, '2030-06-12', 'diner', a.id)
    await repas(f, d.k.userId, '2030-06-12', 'dejeuner', b.id)
    await active(d.k.userId, 'sortir_du_congelateur')
    const [x] = await du(MARDI_19H, [d.k.userId])
    expect((x.donnees.plats as any[]).map(p => p.label)).toEqual(['Burger', 'Pizza'])
  })

  it('une barquette déjà sortie n’est plus à sortir ; une barquette de plus change le mail', async () => {
    const d = await duo()
    const f = d.k.householdId
    const a = await portion(f, { label: 'Wraps', lieu: 'congelateur' })
    await repas(f, d.k.userId, '2030-06-12', 'dejeuner', a.id)
    await active(d.k.userId, 'sortir_du_congelateur')
    expect(await du(MARDI_19H, [d.k.userId])).toHaveLength(1)
    ou(await db.from('portion').update({ location: 'frigo' }).eq('id', a.id).select())
    expect(await du(MARDI_19H, [d.k.userId]), 'elle est au frigo : rien à sortir').toEqual([])
  })

  it('à l’heure de Paris : 19 h d’hiver est 18 h UTC, 19 h d’été est 17 h UTC', async () => {
    const d = await duo()
    const f = d.k.householdId
    await repas(f, d.k.userId, '2030-01-16', 'dejeuner', (await portion(f, { label: 'Wraps', lieu: 'congelateur' })).id)
    await repas(f, d.k.userId, '2030-06-12', 'dejeuner', (await portion(f, { label: 'Wraps', lieu: 'congelateur' })).id)
    await active(d.k.userId, 'sortir_du_congelateur')
    expect(await du('2030-01-15T17:59:00Z', [d.k.userId]), '18 h 59 à Paris, en hiver').toEqual([])
    expect(await du('2030-01-15T18:00:00Z', [d.k.userId]), '19 h pile, en hiver').toHaveLength(1)
    expect(await du('2030-06-11T16:59:00Z', [d.k.userId]), '18 h 59 à Paris, en été').toEqual([])
    expect(await du('2030-06-11T17:00:00Z', [d.k.userId]), '19 h pile, en été').toHaveLength(1)
  })

  it('autour du changement d’heure d’octobre (le dimanche 27, 3 h devient 2 h)', async () => {
    const d = await duo()
    const f = d.k.householdId
    // Samedi 26 octobre, 19 h (heure d’été) → le repas de dimanche.
    await repas(f, d.k.userId, '2030-10-27', 'dejeuner', (await portion(f, { label: 'Wraps', lieu: 'congelateur' })).id)
    // Dimanche 27 octobre, 19 h (heure d’hiver) → le repas de lundi.
    await repas(f, d.k.userId, '2030-10-28', 'dejeuner', (await portion(f, { label: 'Pizza', lieu: 'congelateur' })).id)
    await active(d.k.userId, 'sortir_du_congelateur')
    const ids = [d.k.userId]
    expect(await du('2030-10-26T16:59:00Z', ids)).toEqual([])
    expect((await du('2030-10-26T17:00:00Z', ids)).map(x => x.cle)).toEqual(['2030-10-27'])
    expect((await du('2030-10-27T17:59:00Z', ids)).map(x => x.cle), '19 h d’hiver n’est pas encore là').toEqual([])
    expect((await du('2030-10-27T18:00:00Z', ids)).map(x => x.cle)).toEqual(['2030-10-28'])
  })

  it('autour du changement d’heure de mars (le dimanche 31, 2 h devient 3 h)', async () => {
    const d = await duo()
    const f = d.k.householdId
    await repas(f, d.k.userId, '2030-04-01', 'dejeuner', (await portion(f, { label: 'Wraps', lieu: 'congelateur' })).id)
    await active(d.k.userId, 'sortir_du_congelateur')
    expect(await du('2030-03-31T16:59:00Z', [d.k.userId]), '18 h 59 d’été').toEqual([])
    expect(await du('2030-03-31T17:00:00Z', [d.k.userId]), '19 h d’été').toHaveLength(1)
  })
})

describe('barquette_perime : à 8 h, ce qui périme avant demain soir et n’est prévu nulle part', () => {
  const MARDI_8H = '2030-06-11T06:00:00Z'
  it('regroupe les barquettes d’un plat, une clé par barquette', async () => {
    const d = await duo()
    const f = d.k.householdId
    // Trois lasagnes qui périment demain 21 h (Paris), non prévues.
    const trois = await Promise.all([1, 2, 3].map(() => portion(f, { label: 'Lasagnes saumon', expire: '2030-06-12T19:00:00Z' })))
    await active(d.k.userId, 'barquette_perime')
    const ids = [d.k.userId]

    expect(await du('2030-06-11T05:59:00Z', ids), '7 h 59').toEqual([])
    const dus = await du(MARDI_8H, ids)
    expect(dus).toHaveLength(1)
    const x = dus[0]
    expect(x.type).toBe('barquette_perime')
    expect([...x.cles].sort()).toEqual(trois.map(t => t.id).sort())
    expect(trois.map(t => t.id)).toContain(x.cle)
    expect(x.donnees.label).toBe('Lasagnes saumon')
    expect(x.donnees.n).toBe(3)
    expect(new Date(x.donnees.expire).toISOString()).toBe('2030-06-12T19:00:00.000Z')
    expect(x.donnees.frigo).toEqual([{ label: 'Lasagnes saumon', n: 3, libres: 3 }])
    expect(await du('2030-06-11T21:59:00Z', ids), '23 h 59 : encore dû').toHaveLength(1)

    // Réservées, elles ne reviennent pas ; une quatrième barquette fait un nouveau mail pour elle seule.
    expect((await db.rpc('reserve_rappel', { p_user: d.k.userId, p_type: 'barquette_perime', p_cles: x.cles })).data).toBe(true)
    expect(await du(MARDI_8H, ids)).toEqual([])
    const quatre = await portion(f, { label: 'Lasagnes saumon', expire: '2030-06-12T19:00:00Z' })
    const encore = await du(MARDI_8H, ids)
    expect(encore).toHaveLength(1)
    expect(encore[0].cles).toEqual([quatre.id])
    expect(encore[0].donnees.n).toBe(1)
  })

  it('ne compte pas ce qui est prévu, ce qui périme plus tard, ce qui est déjà périmé, ni le congélateur', async () => {
    const d = await duo()
    const f = d.k.householdId
    const prevue = await portion(f, { label: 'Prévue', expire: '2030-06-12T19:00:00Z' })
    await repas(f, d.k.userId, '2030-06-12', 'diner', prevue.id)
    await portion(f, { label: 'Plus tard', expire: '2030-06-12T22:30:00Z' }) // 00 h 30 le 13 : après demain soir
    await portion(f, { label: 'Déjà périmée', expire: '2030-06-10T10:00:00Z' })
    await portion(f, { label: 'Congelée', lieu: 'congelateur', expire: '2030-06-12T19:00:00Z' })
    await portion(f, { label: 'Mangée', etat: 'mangee', expire: '2030-06-12T19:00:00Z' })
    await active(d.k.userId, 'barquette_perime')
    expect(await du(MARDI_8H, [d.k.userId])).toEqual([])
  })

  it('une réclamation d’un jour passé ne la retient pas ; avant demain soir, jusqu’à 23 h 59 demain', async () => {
    const d = await duo()
    const f = d.k.householdId
    const vieille = await portion(f, { label: 'Soupe', expire: '2030-06-12T21:59:00Z' }) // 23 h 59 demain : dedans
    await repas(f, d.k.userId, '2030-06-09', 'diner', vieille.id) // un repas passé, jamais noté
    await active(d.k.userId, 'barquette_perime')
    expect(await du(MARDI_8H, [d.k.userId])).toHaveLength(1)
  })

  it('à l’heure de Paris, 8 h d’hiver est 7 h UTC', async () => {
    const d = await duo()
    await portion(d.k.householdId, { label: 'Soupe', expire: '2030-01-16T19:00:00Z' })
    await active(d.k.userId, 'barquette_perime')
    expect(await du('2030-01-15T06:59:00Z', [d.k.userId])).toEqual([])
    expect(await du('2030-01-15T07:00:00Z', [d.k.userId])).toHaveLength(1)
  })
})

describe('choisir_les_repas : le dimanche à 18 h, s’il reste des dîners vides', () => {
  const DIM_18H = '2030-06-09T16:00:00Z'
  const jours = ['2030-06-10', '2030-06-11', '2030-06-12', '2030-06-13', '2030-06-14', '2030-06-15', '2030-06-16']

  it('dû tant qu’un dîner est vide ; « sauté » et « autre chose » sont des réponses, « prévu sans rien » est vide', async () => {
    const d = await duo()
    const f = d.k.householdId
    const plat = await portion(f, { label: 'Pizza', lieu: 'frigo' })
    const wrap = await portion(f, { label: 'Wraps', lieu: 'congelateur' })
    await repas(f, d.k.userId, jours[0], 'diner', plat.id)
    await repas(f, d.k.userId, jours[1], 'diner', wrap.id)
    await repas(f, d.k.userId, jours[2], 'diner', null, 'saute')
    const autre = await repas(f, d.k.userId, jours[3], 'diner', null)
    ou(await db.from('meal_extra').insert({ household_id: f, meal_slot_id: autre.id, label: 'Restaurant', kcal: 800 }).select())
    await repas(f, d.k.userId, jours[4], 'diner', null) // « prévu » sans barquette ni extra : vide
    await active(d.k.userId, 'choisir_les_repas')
    const ids = [d.k.userId]

    expect(await du('2030-06-09T15:59:00Z', ids), '17 h 59').toEqual([])
    const [x] = await du(DIM_18H, ids)
    expect(x.cle).toBe('2030-W23')
    expect(x.donnees.vides, 'jours 5 et 6 (et 7), le « prévu sans rien » et les deux sans ligne').toBe(3)
    expect((x.donnees.jours as any[]).map(j => j.jour)).toEqual(jours)
    expect((x.donnees.jours as any[]).map(j => j.soir)).toEqual(['frigo', 'congelateur', 'autre', 'autre', 'vide', 'vide', 'vide'])
    expect(x.donnees.congelateur).toBe(1)
    expect(x.donnees.frigo).toBe(1)

    // Tout est choisi : plus rien d'à rappeler.
    await repas(f, d.k.userId, jours[4], 'diner', null, 'saute').catch(() => null)
    ou(await db.from('meal_slot').update({ state: 'saute' }).eq('user_profile_id', d.k.userId).eq('day', jours[4]).eq('meal', 'diner').select())
    await repas(f, d.k.userId, jours[5], 'diner', null, 'saute')
    await repas(f, d.k.userId, jours[6], 'diner', null, 'saute')
    expect(await du(DIM_18H, ids), 'tous les dîners ont une réponse').toEqual([])
  })

  it('ni le samedi, ni le lundi ; chacun pour ses propres dîners', async () => {
    const d = await duo()
    const f = d.k.householdId
    await active(d.k.userId, 'choisir_les_repas')
    await active(d.t.userId, 'choisir_les_repas')
    const plat = await portion(f, { label: 'Pizza' })
    for (const j of jours) await repas(f, d.k.userId, j, 'diner', null, 'saute')
    void plat
    // Kamil a tout répondu, Thauba rien : seule Thauba est relancée.
    const dus = await du(DIM_18H, [d.k.userId, d.t.userId])
    expect(dus.map(x => x.user_id)).toEqual([d.t.userId])
    expect(dus[0].donnees.vides).toBe(7)
    expect(await du('2030-06-08T16:00:00Z', [d.t.userId]), 'samedi').toEqual([])
    expect(await du('2030-06-10T16:00:00Z', [d.t.userId]), 'lundi').toEqual([])
  })

  it('à l’heure de Paris, y compris les dimanches de changement d’heure', async () => {
    const d = await duo()
    await active(d.k.userId, 'choisir_les_repas')
    const ids = [d.k.userId]
    // 27 octobre : 18 h est 17 h UTC (heure d'hiver) ; avant la bascule, 18 h aurait été 16 h UTC.
    expect(await du('2030-10-27T16:30:00Z', ids), '17 h 30 à Paris : pas encore').toEqual([])
    expect(await du('2030-10-27T17:00:00Z', ids), '18 h à Paris').toHaveLength(1)
    // 31 mars : 18 h est 16 h UTC (heure d'été).
    expect(await du('2030-03-31T15:59:00Z', ids)).toEqual([])
    expect(await du('2030-03-31T16:00:00Z', ids)).toHaveLength(1)
  })
})

/** Une charge « au fil du mois » (ou autre) et sa ligne de mois, avec les parts. */
async function ligneDuMois(d: Duo, o: {
  libelle: string; mois: string; facon: 'fixe' | 'facture' | 'au_fil'; parts: Actor[]; confirme?: boolean
}) {
  const charge = await poseCharge(d.k, {
    libelle: `${o.libelle} ${++n}`, cents: 10_000, mode: o.facon, participants: o.parts.map(p => p.userId),
  })
  const ligne = ou(await db.from('depense').insert({
    household_id: d.k.householdId, charge_id: charge, mois: o.mois, libelle: o.libelle, montant_cents: 10_000,
    montant_prevu_cents: 10_000, nature: 'estimee', source: 'modele', facon: o.facon,
    confirme_le: o.confirme ? '2030-06-20T10:00:00Z' : null,
  }).select().single()) as { id: string }
  ou(await db.from('depense_part').insert(o.parts.map(p => ({
    depense_id: ligne.id, user_profile_id: p.userId, household_id: d.k.householdId,
    part_cents: 10_000 / o.parts.length, part_bps: 10_000 / o.parts.length,
  }))).select())
  return { charge, ligne: ligne.id }
}
async function saisie(d: Duo, ligneId: string, faitLe: string) {
  ou(await db.from('saisie').insert({
    id: randomUUID(), household_id: d.k.householdId, depense_id: ligneId, fait_le: faitLe, montant_cents: 500,
    saisi_par: d.k.userId,
  }).select())
}

describe('noter_les_depenses : le dimanche à 20 h, si rien n’est noté depuis 7 jours', () => {
  const DIM_20H = '2030-06-09T18:00:00Z'
  it('dû quand une ligne « au fil » existe et que rien n’a été noté depuis une semaine', async () => {
    const d = await duo()
    const { ligne } = await ligneDuMois(d, { libelle: 'Courses', mois: '2030-06-01', facon: 'au_fil', parts: [d.k, d.t] })
    await active(d.k.userId, 'noter_les_depenses')
    await active(d.t.userId, 'noter_les_depenses')
    const ids = [d.k.userId, d.t.userId]

    expect(await du('2030-06-09T17:59:00Z', ids), '19 h 59').toEqual([])
    const dus = await du(DIM_20H, ids)
    expect(dus.map(x => x.user_id).sort()).toEqual([...ids].sort())
    expect(dus[0].cle).toBe('2030-W23')
    expect(dus[0].donnees.depuis_jours).toBeNull()
    expect(dus[0].donnees.lignes).toBe(1)

    // Une dépense notée il y a 8 jours : toujours dû, et le mail dit depuis combien de temps.
    await saisie(d, ligne, '2030-06-01')
    expect((await du(DIM_20H, ids))[0].donnees.depuis_jours).toBe(8)
    // Une dépense notée mercredi : rien à rappeler.
    await saisie(d, ligne, '2030-06-05')
    expect(await du(DIM_20H, ids)).toEqual([])
  })

  it('rien à noter sans ligne « au fil » à son nom ; pas le samedi', async () => {
    const d = await duo()
    await ligneDuMois(d, { libelle: 'Loyer', mois: '2030-06-01', facon: 'fixe', parts: [d.k] })
    await ligneDuMois(d, { libelle: 'Courses', mois: '2030-06-01', facon: 'au_fil', parts: [d.k] })
    await active(d.k.userId, 'noter_les_depenses')
    await active(d.t.userId, 'noter_les_depenses')
    const dus = await du(DIM_20H, [d.k.userId, d.t.userId])
    expect(dus.map(x => x.user_id), 'Thauba ne porte aucune ligne « au fil »').toEqual([d.k.userId])
    expect(await du('2030-06-08T18:00:00Z', [d.k.userId]), 'samedi').toEqual([])
  })

  it('à l’heure de Paris le dimanche du changement d’heure', async () => {
    const d = await duo()
    await ligneDuMois(d, { libelle: 'Courses', mois: '2030-10-01', facon: 'au_fil', parts: [d.k] })
    await active(d.k.userId, 'noter_les_depenses')
    expect(await du('2030-10-27T18:59:00Z', [d.k.userId]), '19 h 59 à Paris').toEqual([])
    expect(await du('2030-10-27T19:00:00Z', [d.k.userId]), '20 h à Paris').toHaveLength(1)
  })
})

describe('confirmer_les_charges : le 1er à 9 h, les lignes du mois fini à confirmer', () => {
  const PREMIER_9H = '2030-07-01T07:00:00Z'
  it('dû pour qui porte une facture non confirmée du mois fini', async () => {
    const d = await duo()
    await ligneDuMois(d, { libelle: 'Électricité', mois: '2030-06-01', facon: 'facture', parts: [d.k] })
    await ligneDuMois(d, { libelle: 'Internet', mois: '2030-06-01', facon: 'facture', parts: [d.k, d.t] })
    await ligneDuMois(d, { libelle: 'Déjà confirmée', mois: '2030-06-01', facon: 'facture', parts: [d.k], confirme: true })
    await ligneDuMois(d, { libelle: 'Un loyer fixe', mois: '2030-06-01', facon: 'fixe', parts: [d.k] })
    await ligneDuMois(d, { libelle: 'Mois en cours', mois: '2030-07-01', facon: 'facture', parts: [d.k] })
    await active(d.k.userId, 'confirmer_les_charges')
    await active(d.t.userId, 'confirmer_les_charges')
    const ids = [d.k.userId, d.t.userId]

    expect(await du('2030-07-01T06:59:00Z', ids), '8 h 59').toEqual([])
    const dus = await du(PREMIER_9H, ids)
    expect(dus.map(x => x.user_id).sort()).toEqual([...ids].sort())
    const kamil = dus.find(x => x.user_id === d.k.userId)!
    const thauba = dus.find(x => x.user_id === d.t.userId)!
    expect(kamil.cle).toBe('2030-06')
    expect(kamil.donnees.n).toBe(2)
    expect((kamil.donnees.lignes as any[]).map(l => l.libelle)).toEqual(['Électricité', 'Internet'])
    expect(thauba.donnees.n, 'Thauba ne porte que la moitié d’Internet').toBe(1)
    expect(await du('2030-07-02T07:00:00Z', ids), 'le 2, ce n’est plus le jour').toEqual([])
  })

  it('rien si le mois est déjà clôturé', async () => {
    const d = await duo()
    await ligneDuMois(d, { libelle: 'Électricité', mois: '2030-06-01', facon: 'facture', parts: [d.k] })
    await active(d.k.userId, 'confirmer_les_charges')
    expect(await du(PREMIER_9H, [d.k.userId])).toHaveLength(1)
    ou(await db.from('cloture').insert({ household_id: d.k.householdId, mois: '2030-06-01', cloture_le: '2030-07-01T08:00:00Z' }).select())
    expect(await du(PREMIER_9H, [d.k.userId])).toEqual([])
  })

  it('à l’heure de Paris : 9 h d’hiver est 8 h UTC', async () => {
    const d = await duo()
    await ligneDuMois(d, { libelle: 'Électricité', mois: '2030-11-01', facon: 'facture', parts: [d.k] })
    await active(d.k.userId, 'confirmer_les_charges')
    expect(await du('2030-12-01T07:59:00Z', [d.k.userId])).toEqual([])
    expect(await du('2030-12-01T08:00:00Z', [d.k.userId])).toHaveLength(1)
  })
})

describe('cloturer_le_mois : le dernier jour à 19 h, si le mois n’est pas clos', () => {
  const FIN_19H = '2030-06-30T17:00:00Z'
  it('dû pour qui a un revenu, une part et un mois ouvert', async () => {
    const d = await duo()          // Thauba n'a pas de revenu
    await ligneDuMois(d, { libelle: 'Électricité', mois: '2030-06-01', facon: 'facture', parts: [d.k, d.t] })
    await ligneDuMois(d, { libelle: 'Loyer', mois: '2030-06-01', facon: 'fixe', parts: [d.k, d.t] })
    await active(d.k.userId, 'cloturer_le_mois')
    await active(d.t.userId, 'cloturer_le_mois')
    const ids = [d.k.userId, d.t.userId]

    expect(await du('2030-06-30T16:59:00Z', ids), '18 h 59').toEqual([])
    const dus = await du(FIN_19H, ids)
    expect(dus.map(x => x.user_id), 'Thauba n’a pas posé de revenu : on ne lui parle pas de clôture').toEqual([d.k.userId])
    expect(dus[0].cle).toBe('2030-06')
    expect(dus[0].donnees.lignes).toBe(2)
    expect(dus[0].donnees.a_confirmer).toBe(1)
    expect(await du('2030-06-29T17:00:00Z', ids), 'l’avant-dernier jour').toEqual([])
  })

  it('rien si le mois est clos, ou s’il n’a aucune ligne', async () => {
    const d = await duo()
    await active(d.k.userId, 'cloturer_le_mois')
    expect(await du(FIN_19H, [d.k.userId]), 'aucune ligne').toEqual([])
    await ligneDuMois(d, { libelle: 'Loyer', mois: '2030-06-01', facon: 'fixe', parts: [d.k] })
    expect(await du(FIN_19H, [d.k.userId])).toHaveLength(1)
    ou(await db.from('cloture').insert({ household_id: d.k.householdId, mois: '2030-06-01', cloture_le: '2030-06-30T10:00:00Z' }).select())
    expect(await du(FIN_19H, [d.k.userId])).toEqual([])
  })

  it('février, le 28 : le dernier jour change avec le mois', async () => {
    const d = await duo()
    await ligneDuMois(d, { libelle: 'Loyer', mois: '2030-02-01', facon: 'fixe', parts: [d.k] })
    await active(d.k.userId, 'cloturer_le_mois')
    expect(await du('2030-02-28T18:00:00Z', [d.k.userId])).toHaveLength(1)   // 19 h CET
    expect(await du('2030-02-27T18:00:00Z', [d.k.userId])).toEqual([])
  })
})

describe('facture_annuelle : 15 jours avant le mois où la charge se paie', () => {
  async function chargeAnnuelle(d: Duo, payeLe: string, o: { parts?: Actor[] } = {}) {
    const charge = await poseCharge(d.k, {
      libelle: `Taxe foncière ${++n}`, cents: 145_000, mode: 'mis_de_cote', periodicite: 'annuel',
      participants: (o.parts ?? [d.k]).map(p => p.userId),
    })
    ou(await db.from('facture').insert({
      id: randomUUID(), household_id: d.k.householdId, charge_id: charge, annee: Number(payeLe.slice(0, 4)),
      paye_le: payeLe, montant_cents: 142_000, origine: 'saisie', saisi_par: d.k.userId,
    }).select())
    return charge
  }

  it('dû le 17 août pour une facture payée en septembre l’an dernier', async () => {
    const d = await duo()
    const charge = await chargeAnnuelle(d, '2029-09-14')
    await active(d.k.userId, 'facture_annuelle')
    await active(d.t.userId, 'facture_annuelle')
    const ids = [d.k.userId, d.t.userId]

    expect(await du('2030-08-17T06:59:00Z', ids), '8 h 59').toEqual([])
    const dus = await du('2030-08-17T07:00:00Z', ids)
    expect(dus.map(x => x.user_id), 'seuls les participants de la charge').toEqual([d.k.userId])
    expect(dus[0].cle).toBe(`${charge}:2030`)
    expect(dus[0].donnees.mois).toBe('2030-09-01')
    expect(dus[0].donnees.derniere_montant_cents).toBe(142_000)
    expect(await du('2030-08-16T07:00:00Z', ids), 'la veille').toEqual([])
    expect(await du('2030-08-18T07:00:00Z', ids), 'le lendemain').toEqual([])
  })

  it('rien si la facture de l’année est déjà saisie, ni sans facture passée', async () => {
    const d = await duo()
    const charge = await chargeAnnuelle(d, '2029-09-14')
    await active(d.k.userId, 'facture_annuelle')
    expect(await du('2030-08-17T07:00:00Z', [d.k.userId])).toHaveLength(1)
    ou(await db.from('facture').insert({
      id: randomUUID(), household_id: d.k.householdId, charge_id: charge, annee: 2030,
      paye_le: '2030-08-01', montant_cents: 150_000, origine: 'saisie', saisi_par: d.k.userId,
    }).select())
    expect(await du('2030-08-17T07:00:00Z', [d.k.userId]), 'déjà payée cette année').toEqual([])

    const e = await duo()
    await poseCharge(e.k, { libelle: 'Sans histoire', cents: 100_000, mode: 'mis_de_cote', periodicite: 'annuel' })
    await active(e.k.userId, 'facture_annuelle')
    expect(await du('2030-08-17T07:00:00Z', [e.k.userId]), 'aucune facture passée : pas de mois connu').toEqual([])
  })

  it('un mois de janvier se prévient en décembre, sous la clé de l’année suivante', async () => {
    const d = await duo()
    const charge = await chargeAnnuelle(d, '2029-01-20')
    await active(d.k.userId, 'facture_annuelle')
    const dus = await du('2030-12-17T08:00:00Z', [d.k.userId])   // 9 h CET
    expect(dus).toHaveLength(1)
    expect(dus[0].cle).toBe(`${charge}:2031`)
    expect(dus[0].donnees.mois).toBe('2031-01-01')
  })

  it('une charge retirée n’est plus annoncée', async () => {
    const d = await duo()
    const charge = await chargeAnnuelle(d, '2029-09-14')
    await active(d.k.userId, 'facture_annuelle')
    ou(await db.from('charge').update({ archive_le: '2030-01-01T00:00:00Z' }).eq('id', charge).select())
    expect(await du('2030-08-17T07:00:00Z', [d.k.userId])).toEqual([])
  })
})

describe('jamais deux fois', () => {
  async function unDu() {
    const d = await duo()
    const wrap = await portion(d.k.householdId, { label: 'Wraps', lieu: 'congelateur' })
    await repas(d.k.householdId, d.k.userId, '2030-06-12', 'diner', wrap.id)
    await active(d.k.userId, 'sortir_du_congelateur')
    return d
  }

  it('réservé, un rappel n’est plus dû ; libéré après un échec d’envoi, il l’est de nouveau', async () => {
    const d = await unDu()
    const [x] = await du(MARDI_19H, [d.k.userId])
    const r = await db.rpc('reserve_rappel', { p_user: d.k.userId, p_type: x.type, p_cles: x.cles })
    expect(r.data).toBe(true)
    expect(await du(MARDI_19H, [d.k.userId]), 'déjà parti').toEqual([])
    expect((await db.rpc('reserve_rappel', { p_user: d.k.userId, p_type: x.type, p_cles: x.cles })).data, 'une seconde réservation').toBe(false)

    expect((await db.rpc('libere_rappel', { p_user: d.k.userId, p_type: x.type, p_cles: x.cles })).error).toBeNull()
    expect(await du(MARDI_19H, [d.k.userId]), 'l’heure suivante réessaie').toHaveLength(1)
  })

  it('sept passages en même temps : un seul gagne', async () => {
    const d = await unDu()
    const essais = await Promise.all(Array.from({ length: 7 }, () =>
      db.rpc('reserve_rappel', { p_user: d.k.userId, p_type: 'sortir_du_congelateur', p_cles: ['2030-06-12'] })))
    expect(essais.every(e => e.error === null)).toBe(true)
    expect(essais.filter(e => e.data === true)).toHaveLength(1)
    const lignes = ou(await db.from('rappel_envoye').select('cle').eq('user_id', d.k.userId))
    expect(lignes).toHaveLength(1)
  })

  it('une clé déjà prise : aucune des autres n’est posée', async () => {
    const d = await unDu()
    ou(await db.from('rappel_envoye').insert({ user_id: d.k.userId, type: 'barquette_perime', cle: 'b' }).select())
    const r = await db.rpc('reserve_rappel', { p_user: d.k.userId, p_type: 'barquette_perime', p_cles: ['a', 'b', 'c'] })
    expect(r.data).toBe(false)
    const lignes = ou(await db.from('rappel_envoye').select('cle').eq('user_id', d.k.userId).eq('type', 'barquette_perime'))
    expect(lignes.map((l: any) => l.cle)).toEqual(['b'])
  })

  it('la réservation est celle du membre : l’autre membre reçoit son propre mail', async () => {
    const d = await duo()
    const wrap = await portion(d.k.householdId, { label: 'Wraps', lieu: 'congelateur' })
    await repas(d.k.householdId, d.k.userId, '2030-06-12', 'diner', wrap.id)
    await active(d.k.userId, 'sortir_du_congelateur')
    await active(d.t.userId, 'sortir_du_congelateur')
    expect((await db.rpc('reserve_rappel', { p_user: d.k.userId, p_type: 'sortir_du_congelateur', p_cles: ['2030-06-12'] })).data).toBe(true)
    expect((await du(MARDI_19H, [d.k.userId, d.t.userId])).map(x => x.user_id)).toEqual([d.t.userId])
  })

  it('les types du schéma sont ceux de l’écran', async () => {
    const d = await duo()
    for (const t of TYPES) await active(d.k.userId, t)
    const lus = ou(await d.k.client.from('rappel_reglage').select('type').order('type')) as { type: string }[]
    expect(lus.map(l => l.type).sort()).toEqual([...TYPES].sort())
  })
})
