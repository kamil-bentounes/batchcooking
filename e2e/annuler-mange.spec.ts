/**
 * Annuler « Je l'ai mangé » (migration 0129), joué de bout en bout : le bandeau de 6 secondes, le lien « Pas mangé ? Annuler »
 * et sa confirmation dans la carte, sur la semaine, le hub et l'accueil de la cuisine.
 *
 * À CHAQUE geste on RELIT LA BASE : ce que l'écran affiche ne prouve rien de ce qui est écrit. Le bandeau se joue en temps
 * réel (pas `page.clock` : il avance aussi l'horloge de supabase-js, cf. `horloge.ts`).
 *
 * Les captures (390, 320 et 1440 px) des quatre moments de la maquette sont posées dans `CAPTURES_ANNULER`.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'

const CAPTURES = process.env.CAPTURES_ANNULER ?? '.shots/annuler-mange'
const LASAGNES = 'Lasagnes au saumon-poireaux'
/* Le nom court des cartes (`nomCourt`). */
const COURT = 'Lasagnes saumon-poireaux'
const BURGER = 'Burger de feuilles de riz'
/* Une photo qui n'existe pas sur le réseau : la route ci-dessous la sert (l'image de l'appli, jamais un site). */
const PHOTO = 'https://photos.exemple.test/lasagnes.png'

test.use({ viewport: { width: 390, height: 844 } })
/* Chaque test sème son foyer : ils ne dépendent pas les uns des autres. */

let foyer: Foyer
let recetteLasagnes = ''

const jourLocal = (decalage: number) => {
  const d = new Date(); d.setDate(d.getDate() + decalage)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** Une heure du jour, il y a `decalage` jours : « 19 h 05 » hier. */
const aLHeure = (decalage: number, h: number, m: number) => {
  const d = new Date(); d.setDate(d.getDate() + decalage); d.setHours(h, m, 0, 0); return d.toISOString()
}

async function connecte(page: Page) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(foyer.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

async function capture(page: Page, nom: string) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${CAPTURES}/${nom}.png`, fullPage: true })
}
const debordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
/** Les trois largeurs de la maquette : 390, 320 (sans défilement horizontal), 1440 ; on revient à 390 px. */
async function captureAuxTroisLargeurs(page: Page, nom: string) {
  await capture(page, `${nom}-390`)
  await page.setViewportSize({ width: 320, height: 700 })
  expect(await debordement(page), `défilement horizontal à 320 px : ${nom}`).toBeLessThanOrEqual(0)
  await capture(page, `${nom}-320`)
  await page.setViewportSize({ width: 1440, height: 900 })
  await capture(page, `${nom}-1440`)
  await page.setViewportSize({ width: 390, height: 844 })
}

const portions = async (label?: string) => {
  const q = db.from('portion').select('*').eq('household_id', foyer.householdId).order('created_at')
  return (await (label ? q.eq('label', label) : q)).data!
}
const auFrigo = async (label: string) =>
  (await portions(label)).filter(p => p.location === 'frigo' && ['au_frais', 'decongelee'].includes(p.state)).length
const caseDe = async (qui: string, decalage: number, meal: string) =>
  ((await db.from('meal_slot').select('*').eq('household_id', foyer.householdId)).data!)
    .find(s => s.user_profile_id === qui && s.day === jourLocal(decalage) && s.meal === meal)
const repas = (page: Page, m: 'dejeuner' | 'diner') => page.locator(`[data-repas="${m}"]`)
const bandeau = (page: Page) => page.locator('[data-bandeau-annule]')

/**
 * Le foyer de chaque test : six lasagnes au frigo, deux burgers au congélateur.
 *  · aujourd'hui, midi et soir : lasagnes pour vous deux, rien de mangé ;
 *  · hier soir : les burgers, mangés par vous deux (la part est consommée par le trigger, comme en vrai).
 */
async function seme(o: { soirDeThaubaMange?: boolean; hierSansBarquette?: boolean } = {}) {
  const hh = foyer.householdId
  await db.from('meal_slot').delete().eq('household_id', hh)
  await db.from('portion').delete().eq('household_id', hh)
  const il = (jours: number) => new Date(Date.now() - jours * 86_400_000).toISOString()
  const ligne = (label: string, o2: Record<string, unknown>) => ({
    household_id: hh, label, grams: 500, kcal: 600, protein_g: 50, fiber_g: 5, carb_g: 60, fat_g: 20, ...o2,
  })
  const { data: lasagnes, error } = await db.from('portion').insert(Array.from({ length: 6 }, () => ligne(LASAGNES, {
    recipe_id: recetteLasagnes, grams: 784, kcal: 682, protein_g: 56, prepared_at: il(1),
  }))).select()
  if (error) throw new Error(error.message)
  const { data: burgers } = await db.from('portion').insert(Array.from({ length: 2 }, () => ligne(BURGER, {
    grams: 259, kcal: 501, protein_g: 36, location: 'congelateur', prepared_at: il(2), frozen_at: il(2),
  }))).select()
  const lesDeux = [foyer.userId, foyer.elleId]
  const pose = async (rows: Record<string, unknown>[]) => {
    const { error: e } = await db.from('meal_slot').insert(rows)
    if (e) throw new Error(e.message)
  }
  await pose(lesDeux.map((qui, i) => ({
    household_id: hh, user_profile_id: qui, day: jourLocal(0), meal: 'dejeuner', state: 'prevu', portion_id: lasagnes![i].id,
  })))
  await pose([
    { household_id: hh, user_profile_id: foyer.userId, day: jourLocal(0), meal: 'diner', state: 'prevu', portion_id: lasagnes![2].id },
    o.soirDeThaubaMange
      ? { household_id: hh, user_profile_id: foyer.elleId, day: jourLocal(0), meal: 'diner', state: 'mange', eaten_at: aLHeure(0, 19, 5), portion_id: lasagnes![3].id }
      : { household_id: hh, user_profile_id: foyer.elleId, day: jourLocal(0), meal: 'diner', state: 'prevu', portion_id: lasagnes![3].id },
  ])
  if (o.hierSansBarquette) {
    const { data: s } = await db.from('meal_slot').insert({
      household_id: hh, user_profile_id: foyer.userId, day: jourLocal(-1), meal: 'dejeuner', state: 'mange', eaten_at: aLHeure(-1, 12, 10),
    }).select().single()
    await db.from('meal_extra').insert({
      household_id: hh, meal_slot_id: s!.id, label: 'Sandwich du boulanger', kcal: 520, protein_g: 24, planifie: false,
    })
  } else {
    await pose(lesDeux.map((qui, i) => ({
      household_id: hh, user_profile_id: qui, day: jourLocal(-1), meal: 'diner', state: 'mange', eaten_at: aLHeure(-1, 19, 5), portion_id: burgers![i].id,
    })))
  }
}

test.beforeEach(async ({ page }) => {
  await page.route(PHOTO, route => route.fulfill({ path: 'public/icone-512.png', contentType: 'image/png' }))
})
test.beforeAll(async () => {
  foyer = await amorce({ cycleEtat: 'semaine', budget: false })
  const hh = foyer.householdId
  await db.from('stock_item').delete().eq('household_id', hh)
  const { data } = await db.from('recipe').insert({
    title: LASAGNES, yield_servings: 4, origin: 'manuelle', owner_household_id: hh, image_url: PHOTO,
  }).select().single()
  recetteLasagnes = data!.id
})
test.afterAll(async () => {
  if (!foyer) return
  await db.from('recipe').delete().eq('owner_household_id', foyer.householdId)
  await efface(foyer)
})

test('la semaine : « Je l’ai mangé », le bandeau, « Annuler » : la case repasse à prévu et la part revient au frigo', async ({ page }) => {
  test.setTimeout(120_000)
  await seme()
  await connecte(page)
  await page.goto('/semaine')
  const midi = repas(page, 'dejeuner')
  const carte = midi.getByRole('group', { name: `Midi : ${COURT}` })
  await expect(carte).toBeVisible({ timeout: 20_000 })
  expect(await auFrigo(LASAGNES)).toBe(6)
  await expect(carte.getByRole('button', { name: /Pas mangé/ })).toHaveCount(0)
  await captureAuxTroisLargeurs(page, '1-avant')

  await carte.getByRole('button', { name: 'Je l’ai mangé' }).click()
  /* Le bandeau, annoncé poliment : une région `status` qui dit « Noté : mangé. », et « Annuler » à côté. */
  await expect(bandeau(page)).toBeVisible({ timeout: 10_000 })
  await expect(bandeau(page).getByRole('status')).toHaveText('Noté : mangé.')
  await expect(carte.locator('[data-mange-puce]')).toHaveText('Mangé')
  expect((await caseDe(foyer.userId, 0, 'dejeuner'))!.state).toBe('mange')
  expect(await auFrigo(LASAGNES), 'la part consommée sort du frigo : 5 parts').toBe(5)
  /* Pas de lien tant que le bandeau est là. */
  await expect(carte.getByRole('button', { name: /Pas mangé/ })).toHaveCount(0)
  await captureAuxTroisLargeurs(page, '2-bandeau')
  const cible = (await bandeau(page).getByRole('button', { name: 'Annuler' }).boundingBox())!
  expect(cible.height, 'la cible d’« Annuler » fait 44 px au moins').toBeGreaterThanOrEqual(44)

  /* UN toucher, sans question. */
  await bandeau(page).getByRole('button', { name: 'Annuler' }).click()
  await expect(bandeau(page)).toHaveCount(0)
  await expect(carte.getByRole('button', { name: 'Je l’ai mangé' })).toBeVisible()
  await expect(carte.getByRole('button', { name: 'Je l’ai mangé' })).toBeFocused()
  await expect(carte.locator('[data-mange-puce]')).toHaveCount(0)
  const ma = (await caseDe(foyer.userId, 0, 'dejeuner'))!
  expect(ma).toMatchObject({ state: 'prevu', eaten_at: null })
  expect(await auFrigo(LASAGNES), 'la part est revenue : 6 parts').toBe(6)
  const sa = (await caseDe(foyer.elleId, 0, 'dejeuner'))!
  expect(sa.state, 'la case de Thauba n’a pas bougé').toBe('prevu')
  /* Elle se remange, avec la même part. */
  await carte.getByRole('button', { name: 'Je l’ai mangé' }).click()
  await expect.poll(async () => (await caseDe(foyer.userId, 0, 'dejeuner'))?.state, { timeout: 10_000 }).toBe('mange')
  expect((await caseDe(foyer.userId, 0, 'dejeuner'))!.portion_id).toBe(ma.portion_id)
})

test('le bandeau disparaît au bout de 6 secondes, et attend tant que le pointeur ou le focus est dessus ; ensuite, le lien', async ({ page }) => {
  test.setTimeout(120_000)
  await seme()
  await connecte(page)
  await page.goto('/semaine')
  const carte = repas(page, 'diner').getByRole('group', { name: `Soir : ${COURT}` })
  await expect(carte).toBeVisible({ timeout: 20_000 })
  await carte.getByRole('button', { name: 'Je l’ai mangé' }).click()
  await expect(bandeau(page)).toBeVisible({ timeout: 10_000 })

  /* Le pointeur dessus : le délai s'arrête (7 secondes passent, le bandeau reste). */
  await bandeau(page).hover()
  await page.waitForTimeout(7_000)
  await expect(bandeau(page)).toBeVisible()
  /* Le pointeur parti : il reste un peu moins de 6 secondes, puis il s'en va. */
  await page.mouse.move(5, 5)
  await expect(bandeau(page)).toBeVisible()
  await expect(bandeau(page)).toHaveCount(0, { timeout: 9_000 })
  expect((await caseDe(foyer.userId, 0, 'diner'))!.state, 'le repas reste mangé').toBe('mange')

  /* Ensuite : « Mangé à 12 h 40 » et le lien discret. */
  await expect(carte.locator('[data-mange-puce]')).toHaveText(/^Mangé à \d{1,2} h \d{2}$/)
  const lien = carte.getByRole('button', { name: /Pas mangé \? Annuler/ })
  await expect(lien).toBeVisible()
  await captureAuxTroisLargeurs(page, '3-lien')
  const hauteur = (await lien.boundingBox())!.height
  expect(hauteur, 'la cible du lien fait 44 px au moins').toBeGreaterThanOrEqual(44)
})

test('le focus sur le bandeau suspend aussi le délai', async ({ page }) => {
  test.setTimeout(120_000)
  await seme()
  await connecte(page)
  await page.goto('/semaine')
  const carte = repas(page, 'diner').getByRole('group', { name: `Soir : ${COURT}` })
  await expect(carte).toBeVisible({ timeout: 20_000 })
  await carte.getByRole('button', { name: 'Je l’ai mangé' }).click()
  await expect(bandeau(page)).toBeVisible({ timeout: 10_000 })
  await bandeau(page).getByRole('button', { name: 'Annuler' }).focus()
  await page.waitForTimeout(7_000)
  await expect(bandeau(page), 'le focus tient le bandeau').toBeVisible()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await expect(bandeau(page)).toHaveCount(0, { timeout: 9_000 })
})

test('le lien : la confirmation dans la carte, « Non, garder » ne change rien, « Oui, remettre » remet à prévu — sans toucher à Thauba', async ({ page }) => {
  test.setTimeout(120_000)
  await seme({ soirDeThaubaMange: true })
  await connecte(page)
  await page.goto('/semaine')
  const carte = repas(page, 'diner').getByRole('group', { name: `Soir : ${COURT}` })
  await expect(carte).toBeVisible({ timeout: 20_000 })
  await carte.getByRole('button', { name: 'Je l’ai mangé' }).click()
  await expect(bandeau(page)).toBeVisible({ timeout: 10_000 })
  await expect(bandeau(page)).toHaveCount(0, { timeout: 12_000 })
  const avantThauba = (await caseDe(foyer.elleId, 0, 'diner'))!
  expect(await auFrigo(LASAGNES)).toBe(4)

  await carte.getByRole('button', { name: /Pas mangé \? Annuler/ }).click()
  const question = carte.getByRole('group', { name: 'Remettre ce repas à « prévu » ?' })
  await expect(question).toBeVisible()
  await expect(question).toBeFocused()
  await expect(question).toContainText('Ta part redevient prévue et la barquette revient au frigo. Si elle venait du congélateur, elle y retourne.')
  /* Une confirmation DANS la carte : pas de fenêtre par-dessus. */
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await carte.locator('[data-annule="confirme"]').count()).toBe(1)
  await captureAuxTroisLargeurs(page, '4-confirmation')

  await question.getByRole('button', { name: 'Non, garder' }).click()
  await expect(question).toHaveCount(0)
  await expect(carte.getByRole('button', { name: /Pas mangé \? Annuler/ })).toBeFocused()
  expect((await caseDe(foyer.userId, 0, 'diner'))!.state, 'garder ne change rien').toBe('mange')
  expect(await auFrigo(LASAGNES)).toBe(4)

  await carte.getByRole('button', { name: /Pas mangé \? Annuler/ }).click()
  await carte.getByRole('button', { name: 'Oui, remettre' }).click()
  await expect(carte.getByRole('button', { name: 'Je l’ai mangé' })).toBeVisible({ timeout: 10_000 })
  const ma = (await caseDe(foyer.userId, 0, 'diner'))!
  expect(ma).toMatchObject({ state: 'prevu', eaten_at: null })
  expect(await auFrigo(LASAGNES), 'la part est revenue').toBe(5)
  const apresThauba = (await caseDe(foyer.elleId, 0, 'diner'))!
  expect(apresThauba, 'la case de Thauba est intacte').toMatchObject({ state: 'mange', eaten_at: avantThauba.eaten_at, portion_id: avantThauba.portion_id })
  expect((await portions(LASAGNES)).find(p => p.id === avantThauba.portion_id)!.state, 'sa part reste mangée').toBe('mangee')
})

test('un jour passé : le lien est là, la part revient au congélateur, la case de l’autre ne bouge pas', async ({ page }) => {
  test.setTimeout(120_000)
  await seme()
  await connecte(page)
  await page.goto('/semaine')
  await page.locator(`[data-jour="${jourLocal(-1)}"]`).click()
  const carte = repas(page, 'diner').getByRole('group', { name: `Soir : ${BURGER}` })
  await expect(carte).toBeVisible({ timeout: 20_000 })
  await expect(carte.locator('[data-mange-puce]')).toHaveText('Mangé à 19 h 05')
  await expect(carte).toContainText('Du congélateur, pour vous deux · mangé')
  /* Pas de bandeau : on n'a rien coché à l'instant. */
  await expect(bandeau(page)).toHaveCount(0)
  const avant = (await portions(BURGER))
  expect(avant.every(p => p.state === 'mangee')).toBe(true)
  await carte.getByRole('button', { name: /Pas mangé \? Annuler/ }).click()
  await carte.getByRole('button', { name: 'Oui, remettre' }).click()
  await expect(carte.getByRole('button', { name: 'Je l’ai mangé' })).toBeVisible({ timeout: 10_000 })
  const ma = (await caseDe(foyer.userId, -1, 'diner'))!
  expect(ma).toMatchObject({ state: 'prevu', eaten_at: null })
  const sa = (await caseDe(foyer.elleId, -1, 'diner'))!
  expect(sa.state).toBe('mange')
  const apres = await portions(BURGER)
  const maPart = apres.find(p => p.id === ma.portion_id)!
  expect(maPart, 'la part retourne au congélateur, comme avant').toMatchObject({ state: 'au_frais', location: 'congelateur' })
  expect(maPart.frozen_at).not.toBeNull()
  expect(apres.find(p => p.id === sa.portion_id)!.state, 'la part de Thauba reste mangée').toBe('mangee')
  /* Le bilan de la veille ne compte plus le repas de Kamil. */
  const { data: lignes } = await db.from('meal_slot').select('state, portion:portion_id(kcal)')
    .eq('household_id', foyer.householdId).eq('day', jourLocal(-1)).eq('user_profile_id', foyer.userId)
  expect(lignes!.filter(l => l.state === 'mange')).toHaveLength(0)
})

test('« autre chose » sans barquette : le lien dit seulement « prévu », et le « en plus » reste', async ({ page }) => {
  test.setTimeout(120_000)
  await seme({ hierSansBarquette: true })
  await connecte(page)
  await page.goto('/semaine')
  await page.locator(`[data-jour="${jourLocal(-1)}"]`).click()
  const carte = repas(page, 'dejeuner').getByRole('group', { name: 'Midi : Sandwich du boulanger' })
  await expect(carte).toBeVisible({ timeout: 20_000 })
  await carte.getByRole('button', { name: /Pas mangé \? Annuler/ }).click()
  const question = carte.getByRole('group', { name: 'Remettre ce repas à « prévu » ?' })
  await expect(question).toContainText('Ta part redevient prévue.')
  await expect(question).not.toContainText('barquette')
  await question.getByRole('button', { name: 'Oui, remettre' }).click()
  await expect(carte.getByRole('button', { name: 'Je l’ai mangé' })).toBeVisible({ timeout: 10_000 })
  const ma = (await caseDe(foyer.userId, -1, 'dejeuner'))!
  expect(ma).toMatchObject({ state: 'prevu', eaten_at: null, portion_id: null })
  const { data: extras } = await db.from('meal_extra').select('*').eq('meal_slot_id', ma.id)
  /* Les extras SONT le repas : la ligne reste, mais elle redevient « planifiée » : le bilan ne la compte plus. */
  expect(extras).toMatchObject([{ label: 'Sandwich du boulanger', kcal: 520, planifie: true }])
  /* La part de lasagnes ne bouge pas : il n'y avait pas de barquette à rendre. */
  expect(await auFrigo(LASAGNES)).toBe(6)
})

test('le hub : « Je l’ai mangé » sur la carte sombre, puis le bandeau et le lien sous la carte', async ({ page }) => {
  test.setTimeout(120_000)
  await seme()
  await connecte(page)
  const sombre = page.locator('[data-carte="repas"]')
  await expect(sombre).toContainText('Ce midi et ce soir', { timeout: 15_000 })
  await sombre.getByRole('button', { name: 'Je l’ai mangé' }).click()
  await expect(sombre).toContainText('Ce soir, pour vous deux', { timeout: 15_000 })
  await expect(bandeau(page)).toBeVisible()
  const lignes = page.getByRole('region', { name: 'Repas déjà notés' })
  await expect(lignes.getByRole('group', { name: `Midi : ${COURT}` })).toBeVisible()
  await captureAuxTroisLargeurs(page, 'hub-bandeau')
  expect(await auFrigo(LASAGNES)).toBe(5)

  /* Annuler : la carte sombre reprend le midi, et rien n'est resté noté. */
  await bandeau(page).getByRole('button', { name: 'Annuler' }).click()
  await expect(sombre).toContainText('Ce midi et ce soir', { timeout: 10_000 })
  await expect(lignes).toHaveCount(0)
  expect((await caseDe(foyer.userId, 0, 'dejeuner'))!.state).toBe('prevu')
  expect(await auFrigo(LASAGNES)).toBe(6)

  /* Puis le lien, une fois le bandeau passé. */
  await sombre.getByRole('button', { name: 'Je l’ai mangé' }).click()
  await expect(bandeau(page)).toBeVisible({ timeout: 10_000 })
  await expect(bandeau(page)).toHaveCount(0, { timeout: 12_000 })
  const lien = lignes.getByRole('button', { name: /Pas mangé \? Annuler/ })
  await expect(lien).toBeVisible()
  await captureAuxTroisLargeurs(page, 'hub-lien')
  await lien.click()
  await lignes.getByRole('button', { name: 'Oui, remettre' }).click()
  await expect(lignes).toHaveCount(0, { timeout: 10_000 })
  expect((await caseDe(foyer.userId, 0, 'dejeuner'))!.state).toBe('prevu')
  expect(await auFrigo(LASAGNES)).toBe(6)
})

test('l’accueil de la cuisine : le même bandeau et le même lien', async ({ page }) => {
  test.setTimeout(120_000)
  await seme()
  await connecte(page)
  await page.goto('/cuisine-accueil')
  const carte = page.locator('[data-carte="repas"]')
  await expect(carte).toBeVisible({ timeout: 20_000 })
  await carte.getByRole('button', { name: 'Je l’ai mangé' }).click()
  await expect(bandeau(page)).toBeVisible({ timeout: 10_000 })
  expect(await auFrigo(LASAGNES)).toBe(5)
  await bandeau(page).getByRole('button', { name: 'Annuler' }).click()
  await expect(bandeau(page)).toHaveCount(0)
  await expect(page.locator('[data-carte="repas"]').getByRole('button', { name: 'Je l’ai mangé' })).toBeVisible({ timeout: 10_000 })
  expect((await caseDe(foyer.userId, 0, 'dejeuner'))!.state).toBe('prevu')
  expect(await auFrigo(LASAGNES)).toBe(6)
})

test('le double appui : la réponse « pas noté mangé » de la base est un succès, sans erreur, et la part n’est pas rendue deux fois', async ({ page }) => {
  test.setTimeout(120_000)
  await seme()
  await connecte(page)
  await page.goto('/semaine')
  const carte = repas(page, 'diner').getByRole('group', { name: `Soir : ${COURT}` })
  await expect(carte).toBeVisible({ timeout: 20_000 })
  await carte.getByRole('button', { name: 'Je l’ai mangé' }).click()
  await expect(bandeau(page)).toHaveCount(0, { timeout: 15_000 })
  await carte.getByRole('button', { name: /Pas mangé \? Annuler/ }).click()
  /* L'autre téléphone vient d'annuler : à l'instant où notre demande part, la case est déjà « prévu » en base. */
  const c = (await caseDe(foyer.userId, 0, 'diner'))!
  await page.route('**/rest/v1/rpc/annule_mange', async route => {
    await db.from('meal_slot').update({ state: 'prevu', eaten_at: null }).eq('id', c.id)
    await db.from('portion').update({ state: 'au_frais' }).eq('id', c.portion_id!)
    await route.continue()
  })
  await carte.getByRole('button', { name: 'Oui, remettre' }).click()
  await expect(carte.getByRole('button', { name: 'Je l’ai mangé' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('alert'), 'le but est atteint : pas d’erreur').toHaveCount(0)
  expect(await auFrigo(LASAGNES), 'rien n’est rendu une seconde fois').toBe(6)
})

test('un bandeau qui apparaît sous un pointeur immobile ne reste pas en pause : il s’en va au bout de 6 secondes', async ({ page }) => {
  test.setTimeout(120_000)
  await seme()
  await connecte(page)
  await page.goto('/semaine')
  const carte = repas(page, 'dejeuner').getByRole('group', { name: `Midi : ${COURT}` })
  await expect(carte).toBeVisible({ timeout: 20_000 })
  await carte.getByRole('button', { name: 'Je l’ai mangé' }).click()
  await expect(bandeau(page)).toBeVisible({ timeout: 10_000 })
  /* Ce que le navigateur envoie à un élément qui apparaît sous un pointeur qui ne bouge pas : « pointerover / enter »
     et un « pointermove » SANS déplacement (movementX/Y = 0). Rien de tout cela n'est un survol. */
  await bandeau(page).evaluate(el => {
    const init = { bubbles: true, pointerType: 'mouse', movementX: 0, movementY: 0 }
    el.dispatchEvent(new PointerEvent('pointerover', init))
    el.dispatchEvent(new PointerEvent('pointerenter', { ...init, bubbles: false }))
    el.dispatchEvent(new PointerEvent('pointermove', init))
  })
  await expect(bandeau(page)).toHaveCount(0, { timeout: 12_000 })
})

test('un repas noté un autre jour que le sien dit quand il a été noté, pas « Mangé à 9 h 12 »', async ({ page }) => {
  test.setTimeout(120_000)
  await seme()
  /* Le dîner d'hier, noté ce matin à 9 h 12. */
  await db.from('meal_slot').update({ eaten_at: aLHeure(0, 9, 12) }).eq('household_id', foyer.householdId)
    .eq('user_profile_id', foyer.userId).eq('day', jourLocal(-1)).eq('meal', 'diner')
  await connecte(page)
  await page.goto('/semaine')
  await page.locator(`[data-jour="${jourLocal(-1)}"]`).click()
  const carte = repas(page, 'diner').getByRole('group', { name: `Soir : ${BURGER}` })
  await expect(carte.locator('[data-mange-puce]')).toHaveText(/^Noté mangé le \S+ \d{1,2} \S+ à 9 h 12$/, { timeout: 20_000 })
  await page.setViewportSize({ width: 320, height: 700 })
  expect(await debordement(page)).toBeLessThanOrEqual(0)
  await capture(page, 'jour-passe-saisie-320')
})

test('le hub : après l’annulation le focus revient à la carte du jour, et une erreur ne reste pas affichée', async ({ page }) => {
  test.setTimeout(120_000)
  await seme()
  await connecte(page)
  const sombre = page.locator('[data-carte="repas"]')
  await expect(sombre).toContainText('Ce midi et ce soir', { timeout: 15_000 })
  await sombre.getByRole('button', { name: 'Je l’ai mangé' }).click()
  const lignes = page.getByRole('region', { name: 'Repas déjà notés' })
  await expect(bandeau(page)).toBeVisible({ timeout: 10_000 })
  await expect(bandeau(page)).toHaveCount(0, { timeout: 12_000 })
  /* Une vraie panne : le réseau tombe sur l'annulation. L'erreur se dit tant que la ligne est là, puis le geste suivant l'efface. */
  await page.route('**/rest/v1/rpc/annule_mange', route => route.abort())
  await lignes.getByRole('button', { name: /Pas mangé \? Annuler/ }).click()
  await lignes.getByRole('button', { name: 'Oui, remettre' }).click()
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 })
  await page.unroute('**/rest/v1/rpc/annule_mange')
  await lignes.getByRole('button', { name: 'Oui, remettre' }).click()
  await expect(lignes).toHaveCount(0, { timeout: 10_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-carte]')), { timeout: 5_000 }).toBe(true)
  expect((await caseDe(foyer.userId, 0, 'dejeuner'))!.state).toBe('prevu')
})

test('l’accueil de la cuisine : le focus revient aussi, et « déjà remis » est un succès', async ({ page }) => {
  test.setTimeout(120_000)
  await seme()
  await connecte(page)
  await page.goto('/cuisine-accueil')
  const carte = page.locator('[data-carte="repas"]')
  await expect(carte).toBeVisible({ timeout: 20_000 })
  await carte.getByRole('button', { name: 'Je l’ai mangé' }).click()
  await expect(bandeau(page)).toHaveCount(0, { timeout: 15_000 })
  const lignes = page.getByRole('region', { name: 'Repas déjà notés' })
  await lignes.getByRole('button', { name: /Pas mangé \? Annuler/ }).click()
  const c = (await caseDe(foyer.userId, 0, 'dejeuner'))!
  await page.route('**/rest/v1/rpc/annule_mange', async route => {
    await db.from('meal_slot').update({ state: 'prevu', eaten_at: null }).eq('id', c.id)
    await db.from('portion').update({ state: 'au_frais' }).eq('id', c.portion_id!)
    await route.continue()
  })
  await lignes.getByRole('button', { name: 'Oui, remettre' }).click()
  await expect(lignes).toHaveCount(0, { timeout: 10_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-carte], main')), { timeout: 5_000 }).toBe(true)
})
