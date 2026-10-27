/**
 * Le hub « ma journée », joué au clic sur un foyer qui ressemble à celui de Kamil : des lasagnes au frigo (midi et
 * soir aujourd'hui pour vous deux, demain midi), des pizzas, des wraps au congélateur (dans deux jours), et un budget.
 *
 * Ce que le banc prouve, et qu'un rendu en chaîne ne dit pas : la carte du jour avec sa photo, sa note et ses gestes ;
 * « Ce qui vient » et la pastille « à sortir » ; les deux chiffres du frigo ; la tuile du budget ; les deux entrées
 * (« Cuisine », « Budget ») ; « Je l'ai mangé » ÉCRIT en base ; la mise en page (une colonne de cartes puis deux au
 * téléphone, 7/5 au bureau) ; le budget d'avant l'arrivée avec son compte à rebours ; l'honnêteté au chargement.
 *
 * ⚠️ LOCAL, ET RIEN D'AUTRE.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, db, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'

const CAPTURES = process.env.CAPTURES_HUB ?? '.shots/hub'
const LASAGNES = 'Lasagnes au saumon-poireaux'
const PIZZA = 'Pizza vietnamienne protéinée'
const WRAP = 'Wrap'
/** Une photo en https (la base n'en accepte pas d'autre), servie par le banc : un GIF d'un pixel, sans réseau. */
const PHOTO = 'https://exemple.fr/photos/lasagnes.gif'
const GIF = Buffer.from('R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64')
const JOUR_MS = 24 * 3_600_000

test.describe.configure({ mode: 'serial' })

let foyer: Foyer
let courses: Foyer | null = null

const jourLocal = (decalage: number) => {
  const d = new Date(); d.setDate(d.getDate() + decalage)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const nomDuJour = (decalage: number) => {
  const d = new Date(); d.setDate(d.getDate() + decalage)
  return d.toLocaleDateString('fr-FR', { weekday: 'long' })
}

async function connecte(page: Page, email: string) {
  await page.route('https://exemple.fr/photos/**', route => route.fulfill({ contentType: 'image/gif', body: GIF }))
  await page.goto('/')
  await page.getByLabel('Ton e-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

async function capture(page: Page, nom: string) {
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${CAPTURES}/${nom}.png`, fullPage: true })
}

/** Les cibles de moins de 44 px, visibles et touchables : un pouce doit les trouver. */
const ciblesPetites = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>('button, a[href]')]
    .filter(c => getComputedStyle(c).visibility !== 'hidden' && !c.closest('[inert]'))
    .map(c => ({ c, r: c.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
    .map(({ c, r }) => `${(c.getAttribute('aria-label') || c.textContent || '?').trim().slice(0, 30)} ${Math.round(r.width)}×${Math.round(r.height)}`))

const portions = async (f = foyer) =>
  (await db.from('portion').select('*').eq('household_id', f.householdId)).data!
const cases = async (f = foyer) =>
  (await db.from('meal_slot').select('*').eq('household_id', f.householdId)).data!

test.beforeAll(async () => {
  const url = process.env.VITE_SUPABASE_URL ?? ''
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(`Ce banc ne se joue qu'en local. Base visée : ${url || '(non renseignée)'}.`)
  }
  foyer = await amorce({ cycleEtat: 'semaine' })
  const hh = foyer.householdId
  await db.from('meal_slot').delete().eq('household_id', hh)
  await db.from('portion').delete().eq('household_id', hh)
  await db.from('stock_item').delete().eq('household_id', hh)

  const recettes: Record<string, string> = {}
  for (const titre of [LASAGNES, PIZZA, WRAP]) {
    const { data } = await db.from('recipe').insert({
      title: titre, yield_servings: 4, origin: 'manuelle', owner_household_id: hh,
      image_url: titre === LASAGNES ? PHOTO : null,
    }).select().single()
    recettes[titre] = data!.id
  }
  const il = (jours: number) => new Date(Date.now() - jours * JOUR_MS).toISOString()
  const ajoute = async (titre: string, n: number, o: Record<string, unknown>) =>
    (await db.from('portion').insert(Array.from({ length: n }, () => ({
      household_id: hh, cycle_id: foyer.cycleId, recipe_id: recettes[titre], label: titre, grams: 500, kcal: 600,
      protein_g: 50, fiber_g: 5, carb_g: 60, fat_g: 20, ...o,
    }))).select()).data!
  const las = await ajoute(LASAGNES, 6, { prepared_at: il(1) })
  const piz = await ajoute(PIZZA, 2, { prepared_at: il(2) })
  const wra = await ajoute(WRAP, 4, { location: 'congelateur', prepared_at: il(1), frozen_at: il(1) })

  /* Deux personnes : Kamil (userId) et Thauba (elleId). Une barquette par personne et par repas. */
  const qui = [foyer.userId, foyer.elleId]
  const pose = async (decalage: number, meal: string, parts: { id: string }[]) =>
    db.from('meal_slot').insert(qui.map((q, i) => ({
      household_id: hh, cycle_id: foyer.cycleId, user_profile_id: q, day: jourLocal(decalage), meal,
      portion_id: parts[i].id, state: 'prevu',
    }))).select()
  for (const r of [
    await pose(0, 'dejeuner', las.slice(0, 2)), await pose(0, 'diner', las.slice(2, 4)),
    await pose(1, 'dejeuner', las.slice(4, 6)), await pose(1, 'diner', piz),
    await pose(2, 'dejeuner', wra.slice(0, 2)), await pose(2, 'diner', wra.slice(2, 4)),
  ]) expect(r.error, r.error?.message).toBeNull()
})
test.afterAll(async () => {
  for (const f of [foyer, courses]) {
    if (!f) continue
    await db.from('recipe').delete().eq('owner_household_id', f.householdId)
    await efface(f)
  }
})

test('la journée au téléphone : la carte, ce qui vient, le frigo, le budget, les raccourcis', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await connecte(page, foyer.email)

  /* La date en grand, et la phrase tirée du cycle et des barquettes (12 barquettes, 8 au frigo). */
  await expect(page.locator('[data-jour="date"]')).toHaveText(new RegExp(
    `^${nomDuJour(0)} ${new Date().getDate()} `, 'i'))
  await expect(page.locator('[data-jour="phrase"]')).toHaveText('La semaine tourne : 12 barquettes, dont 8 au frigo.')

  /* La carte sombre : quand, pour qui, le nom, la photo, la note, les deux gestes. */
  const carte = page.locator('[data-carte="repas"]')
  await expect(carte).toContainText('Ce midi et ce soir, pour vous deux')
  await expect(carte.getByRole('heading', { name: LASAGNES })).toBeVisible()
  await expect(carte.locator('img')).toHaveCount(1)
  await expect(carte.locator('[data-note="plat"]')).toContainText(/^Au frigo, 6 parts\. Elles périment .+ : demain midi finit le plat\.$/)
  await expect(carte.getByRole('button', { name: 'Je l’ai mangé' })).toBeVisible()
  await expect(carte.getByRole('button', { name: 'Changer' })).toBeVisible()
  await expect(carte.getByRole('button', { name: 'Je les sors' })).toHaveCount(0)

  /* Ce qui vient : trois lignes, la vignette ou le picto, le moment, le nom, et « à sortir » sur les wraps seuls. */
  const vient = page.locator('[data-section="a-venir"]')
  const lignes = vient.locator('li')
  await expect(lignes).toHaveCount(3)
  await expect(lignes.nth(0)).toContainText('Demain midi')
  await expect(lignes.nth(0)).toContainText(LASAGNES)
  await expect(lignes.nth(0).locator('img')).toHaveCount(1)
  await expect(lignes.nth(1)).toContainText(`Demain soir`)
  await expect(lignes.nth(1)).toContainText(PIZZA)
  await expect(lignes.nth(1).locator('svg')).toHaveCount(1)
  await expect(lignes.nth(2)).toContainText(new RegExp(`${nomDuJour(2)}, midi et soir`, 'i'))
  await expect(lignes.nth(2)).toContainText(WRAP)
  await expect(vient.locator('[data-pastille="a-sortir"]')).toHaveCount(1)
  await expect(lignes.nth(2).locator('[data-pastille="a-sortir"]')).toHaveText(`à sortir ${nomDuJour(1)}`)
  await expect(vient.getByRole('button', { name: 'La semaine' })).toBeVisible()

  /* Le frigo : les deux chiffres teintés, sans le dessin au téléphone. */
  const frigo = page.locator('[data-tuile="frigo"]')
  await expect(frigo.locator('[data-compte="frigo"]')).toContainText('8')
  await expect(frigo.locator('[data-compte="frigo"]')).toContainText('parts au frigo')
  await expect(frigo.locator('[data-compte="congelateur"]')).toContainText('4')
  await expect(frigo.locator('[data-compte="congelateur"]')).toContainText('au congélateur')
  await expect(frigo.locator('[data-frigo="mini"]')).toBeHidden()

  /* Le budget : le chiffre du mois, la barre, la pastille ; la carte longue est cachée. */
  const budget = page.locator('[data-tuile="budget"]')
  await expect(budget).toContainText(/Il te (reste|manque)|il te (reste|manque)/)
  await expect(budget.locator('[data-barre="budget"]')).toBeVisible()
  await expect(budget.locator('[data-pastille="budget"]')).toBeVisible()

  /* Les raccourcis. */
  await expect(page.getByRole('button', { name: 'Noter une dépense' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Envie spéciale' })).toBeVisible()

  /* L'ordre et les deux colonnes : la carte sur toute la largeur, frigo et budget côte à côte, puis le reste. */
  const boite = async (sel: string) => (await page.locator(sel).first().boundingBox())!
  const [c, f, b, v, r] = await Promise.all([
    boite('[data-carte="repas"]'), boite('[data-tuile="frigo"]'), boite('[data-tuile="budget"]'),
    boite('[data-section="a-venir"]'), boite('nav[aria-label="Raccourcis"]')])
  expect(c.width, 'la carte du jour prend toute la largeur').toBeGreaterThan(350)
  expect(Math.abs(f.y - b.y), 'frigo et budget sur la même ligne').toBeLessThan(2)
  expect(f.x).toBeLessThan(b.x)
  expect(f.y).toBeGreaterThan(c.y + c.height)
  expect(v.y).toBeGreaterThan(Math.max(f.y + f.height, b.y + b.height) - 1)
  expect(r.y).toBeGreaterThan(v.y + v.height - 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth), 'pas de défilement horizontal')
    .toBeLessThanOrEqual(390)
  expect(await ciblesPetites(page), 'cibles de moins de 44 px').toEqual([])
  await capture(page, 'hub-semaine-390')
})

test('les deux entrées : « Cuisine » mène à l’accueil de la cuisine, « Budget » à l’écran du mois', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await connecte(page, foyer.email)
  await expect(page.getByRole('button', { name: /^Cuisine/ })).toHaveCount(1)
  await page.getByRole('button', { name: /^Cuisine/ }).click()
  await expect(page).toHaveURL(/\/cuisine-accueil$/)
  await page.goBack()
  await expect(page.getByRole('button', { name: /Budget/ }).first()).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /Budget/ }).first().click()
  await expect(page).toHaveURL(/\/budget$/)
  await page.goBack()
  /* Les autres portes : le frigo, la semaine, les raccourcis. */
  await page.getByRole('button', { name: 'Ouvrir le frigo' }).click()
  await expect(page).toHaveURL(/\/frigo$/)
  await page.goBack()
  await page.locator('[data-section="a-venir"]').getByRole('button', { name: 'La semaine' }).click()
  await expect(page).toHaveURL(/\/semaine$/)
  await page.goBack()
  await page.getByRole('button', { name: 'Envie spéciale' }).click()
  await expect(page).toHaveURL(/\/inventer$/)
  await page.goBack()
  await page.getByRole('button', { name: 'Noter une dépense' }).click()
  await expect(page).toHaveURL(/\/budget$/)
})

test('« Changer » mène au repas, sur la semaine', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await connecte(page, foyer.email)
  await page.locator('[data-carte="repas"]').getByRole('button', { name: 'Changer' }).click()
  await expect(page).toHaveURL(new RegExp(`/semaine\\?jour=${jourLocal(0)}&repas=dejeuner$`))
})

test('au bureau : deux colonnes 7/5, le petit frigo, la carte complète du budget', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await connecte(page, foyer.email)
  await expect(page.locator('[data-carte="repas"]')).toBeVisible()

  const boite = async (sel: string) => (await page.locator(sel).first().boundingBox())!
  const [c, v, f, b, r] = await Promise.all([
    boite('[data-carte="repas"]'), boite('[data-section="a-venir"]'), boite('[data-tuile="frigo"]'),
    boite('[data-tuile="budget"]'), boite('nav[aria-label="Raccourcis"]')])
  /* À gauche la carte et ce qui vient, à droite le frigo, le budget et les raccourcis. */
  expect(Math.abs(c.x - v.x)).toBeLessThan(2)
  expect(Math.abs(f.x - b.x)).toBeLessThan(2)
  expect(Math.abs(f.x - r.x)).toBeLessThan(2)
  expect(f.x).toBeGreaterThan(c.x + c.width)
  expect(v.y).toBeGreaterThan(c.y + c.height - 1)
  expect(b.y).toBeGreaterThan(f.y + f.height - 1)
  expect(r.y).toBeGreaterThan(b.y + b.height - 1)
  /* 7fr / 5fr, dans un conteneur d'environ 1180 px. */
  const rapport = c.width / f.width
  expect(rapport, `7/5 attendu, vu ${rapport.toFixed(2)}`).toBeGreaterThan(1.25)
  expect(rapport).toBeLessThan(1.55)
  expect(f.x + f.width - c.x, 'conteneur de 1180 px').toBeLessThanOrEqual(1180)
  expect(f.x + f.width - c.x).toBeGreaterThan(1100)

  /* Le petit frigo inox à côté des deux chiffres ; la carte complète du budget. */
  await expect(page.locator('[data-tuile="frigo"] [data-frigo="mini"]')).toBeVisible()
  const budget = page.locator('[data-tuile="budget"]')
  await expect(budget.getByText('Ouvrir', { exact: true })).toBeVisible()
  await expect(budget.getByText(/^Charges/)).toBeVisible()
  await expect(budget.locator('[data-barre="budget"]')).toBeVisible()
  await expect(budget.locator('[data-pastille="budget"]')).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440)
  await capture(page, 'hub-semaine-1440')
})

test('à 320 px : rien ne déborde', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 320, height: 640 })
  await connecte(page, foyer.email)
  await expect(page.locator('[data-carte="repas"]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  expect(await ciblesPetites(page), 'cibles de moins de 44 px').toEqual([])
  await capture(page, 'hub-semaine-320')
})

test('« Je l’ai mangé » est ÉCRIT en base, et la carte passe au repas suivant', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await connecte(page, foyer.email)
  const carte = page.locator('[data-carte="repas"]')
  await expect(carte).toContainText('Ce midi et ce soir')
  /* « Ta journée » : rien de mangé, deux repas pas encore notés, contre les objectifs du jour (2 200 kcal, 150 g). */
  const journee = page.locator('[data-tuile="journee"]')
  await expect(journee).toContainText('0kcal, sur 2 200')
  await expect(journee).toContainText('0g de protéines, sur 150')
  await expect(journee).toContainText('2 repas pas encore notés aujourd’hui.')
  await carte.getByRole('button', { name: 'Je l’ai mangé' }).click()
  /* La barquette du midi (600 kcal, 50 g) compte tout de suite. */
  await expect(journee).toContainText('600kcal, sur 2 200', { timeout: 15_000 })
  await expect(journee).toContainText('50g de protéines, sur 150')
  await expect(journee).toContainText('1 repas pas encore noté aujourd’hui.')
  /* Le repas du midi est mangé ; reste le soir, pour vous deux. */
  await expect(carte).toContainText('Ce soir, pour vous deux', { timeout: 15_000 })
  await expect(carte).not.toContainText('Ce midi')
  const kamil = (await cases()).filter(c => c.user_profile_id === foyer.userId)
  expect(kamil.filter(c => c.state === 'mange').map(c => c.meal), 'le midi de Kamil est mangé en base').toEqual(['dejeuner'])
  expect((await portions()).filter(p => p.state === 'mangee'), 'une barquette consommée').toHaveLength(1)
  /* Les deux chiffres suivent. */
  await expect(page.locator('[data-tuile="frigo"] [data-compte="frigo"]')).toContainText('7')
  await capture(page, 'hub-apres-le-midi-390')
})

test('le budget d’avant l’arrivée : le mois type et le compte à rebours en jours', async ({ page }) => {
  test.setTimeout(120_000)
  const d = new Date()
  const premier = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  const iso = `${premier.getFullYear()}-${String(premier.getMonth() + 1).padStart(2, '0')}-01`
  const nom = premier.toLocaleDateString('fr-FR', { month: 'long' })
  const jours = Math.round((premier.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / JOUR_MS)
  await db.from('user_profile').update({ entre_le: iso }).in('id', [foyer.userId, foyer.elleId])
  await page.setViewportSize({ width: 390, height: 844 })
  await connecte(page, foyer.email)
  const budget = page.locator('[data-tuile="budget"]')
  await expect(budget.locator('[data-pastille="budget"]')).toHaveText(jours > 1 ? `Dans ${jours} jours` : 'Demain', { timeout: 15_000 })
  await expect(budget).toContainText('chaque mois')
  await expect(budget).not.toContainText(/en octobre|en novembre|en décembre|Rien de posé|Ajoute ton revenu/)
  await expect(budget.locator('[data-barre="budget"]')).toBeVisible()
  await capture(page, 'hub-avant-arrivee-390')

  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(budget.locator('[data-decompte="budget"]')).toBeVisible()
  await expect(budget.locator('[data-decompte="budget"]')).toContainText(
    new RegExp(`^${jours}\\s*${jours > 1 ? 'jours' : 'jour'} avant ton premier mois, le 1er ${nom}\\.$`))
  await expect(budget).toContainText('Ton mois type, chaque mois')
  await expect(budget).toContainText(/Charges/)
  await expect(budget).toContainText(/Il te (reste|manque)/)
  await capture(page, 'hub-avant-arrivee-1440')
})

test('au chargement, rien ne s’affirme : ni « Rien de prévu », ni « aucune barquette », ni « Rien de posé »', async ({ page }) => {
  test.setTimeout(120_000)
  await db.from('user_profile').update({ entre_le: `${new Date().getFullYear()}-01-01` })
    .in('id', [foyer.userId, foyer.elleId])
  /* La semaine, les barquettes et les repas posés arrivent lentement : pendant l'attente, le hub se tait. */
  await page.route(/\/rest\/v1\/(portion|meal_slot|depense)\b/, async route => {
    await new Promise(r => setTimeout(r, 2_500))
    await route.continue()
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('https://exemple.fr/photos/**', route => route.fulfill({ contentType: 'image/gif', body: GIF }))
  await page.goto('/')
  await page.getByLabel('Ton e-mail').fill(foyer.email)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
  const corps = page.locator('main')
  await page.waitForTimeout(800)
  for (const faux of [/Rien de prévu/, /aucune barquette/, /Rien de posé/, /Rien n’est posé/, /\b0 parts?\b/, /Je l’ai mangé/]) {
    await expect(corps, String(faux)).not.toContainText(faux)
  }
  await expect(page.locator('[data-tuile="frigo"]')).toContainText('…')
  await capture(page, 'hub-chargement-390')
  /* Et la lecture revenue, tout se dit. */
  await expect(page.locator('[data-carte="repas"]')).toContainText(LASAGNES, { timeout: 15_000 })
  await expect(page.locator('[data-tuile="frigo"] [data-compte="frigo"]')).toContainText('7')
})

test('hors semaine, la carte dit le geste du moment, avec son bouton', async ({ page }) => {
  test.setTimeout(120_000)
  courses = await amorce({ cycleEtat: 'courses', budget: false })
  await page.setViewportSize({ width: 390, height: 844 })
  await connecte(page, courses.email)
  const carte = page.locator('[data-carte="geste"]')
  await expect(carte).toContainText('Votre liste est prête', { timeout: 15_000 })
  await expect(page.locator('[data-jour="phrase"]')).toContainText('Votre liste est prête :')
  await expect(page.getByRole('button', { name: 'Je l’ai mangé' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Cuisine/ })).toHaveCount(1)
  await capture(page, 'hub-courses-390')
  await carte.getByRole('button', { name: 'Je pars faire les courses' }).click()
  await expect(page).toHaveURL(/\/magasin$/)
})
