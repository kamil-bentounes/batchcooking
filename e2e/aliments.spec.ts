/**
 * Nos aliments, joués de bout en bout.
 *
 * « Là je vois Yaourt mais les calories et le protéine ne vont pas du tout. » Le foyer range SON yaourt dessert
 * protéiné (125 g le pot, 76 kcal et 10 g de protéines pour 100 g), le voit calculé en grand, le choisit dans la
 * semaine puis dans « en plus » — et à CHAQUE geste on RELIT LA BASE : 95 kcal et 12,5 g, pas les 60 kcal et 4 g du
 * repère « Yaourt ».
 *
 * Ni le réseau ni le modèle ne sont appelés : Open Food Facts et la fonction `etiquette` sont rejouées depuis une vraie
 * réponse enregistrée (`src/lib/aliments/fixtures/`) ou une lecture écrite à la main.
 *
 * Les captures (390 px et 320 px) sont posées dans `CAPTURES_ALIMENTS`, à regarder à côté de la maquette
 * `Aliment.dc.html`.
 */
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'

const CAPTURES = process.env.CAPTURES_ALIMENTS ?? '.shots/aliments'
const SKYR = JSON.parse(readFileSync(new URL('../src/lib/aliments/fixtures/off-skyr-danone.json', import.meta.url), 'utf8'))
const INCONNU = readFileSync(new URL('../src/lib/aliments/fixtures/off-introuvable.json', import.meta.url), 'utf8')

test.use({ viewport: { width: 390, height: 844 } })
/* Les parcours se suivent : chacun part de ce que le précédent a laissé dans la base. */
test.describe.configure({ mode: 'serial' })

let foyer: Foyer
const YAOURT = 'Yaourt dessert protéiné'

const jourLocal = (decalage: number) => {
  const d = new Date(); d.setDate(d.getDate() + decalage)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const semaineDe = (decalage: number) => {
  const d = new Date(); d.setDate(d.getDate() + decalage)
  const j = d.toLocaleDateString('fr-FR', { weekday: 'long' })
  return `${j[0].toUpperCase()}${j.slice(1)}`
}

async function connecte(page: Page) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(foyer.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

async function capture(page: Page, nom: string, plein = true) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${CAPTURES}/${nom}.png`, fullPage: plein })
}

/** Les cibles de moins de 44 px, visibles et touchables : un pouce doit les trouver. */
const ciblesPetites = (page: Page, racine = 'body') => page.evaluate(sel =>
  [...(document.querySelector(sel) ?? document.body).querySelectorAll<HTMLElement>('button, a[href], [role=radio], input[type=checkbox], input[type=text], input:not([type]), label:has(input[type=file])')]
    .filter(c => getComputedStyle(c).visibility !== 'hidden' && !c.closest('[inert]') && !c.classList.contains('sr-only'))
    /* Une case de saisie est visée par son cadre (le `<label>` qui la porte), pas par la saisie nue qu'il contient. */
    .map(c => ({ c, r: (c.matches('input') ? (c.closest('label') ?? c) : c).getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
    .map(({ c, r }) => `${(c.getAttribute('aria-label') || c.textContent || c.outerHTML).trim().slice(0, 90)} ${Math.round(r.width)}×${Math.round(r.height)}`), racine)

const debordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

/** Une photo JPEG dessinée dans le navigateur : un fichier de test sans fichier dans le dépôt. */
async function unePhoto(page: Page): Promise<Buffer> {
  const url = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480
    const x = c.getContext('2d')!
    x.fillStyle = '#F7F5EE'; x.fillRect(0, 0, 640, 480)
    x.fillStyle = '#1C2B23'; x.fillRect(80, 60, 300, 24)
    for (let i = 0; i < 8; i++) { x.fillStyle = '#9AA59E'; x.fillRect(80, 120 + i * 34, 200 + (i % 3) * 90, 10) }
    return c.toDataURL('image/jpeg', 0.8)
  })
  return Buffer.from(url.split(',')[1], 'base64')
}

const lesAliments = async () =>
  (await db.from('aliment').select('*').eq('household_id', foyer.householdId).order('created_at')).data!
const lesExtras = async () =>
  (await db.from('meal_extra').select('*, meal_slot:meal_slot_id(day, meal, user_profile_id)').eq('household_id', foyer.householdId)).data!

test.beforeAll(async () => {
  foyer = await amorce({ cycleEtat: 'semaine', budget: false })
  const hh = foyer.householdId
  await db.from('meal_slot').delete().eq('household_id', hh)
  await db.from('portion').delete().eq('household_id', hh)
  await db.from('stock_item').delete().eq('household_id', hh)
  await db.from('aliment').delete().eq('household_id', hh)
})
test.afterAll(async () => {
  if (!foyer) return
  await efface(foyer)
})

test('les réglages mènent à « Nos aliments » : vide, avec de quoi commencer', async ({ page }) => {
  test.setTimeout(90_000)
  const erreurs: string[] = []
  page.on('pageerror', e => erreurs.push(e.message))
  await connecte(page)
  await page.goto('/reglages')
  await expect(page.getByRole('heading', { name: 'Nos aliments', level: 2 })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Ouvrir nos aliments' }).click()

  await expect(page.getByRole('heading', { name: 'Nos aliments', level: 1 })).toBeVisible()
  await expect(page.getByText('Rien pour l’instant')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ajouter un aliment' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Réglages' })).toBeVisible()
  expect(await debordement(page)).toBeLessThanOrEqual(0)
  expect(await ciblesPetites(page), 'cibles de moins de 44 px').toEqual([])
  await capture(page, '01-vide-390')
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await debordement(page), 'défilement horizontal à 320 px').toBeLessThanOrEqual(0)
  await capture(page, '01-vide-320')
  expect(erreurs).toEqual([])
})

test('créer à la main « Yaourt dessert protéiné » : 125 g le pot, le calcul d’un pot en grand, des refus clairs', async ({ page }) => {
  test.setTimeout(90_000)
  await connecte(page)
  await page.goto('/aliments')
  await page.getByRole('button', { name: 'Ajouter un aliment' }).click()
  await expect(page.getByRole('heading', { name: 'Nouvel aliment', level: 1 })).toBeVisible()

  /* Les trois façons de remplir ; « Étiquette » d'abord, comme la maquette. */
  const facons = page.getByRole('group', { name: 'Comment le remplir' })
  await expect(facons.getByRole('button')).toHaveText(['Étiquette', 'À la main', 'Code-barres'])
  await expect(facons.getByRole('button', { name: 'Étiquette' })).toHaveAttribute('aria-pressed', 'true')
  await capture(page, '02-nouveau-etiquette-390')
  await facons.getByRole('button', { name: 'À la main' }).click()
  await expect(facons.getByRole('button', { name: 'À la main' })).toHaveAttribute('aria-pressed', 'true')

  /* Un enregistrement vide dit ce qui manque, sous chaque champ, et mène au premier. */
  await page.getByRole('button', { name: 'Enregistrer dans mes aliments' }).click()
  await expect(page.getByText('Donne-lui un nom.')).toBeVisible()
  await expect(page.getByText('Il manque les calories.')).toBeVisible()
  await expect(page.getByText('Il manque les protéines.')).toBeVisible()
  await expect(page.getByText('Dis combien pèse 1 pot.')).toBeVisible()
  await expect(page.getByLabel('Son nom')).toBeFocused()
  expect(await lesAliments(), 'rien ne doit être écrit').toHaveLength(0)

  /* Des kJ pris pour des kcal : refusés avant la base. */
  await page.getByLabel('Son nom').fill(YAOURT)
  await page.getByLabel('Calories').fill('318')
  await page.getByLabel('Protéines').fill('10')
  await page.getByLabel('Glucides').fill('5,6')
  await page.getByLabel('Lipides').fill('1,4')
  await page.getByLabel('Poids d’un pot en grammes').fill('125')
  await page.getByLabel('Calories').fill('1050')
  await page.getByRole('button', { name: 'Enregistrer dans mes aliments' }).click()
  await expect(page.getByText(/Plus de 900 kcal pour 100 g/)).toBeVisible()
  await expect(page.getByLabel('Calories')).toBeFocused()

  /* Les vraies valeurs : 76 kcal, et le pot de 125 g vaut 95 kcal et 12,5 g de protéines, en grand. */
  await page.getByLabel('Calories').fill('76')
  const pot = page.getByRole('group', { name: 'Valeurs d’un pot' })
  await expect(pot.locator('[data-valeur="kcal"]')).toHaveText('95')
  await expect(pot.locator('[data-valeur="proteines"]')).toHaveText('12,5')
  await expect(pot).toContainText('7 g de glucides · 1,8 g de lipides · 0 g de fibres')
  await expect(page.getByText('Il remplace le repère « Yaourt »')).toBeVisible()
  expect(await debordement(page)).toBeLessThanOrEqual(0)
  expect(await ciblesPetites(page), 'cibles de moins de 44 px').toEqual([])
  await capture(page, '03-nouveau-a-la-main-390')
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await debordement(page), 'défilement horizontal à 320 px').toBeLessThanOrEqual(0)
  await capture(page, '03-nouveau-a-la-main-320')
  await page.setViewportSize({ width: 390, height: 844 })

  await page.getByRole('button', { name: 'Enregistrer dans mes aliments' }).click()
  await expect(page.getByText(`« ${YAOURT} » est dans nos aliments.`)).toBeVisible()

  /* La liste : le pot, ses chiffres en grand, d'où viennent les chiffres. */
  const carte = page.getByRole('button', { name: `Modifier ${YAOURT}` })
  await expect(carte).toContainText('95')
  await expect(carte).toContainText('12,5')
  await expect(carte).toContainText('1 pot (125 g)')
  await expect(carte).toContainText('à la main')
  expect(await debordement(page)).toBeLessThanOrEqual(0)
  await capture(page, '04-liste-390')

  /* La base : les valeurs pour 100 g, telles que tapées. */
  const [a] = await lesAliments()
  expect(a).toMatchObject({ label: YAOURT, unite: 'pot', source: 'main', code_barres: null })
  expect([a.kcal_100g, a.protein_100g, a.carb_100g, a.fat_100g, a.fiber_100g, a.unite_g].map(Number)).toEqual([76, 10, 5.6, 1.4, 0, 125])
})

test('dans la semaine : nos aliments avant les repères, un geste = un pot, les vraies valeurs écrites', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  const midi = page.locator('[data-repas="dejeuner"]')
  await midi.getByRole('button', { name: '+ Choisir le midi' }).click()
  const f = page.getByRole('dialog', { name: `${semaineDe(0)} midi` })
  await expect(f).toBeVisible()

  /* « Autre chose » : notre yaourt en premier, avec son pot, puis le lien, puis les repères. */
  const autre = f.getByRole('region', { name: 'Autre chose' })
  const lignes = autre.getByRole('button')
  await expect(lignes.first()).toContainText(YAOURT)
  await expect(lignes.first()).toContainText('1 pot (125 g) · 12,5 g de protéines')
  await expect(lignes.first()).toContainText('95 kcal')
  await expect(lignes.nth(1)).toContainText('Ajouter ou modifier nos aliments')
  await expect(autre.getByRole('button', { name: /Restaurant/ })).toBeVisible()
  const noms = await lignes.allInnerTexts()
  expect(noms.findIndex(n => n.includes(YAOURT)), 'nos aliments passent avant les repères')
    .toBeLessThan(noms.findIndex(n => n.includes('Restaurant')))
  expect(await ciblesPetites(page), 'cibles de moins de 44 px dans la feuille').toEqual([])
  await f.evaluate(el => { el.scrollTo(0, el.scrollHeight) })
  await capture(page, '05-feuille-midi-390', false)

  await lignes.first().click()
  await expect(f).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('[data-repas="dejeuner"]')).toContainText(YAOURT)

  /* La base : pour chacun des deux, UN pot — les vraies valeurs, pas celles d'un repère. */
  const extras = (await lesExtras()).filter(e => e.meal_slot.meal === 'dejeuner' && e.meal_slot.day === jourLocal(0))
  expect(extras).toHaveLength(2)
  for (const e of extras) {
    expect(e.label).toBe(YAOURT)
    expect([e.kcal, e.protein_g, e.carb_g, e.fat_g, e.fiber_g, e.grams].map(Number)).toEqual([95, 12.5, 7, 1.8, 0, 125])
  }
  expect(new Set(extras.map(e => e.meal_slot.user_profile_id)).size, 'un pot par personne').toBe(2)
})

test('dans « en plus » : le repère « Yaourt » ne se glisse plus à côté ; la collation prend un pot', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await page.getByRole('button', { name: 'Collation' }).click()
  await expect(page.getByText('Nos aliments', { exact: true })).toBeVisible()
  const chip = page.getByRole('button', { name: new RegExp(`${YAOURT}\\s*95 kcal`) })
  await expect(chip).toBeVisible()
  /* Le repère générique « Yaourt » (60 kcal) est remplacé ; les autres restent. */
  await expect(page.getByRole('button', { name: /^Yaourt\s*60$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Fruit/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Skyr ou fromage blanc/ })).toBeVisible()
  /* Les pastilles (les nôtres et les repères) se touchent du pouce : 44 px de haut au moins. */
  for (const b of await page.locator('[aria-label="Autres moments"] button').all()) {
    expect((await b.boundingBox())!.height, `${await b.innerText()} fait moins de 44 px`).toBeGreaterThanOrEqual(43.5)
  }
  await capture(page, '06-en-plus-390', true)

  await chip.click()
  await expect.poll(async () => (await lesExtras()).filter(e => e.meal_slot.meal === 'collation').length, { timeout: 10_000 }).toBe(1)
  const [e] = (await lesExtras()).filter(e => e.meal_slot.meal === 'collation')
  expect(e.meal_slot.user_profile_id).toBe(foyer.userId)
  expect(e.label).toBe(YAOURT)
  expect([e.kcal, e.protein_g, e.carb_g, e.fat_g, e.grams].map(Number)).toEqual([95, 12.5, 7, 1.8, 125])
  /* Et l'écran le dit, avec les mêmes chiffres. */
  await expect(page.getByText(`${YAOURT} · 95 kcal · 12,5 g de protéines`)).toBeVisible()
})

test('modifier le pot (150 g) : la liste recalcule, les repas déjà notés gardent leurs chiffres', async ({ page }) => {
  test.setTimeout(90_000)
  await connecte(page)
  await page.goto('/aliments')
  await page.getByRole('button', { name: `Modifier ${YAOURT}` }).click()
  await expect(page.getByRole('heading', { name: YAOURT, level: 1 })).toBeVisible()
  await expect(page.getByLabel('Calories')).toHaveValue('76')
  await expect(page.getByLabel('Glucides')).toHaveValue('5,6')
  await page.getByLabel('Poids d’un pot en grammes').fill('150')
  await expect(page.getByRole('group', { name: 'Valeurs d’un pot' }).locator('[data-valeur="kcal"]')).toHaveText('114')
  await page.getByRole('button', { name: 'Enregistrer les changements' }).click()
  await expect(page.getByText(`« ${YAOURT} » est à jour.`)).toBeVisible()
  await expect(page.getByRole('button', { name: `Modifier ${YAOURT}` })).toContainText('114')
  await expect(page.getByRole('button', { name: `Modifier ${YAOURT}` })).toContainText('15')

  expect(Number((await lesAliments())[0].unite_g)).toBe(150)
  const extras = (await lesExtras()).filter(e => e.label === YAOURT)
  expect(extras.length).toBeGreaterThanOrEqual(3)
  expect(extras.every(e => Number(e.kcal) === 95), 'le repas d’hier a gardé ses chiffres').toBe(true)

  /* Un nom déjà pris est refusé en français, pas par le nom d'un index. */
  await page.getByRole('button', { name: 'Ajouter un aliment' }).click()
  await page.getByRole('group', { name: 'Comment le remplir' }).getByRole('button', { name: 'À la main' }).click()
  await page.getByLabel('Son nom').fill(`  ${YAOURT.toUpperCase()} `)
  await page.getByLabel('Calories').fill('80')
  await page.getByLabel('Protéines').fill('5')
  await page.getByLabel('Poids d’un pot en grammes').fill('100')
  await page.getByRole('button', { name: 'Enregistrer dans mes aliments' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'porte déjà ce nom' })).toBeVisible()
})

test('par code-barres : Open Food Facts remplit le Skyr de Danone, à vérifier ; un code faux ou inconnu se dit', async ({ page }) => {
  test.setTimeout(90_000)
  const appels: string[] = []
  await page.route('https://world.openfoodfacts.org/**', route => {
    appels.push(route.request().url())
    if (route.request().url().includes('/3033490004743.json')) {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(SKYR) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: INCONNU })
  })
  await connecte(page)
  await page.goto('/aliments?nouveau=1')
  await expect(page.getByRole('heading', { name: 'Nouvel aliment', level: 1 })).toBeVisible()
  await page.getByRole('group', { name: 'Comment le remplir' }).getByRole('button', { name: 'Code-barres' }).click()
  /* Pas de lecteur d'appareil photo dans ce navigateur : seules les chiffres, qui marchent partout. */
  const code = page.getByLabel('Les chiffres du code-barres')

  await code.fill('3033490004744')
  await page.getByRole('button', { name: 'Chercher' }).click()
  await expect(page.getByRole('alert')).toContainText('un chiffre doit être faux')
  expect(appels, 'un code faux ne dérange pas Open Food Facts').toHaveLength(0)

  await code.fill('3033491267499')
  await page.getByRole('button', { name: 'Chercher' }).click()
  await expect(page.getByRole('alert')).toContainText('ne connaît pas ce code')

  await code.fill('3033 4900 04743')
  await page.getByRole('button', { name: 'Chercher' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'trouvé' })).toContainText('« Skyr Danone » trouvé')
  await expect(page.getByRole('status').filter({ hasText: 'trouvé' })).toContainText('Vérifie-les avant d’enregistrer')
  await expect(page.getByLabel('Son nom')).toHaveValue('Skyr Danone')
  await expect(page.getByLabel('Calories')).toHaveValue('57')
  await expect(page.getByLabel('Protéines')).toHaveValue('10')
  await expect(page.getByLabel('Glucides')).toHaveValue('3,9')
  await expect(page.getByLabel('Lipides')).toHaveValue('0,2')
  await expect(page.getByLabel('Poids d’un pot en grammes')).toHaveValue('140')
  await expect(page.getByRole('group', { name: 'Valeurs d’un pot' }).locator('[data-valeur="kcal"]')).toHaveText('80')
  await expect(page.getByRole('group', { name: 'Valeurs d’un pot' }).locator('[data-valeur="proteines"]')).toHaveText('14')
  expect(await debordement(page)).toBeLessThanOrEqual(0)
  expect(await ciblesPetites(page), 'cibles de moins de 44 px').toEqual([])
  await capture(page, '07-code-barres-390')
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await debordement(page), 'défilement horizontal à 320 px').toBeLessThanOrEqual(0)
  await capture(page, '07-code-barres-320')
  await page.setViewportSize({ width: 390, height: 844 })

  await page.getByRole('button', { name: 'Enregistrer dans mes aliments' }).click()
  await expect(page.getByText('« Skyr Danone » est dans nos aliments.')).toBeVisible()
  const skyr = (await lesAliments()).find(x => x.label === 'Skyr Danone')!
  expect(skyr).toMatchObject({ source: 'code_barres', code_barres: '3033490004743', unite: 'pot' })
  expect([skyr.kcal_100g, skyr.protein_100g, skyr.unite_g].map(Number)).toEqual([57, 10, 140])
  await expect(page.getByRole('button', { name: 'Modifier Skyr Danone' })).toContainText('code-barres')
})

test('par l’appareil photo : le code lu part tout seul vers Open Food Facts', async ({ page }) => {
  test.setTimeout(90_000)
  /* Un navigateur qui sait lire un code-barres : le détecteur et la caméra sont joués. */
  await page.addInitScript(() => {
    Object.assign(window, { BarcodeDetector: class { async detect() { return [{ rawValue: '3033490004743' }] } } })
    const toile = document.createElement('canvas'); toile.width = 320; toile.height = 240
    const x = toile.getContext('2d')!
    /* Une image qui change : un flux de canvas n'émet que sur changement. */
    let n = 0
    setInterval(() => { x.fillStyle = n++ % 2 ? '#222' : '#444'; x.fillRect(0, 0, 320, 240) }, 50)
    navigator.mediaDevices.getUserMedia = async () => toile.captureStream(5)
  })
  await page.route('https://world.openfoodfacts.org/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(SKYR) }))
  await connecte(page)
  await page.goto('/aliments?nouveau=1')
  await page.getByRole('group', { name: 'Comment le remplir' }).getByRole('button', { name: 'Code-barres' }).click()
  await page.getByRole('button', { name: 'Lire avec l’appareil photo' }).click()
  await expect(page.getByLabel('Les chiffres du code-barres')).toHaveValue('3033490004743', { timeout: 10_000 })
  await expect(page.getByLabel('Son nom')).toHaveValue('Skyr Danone')
  await expect(page.getByLabel('Calories')).toHaveValue('57')
  /* La caméra est coupée une fois le code lu. */
  await expect(page.getByLabel('Ce que voit l’appareil photo')).toHaveCount(0)
})

test('par l’étiquette : une photo, la fonction `etiquette` lit, les champs se remplissent — à vérifier', async ({ page }) => {
  test.setTimeout(90_000)
  let corps: { images?: string[] } = {}
  await page.route('**/functions/v1/etiquette', async route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    }
    corps = route.request().postDataJSON()
    return route.fulfill({
      status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        nom: 'Fromage blanc 0 %', marque: 'Le Bon Pot', poids_g: 500, parts: 4, kcal_100g: 46, proteines_100g: 8, glucides_100g: 4,
        lipides_100g: 0.1, fibres_100g: null, kcal_portion: null, dlc: null, lisible: true, confiance: 0.9, commentaire: null, restantes: 39,
      }),
    })
  })
  await connecte(page)
  await page.goto('/aliments?nouveau=1')
  const photo = await unePhoto(page)
  await page.locator('input[type=file]').setInputFiles({ name: 'etiquette.jpg', mimeType: 'image/jpeg', buffer: photo })

  await expect(page.getByRole('status').filter({ hasText: 'Étiquette lue' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Les valeurs pour 100 g sont remplies. Vérifie-les avant d’enregistrer.')).toBeVisible()
  expect(corps.images).toHaveLength(1)
  expect(corps.images![0]).toMatch(/^data:image\/jpeg;base64,/)
  await expect(page.getByLabel('Son nom')).toHaveValue('Fromage blanc 0 % Le Bon Pot')
  await expect(page.getByLabel('Calories')).toHaveValue('46')
  await expect(page.getByLabel('Protéines')).toHaveValue('8')
  await expect(page.getByLabel('Lipides')).toHaveValue('0,1')
  await expect(page.getByLabel('Fibres')).toHaveValue('')
  /* 4 portions annoncées, 500 g net : 125 g l'unité — et on le dit. */
  await expect(page.getByLabel('Poids d’un pot en grammes')).toHaveValue('125')
  await expect(page.getByText(/4 portions de 500 g en tout : je compte 125 g l’unité/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reprendre la photo' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Photo de l’étiquette nutritionnelle' })).toBeVisible()
  expect(await debordement(page)).toBeLessThanOrEqual(0)
  expect(await ciblesPetites(page), 'cibles de moins de 44 px').toEqual([])
  await capture(page, '08-etiquette-lue-390')
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await debordement(page), 'défilement horizontal à 320 px').toBeLessThanOrEqual(0)
  await capture(page, '08-etiquette-lue-320')
  await page.setViewportSize({ width: 390, height: 844 })

  /* On corrige avant d'enregistrer : la provenance reste « étiquette ». */
  await page.getByLabel('Calories').fill('47')
  await page.getByRole('button', { name: 'Enregistrer dans mes aliments' }).click()
  await expect(page.getByText('« Fromage blanc 0 % Le Bon Pot » est dans nos aliments.')).toBeVisible()
  const a = (await lesAliments()).find(x => x.label.startsWith('Fromage blanc'))!
  expect(a.source).toBe('etiquette')
  expect([a.kcal_100g, a.protein_100g, a.unite_g].map(Number)).toEqual([47, 8, 125])
})

test('une étiquette illisible ou en panne se dit en français, et on peut remplir à la main', async ({ page }) => {
  test.setTimeout(90_000)
  await page.route('**/functions/v1/etiquette', async route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    }
    return route.fulfill({
      status: 429, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ erreur: 'Quota atteint : 40 étiquettes par mois. Il repart le 1er.', restantes: 0 }),
    })
  })
  await connecte(page)
  await page.goto('/aliments?nouveau=1')
  await page.locator('input[type=file]').setInputFiles({ name: 'etiquette.jpg', mimeType: 'image/jpeg', buffer: await unePhoto(page) })
  await expect(page.getByRole('alert')).toContainText('Quota atteint : 40 étiquettes par mois')
  await expect(page.getByRole('button', { name: 'Reprendre la photo' })).toBeVisible()
  await capture(page, '09-etiquette-panne-390')
})

test('retirer un aliment : on demande, « Non » le garde, « Oui » le retire ; les repas notés gardent leurs chiffres', async ({ page }) => {
  test.setTimeout(90_000)
  await connecte(page)
  await page.goto('/aliments')
  await page.getByRole('button', { name: 'Modifier Skyr Danone' }).click()
  await page.getByRole('button', { name: 'Retirer cet aliment' }).click()
  const q = page.getByRole('alertdialog', { name: 'Retirer « Skyr Danone » de nos aliments ?' })
  await expect(q).toBeVisible()
  await expect(q.getByRole('button', { name: 'Non, le garder' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(q).toBeHidden()
  expect((await lesAliments()).some(a => a.label === 'Skyr Danone')).toBe(true)

  await page.getByRole('button', { name: 'Retirer cet aliment' }).click()
  await page.getByRole('button', { name: 'Oui, le retirer' }).click()
  await expect(page.getByText('« Skyr Danone » est retiré.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Modifier Skyr Danone' })).toHaveCount(0)
  expect((await lesAliments()).some(a => a.label === 'Skyr Danone')).toBe(false)
  expect((await lesExtras()).filter(e => e.label === YAOURT).length, 'les repas notés sont intacts').toBeGreaterThanOrEqual(3)
})

test('depuis la feuille de choix : le lien mène à « Nos aliments », le retour rouvre la feuille', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await page.locator('[data-repas="diner"]').getByRole('button', { name: '+ Choisir le soir' }).click()
  const f = page.getByRole('dialog', { name: `${semaineDe(0)} soir` })
  await f.getByRole('button', { name: 'Ajouter ou modifier nos aliments' }).click()
  await expect(page.getByRole('heading', { name: 'Nos aliments', level: 1 })).toBeVisible()
  expect(new URL(page.url()).search).toBe(`?depuis=semaine&jour=${jourLocal(0)}&repas=diner`)
  await page.getByRole('button', { name: 'La semaine' }).click()
  await expect(page.getByRole('dialog', { name: `${semaineDe(0)} soir` })).toBeVisible({ timeout: 10_000 })
})
