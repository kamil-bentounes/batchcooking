/**
 * L'écran des Charges refait (27/10) : la liste rangée par catégorie, les gestes qui s'ouvrent au toucher,
 * l'erreur d'un geste sur SA ligne, et l'écran d'avant l'arrivée — calé sur le mois d'arrivée, pas à 0 €.
 *
 * ⚠️ LOCAL, ET RIEN D'AUTRE.
 */
import { expect, test, type Page } from '@playwright/test'
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
test.use({ viewport: { width: 390, height: 844 } })

async function connecte(page: Page, email: string) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

/** La ligne d'une charge, par son nom. */
const ligne = (page: Page, nom: string) => page.locator('[data-charge]').filter({ has: page.getByText(nom, { exact: true }) })

test('la liste est rangée par catégorie, avec ses comptes, ses totaux et ses lignes', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/charges')

  /* Les catégories du budget, la plus lourde d'abord (par mois). */
  const cartes = page.locator('section[aria-label^="Catégorie "]')
  await expect(cartes.first()).toBeVisible({ timeout: 15_000 })
  expect(await cartes.evaluateAll(els => els.map(e => e.getAttribute('aria-label')))).toEqual([
    'Catégorie Crédits', 'Catégorie Impôts', 'Catégorie Vie courante', 'Catégorie Maison',
    'Catégorie Auto', 'Catégorie Santé', 'Catégorie Abonnements'])
  const totaux = await cartes.evaluateAll(els => els.map(e => Number(e.getAttribute('data-total'))))
  expect([...totaux].sort((a, b) => b - a)).toEqual(totaux)

  /* En-tête de catégorie : le nombre de lignes et le total par mois. */
  const maison = page.getByRole('region', { name: 'Catégorie Maison' })
  await expect(maison.getByRole('button', { name: /Maison\s*3 lignes\s*187 €/ })).toBeVisible()

  /* Une ligne : son nom, « 37 € par mois · Kamil et Thauba », le montant, les initiales. */
  const internet = ligne(page, 'Internet')
  await expect(internet).toContainText('37 € par mois · Kamil et Thauba')
  await expect(internet.locator('.chiffre')).toHaveText('37 €')
  /* Une charge qui ne se paie pas chaque mois : son montant, et « 100 € par mois » dessous ; sans compte. */
  const copro = ligne(page, 'Charges de copropriété du bâtiment B')
  await expect(copro).toContainText('300 € par trimestre · Kamil et Thauba · mise de côté')
  await expect(copro.locator('.chiffre')).toHaveText('300 €')
  await expect(copro).toContainText('100 € par mois')
  await expect(copro).toContainText('sans compte')
  await expect(internet).not.toContainText('sans compte')

  /* Le total du foyer, en grand, et la phrase. */
  await expect(page.getByText(/par mois pour le foyer, une fois tout ramené au mois/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Répartition par catégorie' })).toContainText('Crédits')

  /* Les filtres, avec leurs comptes. */
  const filtres = page.getByRole('group', { name: 'Filtrer' })
  await expect(filtres.getByRole('button', { name: /^Tout\s*10$/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(filtres.getByRole('button', { name: /^En commun\s*7$/ })).toBeVisible()
  await expect(filtres.getByRole('button', { name: /^À moi\s*2$/ })).toBeVisible()
  await filtres.getByRole('button', { name: /^À moi/ }).click()
  await expect(page.getByText(/par mois pour toi, une fois tout ramené au mois/)).toBeVisible()
  await expect(page.locator('[data-charge]')).toHaveCount(2)
  await expect(ligne(page, 'Forfait mobile')).toBeVisible()
  await expect(ligne(page, 'Internet')).toHaveCount(0)
})

test('les gestes d’une ligne s’ouvrent quand on la touche, un seul panneau à la fois', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/charges')
  const internet = ligne(page, 'Internet')
  await expect(internet).toBeVisible({ timeout: 15_000 })

  /* Fermés : aucun geste dans la page. */
  await expect(page.getByRole('button', { name: 'Corriger Internet' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retirer Internet' })).toHaveCount(0)

  const toucheInternet = internet.getByRole('button', { expanded: false }).first()
  await toucheInternet.click()
  await expect(internet.getByRole('button', { name: 'Corriger Internet' })).toBeVisible()
  await expect(internet.getByRole('button', { name: 'Changer qui participe' })).toBeVisible()
  await expect(internet.getByRole('button', { name: 'Retirer Internet' })).toBeVisible()
  /* Rattacher n'est proposé qu'à une charge sans compte. */
  await expect(internet.getByRole('button', { name: 'Rattacher' })).toHaveCount(0)

  /* Une autre ligne : la première se referme. Sans compte, elle propose « Rattacher ». */
  const copro = ligne(page, 'Charges de copropriété du bâtiment B')
  await copro.getByRole('button', { expanded: false }).first().click()
  await expect(copro.getByRole('button', { name: 'Rattacher' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Corriger Internet' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Corriger / })).toHaveCount(1)

  /* « Corriger » se déplie DANS la ligne ; les règles d'avant sont là. */
  await copro.getByRole('button', { name: /^Corriger / }).click()
  await expect(copro.getByLabel('Son nom')).toHaveValue('Charges de copropriété du bâtiment B')
  await expect(copro.getByText('Les mois déjà confirmés gardent leur montant. Les autres se refont.')).toBeVisible()
  await expect(copro.getByRole('radiogroup', { name: /^Catégorie de / })).toBeVisible()
  /* Annuler : retour aux gestes de la ligne. */
  await copro.getByRole('button', { name: 'Annuler' }).click()
  await expect(copro.getByRole('button', { name: /^Corriger / })).toBeVisible()
  await expect(copro.getByLabel('Son nom')).toHaveCount(0)

  /* La ligne se referme d'un second toucher. */
  await copro.getByRole('button', { expanded: true }).first().click()
  await expect(page.getByRole('button', { name: /^Corriger / })).toHaveCount(0)
})

test('« Changer qui participe » se règle dans la ligne, et se referme sur elle', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/charges')
  const internet = ligne(page, 'Internet')
  await internet.getByRole('button', { expanded: false }).first().click()
  await internet.getByRole('button', { name: 'Changer qui participe' }).click()
  const kamil = internet.getByRole('checkbox', { name: 'Kamil' })
  const thauba = internet.getByRole('checkbox', { name: 'Thauba' })
  await expect(kamil).toHaveAttribute('aria-checked', 'true')
  await thauba.click()
  await expect(thauba).toHaveAttribute('aria-checked', 'false', { timeout: 10_000 })
  await expect(internet).toContainText('Kamil seul')
  await thauba.click()
  await expect(thauba).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 })
  await internet.getByRole('button', { name: 'Fermer' }).click()
  await expect(internet.getByRole('button', { name: 'Corriger Internet' })).toBeVisible()
})

test('l’erreur d’un geste s’affiche sur la ligne qui l’a produite, jamais en tête de page', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/charges')
  const copro = ligne(page, 'Charges de copropriété du bâtiment B')
  await copro.getByRole('button', { expanded: false }).first().click()

  /* La base refuse l'écriture : « Rattacher » échoue. */
  await page.route('**/rest/v1/charge?*', route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 500, contentType: 'application/json',
                      body: JSON.stringify({ message: 'Refus de test sur la ligne' }) })
    : route.continue())
  await copro.getByRole('button', { name: 'Rattacher' }).click()

  const alerte = page.getByRole('alert').filter({ hasText: 'Refus de test sur la ligne' })
  await expect(alerte).toHaveCount(1)
  await expect(copro.getByRole('alert')).toContainText('Refus de test sur la ligne')
  /* Ni sur les autres lignes, ni au-dessus de la liste (avant la première catégorie). */
  await expect(ligne(page, 'Internet').getByRole('alert')).toHaveCount(0)
  const avantLaListe = await alerte.evaluate(el => {
    const premiere = document.querySelector('section[aria-label^="Catégorie "]')!
    return !!(el.compareDocumentPosition(premiere) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(avantLaListe, 'l’erreur est montée en tête de page').toBe(false)
  /* Et la charge n'a pas bougé : toujours sans compte. */
  await expect(copro).toContainText('sans compte')
})

test('avant son arrivée, l’écran se cale sur le mois d’arrivée : les montants de novembre, pas 0 €', async ({ page }) => {
  foyer = await amorce()
  const d = new Date()
  const p = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  const iso = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`
  const nom = p.toLocaleDateString('fr-FR', { month: 'long' })
  /* Il entre dans le foyer le mois prochain, et tout est posé pour ce mois-là — comme Kamil. */
  await db.from('user_profile').update({ entre_le: iso }).eq('id', foyer.userId)
  await db.from('user_profile').update({ entre_le: iso }).eq('id', foyer.elleId)
  await db.from('charge').update({ debut: iso }).eq('household_id', foyer.householdId)
  await connecte(page, foyer.email)
  await page.goto('/charges')

  /* Une ligne en tête le dit. */
  await expect(page.getByText(`Tu entres dans le foyer en ${nom}`)).toBeVisible({ timeout: 15_000 })

  /* Chaque ligne montre son montant d'arrivée, et plus « commence en … ». */
  const internet = ligne(page, 'Internet')
  await expect(internet.locator('.chiffre')).toHaveText('37 €')
  await expect(internet).toContainText('37 € par mois · Kamil et Thauba')
  await expect(page.getByText(/commence en /)).toHaveCount(0)

  /* Le total est celui du mois d'arrivée, pas 0,00 €. */
  const total = page.getByText(/par mois pour le foyer, une fois tout ramené au mois/)
  await expect(total).toBeVisible()
  expect(await total.innerText()).not.toMatch(/^0,00 €/)
  const maison = page.getByRole('region', { name: 'Catégorie Maison' })
  await expect(maison.getByRole('button', { name: /Maison\s*3 lignes\s*187 €/ })).toBeVisible()

  /* Une charge qui commence APRÈS l'arrivée reste « à venir », grisée et hors du total. */
  await db.from('charge').update({ debut: `${p.getFullYear() + 1}-${String(p.getMonth() + 1).padStart(2, '0')}-01` })
    .eq('household_id', foyer.householdId).eq('libelle', 'Internet')
  await page.reload()
  const plusTard = ligne(page, 'Internet')
  await expect(plusTard).toContainText(`commence en ${nom} ${p.getFullYear() + 1}`)
  await expect(page.getByRole('region', { name: 'Catégorie Maison' })
    .getByRole('button', { name: /Maison\s*3 lignes\s*150 €/ })).toBeVisible()
})

test('à 320 px, ni défilement de côté, ni cible de moins de 44 px dans la liste, un geste ouvert', async ({ page }) => {
  foyer = await amorce()
  await page.setViewportSize({ width: 320, height: 700 })
  await connecte(page, foyer.email)
  const debordement = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  await page.goto('/charges')
  const copro = ligne(page, 'Charges de copropriété du bâtiment B')
  await expect(copro).toBeVisible({ timeout: 15_000 })
  expect(await debordement(), 'la liste déborde à 320 px').toBeLessThanOrEqual(0)

  await copro.getByRole('button', { expanded: false }).first().click()
  expect(await debordement(), 'les gestes débordent à 320 px').toBeLessThanOrEqual(0)
  await copro.getByRole('button', { name: /^Corriger / }).click()
  expect(await debordement(), 'le formulaire « Corriger » déborde à 320 px').toBeLessThanOrEqual(0)

  /* Les cibles : chaque bouton visible de la ligne ouverte fait 44 px au moins. */
  const petits = await copro.getByRole('button').evaluateAll(bs => bs
    .map(b => ({ nom: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 30), h: b.getBoundingClientRect().height }))
    .filter(b => b.h > 0 && b.h < 43.5))
  expect(petits, 'des cibles de moins de 44 px').toEqual([])

  await page.getByRole('button', { name: 'Autre chose' }).click()
  expect(await debordement(), 'le formulaire d’ajout déborde à 320 px').toBeLessThanOrEqual(0)

  await page.goto('/toutes-les-charges')
  await expect(page.getByRole('region', { name: 'Les charges' })).toBeVisible({ timeout: 15_000 })
  expect(await debordement(), 'le tableau déborde à 320 px').toBeLessThanOrEqual(0)
})
