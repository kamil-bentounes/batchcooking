/**
 * Photo du frigo, ticket de caisse et pesée refaits d'après la maquette `saisies-photo-ticket-peser.html`.
 *
 * Aucun modèle n'est appelé : les réponses des fonctions `frigo` et `ticket` sont simulées par une route Playwright.
 * Ce qu'on éprouve est l'écran de validation — ce qu'il coche d'avance, ce qu'il montre comme deviné, ce qu'il écrit
 * à la base quand on valide — et sa tenue à 320, 390 et 1440 px (pas de défilement horizontal, cibles de 44 px).
 *
 * Les captures vont dans `CAPTURES_SAISIES` (par défaut `.shots/saisies`).
 */
import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { MOT_DE_PASSE, amorce, db, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'

const DOSSIER = process.env.CAPTURES_SAISIES ?? '.shots/saisies'

let foyer: Foyer

test.beforeAll(async () => {
  foyer = await amorce()
  /* Trois enseignes, comme la maquette : la pastille choisie se voit. */
  await db.from('store').insert([
    { household_id: foyer.householdId, name: 'Lidl' },
    { household_id: foyer.householdId, name: 'Marché' },
  ])
  /* Des aliments à peser : les lignes « au compte » de la recette semée, un nom de plus chacune. */
  const { data: foods } = await db.from('food').select('id, name').limit(8)
  const { data: recette } = await db.from('cycle_recipe').select('recipe_id').eq('cycle_id', foyer.cycleId).limit(1).single()
  const deja = new Set((await db.from('recipe_ingredient').select('food_id').eq('recipe_id', recette!.recipe_id)).data?.map(r => r.food_id))
  let ordinal = 10
  for (const f of (foods ?? []).filter(x => !deja.has(x.id)).slice(0, 4)) {
    await db.from('recipe_ingredient').insert({
      recipe_id: recette!.recipe_id, ordinal: ordinal++, raw_text: `3 ${f.name}`, qty: 3, unit: null, food_id: f.id,
    })
  }
})
test.afterAll(async () => { if (foyer) await efface(foyer) })

async function connecte(page: Page) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(foyer.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

/** La réponse d'une fonction, simulée. Rend la liste des corps reçus. */
async function simule(page: Page, nom: string, corps: unknown, o: { statut?: number; delai?: number } = {}) {
  const recus: Record<string, unknown>[] = []
  await page.route(`**/functions/v1/${nom}`, async (route: Route) => {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    recus.push(route.request().postDataJSON())
    if (o.delai) await new Promise(r => setTimeout(r, o.delai))
    return route.fulfill({
      status: o.statut ?? 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(corps),
    })
  })
  return recus
}

/** Un vrai PNG, gris clair : `prepare()` le passe dans un canvas avant l'envoi. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO4e/8GVsQwtCQAecilAZTRNhYAAAAASUVORK5CYII=', 'base64')
const donneLaPhoto = (page: Page) =>
  page.locator('input[type="file"]').first().setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PIXEL })

const pasDeDefilement = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

const art = (nom: string, variete: string | null, quantite: number | null, unite: string | null, ou: string,
  confiance = 0.95, lieu = 'frigo', remarque: string | null = null) =>
  ({ nom, variete, quantite, unite, ou, confiance, lieu, remarque })

const VU = {
  articles: [
    art('Yaourt', 'nature', 4, 'pot', 'étagère du haut, à gauche'),
    art('Skyr', 'vanille', 2, 'pot', 'étagère du haut, au milieu'),
    art('Œufs', null, 6, 'u', 'étagère du milieu, à gauche'),
    art('Lait', 'demi-écrémé', 1, 'bouteille', 'porte, à droite'),
    art('Beurre', null, 1, 'paquet', 'étagère du haut, à droite'),
    art('Tomates cerises', null, 1, 'barquette', 'étagère du milieu, à droite'),
    art('Citrons', null, 2, 'u', 'bac du bas, à gauche'),
    art('Sauce', 'blanche ?', 1, 'pot', 'bac du bas, au fond', 0.5),
    art('Fromage râpé', null, 1, 'paquet', 'bac du bas, à droite', 0.4),
  ],
  lisible: true, commentaire: null, restantes: 2, quota: 30, ms: 14_000,
}

const TICKET = {
  enseigne: 'Super U', date: '2026-10-26',
  lignes: [
    { label: 'POULET FERMIER 800G', quantity: 800, unit: 'g', price_eur: 7.10, confiance: 0.95 },
    { label: 'LENTILLES CORAIL 500G', quantity: 500, unit: 'g', price_eur: 2.30, confiance: 0.93 },
    { label: 'OIGNONS JAUNES 1KG', quantity: 1000, unit: 'g', price_eur: 1.99, confiance: 0.9 },
    { label: 'SAC POUBELLE 30L', quantity: null, unit: null, price_eur: 3.45, confiance: 0.9 },
    { label: 'XZ4 PROMO', quantity: 1, unit: null, price_eur: 1.20, confiance: 0.31 },
  ],
  total_eur: 17.24, somme: 16.04, ecart: 1.2, remisesDeduites: false, lisible: true, commentaire: null,
  restantes: 1, quota: 30, ms: 9_000,
}

test.describe('la photo du frigo', () => {
  test('avant la photo : le lieu se choisit au clavier, la lecture se dit, le lieu part avec la photo', async ({ page }) => {
    test.setTimeout(90_000)
    const recus = await simule(page, 'frigo', VU, { delai: 1500 })
    await connecte(page)
    await page.goto('/photo')

    await expect(page.getByRole('heading', { name: 'Photo du frigo' })).toBeVisible()
    await expect(page.getByText('Le modèle propose, tu valides. Rien n’entre à l’inventaire sans que tu l’aies coché.')).toBeVisible()
    await expect(page.getByText('une étagère à la fois')).toBeVisible()
    const lieux = page.getByRole('radiogroup', { name: 'Où est-ce que tu photographies ?' }).getByRole('radio')
    await expect(lieux).toHaveText(['Frigo', 'Congélateur', 'Placard'])
    await expect(lieux.nth(0)).toHaveAttribute('aria-checked', 'true')
    await lieux.nth(0).focus()
    await page.keyboard.press('ArrowRight')
    await expect(lieux.nth(1)).toHaveAttribute('aria-checked', 'true')
    await expect(lieux.nth(1)).toBeFocused()
    await expect(page.getByText('Prendre la photo')).toBeVisible()
    expect(await pasDeDefilement(page)).toBe(true)

    await donneLaPhoto(page)
    await expect(page.getByText('Je regarde… une quinzaine de secondes.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ce que j’ai vu' })).toBeVisible({ timeout: 20_000 })
    expect(recus[0].lieu, 'le lieu choisi part avec la photo').toBe('congelateur')
  })

  test('ce que j’ai vu : sûr coché, deviné décoché et dit, chiffres de la lecture, ajout à l’inventaire', async ({ page }) => {
    test.setTimeout(90_000)
    await simule(page, 'frigo', VU)
    await connecte(page)
    await page.goto('/photo')
    await donneLaPhoto(page)

    await expect(page.getByRole('heading', { name: 'Ce que j’ai vu' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('articles vus · 7 retenus · 14 s')).toBeVisible()
    await expect(page.getByText('étagère du haut, à gauche')).toBeVisible()
    await expect(page.getByText('deviné, à vérifier')).toHaveCount(2)
    await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(7)
    await expect(page.getByRole('checkbox', { checked: false })).toHaveCount(2)
    await expect(page.getByRole('checkbox', { name: 'Sauce blanche ?' })).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByText('2 photos restantes ce mois-ci.')).toBeVisible()
    await expect(page.getByText('4pots')).toBeVisible()
    await expect(page.getByRole('img', { name: 'La photo envoyée' })).toBeVisible()
    expect(await pasDeDefilement(page)).toBe(true)

    /* Les cases font 44 px de côté. */
    for (const c of await page.getByRole('checkbox').all()) {
      const b = await c.boundingBox()
      expect(b!.width).toBeGreaterThanOrEqual(43.5)
      expect(b!.height).toBeGreaterThanOrEqual(43.5)
    }

    await page.getByRole('checkbox', { name: 'Citrons' }).click()
    await expect(page.getByRole('button', { name: 'Ajouter 6 articles' })).toBeVisible()
    await expect(page.getByText('articles vus · 6 retenus · 14 s')).toBeVisible()
    await page.getByRole('checkbox', { name: 'Fromage râpé' }).click()
    await page.getByRole('button', { name: 'Ajouter 7 articles' }).dblclick()
    await expect(page).toHaveURL(/\/frigo/, { timeout: 15_000 })

    const { data } = await db.from('stock_item').select('label, quantity, unit, location').eq('household_id', foyer.householdId)
    const labels = (data ?? []).map(s => s.label)
    expect(labels).toContain('Yaourt nature')
    expect(labels).toContain('Fromage râpé')
    expect(labels, 'le décoché n’entre pas').not.toContain('Citrons')
    expect(labels, 'le deviné décoché n’entre pas').not.toContain('Sauce blanche ?')
    expect(labels.filter(l => l === 'Yaourt nature'), 'un double appui n’ajoute pas deux fois').toHaveLength(1)
    await db.from('stock_item').delete().eq('household_id', foyer.householdId).not('label', 'in', '("yaourt nature","beurre")')
  })

  test('sans durée ni emplacement, l’écran n’invente rien', async ({ page }) => {
    test.setTimeout(90_000)
    await simule(page, 'frigo', {
      ...VU, ms: undefined, articles: [{ ...VU.articles[0], ou: '' }, { ...VU.articles[1], ou: '', confiance: 0.3 }],
    })
    await connecte(page)
    await page.goto('/photo')
    await donneLaPhoto(page)
    await expect(page.getByText('articles vus · 1 retenu')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/ s$/)).toHaveCount(0)
    await expect(page.getByText('deviné, à vérifier')).toBeVisible()
    await expect(page.getByText(/^ ·|· $/)).toHaveCount(0)
  })

  test('une photo illisible se dit, et « Reprendre une photo » repart de zéro', async ({ page }) => {
    test.setTimeout(90_000)
    await simule(page, 'frigo', {
      articles: [], lisible: false, commentaire: null, restantes: 11, quota: 30, ms: 900,
    })
    await connecte(page)
    await page.goto('/photo')
    await donneLaPhoto(page)
    await expect(page.getByRole('heading', { name: 'Je n’ai rien su lire' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('La photo ne montre pas d’aliments identifiables.')).toBeVisible()
    await page.getByRole('button', { name: 'Reprendre une photo' }).click()
    await expect(page.getByText('Prendre la photo')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Je n’ai rien su lire' })).toHaveCount(0)
  })

  test('le quota atteint se dit en français', async ({ page }) => {
    test.setTimeout(90_000)
    await simule(page, 'frigo', { erreur: 'Quota atteint : 30 photos par mois. Il repart le 1er.', restantes: 0 }, { statut: 429 })
    await connecte(page)
    await page.goto('/photo')
    await donneLaPhoto(page)
    await expect(page.getByText(/Quota atteint/)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/\{|"erreur"/)).toHaveCount(0)
  })
})

test.describe('le ticket', () => {
  test('avant la photo : l’enseigne se choisit, la lecture se dit', async ({ page }) => {
    test.setTimeout(90_000)
    const recus = await simule(page, 'ticket', TICKET, { delai: 1500 })
    await connecte(page)
    await page.goto('/ticket')
    await expect(page.getByRole('heading', { name: 'Le ticket' })).toBeVisible()
    await expect(page.getByText('À plat, bien éclairé, de haut.')).toBeVisible()
    const enseignes = page.getByRole('group', { name: 'Enseigne' }).getByRole('button')
    await expect(enseignes).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'Super U' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Lidl' }).click()
    await expect(page.getByRole('button', { name: 'Lidl' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Super U' })).toHaveAttribute('aria-pressed', 'false')
    expect(await pasDeDefilement(page)).toBe(true)

    await donneLaPhoto(page)
    await expect(page.getByText('Je lis… une vingtaine de secondes.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Le ticket lu' })).toBeVisible({ timeout: 20_000 })
    expect(recus[0].enseigne).toBe('Lidl')
  })

  test('ticket lu : en-tête, écart, lignes, rattachement ailleurs, enregistrement', async ({ page }) => {
    test.setTimeout(90_000)
    await simule(page, 'ticket', TICKET)
    await connecte(page)
    await page.goto('/ticket')
    await donneLaPhoto(page)

    await expect(page.getByRole('heading', { name: 'Le ticket lu' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Super U', { exact: true })).toBeVisible()
    await expect(page.getByText('26/10/2026')).toBeVisible()
    await expect(page.getByText('17,24 €', { exact: true })).toBeVisible()
    await expect(page.getByText('5 lignes lues')).toBeVisible()
    await expect(page.getByText('3 rattachées à la liste')).toBeVisible()
    await expect(page.getByText('écart de 1,20 € avec le total imprimé')).toBeVisible()
    await expect(page.getByText(/L’écart est la mesure de la lecture/)).toBeVisible()
    await expect(page.getByText('pas sur la liste : le prix s’apprend quand même')).toHaveCount(2)
    await expect(page.getByText('1 ticket restant ce mois-ci.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enregistrer 4 lignes · 14,84 €' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'XZ4 PROMO' })).toHaveAttribute('aria-checked', 'false')
    expect(await pasDeDefilement(page)).toBe(true)

    /* Toucher une ligne : « Rattacher à », le choix change la phrase de la ligne. */
    const ligne = page.getByRole('button', { name: /SAC POUBELLE 30L/ })
    await ligne.click()
    await expect(ligne).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('Rattacher à :')).toBeVisible()
    await page.getByRole('button', { name: 'oignon', exact: true }).click()
    await expect(page.getByText('sur la liste : oignon').first()).toBeVisible()
    await expect(page.getByText('4 rattachées à la liste')).toBeVisible()

    await page.getByRole('checkbox', { name: 'XZ4 PROMO' }).click()
    await expect(page.getByRole('button', { name: 'Enregistrer 5 lignes · 16,04 €' })).toBeVisible()
    await page.getByRole('button', { name: /^Enregistrer 5 lignes/ }).click()
    await expect(page).toHaveURL(/\/magasin/, { timeout: 15_000 })
  })

  test('un ticket sans écart ni total ne parle pas d’écart', async ({ page }) => {
    test.setTimeout(90_000)
    await simule(page, 'ticket', { ...TICKET, total_eur: null, ecart: null, remisesDeduites: true })
    await connecte(page)
    await page.goto('/ticket')
    await donneLaPhoto(page)
    await expect(page.getByRole('heading', { name: 'Le ticket lu' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/écart/)).toHaveCount(0)
    await expect(page.getByText('remises déduites')).toBeVisible()
  })

  test('un ticket illisible se dit', async ({ page }) => {
    test.setTimeout(90_000)
    await simule(page, 'ticket', {
      enseigne: null, date: null, lignes: [], total_eur: null, somme: 0, ecart: null, remisesDeduites: false,
      lisible: false, commentaire: null, restantes: 17, quota: 30, ms: 500,
    })
    await connecte(page)
    await page.goto('/ticket')
    await donneLaPhoto(page)
    await expect(page.getByRole('heading', { name: 'Je n’ai rien su lire' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('La photo ne montre pas un ticket lisible.')).toBeVisible()
    await page.getByRole('button', { name: 'Reprendre une photo' }).click()
    await expect(page.getByText('Photographier le ticket')).toBeVisible()
  })
})

test.describe('peser', () => {
  test('la carte sombre compte, une pesée aberrante se dit avant d’enregistrer, une pesée s’enregistre et s’efface', async ({ page }) => {
    test.setTimeout(90_000)
    await connecte(page)
    await page.goto('/peser')
    await expect(page.getByRole('heading', { name: 'Peser', exact: true })).toBeVisible()
    await expect(page.getByText('Ce que la semaine demande')).toBeVisible()
    await expect(page.getByText('aliments à connaître,')).toBeVisible()
    await expect(page.getByText('trois pesées par aliment')).toBeVisible()
    await expect(page.getByText('0 sur 3').first()).toBeVisible()

    const oignon = page.getByRole('button', { name: /2 oignons/ })
    await oignon.click()
    await expect(oignon).toHaveAttribute('aria-expanded', 'true')
    await page.getByLabel('Combien').fill('1')
    await page.getByLabel('Pèsent, en grammes').fill('900')
    await expect(page.getByText(/g l’unité, contre \d+ g attendus\. C’est peut-être juste, mais si c’est une faute de frappe/)).toBeVisible()
    await expect(page.getByLabel('Pèsent, en grammes')).toHaveAttribute('aria-invalid', 'true')
    await page.getByLabel('Pèsent, en grammes').fill('110')
    await expect(page.getByText(/contre \d+ g attendus/)).toHaveCount(0)

    await page.getByRole('button', { name: /^Enregistrer · encore 2 après$/ }).dblclick()
    await expect(page.getByText('1 pour 110 g')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('1 sur 3').first()).toBeVisible()
    const { data } = await db.from('weighing').select('grams').eq('household_id', foyer.householdId)
    expect(data, 'un double appui n’enregistre pas deux fois').toHaveLength(1)

    await page.getByRole('button', { name: 'effacer' }).click()
    await expect(page.getByText('1 pour 110 g')).toHaveCount(0)
    expect(await pasDeDefilement(page)).toBe(true)
  })
})

/* ───── Les captures de la maquette, à trois largeurs ───── */

for (const [largeur, hauteur] of [[390, 844], [320, 700], [1440, 900]] as const) {
  test.describe(`captures à ${largeur} px`, () => {
    test.use({
      viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 1,
      isMobile: largeur < 900, hasTouch: largeur < 900,
    })

    const prend = async (page: Page, nom: string) => {
      await page.waitForTimeout(350)
      expect(await pasDeDefilement(page), `défilement horizontal sur « ${nom} » à ${largeur} px`).toBe(true)
      await page.screenshot({ path: `${DOSSIER}/${nom}-${largeur}.png`, fullPage: true })
    }

    test('photo, ticket et peser', async ({ page }) => {
      test.setTimeout(120_000)
      await simule(page, 'frigo', VU)
      await simule(page, 'ticket', TICKET)
      await connecte(page)

      await page.goto('/photo')
      await expect(page.getByText('Prendre la photo')).toBeVisible()
      await prend(page, 'photo-prise')
      await donneLaPhoto(page)
      await expect(page.getByRole('heading', { name: 'Ce que j’ai vu' })).toBeVisible({ timeout: 20_000 })
      await prend(page, 'photo-lue')

      await page.goto('/ticket')
      await expect(page.getByText('Photographier le ticket')).toBeVisible()
      await prend(page, 'ticket-prise')
      await donneLaPhoto(page)
      await expect(page.getByRole('heading', { name: 'Le ticket lu' })).toBeVisible({ timeout: 20_000 })
      await page.getByRole('button', { name: /SAC POUBELLE 30L/ }).click()
      await prend(page, 'ticket-lu')

      await page.goto('/peser')
      await page.getByRole('button', { name: /2 oignons/ }).click()
      await page.getByLabel('Combien').fill('1')
      await page.getByLabel('Pèsent, en grammes').fill('900')
      await expect(page.getByText(/contre \d+ g attendus/)).toBeVisible()
      await prend(page, 'peser')
    })
  })
}
