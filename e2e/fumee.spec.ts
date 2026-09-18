/**
 * Chaque écran s'ouvre-t-il vraiment ?
 *
 * Ce fichier existe parce que 525 tests passaient pendant que trois écrans
 * n'avaient jamais été rendus une seule fois. `tsc` garantit qu'un composant
 * compile ; il ne garantit pas qu'il s'affiche, ni qu'un `Number(null)` au
 * premier rendu ne fasse pas une page blanche.
 *
 * On ne compare PAS des pixels : une référence d'image casserait à chaque
 * changement d'espacement et finirait ignorée, ce qui est pire que pas de test.
 * On vérifie qu'un écran s'ouvre, qu'il montre ce qu'il promet, et qu'aucune
 * erreur n'est tombée dans la console — c'est ce qu'un test de fumée doit dire.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'

let foyer: Foyer

test.beforeAll(async () => { foyer = await amorce() })
test.afterAll(async () => { if (foyer) await efface(foyer) })

/** Les erreurs de console sont des échecs : une page blanche en laisse une. */
function surveille(page: Page): string[] {
  const erreurs: string[] = []
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()) })
  page.on('pageerror', e => erreurs.push(e.message))
  return erreurs
}

async function connecte(page: Page) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(foyer.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: /connexion|se connecter|entrer/i }).click()
  // L'accueil porte le prénom : c'est le signe que la session ET le foyer sont là.
  await expect(page.getByRole('button', { name: /réglages|kamil/i }).first())
    .toBeVisible({ timeout: 15_000 })
}

test.describe('les écrans s’ouvrent', () => {
  test('la connexion mène à l’accueil', async ({ page }) => {
    const erreurs = surveille(page)
    await connecte(page)
    await expect(page.locator('h1').first()).toBeVisible()
    expect(erreurs, erreurs.join(' | ')).toEqual([])
  })

  for (const [chemin, attendu] of [
    ['/choisir', /Choisir|recette/i],
    ['/magasin', /liste/i],
    ['/semaine', /semaine/i],
    ['/stock', /ce que j|frigo|placard/i],
    ['/bilan', /bilan/i],
    ['/ticket', /ticket/i],
    ['/peser', /peser/i],
    ['/photo', /photo/i],
    ['/objectifs', /objectif|cible/i],
    ['/reglages', /réglage/i],
  ] as const) {
    test(`${chemin} s’affiche`, async ({ page }) => {
      const erreurs = surveille(page)
      await connecte(page)
      await page.goto(chemin)
      await expect(page.getByText(attendu).first()).toBeVisible({ timeout: 10_000 })
      // Une page blanche n'a pas de titre : c'est le plus simple des garde-fous.
      await expect(page.locator('h1').first()).toBeVisible()
      expect(erreurs, erreurs.join(' | ')).toEqual([])
    })
  }
})

test.describe('ce que les écrans doivent VRAIMENT montrer', () => {
  test('le catalogue filtre sur le temps actif, pas sur le temps total', async ({ page }) => {
    await connecte(page)
    await page.goto('/choisir')
    // 8 min actives pour 33 min au total : c'est le chiffre que personne
    // d'autre n'affiche, et il doit être celui qui s'affiche.
    await expect(page.getByText(/8 min/).first()).toBeVisible({ timeout: 10_000 })
  })

  test('le bilan dit sur combien de jours il parle (D33)', async ({ page }) => {
    await connecte(page)
    await page.goto('/bilan')
    // Deux dîners cochés, le reste vide : l'écran doit le dire plutôt que de
    // faire passer les blancs pour des zéros.
    await expect(page.getByText(/jours? renseignés? sur/i).first())
      .toBeVisible({ timeout: 10_000 })
  })

  test('le bilan affiche le budget sans inventer de dépense', async ({ page }) => {
    await connecte(page)
    await page.goto('/bilan')
    // Aucun ticket : la jauge existe (budget posé) mais le payé reste à zéro,
    // et l'écran le dit au lieu d'additionner les estimations.
    await expect(page.getByText(/aucun ticket enregistré/i)).toBeVisible({ timeout: 10_000 })
  })

  test('le bilan trace DEUX graphiques, jamais deux axes', async ({ page }) => {
    await connecte(page)
    await page.goto('/bilan')
    // Deux dessins séparés, chacun avec son échelle. Superposés, ils
    // exigeraient une double échelle, et une double échelle se lit de travers.
    await expect(page.getByText('CALORIES')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('PROTÉINES')).toBeVisible()
    await expect(page.getByRole('img', { name: /calories par jour/i })).toBeVisible()
    await expect(page.getByRole('img', { name: /protéines par jour/i })).toBeVisible()
  })

  test('la pesée réclame l’aliment et annonce la référence', async ({ page }) => {
    await connecte(page)
    await page.goto('/peser')
    // « 2 oignons » : la ligne au compte que l'app ne sait pas convertir seule.
    await expect(page.getByText('Oignon', { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/110 g en attendant/)).toBeVisible()
  })

  test('aucun bouton natif en anglais sur les écrans de photo', async ({ page }) => {
    // Un `<input type="file">` nu affiche « Choose File », en anglais, dans une
    // application entièrement en français — et ce libellé n'est pas modifiable.
    await connecte(page)
    for (const c of ['/ticket', '/photo']) {
      await page.goto(c)
      await expect(page.getByText(/choose file|no file chosen/i)).toHaveCount(0)
      await expect(page.getByText(/photographier le ticket|prendre la photo/i).first())
        .toBeVisible()
    }
  })

  test('le ticket refuse de commencer sans photo', async ({ page }) => {
    await connecte(page)
    await page.goto('/ticket')
    await expect(page.getByText(/photographie-le/i).first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('les captures de référence', () => {
  test('sont prises pour relecture à l’œil', async ({ page }) => {
    // Pas une comparaison : une trace. Elles servent à REGARDER l'application
    // après un changement, ce qu'aucune assertion ne remplace.
    await connecte(page)
    for (const c of ['/', '/choisir', '/magasin', '/bilan', '/ticket', '/peser', '/stock']) {
      await page.goto(c)
      await page.waitForTimeout(400)
      await page.screenshot({
        path: `.shots/${c === '/' ? 'accueil' : c.slice(1)}.png`,
        fullPage: true,
      })
    }
  })
})
