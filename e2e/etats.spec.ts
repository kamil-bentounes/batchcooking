/**
 * Les ÉTATS que la revue ordinaire ne rencontre jamais.
 *
 * `captures.spec.ts` photographie chaque écran une fois, dans l'état où on le
 * rencontre le plus souvent. C'est utile et ça a trouvé des choses — mais un
 * écran ment rarement dans son état moyen. Il ment au bord :
 *
 *  · le tout PREMIER soir, quand il n'y a rien à afficher ;
 *  · quand une écriture ÉCHOUE, et qu'il faut le dire ;
 *  · quand le mois est CONFIRMÉ, ou qu'on regarde derrière soi ;
 *  · vu par l'AUTRE personne, qui n'a pas posé ces chiffres ;
 *  · quand les LIBELLÉS et les MONTANTS vont jusqu'aux bornes.
 *
 * Aucun de ces cinq n'avait jamais été photographié, et c'est le premier qui
 * compte le plus : c'est l'écran d'accueil de deux vraies personnes.
 *
 * Ce fichier n'asserte presque rien — comme `captures.spec.ts`, son produit
 * ce sont les images. Les quelques `expect` ne sont là que pour échouer fort
 * si l'écran n'est pas celui qu'on croit photographier.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'

async function connecte(page: Page, email: string) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' }))
    .toBeVisible({ timeout: 15_000 })
}

/** Deux images, pour la même raison que dans `captures.spec.ts`. */
async function prend(page: Page, nom: string) {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `.shots/etats/${nom}.png` })
  await page.screenshot({ path: `.shots/etats/${nom}-entier.png`, fullPage: true })
}

test.describe('le tout premier soir', () => {
  let vide: Foyer
  test.beforeAll(async () => { vide = await amorce({ budget: false }) })
  test.afterAll(async () => { if (vide) await efface(vide) })

  test('un foyer sans un centime : ce que deux personnes voient en arrivant', async ({ page }) => {
    test.setTimeout(120_000)
    await connecte(page, vide.email)

    for (const [chemin, nom] of [
      ['/', 'vide-01-hub'],
      ['/budget', 'vide-02-budget'],
      ['/charges', 'vide-03-charges'],
      ['/budget-reglages', 'vide-04-reglages'],
      ['/epargne', 'vide-05-epargne'],
      ['/profil', 'vide-06-profil'],
    ] as const) {
      await page.goto(chemin)
      await prend(page, nom)
    }
  })
})

test.describe('les états du foyer rempli', () => {
  let foyer: Foyer
  test.beforeAll(async () => { foyer = await amorce() })
  test.afterAll(async () => { if (foyer) await efface(foyer) })

  test('quand une écriture échoue, l’écran le dit', async ({ page }) => {
    /* Le bandeau d'erreur des charges n'avait jamais été vu : `majQui` et
       `rattache` levaient dans le vide jusqu'à ce matin, et `corrige` vient
       d'être câblé. Une erreur qu'on n'a jamais regardée est une erreur dont
       on ne sait pas si elle se lit.

       Le refus est RÉEL, pas simulé : `corrige_la_charge` borne le montant à
       un million d'euros, et l'écran envoie ce qu'on tape. */
    await connecte(page, foyer.email)
    await page.goto('/charges')
    await page.getByRole('button', { name: 'Corriger Internet' }).click()
    await page.getByLabel('Montant de Internet').fill('2000000')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    /* ⚠️ `toBeVisible` ne dit pas « on le voit » : un message quatre écrans
       plus haut est « visible » pour Playwright. La première version de ce
       test passait avec le refus affiché en tête de page, hors de l'écran.
       On exige donc qu'il soit DANS la fenêtre, à côté du bouton touché. */
    const refus = page.getByText(/borne|refus|hors/i).first()
    await expect(refus).toBeVisible({ timeout: 15_000 })
    await expect(refus).toBeInViewport()
    await prend(page, 'erreur-01-charge-refusee')
  })

  test('un mois confirmé, et le mois d’avant', async ({ page }) => {
    test.setTimeout(90_000)
    /* Tout ce qui a été photographié jusqu'ici l'était AVANT confirmation :
       l'écran du 27, celui où l'on saisit ce qu'on a vraiment payé, et celui
       d'un mois déjà vécu, n'existaient sur aucune image. */
    await connecte(page, foyer.email)
    await page.goto('/budget')

    /* ⚠️ `count()` n'attend RIEN. Compté avant que l'écran ait fini de charger,
       il rend zéro et le test échoue sur une capture qui, elle, montre bien
       les champs — on cherche alors le défaut là où il n'est pas. */
    const champs = page.getByLabel(/vraiment payé/i)
    await expect(champs.first()).toBeVisible({ timeout: 15_000 })
    const combien = await champs.count()
    expect(combien, 'aucune ligne à confirmer : l’amorce a changé').toBeGreaterThan(0)
    /* ⚠️ Toujours la PREMIÈRE : une ligne confirmée quitte la liste, et
       `nth(1)` n'existe plus une fois la première partie. */
    for (let reste = combien; reste > 0; reste--) {
      await champs.first().fill('42')
      await page.getByRole('button', { name: /c’est ça/i }).first().click()
      await expect(champs).toHaveCount(reste - 1, { timeout: 15_000 })
    }
    await prend(page, 'confirme-01-mois-confirme')

    /* Le bouton dit « ‹ Avant » mais s'annonce « Mois précédent » : son
       `aria-label` remplace le texte visible. C'est le nom accessible qui
       compte pour un test comme pour une synthèse vocale. */
    await page.getByRole('button', { name: 'Mois précédent' }).click()
    await page.waitForTimeout(800)
    await prend(page, 'confirme-02-mois-precedent')
  })

  test('ce que Thauba voit d’elle-même', async ({ page }) => {
    /* Elle n'a posé aucun de ces chiffres. Les écrans lui parlent-ils d'elle,
       ou de celui qui a rempli ? Le parcours d'invitation la crée mais ne
       photographie que la liste des charges. */
    await connecte(page, foyer.elleEmail)
    for (const [chemin, nom] of [
      ['/', 'elle-01-hub'],
      ['/budget', 'elle-02-budget'],
      ['/charges', 'elle-03-charges'],
      ['/budget-reglages', 'elle-04-reglages'],
      ['/epargne', 'elle-05-epargne'],
      ['/profil', 'elle-06-profil'],
    ] as const) {
      await page.goto(chemin)
      await prend(page, nom)
    }
  })

  test('les libellés et les montants poussés jusqu’aux bornes', async ({ page }) => {
    /* L'amorce sème un libellé de 75 caractères et un montant à sept chiffres,
       les deux au maximum de ce que la base accepte. Une carte, un total et un
       virement les portent-ils sans casser ? */
    await connecte(page, foyer.email)
    await page.goto('/charges')
    await expect(page.getByText(/Crédit immobilier de la résidence/))
      .toBeVisible({ timeout: 15_000 })
    await prend(page, 'bornes-01-charges')

    await page.goto('/budget')
    await prend(page, 'bornes-02-budget')

    await page.goto('/')
    await prend(page, 'bornes-03-hub')
  })
})
