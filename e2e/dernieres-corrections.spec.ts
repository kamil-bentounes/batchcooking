/**
 * Le grand test (22/10), les derniers écarts du front : un test par défaut corrigé, regardé au
 * clic. Foyer amorcé par `amorce()` : Kamil a ses objectifs, Thauba n'a pas encore fixé les siens.
 *
 *   1. Réglages : « Dans le foyer : Kamil, Thauba » ;
 *   2. « Mes charges » : une charge qui démarre en 2031 est listée avec sa date, hors du total ;
 *   3. Hub de Thauba : « Fixe tes objectifs » ; dressage de Kamil : il dit qui est omis ;
 *   4. Choisir : au-delà de trois recettes retenues, « + N autres » se déplie ;
 *   5. un mois clôturé par l'autre : son reste calculé, « clôturé par Thauba », jamais un tiret.
 *
 * ⚠️ LOCAL, ET RIEN D'AUTRE.
 */
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, db, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'
import { montant } from '../src/lib/budget/mois.ts'
import { remetLHeure } from './horloge.ts'

let foyer: Foyer
test.use({ viewport: { width: 390, height: 844 } })
test.beforeAll(async () => {
  if (!/127\.0\.0\.1|localhost/.test(process.env.VITE_SUPABASE_URL ?? '')) {
    throw new Error('Ce banc ne se joue qu’en local.')
  }
  await remetLHeure()
  foyer = await amorce()
})
test.afterAll(async () => { if (foyer) await efface(foyer) })

async function connecte(page: Page, email = foyer.email) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

test('Réglages : « Dans le foyer : Kamil, Thauba »', async ({ page }) => {
  await connecte(page)
  await page.goto('/reglages')
  await expect(page.getByText(/^Dans le foyer : Kamil, Thauba$/)).toBeVisible({ timeout: 15_000 })
})

test('« Mes charges » : une charge de 2031 est listée avec sa date, hors du total', async ({ page }) => {
  await connecte(page)
  await page.goto('/charges')
  const total = page.getByText(/par mois pour le foyer/)
  await expect(total).toBeVisible({ timeout: 15_000 })
  const avant = await total.innerText()

  const { data: c, error } = await db.from('charge').insert({
    household_id: foyer.householdId, libelle: 'Piscine du jardin', montant_cents: 10_000,
    periodicite: 'mensuel', mode: 'fixe', categorie: 'autre', debut: '2031-01-01', commun: true,
  }).select().single()
  if (error) throw new Error(error.message)
  await db.from('charge_participant').insert([foyer.userId, foyer.elleId].map(p => ({
    charge_id: c!.id, user_profile_id: p, household_id: foyer.householdId })))

  await page.goto('/charges')
  await expect(page.getByText('Piscine du jardin')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/commence en janvier 2031/)).toBeVisible()
  expect(await page.getByText(/par mois pour le foyer/).innerText(),
    'la charge de 2031 est entrée dans le total').toBe(avant)
})

test('un nouvel arrivant sans objectifs : le hub le dit, le dressage nomme celle qui est omise', async ({ page, browser }) => {
  // Thauba (aucun objectif) voit « Fixe tes objectifs » sur le hub.
  const ctxElle = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR',
    timezoneId: 'Europe/Paris' })
  const elle = await ctxElle.newPage()
  await connecte(elle, foyer.elleEmail)
  await expect(elle.getByText('Fixe tes objectifs.')).toBeVisible({ timeout: 15_000 })
  await expect(elle.getByText(/aucune barquette ne t’est dressée/)).toBeVisible()
  await ctxElle.close()

  // Kamil, lui, n'a aucun bandeau d'objectifs, et son dressage dit qui est omis.
  await connecte(page)
  await expect(page.getByText('Fixe tes objectifs.')).toHaveCount(0)
  await page.goto('/dressage')
  await expect(page.getByText('Thauba n’a pas encore fixé ses objectifs : aucune barquette ne lui est dressée.'))
    .toBeVisible({ timeout: 15_000 })
})

test('Choisir : au-delà de trois recettes retenues, « + N autres » se déplie', async ({ page }) => {
  for (let i = 1; i <= 4; i++) {
    const { data: r, error } = await db.from('recipe').insert({
      title: `Plat de repli ${i}`, yield_servings: 4, total_time_min: 30, origin: 'importee',
      source_name: 'exemple.fr', source_url: `https://exemple.fr/repli-${i}-${Date.now()}`,
      plannable: true, freezable: true,
    }).select().single()
    if (error) throw new Error(error.message)
    await db.from('cycle_recipe').insert({ cycle_id: foyer.cycleId, recipe_id: r!.id, servings: 2 })
  }
  await connecte(page)
  await page.goto('/choisir')
  const champs = page.getByLabel(/^Parts de /)
  await expect(champs.first()).toBeVisible({ timeout: 15_000 })
  await expect(champs, 'six recettes retenues : trois seulement se montrent').toHaveCount(3)
  const plus = page.getByRole('button', { name: '+ 3 autres' })
  await expect(plus).toBeVisible()
  expect((await plus.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await plus.click()
  await expect(champs).toHaveCount(6)
  await expect(page.getByRole('button', { name: 'Replier' })).toHaveAttribute('aria-expanded', 'true')
})

test('un mois clôturé par Thauba : le reste de Kamil est calculé, avec « clôturé par Thauba »', async ({ page }) => {
  const d = new Date()
  const prec = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  const mois = `${prec.getFullYear()}-${String(prec.getMonth() + 1).padStart(2, '0')}-01`
  // Thauba clôture, par l'interface de la base comme le fait l'écran : seul son choix est écrit.
  const elle = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } })
  const { error: eCo } = await elle.auth.signInWithPassword({ email: foyer.elleEmail, password: MOT_DE_PASSE })
  if (eCo) throw new Error(eCo.message)
  const { data: poche } = await db.from('poche_epargne').select('id')
    .eq('household_id', foyer.householdId).limit(1).single()
  const { error } = await elle.rpc('cloture_le_mois', { le_mois: mois, la_poche: poche!.id })
  if (error) throw new Error(`cloture_le_mois : ${error.message}`)
  const { data: choix } = await db.from('cloture_choix').select('user_profile_id')
  expect(choix?.some(c => c.user_profile_id === foyer.userId), 'Kamil n’a aucun choix').toBe(false)

  await connecte(page)
  await page.goto(`/budget/${mois.slice(0, 7)}`)
  const recap = page.getByRole('region', { name: 'Ce qui reste' })
  await expect(recap.getByText(/est clôturé par Thauba\./)).toBeVisible({ timeout: 15_000 })
  const t = await recap.innerText()
  /* Le montant, recalculé depuis les tables brutes : mon revenu en vigueur À LA FIN de ce mois-là,
     moins mes parts figées des lignes du mois. */
  const fin = new Date(prec.getFullYear(), prec.getMonth() + 1, 0).getDate()
  const { data: revenus } = await db.from('revenu').select('net_mensuel_cents')
    .eq('user_profile_id', foyer.userId).lte('valid_from', `${mois.slice(0, 8)}${fin}`)
    .order('valid_from', { ascending: false }).limit(1)
  const { data: parts } = await db.from('depense_part').select('part_cents, depense!inner(mois)')
    .eq('user_profile_id', foyer.userId).eq('depense.mois', mois)
  const attendu = revenus![0].net_mensuel_cents - parts!.reduce((s, p) => s + p.part_cents, 0)
  expect(parts!.length, 'aucune part de Kamil ce mois-là : le montant ne prouverait rien').toBeGreaterThan(0)
  expect(t).toContain(attendu < 0 ? 'Il te manque' : 'Il t’est resté')
  expect(t, 'le reste affiché n’est pas celui de ses tables').toContain(montant(Math.abs(attendu)))
  expect(t).not.toContain('—')
  expect(t, 'le reste de Thauba ne devient pas le mien').not.toContain('999')
  expect(t).toContain('Calculé sur tes parts')
})
