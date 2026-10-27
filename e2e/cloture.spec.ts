/**
 * La clôture (lot 3), jouée à des dates choisies : le 19 octobre (septembre est
 * à clôturer, puis le rappel), le 27 (« se termine »), le 1er novembre (on
 * clôture octobre, on revient dessus, on reclôture).
 *
 * Les tests partagent un foyer et tournent dans l'ordre : chacun part de ce
 * que le précédent a laissé.
 */
import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, db, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'
import { releve } from './couverture.ts'
import { joue, remetLHeure } from './horloge.ts'

const A = new Date().getFullYear()
let foyer: Foyer
test.describe.configure({ mode: 'serial' })
test.use({ viewport: { width: 390, height: 844 } })
test.beforeAll(async () => { foyer = await amorce() })
test.afterAll(async () => {
  await remetLHeure()
  if (foyer) await efface(foyer)
})

async function connecte(page: Page) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(foyer.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
  await releve(page)
}

async function prend(page: Page, nom: string) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `.shots/budget/cloture-${nom}.png` })
  await page.screenshot({ path: `.shots/budget/cloture-${nom}-entier.png`, fullPage: true })
  await releve(page)
}

/** Ce que l'épargne du foyer contient, en base. */
async function epargne(): Promise<number> {
  const { data } = await db.from('versement_epargne').select('montant_cents')
    .eq('household_id', foyer.householdId)
  return (data ?? []).reduce((t, v) => t + v.montant_cents, 0)
}

test('le 19 octobre : septembre est à clôturer, sur le hub et dans le bandeau', async ({ page }) => {
  await joue(page, `${A}-10-19T10:00:00Z`)
  await connecte(page)
  /* Au téléphone, la tuile du budget le dit en deux mots (la ligne entière est celle du bureau). */
  const carte = page.locator('[data-tuile="budget"]')
  await expect(carte.getByText('Septembre à clôturer')).toBeVisible({ timeout: 15_000 })
  await page.goto('/budget')
  await expect(page.getByText('Septembre est fini : on le clôture ?')).toBeVisible({ timeout: 15_000 })
  await prend(page, '01-bandeau')
})

test('septembre se clôture en trois étapes ; l’épargne augmente, le mois s’affiche clôturé',
  async ({ page }) => {
    await joue(page, `${A}-10-19T10:00:00Z`)
    await connecte(page)
    await page.goto('/budget')
    const avant = await epargne()
    await page.getByRole('button', { name: 'Clôturer septembre' }).click()
    await expect(page.getByRole('heading', { name: 'Clôturer septembre' })).toBeVisible({ timeout: 15_000 })

    // 1 · La facture d'électricité : « C'est ça ».
    const factures = page.getByRole('region', { name: 'Les factures du mois' })
    await factures.getByRole('button', { name: /^C’est ça/ }).click()
    await expect(factures.getByText('Tout est validé.')).toBeVisible({ timeout: 10_000 })

    // 2 · 47,90 € de courses, et « Rien dépensé » au restaurant.
    const depenses = page.getByRole('region', { name: 'Tes dépenses du mois' })
    await depenses.getByRole('button', { name: 'Déclarer pour Courses' }).click()
    const feuille = page.getByRole('dialog', { name: 'Courses' })
    await feuille.getByLabel('Nouvelle dépense').fill('47,90')
    await feuille.getByRole('button', { name: 'Ajouter 47,90 €' }).click()
    await expect(feuille.getByText('Déjà ce mois-ci')).toBeVisible({ timeout: 10_000 })
    await feuille.getByRole('button', { name: 'Fermer' }).click()
    await expect(depenses.getByText('47,90 € sur 800 €')).toBeVisible()
    const rien = depenses.getByRole('switch', { name: 'Rien dépensé : Restaurant' })
    await rien.click()
    await expect(rien).toHaveAttribute('aria-checked', 'true')
    await expect(depenses.getByText(/^Tu as dépensé .* de moins que prévu\.$/)).toBeVisible()

    // 3 · Ce qui reste : tout, sur la poche d'urgence.
    const reste = page.getByRole('region', { name: 'Ce qui reste' })
    await expect(reste.getByText('Il te reste ce mois-ci')).toBeVisible()
    await expect(reste.getByRole('radio', { name: /^Le mettre de côté/ }))
      .toHaveAttribute('aria-checked', 'true')
    await expect(reste.getByText(/^Ton épargne d’urgence passe à .* sur 4\s500 €\.$/)).toBeVisible()
    await prend(page, '02-trois-etapes')

    await page.getByRole('button', { name: 'Clôturer septembre' }).click()
    await expect(page.getByText('Septembre est clôturé.')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Il t’est resté')).toBeVisible()

    /* « Tout ce qui reste » a mis de côté le reste de la base, au centime. */
    const { data: choix } = await db.from('cloture_choix')
      .select('reste_cents, mis_de_cote_cents').eq('household_id', foyer.householdId)
    expect(choix).toHaveLength(1)
    expect(choix![0].mis_de_cote_cents).toBe(choix![0].reste_cents)
    expect(await epargne() - avant, 'l’épargne n’a pas reçu le reste').toBe(choix![0].mis_de_cote_cents)
    await prend(page, '03-septembre-cloture')
  })

test('le rappel avant le 27, puis « se termine » à partir du 27', async ({ page }) => {
  await joue(page, `${A}-10-19T10:00:00Z`)
  await connecte(page)
  /* Septembre est clôturé : le hub passe aux montants à dire d'octobre. */
  await expect(page.locator('[data-tuile="budget"]').getByText(/\d+ à dire/))
    .toBeVisible({ timeout: 15_000 })
  await page.goto('/budget')
  await expect(page.getByText('Le mois fini, on le clôture : tu confirmes les factures, et tu choisis quoi faire de ce qui reste.'))
    .toBeVisible({ timeout: 15_000 })

  await joue(page, `${A}-10-27T10:00:00Z`)
  await page.goto('/budget')
  await expect(page.getByText('Octobre se termine. Le 1er novembre, on le clôture.'))
    .toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: /^Clôturer/ })).toHaveCount(0)
  await prend(page, '04-se-termine')
})

test('le 1er novembre : octobre se clôture, on revient dessus, l’épargne revient ; on reclôture',
  async ({ page }) => {
    await joue(page, `${A}-11-01T10:00:00Z`)
    await connecte(page)
    await page.goto('/budget')
    const avant = await epargne()
    await page.getByRole('button', { name: 'Clôturer octobre' }).click()
    await expect(page.getByRole('heading', { name: 'Clôturer octobre' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Clôturer octobre' }).click()
    await expect(page.getByText('Octobre est clôturé.')).toBeVisible({ timeout: 15_000 })
    expect(await epargne()).toBeGreaterThan(avant)
    await prend(page, '05-octobre-cloture')

    let annonce = ''
    page.once('dialog', d => { annonce = d.message(); void d.accept() })
    await page.getByRole('button', { name: 'Revenir dessus' }).click()
    await expect(page.getByRole('region', { name: 'Ce qui reste' }).getByText('Il te reste'))
      .toBeVisible({ timeout: 15_000 })
    expect(annonce).toMatch(/^Revenir sur octobre \? Les .* mis de côté seront retirés de l’épargne\.$/)
    expect(await epargne(), 'l’épargne n’est pas revenue à son niveau').toBe(avant)

    /* Reclôturer refait le même calcul (§ 7) : le mois retrouve son chiffre. */
    await page.getByRole('button', { name: 'Clôturer octobre' }).click()
    await expect(page.getByRole('heading', { name: 'Clôturer octobre' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Clôturer octobre' }).click()
    await expect(page.getByText('Octobre est clôturé.')).toBeVisible({ timeout: 15_000 })
  })

test('le hub : « Tout est à jour » quand chaque ligne au fil du mois a sa dépense', async ({ page }) => {
  await joue(page, `${A}-11-01T10:00:00Z`)
  await connecte(page)
  const carte = page.locator('[data-tuile="budget"]')
  await expect(carte.getByText(/\d+ à dire/)).toBeVisible({ timeout: 15_000 })
  const { data: lignes } = await db.from('depense').select('id')
    .eq('household_id', foyer.householdId).eq('mois', `${A}-11-01`).eq('facon', 'au_fil')
  expect((lignes ?? []).length).toBeGreaterThan(0)
  for (const l of lignes ?? []) {
    /* L'identifiant vient de l'appareil (§ 4.2) : la table n'en fabrique pas. */
    const { error } = await db.from('saisie').insert({
      id: randomUUID(), household_id: foyer.householdId, depense_id: l.id,
      fait_le: `${A}-11-01`, montant_cents: 1_000, saisi_par: foyer.userId })
    expect(error).toBeNull()
  }
  await page.reload()
  await expect(carte.locator('[data-pastille="budget"]')).toHaveText('À jour', { timeout: 15_000 })
  await prend(page, '06-hub-a-jour')
})

/* ── Les gestes d'une clôture qui tourne mal, joués avec de vrais clics (1er décembre : novembre
      est fini). Chaque test remet novembre dans l'état où il l'a pris. ─────────────────────── */

const NOVEMBRE = `/cloture/${A}-11`

async function ouvreNovembre(page: Page) {
  await joue(page, `${A}-12-01T10:00:00Z`)
  await connecte(page)
  await page.goto(NOVEMBRE)
}

test('« Réessayer la lecture du mois » relit pour de bon, au clic', async ({ page }) => {
  /* TanStack réessaie trois fois (1 s, 2 s, 4 s) avant de déclarer la panne. */
  test.setTimeout(60_000)
  await joue(page, `${A}-12-01T10:00:00Z`)
  await connecte(page)
  /* Les clôtures en panne : la page n'ose ni « Clôturer » ni « Ajoute ton revenu ». */
  await page.route('**/rest/v1/cloture?*', route => route.fulfill({
    status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ message: 'Lecture en panne.', code: 'P0001' }) }))
  await page.goto(NOVEMBRE)
  const reessayer = page.getByRole('button', { name: 'Réessayer la lecture du mois' })
  await expect(reessayer).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Clôturer novembre' })).toHaveCount(0)
  await prend(page, '07-lecture-en-panne')

  await page.unroute('**/rest/v1/cloture?*')
  await reessayer.click()
  await expect(page.getByRole('button', { name: 'Clôturer novembre' })).toBeVisible({ timeout: 15_000 })
  await expect(reessayer).toHaveCount(0)
})

test('« Rien dépensé » se coche et se décoche, et l’écart suit chaque clic', async ({ page }) => {
  /* Le test du hub a déclaré 10 € sur chaque ligne de novembre : une ligne sans saisie, il n'y
     en aurait aucune à basculer. */
  const { error } = await db.from('saisie').delete().eq('household_id', foyer.householdId)
    .gte('fait_le', `${A}-11-01`).lte('fait_le', `${A}-11-30`)
  expect(error).toBeNull()
  await ouvreNovembre(page)
  const depenses = page.getByRole('region', { name: 'Tes dépenses du mois' })
  const rien = depenses.getByRole('switch', { name: /^Rien dépensé : / }).first()
  await expect(rien).toHaveAttribute('aria-checked', 'false', { timeout: 15_000 })
  await expect(depenses.getByText('Tu as dépensé ce qui était prévu.')).toBeVisible()

  await rien.click()
  await expect(rien).toHaveAttribute('aria-checked', 'true')
  await expect(depenses.getByText(/^Tu as dépensé .* de moins que prévu\.$/)).toBeVisible()

  await rien.click()
  await expect(rien).toHaveAttribute('aria-checked', 'false')
  await expect(depenses.getByText('Tu as dépensé ce qui était prévu.')).toBeVisible()
})

test('une clôture dont la réponse se perd : la base l’a faite, la page le relit (jamais « déjà clôturé »)',
  async ({ page }) => {
    await ouvreNovembre(page)
    const bouton = page.getByRole('button', { name: 'Clôturer novembre' })
    await expect(bouton).toBeVisible({ timeout: 15_000 })
    /* La requête PART et la base la valide ; seule la réponse est perdue. */
    await page.route('**/rest/v1/rpc/cloture_le_mois', async route => {
      await route.fetch()
      await route.abort('connectionreset')
    })
    await bouton.click()
    await expect(page.getByText(/^Novembre est clôturé le/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/déjà clôturé/)).toHaveCount(0)
    const { data } = await db.from('cloture').select('mois').eq('household_id', foyer.householdId)
      .eq('mois', `${A}-11-01`)
    expect(data, 'la base a bien clos novembre').toHaveLength(1)
    await page.unroute('**/rest/v1/rpc/cloture_le_mois')
  })

test('« Revenir dessus » dont la réponse se perd : le mois est rouvert, la page le relit',
  async ({ page }) => {
    await ouvreNovembre(page)
    const revenir = page.getByRole('button', { name: 'Revenir dessus, Novembre' })
    await expect(revenir).toBeVisible({ timeout: 15_000 })
    await page.route('**/rest/v1/rpc/rouvre_le_mois', async route => {
      await route.fetch()
      await route.abort('connectionreset')
    })
    page.once('dialog', d => { void d.accept() })
    await revenir.click()
    await expect(page.getByRole('button', { name: 'Clôturer novembre' })).toBeVisible({ timeout: 15_000 })
    const { data } = await db.from('cloture').select('mois').eq('household_id', foyer.householdId)
      .eq('mois', `${A}-11-01`)
    expect(data, 'la base a bien rouvert novembre').toHaveLength(0)
    await page.unroute('**/rest/v1/rpc/rouvre_le_mois')
  })

test('une clôture refusée par la base se dit, et « Clôturer » reste utilisable : le clic suivant passe',
  async ({ page }) => {
    await ouvreNovembre(page)
    const bouton = page.getByRole('button', { name: 'Clôturer novembre' })
    await expect(bouton).toBeVisible({ timeout: 15_000 })
    let refus = true
    await page.route('**/rest/v1/rpc/cloture_le_mois', route => refus
      ? route.fulfill({ status: 400, contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ message: 'Panne simulée.', code: 'P0001' }) })
      : route.continue())
    await bouton.click()
    await expect(page.getByText('Panne simulée.')).toBeVisible({ timeout: 10_000 })
    await expect(bouton).toBeEnabled()
    refus = false
    await bouton.click()
    /* Le clic qui passe ramène AU MOIS (`apres`), dont la carte dit « Novembre est clôturé. » :
       « … clôturé le 01/12 » est la phrase de la page de clôture, qu'on quitte. Le test
       attendait celle-là et échouait déjà avant le grand test du 22/10. */
    await expect(page.getByText(/^Novembre est clôturé\./)).toBeVisible({ timeout: 15_000 })
    // Remet novembre ouvert pour les bancs suivants.
    page.once('dialog', d => { void d.accept() })
    await page.getByRole('button', { name: 'Revenir dessus, Novembre' }).click()
    await expect(page.getByRole('button', { name: 'Clôturer novembre' })).toBeVisible({ timeout: 15_000 })
    await page.unroute('**/rest/v1/rpc/cloture_le_mois')
  })

test('/budget/<mois à venir> quitte son adresse pour /budget ; /cloture/<année passée> nomme l’année',
  async ({ page }) => {
    await joue(page, `${A}-12-01T10:00:00Z`)
    await connecte(page)
    await page.goto(`/budget/${A + 4}-05`)
    await expect(page).toHaveURL(/\/budget$/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Décembre' })).toBeVisible()

    await page.goto(`/cloture/${A - 1}-09`)
    await expect(page.getByRole('heading', { name: `Clôturer septembre ${A - 1}` })).toBeVisible({ timeout: 15_000 })
    /* Le titre reçoit le focus à l'arrivée. */
    await expect(page.getByRole('heading', { name: `Clôturer septembre ${A - 1}` })).toBeFocused()
  })
