/**
 * Le CYCLE joué en entier, d'un bout à l'autre.
 *
 * Les trois écrans les plus mal couverts de l'application — la cuisine à 12 %
 * de branches, la semaine à 28 %, le magasin à 40 % — le sont pour une raison
 * simple : ils n'existent que dans un ÉTAT du cycle, et aucun banc ne l'y
 * amenait. On visitait leur URL dans l'état « semaine », ils rendaient leur
 * écran vide, et c'est ce vide qui était mesuré.
 *
 * Ici on avance vraiment : on choisit, on fait les courses, on enregistre le
 * plan, on prend un geste en cuisine, on dresse, on mange. Chaque passage
 * laisse une capture — c'est le seul endroit où l'on voit l'écran SOMBRE, celui
 * qu'on regarde les mains sales, à un mètre des yeux.
 *
 * Ce banc ne simule rien : pas de réponse de modèle, pas de fichier. Tout ce
 * qu'il touche est de la vraie donnée, et la seule chose qu'il force est
 * l'état du cycle — ce que l'écran d'accueil fait de toute façon.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'
import { releve } from './couverture.ts'

let foyer: Foyer

test.beforeAll(async () => { foyer = await amorce({ cycleEtat: 'selection' }) })
test.afterAll(async () => { if (foyer) await efface(foyer) })

async function connecte(page: Page) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(foyer.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' }))
    .toBeVisible({ timeout: 15_000 })
  await releve(page)
}

async function prend(page: Page, nom: string) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `.shots/cycle/${nom}.png` })
  await page.screenshot({ path: `.shots/cycle/${nom}-entier.png`, fullPage: true })
  await releve(page)
}

/**
 * L'état du cycle, posé directement — c'est ce que l'écran d'accueil fait au
 * clic, et les transitions restent celles que la base autorise : le graphe est
 * à SENS UNIQUE, on ne remonte pas.
 */
async function etat(vers: string) {
  const { error } = await db.from('cycle').update({ state: vers }).eq('id', foyer.cycleId)
  expect(error, `bascule vers ${vers} refusée : ${error?.message}`).toBeNull()
}

test.describe('le cycle, d’un bout à l’autre', () => {
  test('on choisit, on achète, on cuisine, on dresse, on mange', async ({ page }) => {
    test.setTimeout(240_000)
    await connecte(page)

    /* ── 1 · La sélection ──────────────────────────────────────────────── */
    await page.goto('/choisir')
    await expect(page.getByText(/Dahl de lentilles/).first())
      .toBeVisible({ timeout: 20_000 })
    await prend(page, '01-choisir')

    /* ── 2 · Les courses ───────────────────────────────────────────────── */
    await etat('courses')
    await page.goto('/magasin')
    await prend(page, '02-magasin')

    /* Cocher un article : c'est LE geste de l'écran, et rien ne le touchait. */
    const aPrendre = page.getByRole('checkbox', { checked: false })
    await expect(aPrendre.first(), 'la liste de courses est vide')
      .toBeVisible({ timeout: 20_000 })
    await aPrendre.first().click()
    await page.waitForTimeout(700)
    await prend(page, '03-magasin-coche')

    /* Et tout le reste de l'écran, qu'aucun test n'ouvrait : les deux panneaux
       de l'en-tête, et le détail d'un article — magasin, rayon, suppression. */
    for (const [nom, capture] of [
      [/ajouter/i, '03a-magasin-ajout'],
      [/compléter|d’après/i, '03b-magasin-completer'],
    ] as const) {
      const b = page.getByRole('button', { name: nom }).first()
      if (await b.count()) {
        await b.click()
        await page.waitForTimeout(500)
        await prend(page, capture)
        await b.click()
      }
    }

    /* Le détail d'un article s'ouvre en touchant son libellé. */
    const libelle = page.getByRole('button', { name: /tomates|pain|oignon/i }).first()
    if (await libelle.count()) {
      await libelle.click()
      await page.waitForTimeout(600)
      await prend(page, '03c-magasin-article')
    }

    /* ── 3 · Le plan, puis LA CUISINE ──────────────────────────────────── */
    await etat('pret')
    await page.goto('/plan')
    const commencer = page.getByRole('button', { name: /commencer la session/i })
    await expect(commencer, 'le plan ne propose pas de commencer')
      .toBeVisible({ timeout: 20_000 })
    await prend(page, '04-plan')
    await commencer.click()

    /* L'écran SOMBRE. Le seul de l'application, et le moins couvert : un geste
       à l'écran, un chiffre de 58 px, le téléphone posé sur un plan de travail. */
    await expect(page).toHaveURL(/\/cuisine/, { timeout: 20_000 })
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 })
    await prend(page, '05-cuisine')

    /* Prendre un geste, puis le terminer. C'est tout ce que fait cet écran, et
       c'est précisément ce qu'aucun test ne faisait. */
    /* Le MÊME bouton porte les deux gestes : « Je prends », puis « C'est fait »
       une fois qu'il est à soi (`Cuisine.tsx:221`). */
    const geste = page.getByRole('button', { name: 'Je prends' })
    await expect(geste, 'aucun geste à prendre : le plan est vide')
      .toBeVisible({ timeout: 20_000 })
    await geste.click()
    await expect(page.getByRole('button', { name: 'C’est fait' }))
      .toBeVisible({ timeout: 20_000 })
    await prend(page, '06-cuisine-geste-pris')

    await page.getByRole('button', { name: 'C’est fait' }).click()
    await page.waitForTimeout(1_200)
    await prend(page, '07-cuisine-geste-fini')

    /* ── 4 · Le dressage ───────────────────────────────────────────────── */
    await etat('dressage')
    await page.goto('/dressage')
    await prend(page, '08-dressage')

    /* ── 5 · La semaine ────────────────────────────────────────────────── */
    await etat('semaine')
    await page.goto('/semaine')
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 })
    await prend(page, '09-semaine')

    /* ⚠️ Il faut d'abord qu'un repas soit PLACÉ.
       La semaine du foyer neuf est vide — « 0 barquettes placées » — donc pas
       une ligne de repas, donc rien à ouvrir, donc la moitié de l'écran jamais
       rendue. On place une barquette libre sur aujourd'hui, ce que fait le
       dressage. */
    const { data: libre } = await db.from('portion').select('id')
      .eq('cycle_id', foyer.cycleId).neq('state', 'mange').limit(1).maybeSingle()
    if (libre) {
      const aujourdhui = new Date().toISOString().slice(0, 10)
      const { error } = await db.from('meal_slot').insert({
        household_id: foyer.householdId, cycle_id: foyer.cycleId,
        user_profile_id: foyer.userId, day: aujourdhui, meal: 'dejeuner',
        portion_id: libre.id, state: 'prevu',
      })
      expect(error, `barquette non placée : ${error?.message}`).toBeNull()
      await page.reload()
      await page.waitForTimeout(800)
      await prend(page, '09c-semaine-repas-place')
    }

    /* ⚠️ « Je l'ai mangé » est DANS un panneau replié : il faut toucher le repas
       pour l'ouvrir. Une première version cherchait un bouton « mangée » qui
       n'existe pas, sautait en silence, et la couverture de cet écran ne
       bougeait pas d'un point. */
    const filtres = page.getByRole('group', { name: 'Filtrer' })
    if (await filtres.count()) {
      const parPersonne = filtres.getByRole('button')
      const combien = await parPersonne.count()
      if (combien > 1) {
        await parPersonne.nth(1).click()
        await page.waitForTimeout(500)
        await prend(page, '09a-semaine-filtree')
        await parPersonne.first().click()
      }
    }

    /* Le premier repas de la liste, ouvert. */
    const repas = page.locator('button', { hasText: /Dahl|Poulet/i }).first()
    if (await repas.count()) {
      await repas.click()
      await page.waitForTimeout(600)
      await prend(page, '09b-semaine-repas-ouvert')
    }

    const mange = page.getByRole('button', { name: 'Je l’ai mangé' }).first()
    if (await mange.count()) {
      await mange.click()
      await page.waitForTimeout(900)
      await prend(page, '10-semaine-mangee')
    } else {
      const saute = page.getByRole('button', { name: 'Sauté' }).first()
      if (await saute.count()) {
        await saute.click()
        await page.waitForTimeout(900)
        await prend(page, '10-semaine-saute')
      }
    }

    /* ── 6 · Le bilan, qui relit tout ce qui précède ───────────────────── */
    await page.goto('/bilan')
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 })
    await prend(page, '11-bilan')
  })

  test('une session interrompue se reprend, elle ne se perd pas', async ({ page }) => {
    /* L'état `interrompue` existe dans la base depuis toujours et n'était rendu
       par aucune capture : on ne savait pas ce qu'il montre, ni s'il offre une
       sortie. */
    test.setTimeout(120_000)
    await connecte(page)
    await etat('interrompue')
    await page.goto('/cuisine-accueil')
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 })
    await prend(page, '12-interrompue')

    await etat('cloture')
    await page.goto('/cuisine-accueil')
    await prend(page, '13-cloture')
  })
})
