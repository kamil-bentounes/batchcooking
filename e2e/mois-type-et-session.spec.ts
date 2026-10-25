/**
 * 25/10 — ce que Kamil et Thauba ont demandé après leur premier dimanche :
 *
 *   1. le mois type : leurs charges par catégorie et par personne, avec des graphes, avant même novembre ;
 *   2. toutes les charges dans un tableau, avec ce que chacun paie, et des filtres ;
 *   3. « J’ai fini » en cuisine : finir une session dont toutes les actions ne sont pas cochées ;
 *   4. une session interrompue se retrouve, même quand son plan date d'un mois.
 *
 * ⚠️ LOCAL, ET RIEN D'AUTRE.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, db, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'

let foyer: Foyer

/* Les graphes se tracent en 1,1 s : en « animations réduites », ils sont là d'emblée, et les captures montrent
   l'état final — c'est aussi le chemin de qui a coupé les animations. */
test.use({ reducedMotion: 'reduce' })

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

/** « 3 979 € », quelle que soit l'espace que `toLocaleString` met entre les milliers. */
const euros = (n: string) => new RegExp(`^${n.replace(' ', '\\s?')}\\s?€$`)

test('le mois type : l’anneau, la jauge de chacun, le filtre par personne et le détail d’une catégorie', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/budget')
  await page.getByRole('button', { name: /Le mois type/ }).click()
  await expect(page).toHaveURL(/\/mois-type$/)
  await expect(page.getByRole('heading', { name: 'Le mois type' })).toBeVisible()

  /* Le commun (3 897 €) au prorata 3 700 / 2 400, plus le perso de chacun : 3 978,57 € en tout. */
  const anneau = page.getByRole('region', { name: 'Le foyer, par mois' })
  await expect(anneau.getByText(euros('3 979')).first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Chacun, par mois' }).getByText('Thauba')).toBeVisible()
  await page.screenshot({ path: '.shots/mois-type/01-foyer.png', fullPage: true })

  /* Une catégorie touchée prend le centre ; retouchée, le total revient. */
  await anneau.getByRole('button', { name: /Impôts/ }).click()
  await expect(anneau.getByText(euros('1 070')).first()).toBeVisible()
  await anneau.getByRole('button', { name: /Impôts/ }).click()
  await expect(anneau.getByText(euros('3 979')).first()).toBeVisible()

  /* Vu par Thauba : sa part du commun et sa pharmacie, rien de ce qui n'est qu'à Kamil. */
  await page.getByRole('group', { name: 'Voir pour' }).getByRole('button', { name: 'Thauba' }).click()
  const sienne = page.getByRole('region', { name: 'Ce que Thauba paie, par mois' })
  await expect(sienne.getByText(euros('1 553')).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Auto :/ })).toHaveCount(0)
  await page.screenshot({ path: '.shots/mois-type/02-thauba.png', fullPage: true })

  /* Sa carte « Vie courante » ouvre le détail, déjà filtré sur la catégorie et sur elle. */
  await page.getByRole('button', { name: /^Vie courante :/ }).click()
  await expect(page).toHaveURL(new RegExp(`/toutes-les-charges/vie_courante/${foyer.elleId}$`))
  const tableau = page.getByRole('region', { name: 'Les charges' })
  await expect(tableau.getByText('Courses', { exact: true })).toBeVisible()
  await expect(tableau.getByText('Restaurant', { exact: true })).toBeVisible()
  await expect(tableau.getByText('Internet', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: '.shots/mois-type/03-detail.png', fullPage: true })
})

test('toutes les charges : chercher, filtrer, effacer — et les totaux suivent', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/toutes-les-charges')
  const tableau = page.getByRole('region', { name: 'Les charges' })
  await expect(page.getByText(/^10 lignes/)).toBeVisible({ timeout: 15_000 })
  await expect(tableau.getByText('Total par mois')).toBeVisible()
  await expect(tableau.getByText('Il reste')).toBeVisible()

  await page.getByLabel('Chercher').fill('mobile')
  await expect(page.getByText(/^1 ligne/)).toBeVisible()
  await expect(tableau.getByText('Forfait mobile')).toBeVisible()
  await expect(tableau.getByText('Total filtré')).toBeVisible()
  await expect(tableau.getByText('Il reste'), 'un reste sur un total filtré ne veut rien dire').toHaveCount(0)

  await page.getByRole('button', { name: 'Tout effacer' }).click()
  await page.getByRole('group', { name: 'Rythme' }).getByRole('button', { name: 'Chaque année' }).click()
  await expect(page.getByText(/^2 lignes/)).toBeVisible()
  await expect(tableau.getByText('Impôt sur le revenu')).toBeVisible()
  await expect(tableau.getByText('Entretien auto')).toBeVisible()

  await page.getByRole('button', { name: 'Tout effacer' }).click()
  await page.getByRole('group', { name: 'Qui paie' }).getByRole('button', { name: 'Commun' }).click()
  await expect(tableau.getByText('Forfait mobile')).toHaveCount(0)
  await expect(tableau.getByText('Pharmacie')).toHaveCount(0)
  await page.screenshot({ path: '.shots/mois-type/04-tableau.png', fullPage: true })
})

test('avant leur arrivée, le budget montre le mois type au lieu de « Pas encore »', async ({ page }) => {
  foyer = await amorce()
  const d = new Date()
  const suivant = `${d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear()}-${String((d.getMonth() + 1) % 12 + 1).padStart(2, '0')}-01`
  await db.from('user_profile').update({ entre_le: suivant }).in('id', [foyer.userId, foyer.elleId])
  await connecte(page, foyer.email)

  await expect(page.getByText(/^Ton mois type : .+ de charges, il te reste .+\.$/)).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: '.shots/mois-type/05-hub-avant.png' })
  await page.goto('/budget')
  await expect(page.getByRole('region', { name: 'Le foyer, par mois' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Pas encore', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: '.shots/mois-type/06-budget-avant.png', fullPage: true })
})

test('« J’ai fini » passe au dressage sans cocher ce qui reste', async ({ page }) => {
  foyer = await amorce({ cycleEtat: 'en_cuisine', budget: false })
  const maintenant = new Date().toISOString()
  const { error } = await db.from('session_task').insert([
    { cycle_id: foyer.cycleId, household_id: foyer.householdId, label: 'Émincer les oignons', duration_min: 8,
      planned_start_min: 0, position: 0, started_at: maintenant, done_at: maintenant },
    { cycle_id: foyer.cycleId, household_id: foyer.householdId, label: 'Rouler les wraps', duration_min: 10,
      planned_start_min: 8, position: 1 },
    { cycle_id: foyer.cycleId, household_id: foyer.householdId, label: 'Laver le plan de travail', duration_min: 5,
      planned_start_min: 18, position: 2 },
  ])
  expect(error).toBeNull()
  await connecte(page, foyer.email)

  await page.goto('/cuisine')
  await page.getByRole('button', { name: /J.ai fini/ }).click()
  const question = page.getByRole('alertdialog', { name: 'Tout est cuit ?' })
  await expect(question).toContainText('Rouler les wraps')
  await expect(question).toContainText('Laver le plan de travail')
  await page.screenshot({ path: '.shots/mois-type/07-jai-fini.png' })

  /* « Non » ne touche à rien. */
  await question.getByRole('button', { name: 'Non, je continue' }).click()
  await expect(question).toHaveCount(0)
  await page.getByRole('button', { name: /J.ai fini/ }).click()
  await page.getByRole('button', { name: 'Oui, au dressage' }).click()
  await expect(page).toHaveURL(/\/dressage$/)
  const { data: cycle } = await db.from('cycle').select('state').eq('id', foyer.cycleId).single()
  expect(cycle?.state).toBe('dressage')
  const { count } = await db.from('session_task').select('*', { count: 'exact', head: true })
    .eq('cycle_id', foyer.cycleId).is('done_at', null)
  expect(count, 'les actions non faites ne doivent pas être cochées : elles fausseraient les durées').toBe(2)
})

test('une session interrompue dont le plan date d’un mois se retrouve sur l’accueil', async ({ page }) => {
  foyer = await amorce({ cycleEtat: 'interrompue', budget: false })
  const ilYaHuitSemaines = new Date(Date.now() - 56 * 86_400_000).toISOString().slice(0, 10)
  await db.from('cycle').update({ week_of: ilYaHuitSemaines, started_at: new Date().toISOString() })
    .eq('id', foyer.cycleId)
  await connecte(page, foyer.email)

  await expect(page.getByText('Session interrompue')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Reprends-la depuis la cuisine.')).toBeVisible()
  await page.screenshot({ path: '.shots/mois-type/08-hub-interrompue.png' })
  await page.getByText('Session interrompue').click()
  await page.getByRole('button', { name: 'Reprendre la session interrompue' }).click()
  await expect(page).toHaveURL(/\/cuisine$/)
  const { data: cycle } = await db.from('cycle').select('state').eq('id', foyer.cycleId).single()
  expect(cycle?.state).toBe('en_cuisine')
})
