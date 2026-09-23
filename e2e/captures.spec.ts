/**
 * La revue à l'œil, écran par écran.
 *
 * Ce fichier ne fait presque aucune assertion : son produit, ce sont les
 * CAPTURES. Les audits automatiques de `parcours.spec.ts` mesurent ce qui se
 * mesure — contrastes, cibles tactiles — mais ils ne voient pas un titre qui
 * déborde, une colonne vide sous un en-tête, deux boutons qui se chevauchent,
 * ou un écran dont l'ordre de lecture trompe. Ça, il faut le regarder.
 *
 * Chaque écran est pris DANS L'ÉTAT OÙ ON LE RENCONTRE, pas vide : un foyer
 * neuf n'est pas l'état intéressant, c'est le moins fréquent. La suite remplit
 * donc le budget avant de photographier.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'

let foyer: Foyer

test.beforeAll(async () => { foyer = await amorce() })
test.afterAll(async () => { if (foyer) await efface(foyer) })

async function connecte(page: Page) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(foyer.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    /* L'avatar du hub. Il portait `aria-label="Réglages"` ; il mène désormais au
     PROFIL — un tap sur son initiale doit mener à soi, et c'était le seul
     chemin manquant vers l'écran d'arrivée. On vise donc la marque, qui ne
     bougera pas. */
  await expect(page.getByRole('heading', { name: 'Popote' }))
    .toBeVisible({ timeout: 15_000 })
}

/**
 * Deux images par écran, et c'est voulu.
 *
 * `fullPage` avec une barre `position: fixed` produit un artefact : la barre est
 * peinte à la position du viewport, donc en HAUT de l'image assemblée, ce qui
 * fait croire à un bug qui n'existe pas. Le viewport dit la vérité de la
 * première impression ; la page entière dit ce qu'il y a dessous.
 */
async function prend(page: Page, nom: string) {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `.shots/revue/${nom}.png` })
  await page.screenshot({ path: `.shots/revue/${nom}-entier.png`, fullPage: true })
}

test.describe('les captures de revue', () => {
  test('tous les écrans, dans l’état où on les rencontre', async ({ page }) => {
    test.setTimeout(180_000)
    await connecte(page)

    /* Le budget d'abord, pour que les écrans qui en dépendent aient quelque
       chose à montrer. L'amorce sème déjà des charges et une enveloppe ; on y
       ajoute un revenu, une poche d'épargne et un projet daté. */
    await page.goto('/budget-reglages')
    await expect(page.getByRole('heading', { name: /réglages du budget/i }))
      .toBeVisible({ timeout: 15_000 })
    await prend(page, '01-budget-reglages')

    await page.goto('/epargne')
    const nom = page.getByLabel(/son nom/i)
    if (await nom.count()) {
      await nom.fill('Lisbonne')
      await page.getByLabel(/objectif/i).fill('1200')
      const quand = page.getByLabel(/pour quand/i).first()
      if (await quand.count()) await quand.fill('2027-12-01')
      await page.getByRole('button', { name: /^ouvrir$/i }).click()
      await page.waitForTimeout(1_200)
    }
    await prend(page, '02-epargne')

    for (const [chemin, nom] of [
      ['/', '03-hub'],
      ['/budget', '04-budget-le-mois'],
      ['/charges', '05-charges'],
      ['/profil', '06-profil'],
      ['/cuisine-accueil', '07-cuisine-accueil'],
      ['/semaine', '08-semaine'],
      ['/stock', '09-stock'],
      ['/bilan', '10-bilan'],
      ['/choisir', '11-choisir'],
      ['/magasin', '12-magasin'],
      ['/plan', '13-plan'],
      ['/cuisine', '14-cuisine'],
      ['/dressage', '15-dressage'],
      ['/inventer', '16-inventer'],
      ['/photo', '17-photo'],
      ['/ticket', '18-ticket'],
      ['/peser', '19-peser'],
      ['/importer', '20-importer'],
      ['/objectifs', '21-objectifs'],
      ['/reglages', '22-reglages'],
      ['/motdepasse', '23-motdepasse'],
    ] as const) {
      await page.goto(chemin)
      await prend(page, nom)
    }

    // Les formulaires ouverts, qu'aucune visite d'URL ne montre.
    await page.goto('/charges')
    await page.getByRole('button', { name: 'Internet', exact: true }).click()
    await prend(page, '24-charge-formulaire')

    await page.goto('/charges')
    await page.getByRole('button', { name: /dicte tout/i }).click()
    await prend(page, '25-dictee')

    /* Corriger une charge : le seul recours contre une faute de frappe, et il
       s'ouvre SOUS la ligne concernée — c'est ce chevauchement-là qu'il faut
       regarder, aucune assertion ne le verrait. */
    await page.goto('/charges')
    await page.getByRole('button', { name: /^Corriger / }).first().click()
    await prend(page, '27-corriger-charge')

    await page.goto('/stock')
    const auFroid = page.getByRole('tab', { name: /congélateur/i })
    if (await auFroid.count()) {
      await auFroid.click()
      await page.waitForTimeout(400)
      const ajout = page.getByRole('button', { name: /à la main|ajouter/i }).first()
      if (await ajout.count()) { await ajout.click(); await prend(page, '26-ajout-manuel') }
    }
  })
})
