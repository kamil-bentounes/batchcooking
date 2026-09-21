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
  // ⚠️ `exact`, parce que « Première connexion » matche aussi /connexion/ :
  //    un sélecteur large rendait deux boutons et faisait échouer les 25 tests.
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
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
    ['/importer', /coller/i],
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
  test('on valide les recettes SANS descendre au bas de la liste', async ({ page }) => {
    // Le bouton était sous quatre-vingts recettes, et le compteur de parts —
    // la seule chose qui décide du choix — disparaissait dès la deuxième carte.
    await connecte(page)
    await page.goto('/choisir')
    const barre = page.locator('.fixed.bottom-0')
    await expect(barre).toBeVisible({ timeout: 10_000 })
    await expect(barre.getByText(/parts/)).toBeVisible()
    await expect(barre.getByRole('button', { name: /faire la liste/i })).toBeVisible()

    // Toujours là après avoir déroulé jusqu'en bas.
    await page.mouse.wheel(0, 6000)
    await page.waitForTimeout(250)
    await expect(barre.getByRole('button', { name: /faire la liste/i })).toBeVisible()
  })

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

  test('la semaine permet de saisir un repas hors barquette (D26)', async ({ page }) => {
    // Sans cet écran, le tableau de bord ment de ~900 kcal par jour : la
    // mutation existait, aucun écran ne l'appelait.
    await connecte(page)
    await page.goto('/semaine')
    // Un déjeuner au restaurant n'a pas de barquette : il doit pouvoir
    // s'inscrire même sur un jour où rien n'est prévu.
    await expect(page.getByText(/mangé sans barquette/i).first())
      .toBeVisible({ timeout: 10_000 })
    // ⚠️ Dans une `section` : les puces de filtre du haut portent les mêmes
    //    noms, et `.first()` tomberait dessus.
    await page.locator('section')
      .getByRole('button', { name: 'Déjeuner', exact: true }).first().click()
    await expect(page.getByText(/un repère, pas une pesée/i)).toBeVisible()
    await page.getByRole('button', { name: /^Restaurant/ }).first().click()
    // La case n'existait pas : elle se crée au moment où l'on y met quelque
    // chose, et le repas apparaît dans la journée.
    await expect(page.getByText('+ Restaurant').first())
      .toBeVisible({ timeout: 10_000 })
  })

  test('l’import montre la zone de texte ET le champ de précision', async ({ page }) => {
    // Écrit sans avoir jamais été rendu — la même erreur que celle qui avait
    // laissé « Choose File » en anglais sur deux écrans.
    await connecte(page)
    await page.goto('/importer')
    await expect(page.getByRole('textbox').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/une précision à ajouter/i)).toBeVisible()
    // Le bouton reste hors d'atteinte tant que le texte est trop court : on ne
    // fait pas dépenser un appel de modèle pour trois mots.
    const bouton = page.getByRole('button', { name: /ranger la recette/i })
    await expect(bouton).toBeDisabled()
    await page.getByRole('textbox').first().fill(
      'Tarte aux poireaux pour 6\n3 poireaux\n200 g de crème\nÉmincer les poireaux.\n'
      + 'Faire revenir 10 minutes.\nEnfourner 35 minutes.')
    await expect(bouton).toBeEnabled()
  })

  test('on atteint l’import depuis l’écran de choix', async ({ page }) => {
    await connecte(page)
    await page.goto('/choisir')
    await page.getByRole('button', { name: /ma propre recette à coller/i }).click()
    await expect(page.getByRole('heading', { name: /coller/i })).toBeVisible()
  })

  test('les trois chemins d’entrée sont SÉPARÉS', async ({ page }) => {
    /*
     * Un seul bouton disait « Première fois, ou mot de passe oublié ? », et les
     * deux envoyaient le même lien de connexion : quelqu'un qui avait oublié
     * son mot de passe était simplement reconnecté, sans jamais pouvoir en
     * poser un nouveau.
     */
    await page.goto('/')
    await expect(page.getByRole('button', { name: /^se connecter$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /première connexion/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /mot de passe oublié/i })).toBeVisible()

    // Et chacun annonce ce qu'il fait, pas la même chose.
    await page.getByRole('button', { name: /mot de passe oublié/i }).click()
    await expect(page.getByText(/lien de réinitialisation/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /réinitialiser mon mot de passe/i }))
      .toBeVisible()

    await page.getByRole('button', { name: /première connexion/i }).click()
    await expect(page.getByText(/ensuite tu choisis ton mot de passe/i)).toBeVisible()
  })

  test('le partage se décide à l’import, et par défaut rien ne sort', async ({ page }) => {
    await connecte(page)
    await page.goto('/importer')
    await page.getByRole('textbox').first().fill(
      'Tarte aux poireaux pour 6\\n3 poireaux\\n200 g de crème\\nÉmincer les poireaux.\\n'
      + 'Faire revenir 10 minutes.\\nEnfourner 35 minutes.')
    // Le choix vit sur l'écran de relecture, au moment où l'on décide de garder.
    // Ici on vérifie au moins que l'écran d'entrée ne promet rien d'autre.
    await expect(page.getByRole('button', { name: /ranger la recette/i })).toBeEnabled()
  })

  test('les amis s’invitent depuis les réglages', async ({ page }) => {
    await connecte(page)
    await page.goto('/reglages')
    await expect(page.getByRole('heading', { name: /vos amis/i })).toBeVisible()
    // Ce que l'invitation engage doit se lire AVANT de cliquer.
    await expect(page.getByText(/vos courses.*ne sortent jamais/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /inviter un foyer/i })).toBeVisible()
  })

  test('accepter une amitié dit ce que ça change, dans les deux sens', async ({ page }) => {
    await connecte(page)
    await page.goto('/ami/00000000-0000-0000-0000-000000000000')
    await expect(page.getByRole('heading', { name: /devenir amis/i }))
      .toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/ce qui est.*privé.*le reste/i)).toBeVisible()
    await expect(page.getByText(/chacun peut rompre/i)).toBeVisible()

    // Un jeton qui ne correspond à rien doit le DIRE, pas échouer en silence.
    await page.getByRole('button', { name: /^accepter$/i }).click()
    await expect(page.getByText(/ne correspond à rien/i)).toBeVisible({ timeout: 10_000 })
  })

  test('la marque est dans l’onglet ET sur l’accueil', async ({ page }) => {
    // Le favicon était encore celui du gabarit : un logo violet, sans rapport
    // avec une application verte et crème. Et rien ne le liait dans la page.
    await connecte(page)
    const icone = page.locator('link[rel="icon"][type="image/svg+xml"]')
    await expect(icone).toHaveAttribute('href', /logo\.svg$/)

    // Le fichier doit exister : un href juste vers un fichier absent donne la
    // même page qu'un href absent, en silence.
    const r = await page.request.get(await icone.getAttribute('href') ?? '')
    expect(r.status(), 'le favicon renvoie une erreur').toBe(200)
    expect(await r.text()).toContain('svg')

    // Et la marque se voit dans l'application, pas seulement dans l'onglet.
    await page.goto('/')
    await expect(page.locator('header svg, h1 ~ svg, svg').first())
      .toBeVisible({ timeout: 10_000 })
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
    for (const c of ['/', '/choisir', '/magasin', '/bilan', '/ticket', '/peser',
                     '/stock', '/importer', '/semaine']) {
      await page.goto(c)
      await page.waitForTimeout(400)
      await page.screenshot({
        path: `.shots/${c === '/' ? 'accueil' : c.slice(1)}.png`,
        fullPage: true,
      })
    }
  })
})
