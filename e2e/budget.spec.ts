/**
 * L'écran du mois refait (lot 2) : le parcours entier, et ses captures à la
 * largeur de la maquette (390 px), dans `.shots/budget/`.
 *
 * Les tests partagent le foyer d'amorce et tournent dans l'ordre : les
 * dépenses déclarées dans l'un se lisent dans les suivants.
 */
import { expect, test, type Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'
import { releve } from './couverture.ts'

let foyer: Foyer
test.beforeAll(async () => { foyer = await amorce() })
test.afterAll(async () => { if (foyer) await efface(foyer) })
test.use({ viewport: { width: 390, height: 844 } })

async function connecte(page: Page, email = foyer.email) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
  await releve(page)
}

/** Deux images : l'écran, et la page entière. */
async function prend(page: Page, nom: string) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `.shots/budget/${nom}.png` })
  await page.screenshot({ path: `.shots/budget/${nom}-entier.png`, fullPage: true })
  await releve(page)
}

/** Ouvre une catégorie repliée. Une catégorie sans montant à dire l'est d'office. */
async function ouvreLaCategorie(page: Page, nom: string) {
  const entete = page.getByRole('region', { name: `Catégorie ${nom}` })
    .locator('button[aria-expanded]').first()
  await expect(entete).toBeVisible({ timeout: 15_000 })
  if (await entete.getAttribute('aria-expanded') === 'false') await entete.click()
}

test.describe('l’écran du mois', () => {
  test('ouvre sur ce qui reste, puis les catégories triées et le filtre — sans « À verser »',
    async ({ page }) => {
      await connecte(page)
      await page.goto('/budget')
      const recap = page.getByRole('region', { name: 'Ce qui reste' })
      await expect(recap.getByText('Il te reste')).toBeVisible({ timeout: 15_000 })
      await expect(recap.getByText(/sur 3\s700 € de revenus/)).toBeVisible()
      await expect(page.getByText(/à verser/i)).toHaveCount(0)

      const cartes = page.getByRole('region', { name: /^Catégorie / })
      await expect(cartes.first()).toBeVisible()
      const totaux = await cartes.evaluateAll(els =>
        els.map(e => Number(e.getAttribute('data-total'))))
      expect(totaux.length).toBeGreaterThanOrEqual(5)
      expect([...totaux].sort((a, b) => b - a), 'les catégories ne sont pas triées').toEqual(totaux)

      await page.getByRole('radio', { name: /^Moi/ }).click()
      await expect(page.getByRole('region', { name: 'Catégorie Abonnements' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Catégorie Maison' })).toHaveCount(0)
      await page.getByRole('radio', { name: /^Tout/ }).click()
      await prend(page, '01-mois')
    })

  test('Déclarer : deux montants s’additionnent, la jauge et le reste suivent', async ({ page }) => {
    await connecte(page)
    await page.goto('/budget')
    await page.getByRole('button', { name: 'Déclarer pour Courses' }).click()
    const feuille = page.getByRole('dialog', { name: 'Courses' })
    await expect(feuille).toBeVisible()
    await feuille.getByLabel('Nouvelle dépense').fill('47,90')
    await feuille.getByRole('button', { name: 'Ajouter 47,90 €' }).click()
    await expect(feuille.getByText(/Il reste 752,10 € pour /)).toBeVisible({ timeout: 10_000 })
    await feuille.getByLabel('Nouvelle dépense').fill('118,50')
    await feuille.getByRole('button', { name: 'Ajouter 118,50 €' }).click()
    await expect(feuille.getByText(/Il reste 633,60 € pour /)).toBeVisible({ timeout: 10_000 })
    await expect(feuille.getByText('Déjà ce mois-ci')).toBeVisible()
    await prend(page, '02-feuille-declarer')
    await feuille.getByRole('button', { name: 'Fermer' }).click()
    await expect(page.getByRole('button', { name: /^Courses : 166,40 € sur 800 €/ })).toBeVisible()
  })

  test('Facture du mois : « C’est ça », et aucune trace sur l’écran du mois (D79)',
    async ({ page }) => {
      await connecte(page)
      await page.goto('/budget')
      await ouvreLaCategorie(page, 'Maison')
      await page.getByRole('button', { name: /^Électricité/ }).click()
      const feuille = page.getByRole('dialog', { name: 'Électricité' })
      await expect(feuille.getByText('Le montant habituel : 50 €')).toBeVisible()
      await prend(page, '03-feuille-facture')
      await feuille.getByRole('button', { name: 'C’est ça' }).click()
      await expect(feuille.getByText('Le montant retenu : 50 €')).toBeVisible({ timeout: 10_000 })
      await feuille.getByRole('button', { name: 'Fermer' }).click()
      await expect(page.getByText(/validé|confirmé|✓/i), 'une confirmation a laissé une trace')
        .toHaveCount(0)
    })

  test('Facture mise de côté : l’aperçu, puis la ligne d’ajustement dans le mois',
    async ({ page }) => {
      await connecte(page)
      await page.goto('/budget')
      await ouvreLaCategorie(page, 'Auto')
      await page.getByRole('button', { name: /^Entretien auto/ }).click()
      const feuille = page.getByRole('dialog', { name: 'Entretien auto' })
      await expect(feuille.getByText(/Prévu pour \d{4}/)).toBeVisible({ timeout: 10_000 })
      await feuille.getByLabel('Montant de la facture').fill('9000')
      await expect(feuille.getByText(/de plus que les .* prévus pour \d{4} : ils s’ajoutent à /))
        .toBeVisible()
      await prend(page, '04-feuille-mise-de-cote')
      await feuille.getByRole('button', { name: 'Ajouter la facture' }).click()
      await expect(feuille.getByText(/Aucune facture/)).toHaveCount(0, { timeout: 10_000 })
      await feuille.getByRole('button', { name: 'Fermer' }).click()
      await expect(page.getByText(/Entretien auto — facture \d{4}/)).toBeVisible({ timeout: 10_000 })
    })

  test('D80 : Thauba voit toutes les lignes, son « Il te reste » ne compte que ses parts',
    async ({ page }) => {
      await connecte(page, foyer.elleEmail)
      await page.goto('/budget')
      const recap = page.getByRole('region', { name: 'Ce qui reste' })
      await expect(recap.getByText(/sur 2\s400 € de revenus/)).toBeVisible({ timeout: 15_000 })
      await ouvreLaCategorie(page, 'Abonnements')
      await expect(page.getByRole('region', { name: 'Catégorie Abonnements' })
        .getByText('Forfait mobile'), 'la ligne de Kamil est cachée').toBeVisible()
      /* Son reste : son revenu moins SES parts du mois — la base les connaît. */
      const mois = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
      const { data } = await db.from('depense').select('montant_cents, facon, depense_part(user_profile_id, part_cents)')
        .eq('household_id', foyer.householdId).eq('mois', mois)
      const siennes = (data ?? []).reduce((t, l) => t + (l.depense_part
        .find((p: { user_profile_id: string }) => p.user_profile_id === foyer.elleId)?.part_cents ?? 0), 0)
      const attendu = ((240_000 - siennes) / 100).toLocaleString('fr-FR',
        { minimumFractionDigits: (240_000 - siennes) % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })
      await expect(recap.getByText(`${attendu} €`)).toBeVisible()
      await prend(page, '05-mois-vu-par-thauba')
    })

  test('la carte Budget du hub : ce qui reste, et la ligne qui suit', async ({ page }) => {
    await connecte(page)
    const carte = page.getByRole('button', { name: /^Budget/ })
    await expect(carte.getByText(/Il te reste/)).toBeVisible({ timeout: 15_000 })
    await expect(carte.getByText(/montants? à dire|Tout est à jour|est à clôturer/)).toBeVisible()
    await prend(page, '06-hub')
  })
})
