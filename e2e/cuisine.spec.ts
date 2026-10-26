/**
 * Non-régression du grand test, parcours « cuisine » (22/10/2026).
 *
 * Chaque test rejoue, par des clics, un défaut trouvé en jouant la cuisine : recherche à deux
 * mots, ligne qui saute quand on règle ses parts, courses qui se contredisent ou se doublent,
 * « Supprimer » qui ne fait rien, quantités qui mentent, accueil figé sans cycle, frise
 * illisible, appli ouverte sans réseau.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'

let foyer: Foyer
test.beforeAll(async () => { foyer = await amorce({ budget: false, cycleEtat: 'selection' }) })
test.afterAll(async () => { if (foyer) await efface(foyer) })

async function connecte(page: Page) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(foyer.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

const cherche = (page: Page) => page.getByPlaceholder(/chercher une recette/i)
const carte = (page: Page, titre: RegExp) => page.getByRole('article').filter({ hasText: titre }).first()

test.describe('la cuisine, jouée au clic', () => {
  test.use({ actionTimeout: 15_000 })

  test('on cherche à deux mots, dans le désordre', async ({ page }) => {
    await connecte(page)
    await page.goto('/choisir')
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 20_000 })
    await cherche(page).fill('corail dahl')
    await expect(carte(page, /Dahl de lentilles corail/)).toBeVisible()
    await cherche(page).fill('dahl poulet')
    await expect(page.getByText('Rien ne correspond')).toBeVisible()
  })

  test('régler les parts ne déplace pas la ligne, et le refus se lit sous le pouce', async ({ page }) => {
    await connecte(page)
    await page.goto('/choisir')
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 20_000 })
    const retenues = page.getByRole('region', { name: /ce qu’on cuisine/i })
    const titres = () => retenues.locator('li span.grow').allInnerTexts()
    const avant = await titres()
    expect(avant.length).toBeGreaterThanOrEqual(2)
    const champ = retenues.getByRole('textbox').first()
    await champ.fill('7')
    await champ.blur()
    await expect(champ).toHaveValue('7')
    expect(await titres(), 'la ligne réglée a changé de place').toEqual(avant)
    await champ.fill('0')
    const alerte = page.getByRole('alert').filter({ hasText: 'Il faut au moins 1 part.' })
    await expect(alerte).toBeVisible()
    const boite = await alerte.boundingBox()
    expect(boite!.y + boite!.height, 'le refus est sous le bas de l’écran').toBeLessThanOrEqual(844)
  })

  test('les courses ne se contredisent pas, ne se doublent pas, et se corrigent', async ({ page }) => {
    await connecte(page)
    await page.goto('/choisir')
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Faire la liste' }).click()
    await expect(page.getByRole('heading', { name: 'La liste' })).toBeVisible({ timeout: 20_000 })
    // « 400 g de lentilles corail » (sans aliment reconnu) : la ligne porte SA quantité (800 g à
    // deux recettes), pas celle du texte de la recette.
    await expect(page.getByRole('checkbox', { name: /^Lentilles corail/ })).toHaveCount(1)
    await expect(page.getByRole('checkbox', { name: /^400 g de lentilles/ })).toHaveCount(0)

    // Cocher, puis refaire la liste depuis « Choisir » : pas de double.
    await page.getByRole('checkbox', { name: /^Lentilles corail/ }).click()
    await expect.poll(async () => (await db.from('shopping_item').select('id')
      .eq('cycle_id', foyer.cycleId).not('checked_at', 'is', null)).data?.length).toBe(1)
    await page.goto('/choisir')
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Faire la liste' }).click()
    await expect(page.getByRole('heading', { name: 'La liste' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('checkbox', { name: /^Lentilles corail/ })).toHaveCount(1)

    // Une ligne cochée ne se supprime pas : on ne propose pas un bouton sans effet.
    await page.getByText(/^Lentilles corail/).first().click()
    await expect(page.getByText('Décoche-le pour le supprimer.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0)

    // Un prix payé hors bornes se refuse avant la base.
    await page.getByLabel('Prix payé').fill('-3')
    await page.getByLabel('Prix payé').blur()
    await expect(page.getByRole('alert')).toContainText('Un prix payé va de 0 à 10')

    // Un article à la main prend son rayon du libellé, pas « Fruits et légumes ».
    await page.getByRole('button', { name: '+ Ajouter' }).click()
    await page.getByPlaceholder('Ce qu’il faut prendre').fill('Sel fin')
    await expect(page.getByRole('combobox', { name: 'Rayon' })).toHaveValue('Autre')
  })

  test('un geste raté se dit, au lieu de ne rien faire', async ({ page }) => {
    await connecte(page)
    await page.goto('/magasin')
    await expect(page.getByRole('heading', { name: 'La liste' })).toBeVisible({ timeout: 20_000 })
    await page.route('**/rest/v1/shopping_item**', r =>
      r.request().method() === 'PATCH' ? r.abort('internetdisconnected') : r.continue())
    await page.getByRole('checkbox').first().click()
    await expect(page.getByRole('alert')).toContainText('Je n’ai pas pu cocher cet article.')
  })

  test('le stock accepte une demi-quantité, refuse zéro en français, et ne déborde pas', async ({ page }) => {
    await connecte(page)
    await page.goto('/stock')
    await expect(page, '/stock mène au frigo').toHaveURL(/\/frigo$/, { timeout: 20_000 })
    await page.getByRole('button', { name: 'Ouvrir le frigo' }).click()
    await expect(page.getByRole('region', { name: 'Dans le frigo' })).toBeVisible({ timeout: 5_000 })
    const ajoute = async (nom: string, q: string) => {
      await page.getByRole('button', { name: '+ Ajouter au frigo' }).click()
      await page.getByLabel('Aliment').fill(nom)
      await page.getByRole('spinbutton', { name: 'Quantité' }).fill(q)
      await page.getByLabel('Unité').selectOption('u')
      await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
    }
    await ajoute('Courgette', '0.5')
    await expect(page.getByText('0,5 u')).toBeVisible()
    await ajoute('Zéro', '0')
    await expect(page.getByRole('alert')).toHaveText('Une quantité est plus grande que zéro.')
    await page.getByLabel('Aliment').fill('X'.repeat(80))
    await page.getByRole('spinbutton', { name: 'Quantité' }).fill('2')
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click()
    // La ligne doit être là avant de mesurer : sinon on mesure la page d'avant l'ajout.
    await expect(page.getByText('X'.repeat(80))).toBeVisible()
    const debord = await page.evaluate(() => {
      const dedans = document.querySelector('[data-interieur=ouvert]')!
      return Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth,
                      dedans.scrollWidth - dedans.clientWidth)
    })
    expect(debord, 'un libellé sans espace fait déborder la page').toBe(0)
  })

  test('la frise du plan ne superpose pas les gestes', async ({ page }) => {
    await db.from('cycle').update({ state: 'pret' }).eq('id', foyer.cycleId)
    await connecte(page)
    await page.goto('/plan')
    const frise = page.getByRole('region', { name: 'Déroulé de la session' })
    await expect(frise).toBeVisible({ timeout: 20_000 })
    const gestes = await frise.locator('.right-0 > div').evaluateAll(l => l.map(e => {
      const r = e.getBoundingClientRect(); return [r.top, r.bottom] }))
    expect(gestes.length).toBeGreaterThan(1)
    for (let i = 1; i < gestes.length; i++) {
      expect(gestes[i][0], 'deux gestes se recouvrent').toBeGreaterThanOrEqual(gestes[i - 1][0] + 40)
    }
  })

  test('sans cycle vivant, l’accueil ne reste pas sur « Un instant… »', async ({ page }) => {
    await db.from('cycle').update({ state: 'interrompue' }).eq('id', foyer.cycleId)
    await connecte(page)
    const t0 = Date.now()
    await page.goto('/cuisine-accueil')
    /* La session interrompue de la semaine EST l'état du moment (25/10) : plus « Rien de prévu ». */
    await expect(page.getByRole('heading', { name: 'Session interrompue' })).toBeVisible({ timeout: 5_000 })
    expect(Date.now() - t0).toBeLessThan(5_000)
    // …et la session interrompue se reprend.
    await page.getByRole('button', { name: 'Reprendre la session interrompue' }).click()
    await expect.poll(async () => (await db.from('cycle').select('state')
      .eq('id', foyer.cycleId).single()).data?.state).toBe('en_cuisine')
  })

  test('ouverte sans réseau, l’appli le dit, et ne parle pas d’invitation', async ({ page, context }) => {
    test.setTimeout(90_000)
    await connecte(page)
    await context.route('**/127.0.0.1:54321/**', r => r.abort('internetdisconnected'))
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Hors ligne' })).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText('Il te faut une invitation')).toHaveCount(0)
    await context.unroute('**/127.0.0.1:54321/**')
    await page.getByRole('button', { name: 'Réessayer' }).click()
    await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 20_000 })
  })
})
