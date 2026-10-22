/**
 * Le grand test (22/10), parcours C — « le Budget » : ce que le clic a trouvé et que les bancs
 * unitaires ne voyaient pas. Un test par défaut corrigé, pas un écran :
 *   1. le fond ne défile pas sous une feuille ouverte (molette sur le fond assombri) ;
 *   2. réseau coupé pendant « Ajouter » : « Pas de réseau », jamais « TypeError: Failed to fetch » ;
 *   3. « Un jour entre le … et le … » ne finit pas par deux points ;
 *   4. une charge au nom de 81 caractères se refuse avant l'envoi, en français ;
 *   5. « Je retire » ne retire pas plus que ce qu'on a versé.
 *
 * ⚠️ LOCAL, ET RIEN D'AUTRE. L'heure de la base est remise à l'heure vraie avant de jouer.
 */
import { expect, test, type Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, db, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'
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

async function connecte(page: Page) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(foyer.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

async function ouvreCourses(page: Page) {
  await page.goto('/budget')
  const cat = page.getByRole('region', { name: 'Catégorie Vie courante' }).locator('button[aria-expanded]').first()
  await expect(cat).toBeVisible({ timeout: 15_000 })
  if (await cat.getAttribute('aria-expanded') === 'false') await cat.click()
  await page.getByRole('button', { name: 'Déclarer pour Courses' }).click()
  const feuille = page.getByRole('dialog', { name: 'Courses' })
  await expect(feuille).toBeVisible()
  return feuille
}

test('le fond ne défile pas sous la feuille ouverte', async ({ page }) => {
  await connecte(page)
  await ouvreCourses(page)
  const avant = await page.evaluate(() => window.scrollY)
  await page.mouse.move(195, 40)
  await page.mouse.wheel(0, 500)
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.scrollY), 'la page a défilé derrière la feuille').toBe(avant)
})

test('réseau coupé pendant « Ajouter » : une phrase française, rien d’écrit', async ({ page }) => {
  await connecte(page)
  const feuille = await ouvreCourses(page)
  await page.route('**/rest/v1/saisie*', r =>
    r.request().method() === 'POST' ? r.abort('internetdisconnected') : r.continue())
  await feuille.getByLabel('Nouvelle dépense').fill('9')
  await feuille.getByRole('button', { name: 'Ajouter 9 €' }).click()
  await expect(feuille.getByText(/Pas de réseau/)).toBeVisible()
  await expect(page.getByText(/Failed to fetch/)).toHaveCount(0)
  const { data } = await db.from('saisie').select('id').eq('household_id', foyer.householdId)
  expect(data).toHaveLength(0)
})

test('« Autre jour » hors du mois : la phrase ne finit pas par deux points', async ({ page }) => {
  await connecte(page)
  const feuille = await ouvreCourses(page)
  await feuille.getByRole('radio', { name: 'Autre jour' }).click()
  await feuille.locator('input[type=date]').fill('2020-01-15')
  const alerte = feuille.getByRole('alert').filter({ hasText: 'Un jour entre le' })
  await expect(alerte).toBeVisible()
  expect(await alerte.innerText()).not.toMatch(/\.\.$/)
})

test('une charge au nom de 81 caractères se refuse avant l’envoi', async ({ page }) => {
  await connecte(page)
  await page.goto('/charges')
  await page.getByRole('button', { name: 'Autre chose' }).click()
  await page.getByLabel('Quoi').fill('x'.repeat(81))
  await page.getByLabel('Combien (€)').fill('10')
  await expect(page.getByText('Un nom de 80 caractères au plus.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Ajouter cette charge/ })).toBeDisabled()
  await page.getByLabel('Quoi').fill('x'.repeat(80))
  await expect(page.getByRole('button', { name: /Ajouter cette charge/ })).toBeEnabled()
})

test('« Je retire » ne retire pas plus que ce qu’on a versé', async ({ page }) => {
  await connecte(page)
  await page.goto('/epargne')
  const somme = async () => ((await db.from('versement_epargne').select('montant_cents')
    .eq('household_id', foyer.householdId)).data ?? []).reduce((t, v) => t + v.montant_cents, 0)
  const avant = await somme()
  await expect(page.getByText('Urgence').first()).toBeVisible({ timeout: 15_000 })
  await page.getByLabel('Verser (€)').first().fill('100000')
  await page.getByRole('button', { name: 'Je retire' }).first().click()
  await expect(page.getByText(/Tu n’as versé que .* ici : tu ne peux pas en retirer plus\./)).toBeVisible()
  expect(await somme(), 'la poche a été entamée').toBe(avant)
})

test('à 360 px, la légende et les catégories ne coupent ni un nom ni un pourcentage', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await connecte(page)
  await page.goto('/budget')
  const recap = page.getByRole('region', { name: 'Ce qui reste' })
  await expect(recap.getByText('Il te reste')).toBeVisible({ timeout: 15_000 })
  const coupes = await page.evaluate(() => {
    const noms = [...document.querySelectorAll('section[aria-label="Ce qui reste"] li span, section[aria-label^="Catégorie"] button .font-semibold')]
    return noms.filter(e => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1
      || getComputedStyle(e).textOverflow === 'ellipsis').map(e => e.textContent)
  })
  expect(coupes, 'un nom est tronqué à 360 px').toEqual([])
  // « 17 % » tient sur une seule ligne : sa boîte ne dépasse pas une ligne de texte.
  const hauteurs = await page.evaluate(() => [...document.querySelectorAll('section[aria-label="Ce qui reste"] li span.tabular-nums')]
    .map(e => Math.round(e.getBoundingClientRect().height)))
  expect(Math.max(...hauteurs), 'un pourcentage passe sur deux lignes').toBeLessThan(24)
})

test('le titre de la page de clôture ne porte pas d’anneau de focus', async ({ page }) => {
  await connecte(page)
  await page.goto('/cloture/2026-08')
  const titre = page.getByRole('heading', { level: 1 })
  await expect(titre).toBeFocused({ timeout: 15_000 })
  expect(await titre.evaluate(e => getComputedStyle(e).outlineStyle)).toBe('none')
})

test('une adresse de mois qui ne se lit pas quitte l’adresse pour /budget', async ({ page }) => {
  await connecte(page)
  for (const fausse of ['/budget/2026-13', '/cloture/abc', '/budget/abc', '/cloture/2026-00']) {
    await page.goto(fausse)
    await expect(page).toHaveURL(/\/budget$/, { timeout: 15_000 })
    expect(new URL(page.url()).pathname, `${fausse} est restée dans la barre d'adresse`).toBe('/budget')
  }
})
