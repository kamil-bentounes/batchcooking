/**
 * 23/10 — les défauts du produit que la relecture du manuel de l'aide a trouvés en comparant chaque page au code,
 * rejoués au clic pour qu'ils ne reviennent pas :
 *
 *   1. « Inventer », ouvert par son adresse (rechargement direct) : les bornes de départ viennent des objectifs, pas
 *      des valeurs par défaut (30 g, 620 kcal) prises avant que le foyer soit lu.
 *   2. « Peser » sans semaine ouverte : l'écran le dit, au lieu de rester sur « Un instant… » pour toujours.
 *   3. Une recette inventée GARDÉE se choisit : elle est « plannable » dès que chaque étape a une durée.
 *
 * ⚠️ LOCAL, ET RIEN D'AUTRE.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, db, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'

let foyer: Foyer

test.beforeAll(() => {
  const url = process.env.VITE_SUPABASE_URL ?? ''
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(`Ce banc ne se joue qu'en local. Base visée : ${url || '(non renseignée)'}.`)
  }
})
test.afterEach(async () => { if (foyer) await efface(foyer) })

async function connecte(page: Page, email: string) {
  await page.goto('/')
  await page.getByLabel('Ton e-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

test('« Inventer » ouvert par son adresse part des objectifs : 2 200 kcal et 150 g donnent 770 kcal et 53 g', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)

  await page.goto('/inventer') // un rechargement complet : le foyer n'est pas encore lu au premier rendu
  await expect(page.getByRole('heading', { name: /Envie\s*spéciale/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByLabel('Au plus kcal la part')).toHaveValue('770')
  await expect(page.getByLabel('Au moins g de protéines')).toHaveValue('53')
  await page.screenshot({ path: '.shots/defauts/01-inventer-bornes.png' })
})

test('« Peser » sans semaine ouverte le dit, au lieu d’attendre sans fin', async ({ page }) => {
  foyer = await amorce()
  // Pas de semaine : on retire le cycle de la fumée (clé de service, jamais depuis l'appli).
  await db.from('cycle').delete().eq('household_id', foyer.householdId)
  await connecte(page, foyer.email)

  await page.goto('/peser')
  await expect(page.getByText('Choisis des recettes', { exact: false })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Un instant', { exact: false })).toHaveCount(0)
  await page.screenshot({ path: '.shots/defauts/02-peser-sans-semaine.png' })
})

test('une recette inventée gardée est planifiable : « Choisir » la trouve', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)

  /* La fonction `inventer` est simulée : on ne teste pas le modèle, on teste ce qui est ÉCRIT quand on garde. */
  await page.route('**/functions/v1/inventer', async route => {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    return route.fulfill({
      status: 200, headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({
        restantes: 9,
        recette: {
          titre: 'Curry de pois chiches express', parts: 2,
          ingredients: [{ nom: 'pois chiches', quantite: 400, unite: 'g' }],
          etapes: [
            { texte: 'Faire revenir les oignons', minutes: 8, appareil: 'plaque', charge: 'actif' },
            { texte: 'Laisser mijoter', minutes: 15, appareil: 'plaque', charge: 'passif' },
          ],
          proteinesParPart: [28, 34], kcalParPart: [520, 600], minutesActives: 8, manquants: [],
        },
      }),
    })
  })

  await page.goto('/inventer')
  await page.getByRole('button', { name: 'Invente-moi ça' }).click()
  await expect(page.getByText('Curry de pois chiches express')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Garder cette recette' }).click()
  await page.waitForLoadState('networkidle')

  const { data } = await db.from('recipe').select('id, plannable, origin')
    .eq('owner_household_id', foyer.householdId).eq('title', 'Curry de pois chiches express')
  expect(data?.length).toBe(1)
  expect(data![0]).toMatchObject({ origin: 'generee', plannable: true })
  await page.screenshot({ path: '.shots/defauts/03-inventee-gardee.png' })
})
