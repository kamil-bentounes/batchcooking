/**
 * « L'épargne » refaite d'après la maquette du 27/10 : ouvrir une poche, verser, se voir refuser un retrait, et un projet
 * avec ses postes — joués de bout en bout. À CHAQUE geste on RELIT LA BASE : ce que l'écran affiche ne prouve rien de ce
 * qui est écrit.
 *
 * Les captures (390, 320 et 1440 px) des états de la maquette sont posées dans `CAPTURES_EPARGNE`.
 * ⚠️ LOCAL, ET RIEN D'AUTRE.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, db, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'

const CAPTURES = process.env.CAPTURES_EPARGNE ?? '.shots/epargne'

test.use({ viewport: { width: 390, height: 844 }, actionTimeout: 15_000 })
test.describe.configure({ mode: 'serial' })
test.beforeAll(() => {
  if (!/127\.0\.0\.1|localhost/.test(process.env.VITE_SUPABASE_URL ?? '')) {
    throw new Error('Ce banc ne se joue qu’en local.')
  }
})

async function connecte(page: Page, f: Foyer) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(f.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

const debordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

/** Les cibles de moins de 44 px, visibles et touchables : un pouce doit les trouver. */
const ciblesPetites = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>('main button, main a[href], main [role=radio], main input')]
    .map(c => ({ c, r: c.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
    .map(({ c, r }) => `${(c.getAttribute('aria-label') || c.textContent || c.tagName).trim().slice(0, 40)} ${Math.round(r.width)}×${Math.round(r.height)}`))

/** Les trois largeurs de la maquette, la page entière ; on revient ensuite à 390 px. */
async function captureAuxTroisLargeurs(page: Page, nom: string) {
  for (const [w, h, suffixe] of [[390, 844, '390'], [320, 700, '320'], [1440, 900, '1440']] as const) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(400)
    expect(await debordement(page), `défilement horizontal à ${w} px : ${nom}`).toBeLessThanOrEqual(0)
    await page.screenshot({ path: `${CAPTURES}/${nom}-${suffixe}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
}

const poche = (page: Page, nom: string) => page.getByRole('region', { name: nom, exact: true })
const lePoche = async (f: Foyer, libelle: string) =>
  (await db.from('poche_epargne').select('*').eq('household_id', f.householdId).eq('libelle', libelle)).data ?? []
const verse = async (f: Foyer) => ((await db.from('versement_epargne').select('montant_cents')
  .eq('household_id', f.householdId)).data ?? []).reduce((t, v) => t + v.montant_cents, 0)

/* ── 1 · Un foyer sans épargne : on ouvre un fonds d'urgence ─────────────────────────────────────────────────────────── */

test.describe('un foyer qui n’a encore rien mis de côté', () => {
  let f: Foyer
  test.beforeAll(async () => { f = await amorce({ budget: false }) })
  test.afterAll(async () => { if (f) await efface(f) })

  test('on ouvre un fonds d’urgence : la poche vide le dit, et la phrase des quatre mois est là', async ({ page }) => {
    await connecte(page, f)
    await page.goto('/epargne')
    await expect(page.getByRole('heading', { name: 'L’épargne', level: 1 })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/Ce qui est versé appartient à qui l’a versé/)).toBeVisible()
    await expect(page.getByText('Rien encore')).toBeVisible()

    await page.getByRole('radio', { name: 'Fonds d’urgence' }).click()
    await expect(page.getByText(/quatre mois de ce qui est nécessaire/).last()).toBeVisible()
    await page.getByLabel('Son nom').fill('Épargne de sécurité')
    await page.getByLabel('Objectif (€)').fill('4000')
    await page.getByRole('button', { name: 'Ouvrir', exact: true }).click()

    const carte = poche(page, 'Épargne de sécurité')
    await expect(carte).toBeVisible({ timeout: 15_000 })
    await expect(carte.getByText('Fonds d’urgence')).toBeVisible()
    await expect(carte.getByText('0 €').first()).toBeVisible()
    await expect(carte.getByText('sur 4 000 €')).toBeVisible()
    await expect(carte.getByText('pas de date')).toBeVisible()
    await expect(carte.getByText(/Rien n’y est encore versé/)).toBeVisible()
    await expect(carte.getByRole('button', { name: 'Je verse' })).toBeDisabled()
    await expect(carte.getByRole('button', { name: 'Je retire' })).toBeDisabled()

    const lignes = await lePoche(f, 'Épargne de sécurité')
    expect(lignes).toHaveLength(1)
    expect(lignes[0]).toMatchObject({ genre: 'urgence', objectif_cents: 400_000, echeance: null, cle: null })
    expect(await verse(f), 'ouvrir une poche ne verse rien').toBe(0)

    expect(await ciblesPetites(page), 'cibles de moins de 44 px').toEqual([])
    await captureAuxTroisLargeurs(page, 'epargne-poche')
  })
})

/* ── 2 · Un foyer qui a déjà versé : verser, être refusé, un projet avec ses postes ─────────────────────────────────── */

test.describe('versements, retrait refusé, un projet', () => {
  let f: Foyer
  const cleEcheance = () => {
    const d = new Date(); d.setMonth(d.getMonth() + 10, 15)
    return d.toISOString().slice(0, 10)
  }
  test.beforeAll(async () => {
    f = await amorce()
    // Thauba a versé, elle aussi : le registre dit qui a mis quoi.
    const { data: p } = await db.from('poche_epargne').select('id').eq('household_id', f.householdId).eq('libelle', 'Urgence').single()
    await db.from('versement_epargne').insert({
      household_id: f.householdId, poche_id: p!.id, user_profile_id: f.elleId, montant_cents: 48_000, motif: 'mensuel' })
  })
  test.afterAll(async () => { if (f) await efface(f) })

  test('un versement : écrit au nom de celui qui le fait, et le registre le montre', async ({ page }) => {
    await connecte(page, f)
    await page.goto('/epargne')
    const carte = poche(page, 'Urgence')
    const registre = carte.getByRole('list', { name: 'Qui a versé quoi' })
    await expect(registre).toBeVisible({ timeout: 15_000 })
    await expect(registre).toContainText('310 €')
    await expect(registre).toContainText('Kamil')
    await expect(registre).toContainText('480 €')
    await expect(registre).toContainText('Thauba')
    await expect(carte.getByText('790 €')).toBeVisible()
    const avant = await verse(f)

    await carte.getByLabel('Verser (€)').fill('200')
    await carte.getByRole('button', { name: 'Je verse' }).click()
    await expect(carte.getByText('990 €')).toBeVisible({ timeout: 15_000 })
    await expect(registre).toContainText('510 €')
    await expect(carte.getByLabel('Verser (€)')).toHaveValue('')
    expect(await verse(f) - avant, 'le versement est écrit, une seule fois').toBe(20_000)
    const { data: v } = await db.from('versement_epargne').select('user_profile_id, motif')
      .eq('household_id', f.householdId).eq('montant_cents', 20_000).single()
    expect(v).toMatchObject({ user_profile_id: f.userId, motif: 'mensuel' })
    await expect(carte.getByRole('meter')).toHaveAttribute('aria-label', /990 € sur 4 500 €/)
  })

  test('un retrait refusé : on ne retire pas plus que ce qu’on a versé, et rien n’est écrit', async ({ page }) => {
    await connecte(page, f)
    await page.goto('/epargne')
    const carte = poche(page, 'Urgence')
    await expect(carte.getByRole('list', { name: 'Qui a versé quoi' })).toBeVisible({ timeout: 15_000 })
    const avant = await verse(f)

    await carte.getByLabel('Verser (€)').fill('1000')
    await expect(carte.getByRole('button', { name: 'Je retire' })).toBeEnabled()
    await carte.getByRole('button', { name: 'Je retire' }).click()
    const refus = carte.getByRole('alert')
    await expect(refus).toHaveText('Tu n’as versé que 510 € ici : tu ne peux pas en retirer plus.')
    expect(await verse(f), 'la poche n’a pas été entamée').toBe(avant)
    await captureAuxTroisLargeurs(page, 'epargne-exemple-refus')

    // Le refus s'efface dès qu'on retape.
    await carte.getByLabel('Verser (€)').fill('10')
    await expect(refus).toHaveCount(0)
  })

  test('un projet : on l’ouvre avec sa date et sa clé, on y pose un poste, on le retire', async ({ page }) => {
    await connecte(page, f)
    await page.goto('/epargne')
    await expect(poche(page, 'Urgence')).toBeVisible({ timeout: 15_000 })

    // « Un projet » est le choix par défaut : Pour quand, puis Comment le financer, avec sa phrase.
    await expect(page.getByRole('radio', { name: 'Un projet' })).toHaveAttribute('aria-checked', 'true')
    await page.getByLabel('Son nom').fill('Voyage d’été')
    await page.getByLabel('Objectif (€)').fill('3000')
    await page.getByLabel(/^Pour quand/).fill(cleEcheance())
    await expect(page.getByRole('radio', { name: 'Comme le foyer' })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('radio', { name: 'Moitié-moitié' }).click()
    await expect(page.getByText('Un voyage peut être à moitié-moitié même si tout le reste est au prorata.')).toBeVisible()
    await page.getByRole('button', { name: 'Ouvrir', exact: true }).click()

    const carte = poche(page, 'Voyage d’été')
    await expect(carte).toBeVisible({ timeout: 15_000 })
    await expect(carte.getByText('Un projet', { exact: true })).toBeVisible()
    await expect(carte.getByText('sur 3 000 €')).toBeVisible()
    await expect(carte.getByText(/^pour [a-zéû]+ \d{4}$/)).toBeVisible()
    await expect(carte.getByText('Le projet', { exact: true })).toBeVisible()
    const lignes = await lePoche(f, 'Voyage d’été')
    expect(lignes).toHaveLength(1)
    expect(lignes[0]).toMatchObject({ genre: 'projet', objectif_cents: 300_000, cle: 'moitie', echeance: cleEcheance() })

    // L'effort mensuel : le calcul existant, dit avec l'état de la poche.
    await expect(carte.getByText(/par mois pendant \d+ mois pour tenir la date\./)).toBeVisible()

    // Un poste : « Vols », 1 400 €.
    const ajoute = carte.getByRole('button', { name: 'Ajouter ce poste' })
    await expect(ajoute).toBeDisabled()
    await carte.getByLabel('Un poste').fill('Vols')
    await carte.getByLabel('Montant du poste (€)').fill('1400')
    await ajoute.click()
    const postes = carte.getByRole('list', { name: 'Les postes du projet' })
    await expect(postes).toContainText('Vols', { timeout: 15_000 })
    await expect(postes).toContainText('1 400 €')
    await expect(carte.getByLabel('Un poste')).toHaveValue('')
    const { data: rows } = await db.from('poche_poste').select('libelle, montant_cents').eq('poche_id', lignes[0].id)
    expect(rows).toEqual([{ libelle: 'Vols', montant_cents: 140_000 }])
    // Les postes (1 400 €) ne font pas l'objectif (3 000 €) : l'écran le dit, sans rien corriger en silence.
    await expect(carte.getByText(/Les postes font 1 400 €, l’objectif 3 000 €\./)).toBeVisible()
    expect((await lePoche(f, 'Voyage d’été'))[0].objectif_cents).toBe(300_000)

    expect(await ciblesPetites(page), 'cibles de moins de 44 px').toEqual([])
    await captureAuxTroisLargeurs(page, 'epargne-exemple')

    // Retirer le poste.
    await carte.getByRole('button', { name: 'Retirer Vols' }).click()
    await expect(postes).toHaveCount(0, { timeout: 15_000 })
    const { data: reste } = await db.from('poche_poste').select('id').eq('poche_id', lignes[0].id)
    expect(reste).toEqual([])
  })

  test('le clavier et le focus : Verser, Je verse et Je retire s’atteignent à la tabulation', async ({ page }) => {
    await connecte(page, f)
    await page.goto('/epargne')
    const carte = poche(page, 'Urgence')
    await expect(carte.getByRole('list', { name: 'Qui a versé quoi' })).toBeVisible({ timeout: 15_000 })
    await carte.getByLabel('Verser (€)').fill('5')
    await page.keyboard.press('Tab')
    await expect(carte.getByRole('button', { name: 'Je verse' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(carte.getByRole('button', { name: 'Je retire' })).toBeFocused()
    // L'anneau de focus se voit : un contour de 2 px.
    const contour = await carte.getByRole('button', { name: 'Je retire' }).evaluate(e => getComputedStyle(e).outlineWidth)
    expect(contour).toBe('2px')
  })
})
