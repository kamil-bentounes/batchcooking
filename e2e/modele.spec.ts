/**
 * Les trois écrans qui parlent à un MODÈLE, et que rien ne touchait.
 *
 * Le ticket de caisse, la photo du frigo et l'import d'une recette étaient les
 * plus mal couverts de l'application — 18, 17 et 8 % de branches — parce qu'il
 * faut un FICHIER et une RÉPONSE DE MODÈLE pour les faire vivre. Aucune des
 * deux n'est un obstacle :
 *
 *  · le fichier entre par un `<input type="file">` caché derrière `BoutonPhoto`
 *    (`src/ui/coque.tsx`), et `setInputFiles` sait le remplir ;
 *  · la réponse s'intercepte avec `page.route`, ce qui rend le banc rapide,
 *    gratuit et surtout DÉTERMINISTE.
 *
 * Ce qu'on éprouve ici n'est donc PAS l'extraction — les bancs `banc-ticket`,
 * `banc-vision` et `banc-charges` s'en chargent avec de vraies réponses — mais
 * l'écran de VALIDATION : ce qu'il coche d'avance, ce qu'il montre comme
 * deviné, ce qu'il refuse d'enregistrer, et ce qu'il dit quand le modèle ne
 * lit rien. C'est là que se joue le principe de toute l'application : le modèle
 * propose, l'écran fait valider, et rien ne part sans un geste.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'
import { releve } from './couverture.ts'

let foyer: Foyer

test.beforeAll(async () => { foyer = await amorce() })
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
  await page.screenshot({ path: `.shots/modele/${nom}.png` })
  await page.screenshot({ path: `.shots/modele/${nom}-entier.png`, fullPage: true })
  await releve(page)
}

/**
 * Un PNG minuscule mais valide, et GRIS CLAIR.
 *
 * `prepare()` (`src/lib/photo.ts`) le passe dans un canvas avant l'envoi : un
 * fichier bidon ne survivrait pas au décodage, et l'écran échouerait pour la
 * mauvaise raison — il faut donc une vraie image.
 *
 * Et gris clair parce que l'écran en fait une VIGNETTE pleine largeur : un
 * pixel rouge sombre étiré donnait un grand rectangle sang au milieu des
 * captures, et on cherche le défaut là où il n'y en a pas.
 */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO4e/8GVsQwtCQAecilAZTRNhYAAAAASUVORK5CYII=', 'base64')

async function donneLaPhoto(page: Page) {
  await page.locator('input[type="file"]').first()
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PIXEL })
}

test.describe('le ticket de caisse', () => {
  /* Une erreur ici ne se rattrape pas d'un geste : un rapprochement faux fait
     apprendre un PRIX faux, et ce prix se propage à toutes les estimations qui
     viendront. D'où ce que l'écran doit faire — marquer ce qui est deviné, ne
     pas le cocher d'avance, et montrer l'écart avec le total imprimé. */
  const TICKET = {
    enseigne: 'Super U', date: '2026-09-20',
    lignes: [
      { label: 'TOMATES GRAPPE', quantity: 1, unit: 'kg', price_eur: 3.49, confiance: 0.95 },
      { label: 'PAIN CPLT 500G', quantity: 1, unit: null, price_eur: 2.10, confiance: 0.92 },
      { label: 'XZ4 PROMO', quantity: 1, unit: null, price_eur: 1.20, confiance: 0.31 },
    ],
    total_eur: 7.09, somme: 6.79, ecart: 0.30,
    remisesDeduites: false, lisible: true,
    commentaire: 'Une ligne est mal imprimée.', restantes: 18, quota: 20,
  }

  test('marque ce qui est deviné, et montre l’écart avec le total', async ({ page }) => {
    test.setTimeout(90_000)
    await page.route('**/functions/v1/ticket', r => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(TICKET),
    }))
    await connecte(page)
    await page.goto('/ticket')
    await prend(page, 'ticket-01-avant')

    await donneLaPhoto(page)
    await expect(page.getByText(/TOMATES GRAPPE/)).toBeVisible({ timeout: 20_000 })
    await prend(page, 'ticket-02-lu')

    /* L'ÉCART entre la somme des lignes et le total imprimé est la façon la
       plus rapide de repérer une ligne manquée. S'il ne s'affiche pas, on
       enregistre un ticket incomplet sans le savoir. */
    await expect(page.getByText(/0,30/),
      'l’écart avec le total imprimé ne s’affiche pas').toBeVisible()
    /* Et la ligne à 0,31 de confiance ne doit PAS être cochée d'avance. */
    const coches = await page.getByRole('checkbox', { checked: true }).count()
    const total = await page.getByRole('checkbox').count()
    expect(coches, 'tout est coché, y compris ce que le modèle a deviné')
      .toBeLessThan(total)
  })

  test('dit quand il n’a rien pu lire, au lieu de rendre une page vide', async ({ page }) => {
    test.setTimeout(90_000)
    await page.route('**/functions/v1/ticket', r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        enseigne: null, date: null, lignes: [], total_eur: null, somme: 0,
        ecart: null, remisesDeduites: false, lisible: false,
        commentaire: 'La photo est trop floue pour être lue.',
        restantes: 17, quota: 20,
      }),
    }))
    await connecte(page)
    await page.goto('/ticket')
    await donneLaPhoto(page)
    await expect(page.getByText(/floue|lisible|rien/i).first(),
      'un ticket illisible ne dit rien').toBeVisible({ timeout: 20_000 })
    await prend(page, 'ticket-03-illisible')
  })

  test('dit quand le quota est atteint, en français', async ({ page }) => {
    /* Le corps d'erreur est du JSON : le jeter tel quel affichait
       `{"erreur":"Quota atteint…"}` à l'écran. */
    test.setTimeout(90_000)
    await page.route('**/functions/v1/ticket', r => r.fulfill({
      status: 429, contentType: 'application/json',
      body: JSON.stringify({ erreur: 'Quota atteint : 20 tickets ce mois-ci.', restantes: 0 }),
    }))
    await connecte(page)
    await page.goto('/ticket')
    await donneLaPhoto(page)
    await expect(page.getByText(/quota atteint/i)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/\{|"erreur"/),
      'le JSON brut s’affiche à l’écran').toHaveCount(0)
    await prend(page, 'ticket-04-quota')
  })
})

test.describe('la photo du garde-manger', () => {
  const VU = {
    articles: [
      { ou: 'porte, en haut', nom: 'Lait', variete: 'demi-écrémé', quantite: 1,
        unite: 'L', lieu: 'frigo', confiance: 0.93 },
      { ou: 'bac à légumes', nom: 'Carottes', variete: null, quantite: 500,
        unite: 'g', lieu: 'frigo', confiance: 0.88 },
      { ou: 'au fond, flou', nom: 'Pot indistinct', variete: null, quantite: null,
        unite: null, lieu: 'frigo', confiance: 0.35 },
    ],
    lisible: true, commentaire: null, restantes: 12, quota: 20, ms: 1840,
  }

  test('ne coche d’avance que ce dont le modèle est sûr', async ({ page }) => {
    test.setTimeout(90_000)
    await page.route('**/functions/v1/frigo', r => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(VU),
    }))
    await connecte(page)
    await page.goto('/photo')
    await prend(page, 'photo-01-avant')

    await donneLaPhoto(page)
    await expect(page.getByText(/Carottes/)).toBeVisible({ timeout: 20_000 })
    await prend(page, 'photo-02-vu')

    const coches = await page.getByRole('checkbox', { checked: true }).count()
    const total = await page.getByRole('checkbox').count()
    expect(total, 'aucune case : l’écran ne fait rien valider').toBeGreaterThan(0)
    expect(coches, 'le « pot indistinct » à 0,35 est coché d’avance')
      .toBeLessThan(total)
  })

  test('une photo illisible se dit, elle ne se devine pas', async ({ page }) => {
    test.setTimeout(90_000)
    await page.route('**/functions/v1/frigo', r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        articles: [], lisible: false,
        commentaire: 'Trop sombre : rien n’est identifiable.',
        restantes: 11, quota: 20, ms: 900,
      }),
    }))
    await connecte(page)
    await page.goto('/photo')
    await donneLaPhoto(page)
    await expect(page.getByText(/sombre|lisible|rien/i).first())
      .toBeVisible({ timeout: 20_000 })
    await prend(page, 'photo-03-illisible')
  })
})

test.describe('importer une recette', () => {
  const RECETTE = {
    titre: 'Dahl de lentilles corail',
    parts: 4,
    ingredients: [
      { ordinal: 1, raw_text: '250 g de lentilles corail', food_id: null,
        food_nom: 'Lentilles corail', qty: 250, unit: 'g',
        grams_reference: 250, confidence: 0.94 },
      { ordinal: 2, raw_text: 'une lichette de curcuma', food_id: null,
        food_nom: null, qty: null, unit: null,
        grams_reference: null, confidence: 0.4 },
    ],
    etapes: [
      { ordinal: 1, text: 'Rincer les lentilles', verb: 'rincer', duration_min: 2,
        duration_source: 'declaree', appliance_type: null, temperature_c: null,
        confiance: 0.9 },
      { ordinal: 2, text: 'Laisser mijoter', verb: 'mijoter', duration_min: null,
        duration_source: null, appliance_type: 'casserole', temperature_c: null,
        confiance: 0.6 },
    ],
    aCompleter: ['La durée de la cuisson n’est pas donnée.'],
    restantes: 9, quota: 20, ms: 2400, par: 'texte',
  }

  test('signale ce qu’il n’a pas su rattacher avant de laisser enregistrer', async ({ page }) => {
    test.setTimeout(90_000)
    await page.route('**/functions/v1/importer', r => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(RECETTE),
    }))
    await connecte(page)
    await page.goto('/importer')
    await prend(page, 'importer-01-avant')

    await page.getByRole('textbox').first().fill(
      'Dahl de lentilles corail : 250 g de lentilles, une lichette de curcuma. '
      + 'Rincer les lentilles 2 min, puis laisser mijoter.')
    await page.getByRole('button', { name: 'Ranger la recette' }).click()

    /* ⚠️ Le titre est dans un `<input>`, pas dans du texte : `getByText` ne le
       trouve pas, et le test échouait alors que l'écran était juste. */
    await expect(page.getByRole('heading', { name: /ce que j’ai compris/i }))
      .toBeVisible({ timeout: 20_000 })
    await expect(page.locator('input').first()).toHaveValue('Dahl de lentilles corail')
    await prend(page, 'importer-02-lue')

    /* Une étape SANS DURÉE est ce que l'écran doit signaler : le plan du
       dimanche se calcule sur les durées, et une recette dont une étape n'en a
       pas ne peut pas y entrer. L'écran doit le dire AVANT d'enregistrer. */
    await expect(page.getByText(/à compléter/i),
      'rien ne signale ce qui n’a pas été rattaché').toBeVisible()
    await expect(page.getByText(/durée de la cuisson/i)).toBeVisible()
  })
})

/**
 * LA REVUE DES CHARGES.
 *
 * Le banc `npm run banc-revue` éprouve le modèle avec de vraies réponses ; ici
 * on éprouve l'ÉCRAN — ce qu'il montre d'un constat, ce qu'il rend cliquable,
 * et surtout ce qu'il dit quand la revue ne trouve rien. Ce dernier cas est le
 * plus fréquent une fois le budget propre, et c'est celui qu'on oublie
 * d'écrire : un écran qui répond au clic par le silence se fait recliquer.
 */
test.describe('relire ses charges', () => {
  const REVUE = {
    verdict: 'Un doublon à corriger, le reste semble cohérent.',
    doublons: [{ libelles: ['Internet', 'Box'], pourquoi: 'C’est le même abonnement, je garderais Internet.' }],
    incoherences: [{
      libelle: 'Taxe foncière',
      quoi: 'Elle est saisie à 1450,00 € par mois alors qu’elle se paie une fois par an.',
      question: 'C’est bien 1450 € à l’année ?',
    }],
    oublis: ['Forfait mobile', 'Mutuelle'],
    restantes: 29,
  }

  test('elle montre ce qui cloche, et ses oublis sont cliquables', async ({ page }) => {
    await page.route('**/functions/v1/revue-charges', r => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(REVUE),
    }))
    await connecte(page)
    await page.goto('/charges')
    await prend(page, 'revue-01-avant')

    await page.getByRole('button', { name: 'Vérifier mes charges' }).click()
    await expect(page.getByText(REVUE.verdict)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Internet · Box')).toBeVisible()
    await expect(page.getByText(/1450 € à l’année/)).toBeVisible()
    await prend(page, 'revue-02-constats')

    /* ⚠️ L'oubli est un BOUTON, et on le CLIQUE. Une capture prouve qu'il est
       dessiné, pas qu'il ouvre le formulaire pré-rempli — trois fois cette
       session un banc est resté vert sur un libellé qui n'actionnait rien. */
    const oublis = page.getByRole('group', { name: 'Postes dont tu n’as pas parlé' })
    await oublis.getByRole('button', { name: 'Forfait mobile', exact: true }).click()
    await expect(page.getByLabel('Quoi')).toHaveValue('Forfait mobile')
    await prend(page, 'revue-03-oubli-ouvert')
  })

  test('quand tout va bien, elle le dit au lieu de se taire', async ({ page }) => {
    await page.route('**/functions/v1/revue-charges', r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        verdict: 'Tout semble en ordre.',
        doublons: [], incoherences: [], oublis: [], restantes: 28,
      }),
    }))
    await connecte(page)
    await page.goto('/charges')
    await page.getByRole('button', { name: 'Vérifier mes charges' }).click()
    await expect(page.getByText(/Ni doublon, ni montant qui détonne/))
      .toBeVisible({ timeout: 20_000 })
    await prend(page, 'revue-04-rien-a-dire')
  })
})
