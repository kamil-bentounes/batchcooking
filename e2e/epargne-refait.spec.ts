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
    await expect(carte.getByRole('meter')).toHaveAttribute('aria-valuetext', /990 € sur 4 500 €/)
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
    // Au focus clavier, le bouton garde ses coins arrondis (la règle globale `:focus-visible` les rendait carrés).
    const coin = await carte.getByRole('button', { name: 'Je retire' }).evaluate(e => getComputedStyle(e).borderTopLeftRadius)
    expect(coin, 'les coins d’un bouton arrondi au focus clavier').toBe('16px')
  })
})

/* ── 3 · Les montants longs, les bornes, les erreurs du formulaire ──────────────────────────────────────────────────── */

test.describe('montants longs, bornes et erreurs', () => {
  let f: Foyer
  const ajoute = async (libelle: string, genre: 'urgence' | 'projet', objectif: number | null, extra: object = {}) =>
    (await db.from('poche_epargne').insert({ household_id: f.householdId, libelle, genre, objectif_cents: objectif, ...extra })
      .select('id').single()).data!.id as string
  const verseA = (poche: string, user: string, cents: number) => db.from('versement_epargne').insert({
    household_id: f.householdId, poche_id: poche, user_profile_id: user, montant_cents: cents,
    motif: cents < 0 ? 'retrait' : 'mensuel' })

  test.beforeAll(async () => {
    f = await amorce({ budget: false })
    // Une poche à gros montants et à centimes, un projet, deux poches du même nom, une poche vidée.
    const grande = await ajoute('Épargne de sécurité pour un très long nom de poche', 'urgence', 5_000_000)
    await verseA(grande, f.userId, 12_345_67)
    await verseA(grande, f.elleId, 1_240_50)
    const projet = await ajoute('Voyage', 'projet', 300_000, { echeance: `${new Date().getFullYear() + 2}-01-15` })
    await verseA(projet, f.userId, 299_000)           // 99,67 % : « 99 % », pas « 100 % »
    // La base interdit deux poches de même nom, à la casse près : « Voyage » et « voyage » sont deux poches pour elle.
    await ajoute('voyage', 'projet', 100_000, { echeance: `${new Date().getFullYear() + 2}-02-15` })
    const videe = await ajoute('Vidée', 'urgence', 100_000)
    await verseA(videe, f.userId, 50_000)
    await verseA(videe, f.userId, -50_000)
  })
  test.afterAll(async () => { if (f) await efface(f) })

  /** Ce qui sort de sa carte : un montant qui déborde d'une tuile, un total qui dépasse la carte. */
  const debordements = (page: Page) => page.evaluate(() => {
    const sortis: string[] = []
    for (const carte of document.querySelectorAll<HTMLElement>('main section[aria-label]')) {
      const limite = carte.getBoundingClientRect().right
      for (const e of carte.querySelectorAll<HTMLElement>('b, li, input, button, h2')) {
        const r = e.getBoundingClientRect()
        if (r.width > 0 && r.right > limite + 0.5) sortis.push(`${e.tagName} ${(e.textContent ?? '').trim().slice(0, 30)}`)
        if (e.tagName === 'B' || e.tagName === 'INPUT') {
          if (e.scrollWidth > e.clientWidth + 1) sortis.push(`rogné ${e.tagName} ${(e.textContent ?? '').trim().slice(0, 30)}`)
        }
      }
      // Un montant de tuile ne sort pas de sa tuile.
      for (const tuile of carte.querySelectorAll<HTMLElement>('ul[aria-label="Qui a versé quoi"] li')) {
        const t = tuile.getBoundingClientRect()
        for (const b of tuile.querySelectorAll<HTMLElement>('b')) {
          if (b.getBoundingClientRect().right > t.right + 0.5) sortis.push(`tuile ${b.textContent}`)
        }
      }
    }
    return sortis
  })

  for (const largeur of [390, 320]) {
    test(`à ${largeur} px, aucun montant ne sort de sa carte ni de sa tuile ; le titre tient en trois lignes`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 800 })
      await connecte(page, f)
      await page.goto('/epargne')
      const carte = poche(page, 'Épargne de sécurité pour un très long nom de poche')
      const registre = carte.getByRole('list', { name: 'Qui a versé quoi' })
      await expect(registre).toBeVisible({ timeout: 15_000 })
      await expect(registre).toContainText('12 345,67 €')
      await expect(registre).toContainText('1 240,50 €')
      await expect(carte.getByText('13 586,17 €', { exact: true })).toBeVisible()
      expect(await debordements(page), `débordements à ${largeur} px`).toEqual([])
      expect(await debordement(page), 'défilement horizontal').toBeLessThanOrEqual(0)
      // Le titre est limité à trois lignes.
      const lignes = await carte.getByRole('heading', { level: 2 }).evaluate(h =>
        Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)))
      expect(lignes).toBeLessThanOrEqual(3)
      await page.screenshot({ path: `${CAPTURES}/epargne-montants-longs-${largeur}.png`, fullPage: true })
      await carte.screenshot({ path: `${CAPTURES}/epargne-montants-longs-carte-${largeur}.png` })
    })
  }

  test('le pourcentage dit vrai, la jauge reste dans ses bornes, deux poches du même nom se distinguent', async ({ page }) => {
    await connecte(page, f)
    await page.goto('/epargne')
    const un = page.getByRole('region', { name: /^voyage \(1 sur 2\)$/i }), deux = page.getByRole('region', { name: /^voyage \(2 sur 2\)$/i })
    await expect(un).toBeVisible({ timeout: 15_000 })
    await expect(deux).toBeVisible()
    await expect(un.getByRole('meter')).toHaveAccessibleName(/^Avancement de « voyage \(1 sur 2\) »$/i)
    await expect(deux.getByRole('meter')).toHaveAccessibleName(/^Avancement de « voyage \(2 sur 2\) »$/i)
    // Un des deux Voyage est à 99,67 % : « 99 % ».
    await expect(page.getByText('99 %', { exact: true })).toHaveCount(1)
    await expect(page.getByText('100 %', { exact: true })).toHaveCount(0)
    for (const e of await page.getByRole('meter').all()) {
      const [n, max] = await Promise.all([e.getAttribute('aria-valuenow'), e.getAttribute('aria-valuemax')])
      expect(Number(n)).toBeLessThanOrEqual(Number(max))
    }
  })

  test('tout retiré : une autre phrase, et plus de pastille', async ({ page }) => {
    await connecte(page, f)
    await page.goto('/epargne')
    const carte = poche(page, 'Vidée')
    await expect(carte.getByText('Tout a été retiré : il n’y a plus rien dessus.')).toBeVisible({ timeout: 15_000 })
    await expect(carte.getByText(/Rien n’y est encore versé/)).toHaveCount(0)
    await expect(carte.getByRole('list', { name: 'Qui a versé quoi' })).toHaveCount(0)
  })

  test('le champ du montant d’un poste ne rogne pas « 12400,50 »', async ({ page }) => {
    await connecte(page, f)
    for (const largeur of [390, 320]) {
      await page.setViewportSize({ width: largeur, height: 800 })
      await page.goto('/epargne')
      const carte = page.getByRole('region', { name: /^voyage \(1 sur 2\)$/i })
      await expect(carte.getByLabel('Un poste')).toBeVisible({ timeout: 15_000 })
      const champ = carte.getByLabel('Montant du poste (€)')
      await champ.fill('12400,50')
      const [sw, cw] = await champ.evaluate(e => [e.scrollWidth, e.clientWidth])
      expect(sw, `« 12400,50 » rogné à ${largeur} px`).toBeLessThanOrEqual(cw)
      expect(await debordement(page)).toBeLessThanOrEqual(0)
      await carte.getByLabel('Un poste').scrollIntoViewIfNeeded()
      await carte.screenshot({ path: `${CAPTURES}/epargne-poste-carte-${largeur}.png` })
    }
  })

  test('« Ouvrir une poche » : un objectif illisible est refusé sous la case, et l’erreur de création se dit dans le formulaire', async ({ page }) => {
    await connecte(page, f)
    await page.goto('/epargne')
    const form = page.getByRole('region', { name: 'Ouvrir une poche' })
    await expect(form).toBeVisible({ timeout: 15_000 })
    const nb = async () => (await db.from('poche_epargne').select('id').eq('household_id', f.householdId)).data!.length
    const avant = await nb()

    await form.getByLabel('Son nom').fill('Sans objectif ?')
    await form.getByLabel('Objectif (€)').fill('abc')
    await expect(form.getByText(/Un montant, au plus 1 000 000 €/)).toBeVisible()
    await expect(form.getByLabel('Objectif (€)')).toHaveAttribute('aria-invalid', 'true')
    await expect(form.getByRole('button', { name: 'Ouvrir', exact: true })).toBeDisabled()
    expect(await nb()).toBe(avant)

    // Un objectif vide reste permis (une poche sans objectif) ; la panne de la base se dit dans le formulaire.
    await form.getByLabel('Objectif (€)').fill('')
    await expect(form.getByRole('button', { name: 'Ouvrir', exact: true })).toBeEnabled()
    await page.route('**/rest/v1/poche_epargne*', r => r.request().method() === 'POST'
      ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'la base a refusé' }) })
      : r.continue())
    await form.getByRole('button', { name: 'Ouvrir', exact: true }).click()
    await expect(form.getByRole('alert')).toContainText('la base a refusé')
    await expect(page.locator('main > div > p[role=alert]')).toHaveCount(0)
    expect(await nb()).toBe(avant)
  })
})
