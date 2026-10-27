/**
 * Le dressage et « On range », refaits d'après la maquette `dressage.html` (27/10/2026).
 *
 * Ce banc ne rejoue pas le rangement de bout en bout (`ranger.spec.ts` le fait, base relue) : il
 * regarde ce que la refonte ajoute — le repère d'étapes, le nombre en grand, la rangée de compteurs,
 * la photo de chaque recette, les lignes par personne, le complément, les compteurs « au frigo » et
 * « au congélateur » — et chaque état de la planche : chargement, panne, rien à dresser, aucune session,
 * Thauba qui ouvre l'écran, rangement déjà fait.
 *
 * Les captures (390, 320 et 1440 px) vont dans `CAPTURES_DRESSAGE`, à regarder à côté des PNG de la maquette.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'

const CAPTURES = process.env.CAPTURES_DRESSAGE ?? '.shots/dressage'
const TAILLES = [{ nom: '390', w: 390, h: 844 }, { nom: '320', w: 320, h: 700 }, { nom: '1440', w: 1440, h: 900 }]

/** Une photo de plat, servie par la route : l'adresse n'existe pas, l'image oui. */
const PHOTO = 'https://photos.exemple.test/dahl.svg'
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#D9A441"/><circle cx="64" cy="64" r="40" fill="#B3402F"/></svg>`

let foyer: Foyer
const foyers: Foyer[] = []

async function aliment(mot: string): Promise<string> {
  const { data } = await db.from('food').select('id').ilike('name', `%${mot}%`).limit(1)
  if (data?.[0]) return data[0].id
  const { data: n } = await db.from('food').select('id').limit(1)
  return n![0].id
}

/** Un foyer au dressage, vidé de ses barquettes, avec trois recettes dont une photographiée et une mal quantifiée. */
async function foyerADresser(): Promise<Foyer> {
  const f = await amorce({ cycleEtat: 'dressage' })
  foyers.push(f)
  await db.from('meal_slot').delete().eq('cycle_id', f.cycleId)
  await db.from('portion').delete().eq('cycle_id', f.cycleId)

  const poireau = await aliment('poireau')
  const tortilla = await aliment('tortilla')
  const lait = await aliment('lait écrémé')
  const courgette = await aliment('courgette')

  const { data: cr } = await db.from('cycle_recipe').select('recipe_id, recipe:recipe_id(title)').eq('cycle_id', f.cycleId)
  const parTitre = new Map(cr!.map(c => [(c.recipe as unknown as { title: string }).title, c.recipe_id]))
  const dahl = parTitre.get('Dahl de lentilles corail')!
  const poulet = parTitre.get('Poulet rôti aux herbes')!
  await db.from('recipe_ingredient').insert([
    { recipe_id: dahl, ordinal: 3, raw_text: '1,5 kg de poireaux', food_id: poireau, qty: 1500, unit: 'g', grams_reference: 1500 },
    { recipe_id: dahl, ordinal: 4, raw_text: '20 tortillas', food_id: tortilla, qty: 20, unit: null, grams_reference: 800 },
    { recipe_id: poulet, ordinal: 3, raw_text: '75 cl de lait', food_id: lait, qty: 750, unit: 'ml', grams_reference: 750 },
  ])
  await db.from('recipe').update({ image_url: PHOTO }).eq('id', dahl)

  /* Une recette dont presque rien n'est chiffré : des grammes, mais des lignes sans valeurs nutritives. */
  const { data: wrap } = await db.from('recipe').insert({
    title: 'Wrap du jour', yield_servings: 6, total_time_min: 20, origin: 'importee',
    source_name: 'exemple.fr', source_url: `https://exemple.fr/wrap-${Date.now()}`, plannable: true, freezable: true,
  }).select().single()
  await db.from('recipe_ingredient').insert([
    { recipe_id: wrap!.id, ordinal: 1, raw_text: '500 g de courgettes', food_id: courgette, qty: 500, unit: 'g', grams_reference: 500 },
    { recipe_id: wrap!.id, ordinal: 2, raw_text: 'une sauce maison', food_id: null, qty: 300, unit: 'g', grams_reference: 300 },
    { recipe_id: wrap!.id, ordinal: 3, raw_text: 'des herbes', food_id: null, qty: 100, unit: 'g', grams_reference: 100 },
    { recipe_id: wrap!.id, ordinal: 4, raw_text: 'une garniture', food_id: null, qty: 200, unit: 'g', grams_reference: 200 },
  ])
  await db.from('cycle_recipe').insert({ cycle_id: f.cycleId, household_id: f.householdId, recipe_id: wrap!.id, servings: 6, position: 2 })
  await db.from('cycle_recipe').update({ position: 0 }).eq('cycle_id', f.cycleId).eq('recipe_id', dahl)
  await db.from('cycle_recipe').update({ position: 1 }).eq('cycle_id', f.cycleId).eq('recipe_id', poulet)
  return f
}

test.beforeAll(async () => { foyer = await foyerADresser() })
test.afterAll(async () => { for (const f of foyers) await efface(f) })

async function connecte(page: Page, email: string) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

/** La photo du plat : une route, jamais le réseau. */
async function simulePhoto(page: Page) {
  await page.route(PHOTO, route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG }))
}

async function captures(page: Page, nom: string) {
  const { width, height } = page.viewportSize()!
  for (const t of TAILLES) {
    await page.setViewportSize({ width: t.w, height: t.h })
    await page.waitForTimeout(350)
    await page.screenshot({ path: `${CAPTURES}/${nom}-${t.nom}.png`, fullPage: true })
  }
  await page.setViewportSize({ width, height })
}

/** Rien ne déborde sur le côté, et chaque cible tactile fait 44 px au moins. */
async function tientEnLargeur(page: Page, ou: string) {
  const largeurs = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, fenetre: window.innerWidth }))
  expect(largeurs.doc, `${ou} : défilement horizontal`).toBeLessThanOrEqual(largeurs.fenetre)
}
async function ciblesAssezGrandes(page: Page, ou: string) {
  const petits = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('button, input, a[href]')]
    .map(e => ({ e, r: e.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
    .map(({ e, r }) => `${e.getAttribute('aria-label') || e.textContent} ${Math.round(r.width)}×${Math.round(r.height)}`))
  expect(petits, `${ou} : des cibles trop petites pour un pouce`).toEqual([])
}

test.describe('sur un téléphone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('dresser : le repère, le nombre en grand, les compteurs, les cartes et leurs lignes', async ({ page }) => {
    test.setTimeout(120_000)
    await simulePhoto(page)
    await connecte(page, foyer.email)
    await page.goto('/dressage')

    /* Le nombre en grand : le titre le dit en toutes lettres, et sa phrase explique pourquoi on pèse. */
    const titre = page.getByRole('heading', { level: 1 })
    await expect(titre).toHaveText(/^Dresse\s+\d+\s+barquettes$/, { timeout: 20_000 })
    const total = Number((await titre.innerText()).match(/\d+/)![0])
    expect(total, '4 + 4 + 6 parts à dresser').toBe(14)
    await expect(page.getByText('Remplis chacune au poids indiqué : c’est ce qui rend les parts justes.')).toBeVisible()

    /* Le repère d'étapes : « Dresser » est l'étape en cours. */
    const etapes = page.getByRole('list', { name: 'Étapes du dressage' })
    await expect(etapes.getByRole('listitem').nth(0)).toHaveAttribute('aria-current', 'step')
    await expect(etapes.getByRole('listitem').nth(1)).not.toHaveAttribute('aria-current', 'step')
    await expect(etapes.getByRole('listitem')).toHaveText(['1Dresser', '2Ranger'])

    /* Une rangée de compteurs, un par recette, dans l'ordre du cycle. */
    const compteurs = page.getByRole('list', { name: 'Barquettes par recette' }).getByRole('listitem')
    await expect(compteurs).toHaveCount(3)
    await expect(compteurs.nth(0)).toHaveAccessibleName('4 barquettes de Dahl de lentilles corail')
    await expect(compteurs.nth(2)).toHaveAccessibleName('6 barquettes de Wrap du jour')
    await expect(compteurs.nth(0)).toContainText('Dahl')

    /* Une carte par recette : la photo quand elle en a une, la pastille neutre sinon. */
    const dahl = page.getByRole('region', { name: 'Dahl de lentilles corail' })
    await expect(dahl.getByText('4 barquettes à remplir')).toBeVisible()
    await expect(dahl.locator('img')).toHaveCount(1)
    await expect(dahl.locator('img')).toHaveAttribute('src', PHOTO)
    const poulet = page.getByRole('region', { name: 'Poulet rôti aux herbes' })
    await expect(poulet.locator('img')).toHaveCount(0)
    await expect(poulet.locator('[data-photo="neutre"]')).toHaveCount(1)

    /* Une ligne par personne : la pastille, « n × g », « pour … », les kcal et les protéines. */
    await expect(dahl.getByText(/^2 × \d+ g$/)).toHaveCount(2)
    await expect(dahl.getByText('pour Kamil', { exact: true })).toBeVisible()
    await expect(dahl.getByText('pour Thauba · parts égales', { exact: true })).toBeVisible()
    await expect(dahl.getByText(/^\d+ kcal$/)).toHaveCount(2)
    await expect(dahl.getByText(/g de prot\.$/)).toHaveCount(2)

    /* La phrase qui explique le calcul, toujours là. */
    await expect(dahl.locator('p').last()).not.toBeEmpty()

    /* Thauba n'a pas d'objectifs : on le dit, son prénom en gras, sans le bouton (ce n'est pas Kamil qui les fixe). */
    const avis = page.getByRole('status').filter({ hasText: 'n’a pas encore fixé ses objectifs' })
    await expect(avis).toHaveText('Thauba n’a pas encore fixé ses objectifs : ses barquettes sont dressées à parts égales.')
    await expect(avis.locator('b')).toHaveText('Thauba')
    await expect(page.getByRole('button', { name: 'Fixe tes objectifs' })).toHaveCount(0)

    /* Une recette mal quantifiée le dit à sa place. */
    const wrap = page.getByRole('region', { name: 'Wrap du jour' })
    await expect(wrap.getByText('Recette mal quantifiée : les parts sont égales, faute de mieux.')).toBeVisible()

    /* Un seul bouton, et sa phrase. */
    await expect(page.getByRole('button', { name: 'C’est dressé' })).toHaveCount(1)
    await expect(page.getByText('Ensuite, tu choisis ce qui reste au frigo et ce qui part au congélateur.')).toBeVisible()

    /* Le « ? » est dans l'en-tête : un seul, et celui de l'écran. */
    await expect(page.getByRole('button', { name: 'Poser une question à l’aide' })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Mon profil' })).toHaveText('K')

    await ciblesAssezGrandes(page, 'dresser')
    await captures(page, 'dresser')
    for (const t of TAILLES.slice(1)) {
      await page.setViewportSize({ width: t.w, height: t.h })
      await tientEnLargeur(page, `dresser à ${t.nom}`)
    }
  })

  test('« On range » : les compteurs en valeur, la photo, le frigo, et le retour au dressage', async ({ page }) => {
    test.setTimeout(120_000)
    await simulePhoto(page)
    await connecte(page, foyer.email)
    await page.goto('/dressage')
    await page.getByRole('button', { name: 'C’est dressé' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'On range' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'On range' })).toBeFocused()
    const etapes = page.getByRole('list', { name: 'Étapes du dressage' }).getByRole('listitem')
    await expect(etapes.nth(1)).toHaveAttribute('aria-current', 'step')
    await expect(etapes.nth(0)).not.toHaveAttribute('aria-current', 'step')
    await expect(page.getByText('14 barquettes pour vous deux. Choisis ce qui reste au frigo : le reste part au congélateur.')).toBeVisible()

    /* Les deux compteurs, en valeur : 8 au frigo (quatre jours à deux), le reste au congélateur. */
    const tuiles = page.locator('section.sur-encre')
    await expect(tuiles.getByText('au frigo', { exact: true })).toBeVisible()
    await expect(tuiles.locator('b', { hasText: /^8$/ })).toBeVisible()
    await expect(tuiles.locator('b', { hasText: /^6$/ })).toBeVisible()
    await expect(tuiles.getByText('au congélateur', { exact: true })).toBeVisible()

    /* Rangé le … avec « Modifier » ; la photo de la recette suit sur sa carte. */
    await expect(page.getByText('Rangé le', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Modifier' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Dahl de lentilles corail' }).locator('img')).toHaveAttribute('src', PHOTO)
    await expect(page.getByRole('region', { name: 'Wrap du jour' }).getByText(/^Frigo · 0$/)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Wrap du jour' }).getByText(/^se garde jusqu’au /)).toBeVisible()

    /* Les compteurs suivent les « − » et « + » : une de moins au frigo sur le Dahl, puis on la remet. */
    await page.getByRole('region', { name: 'Dahl de lentilles corail' }).getByRole('button', { name: 'Une de moins au frigo' }).click()
    /* 14 barquettes : 7 au frigo et 7 au congélateur. */
    await expect(tuiles.locator('b', { hasText: /^7$/ })).toHaveCount(2)
    await page.getByRole('region', { name: 'Dahl de lentilles corail' }).getByRole('button', { name: 'Une de plus au frigo' }).click()

    /* La session a pris : les pastilles, puis le reste du frigo. */
    await expect(page.getByRole('heading', { name: 'La session a pris' })).toBeVisible()
    await expect(page.getByText('Reste au frigo :', { exact: true })).toBeVisible()

    await ciblesAssezGrandes(page, 'ranger')
    await captures(page, 'ranger')
    for (const t of TAILLES.slice(1)) {
      await page.setViewportSize({ width: t.w, height: t.h })
      await tientEnLargeur(page, `ranger à ${t.nom}`)
    }

    /* Le retour mène au dressage, le focus sur son titre. */
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Dressage', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: /^Dresse\s+14 barquettes$/ })).toBeFocused()
  })

  test('Thauba ouvre l’écran : elle apprend qu’elle est dressée à parts égales, et le bouton mène à ses objectifs', async ({ page }) => {
    test.setTimeout(120_000)
    await simulePhoto(page)
    await connecte(page, foyer.elleEmail)
    await page.goto('/dressage')
    await expect(page.getByRole('status').filter({ hasText: 'Thauba n’a pas encore fixé ses objectifs' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Mon profil' })).toHaveText('T')
    await captures(page, 'etat-thauba')
    await page.getByRole('button', { name: 'Fixe tes objectifs' }).click()
    await expect(page).toHaveURL(/\/objectifs$/)
  })

  test('chargement, panne puis « Réessayer »', async ({ page }) => {
    test.setTimeout(120_000)
    const f = await amorce({ cycleEtat: 'dressage' })
    foyers.push(f)
    await connecte(page, f.email)

    /* La lecture traîne : « Un instant… », dans l'habillage, avec la sortie et le « ? ». */
    await page.route(/current_cycle/, async route => { await new Promise(r => setTimeout(r, 2_500)); await route.continue() })
    await page.goto('/dressage')
    await expect(page.getByRole('status').filter({ hasText: 'Un instant…' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accueil', exact: true })).toBeVisible()
    await captures(page, 'etat-chargement')
    await page.waitForTimeout(3_000)
    await page.unroute(/current_cycle/)

    /* La lecture tombe en panne : on le dit, et un bouton recommence. */
    await page.route(/current_cycle/, route => route.abort())
    await page.goto('/dressage')
    await expect(page.getByRole('alert')).toContainText('Je n’ai pas pu lire la session', { timeout: 40_000 })
    await captures(page, 'etat-panne')
    await page.unroute(/current_cycle/)
    await page.getByRole('button', { name: 'Réessayer' }).click()
    await expect(page.getByRole('heading', { level: 1, name: /^Dresse\s+\d+ barquettes$/ })).toBeVisible({ timeout: 20_000 })
  })

  test('rien à dresser, puis aucune session', async ({ page }) => {
    test.setTimeout(120_000)
    const f = await amorce({ cycleEtat: 'dressage' })
    foyers.push(f)
    await db.from('cycle_recipe').delete().eq('cycle_id', f.cycleId)
    await connecte(page, f.email)
    await page.goto('/dressage')
    await expect(page.getByRole('heading', { level: 1, name: 'Rien à dresser' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Aucune recette n’a été cuisinée dans ce cycle.')).toBeVisible()
    await captures(page, 'etat-rien')

    await db.from('cycle').update({ state: 'interrompue' }).eq('id', f.cycleId)
    await page.goto('/dressage')
    await expect(page.getByRole('heading', { level: 1, name: 'Aucune session' })).toBeVisible({ timeout: 20_000 })
    await captures(page, 'etat-aucune-session')
  })

  test('rangement déjà fait : ce qui est écrit, en lecture seule, et « Terminer le rangement »', async ({ page }) => {
    test.setTimeout(120_000)
    await simulePhoto(page)
    const f = await amorce({ cycleEtat: 'dressage' })
    foyers.push(f)
    await db.from('meal_slot').delete().eq('cycle_id', f.cycleId)
    await db.from('recipe').update({ image_url: PHOTO })
      .in('id', (await db.from('cycle_recipe').select('recipe_id').eq('cycle_id', f.cycleId)).data!.map(c => c.recipe_id))
    await connecte(page, f.email)
    await page.goto('/dressage')
    await page.getByRole('button', { name: 'C’est dressé' }).click()
    await expect(page.getByRole('status').filter({ hasText: /4 barquettes déjà rangées pour vous deux : voilà ce qui est écrit\. Il ne reste qu’à finir\./ }))
      .toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: /de (moins|plus) au frigo/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Modifier' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Terminer le rangement' })).toBeVisible()
    await captures(page, 'etat-deja-range')
  })
})
