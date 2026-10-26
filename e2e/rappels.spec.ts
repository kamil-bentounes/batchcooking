/**
 * Les rappels par mail, joués de bout en bout.
 *
 * On sème un foyer de deux (Kamil et Thauba) et on joue au clic : activer puis couper un rappel (et relire la base
 * à chaque geste), ne pas voir ceux de l'autre, le lien « C'est fait » d'un mail (`/frigo?sortir=…` : une
 * confirmation, puis les barquettes passent au frigo, les identifiants qui ne désignent rien sont ignorés), le
 * bandeau de la semaine qui suit le réglage, « M'envoyer un exemple ».
 *
 * AUCUN mail ne part : l'exemple appelle une fonction que le banc intercepte (la fonction edge n'est pas servie en
 * local, et un vrai envoi sortirait par le Gmail de Kamil).
 *
 * Les captures (390 px et 320 px) sont posées dans `CAPTURES_RAPPELS`, à regarder à côté de la maquette
 * `Rappels.dc.html`.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { MOT_DE_PASSE, amorce, efface, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'

const CAPTURES = process.env.CAPTURES_RAPPELS ?? '.shots/rappels'

test.use({ viewport: { width: 390, height: 844 } })
/* Les parcours se suivent : chacun part de ce que le précédent a laissé dans la base. */
test.describe.configure({ mode: 'serial' })

let foyer: Foyer
let autreFoyer: string
const JOUR_MS = 24 * 60 * 60_000

const jourLocal = (decalage: number) => {
  const d = new Date(); d.setDate(d.getDate() + decalage)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** « mercredi » : le jour de la semaine d'un jour décalé, à Paris. */
const jourDeSemaine = (decalage: number) =>
  new Date(Date.now() + decalage * JOUR_MS).toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'Europe/Paris' })

async function connecte(page: Page, email: string) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

async function capture(page: Page, nom: string, plein = false) {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${CAPTURES}/${nom}.png`, fullPage: plein })
}

/** Les cibles de moins de 44 px visibles et touchables : un pouce doit les trouver. */
const ciblesPetites = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>('button, a[href], [role=switch], input[type=checkbox]')]
    .filter(c => getComputedStyle(c).visibility !== 'hidden' && !c.closest('[inert]'))
    .map(c => ({ c, r: c.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
    .map(({ c, r }) => `${(c.getAttribute('aria-label') || c.textContent || '?').trim().slice(0, 30)} ${Math.round(r.width)}×${Math.round(r.height)}`))

/** Les boutons de la feuille ouverte, s'il y en a de moins de 44 px. */
const ciblesDeLaFeuille = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>('dialog[open] button')]
    .map(c => ({ c, r: c.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
    .map(({ c, r }) => `${(c.textContent || '?').trim().slice(0, 30)} ${Math.round(r.width)}×${Math.round(r.height)}`))

const reglages = async (qui: string) =>
  (await db.from('rappel_reglage').select('type, actif').eq('user_id', qui).order('type')).data!

async function unePortion(foyerId: string, o: { label: string; lieu: 'frigo' | 'congelateur'; etat?: string }) {
  const r = await db.from('portion').insert({
    household_id: foyerId, label: o.label, grams: 400, kcal: 600, protein_g: 40, fiber_g: 5, carb_g: 60, fat_g: 20,
    location: o.lieu, state: o.etat ?? 'au_frais',
    frozen_at: o.lieu === 'congelateur' ? new Date().toISOString() : null,
    expires_at: new Date(Date.now() + (o.lieu === 'congelateur' ? 60 : 3) * JOUR_MS).toISOString(),
  }).select().single()
  if (r.error) throw new Error(r.error.message)
  return r.data
}

test.beforeAll(async () => {
  foyer = await amorce({ budget: false })
  const h = await db.from('household').insert({ name: 'Foyer voisin' }).select().single()
  autreFoyer = h.data!.id
})
test.afterAll(async () => {
  if (autreFoyer) await db.from('household').delete().eq('id', autreFoyer)
  if (foyer) await efface(foyer)
})

test('activer puis couper un rappel : l’interrupteur, la base, la page rechargée', async ({ page }) => {
  await connecte(page, foyer.email)
  await page.goto('/reglages')
  await page.getByRole('button', { name: 'Régler mes rappels' }).click()
  await expect(page.getByRole('heading', { name: 'Les rappels par mail', level: 1 })).toBeVisible()
  await expect(page).toHaveURL(/\/rappels$/)

  // Sept rappels, tous coupés au départ : rien n'est envoyé à qui n'a rien demandé.
  const interrupteurs = page.getByRole('switch')
  await expect(interrupteurs).toHaveCount(7)
  for (const s of await interrupteurs.all()) await expect(s).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByText('Coupé', { exact: true })).toHaveCount(7)
  expect(await reglages(foyer.userId)).toEqual([])
  await capture(page, '01-tous-coupes', true)

  // Un interrupteur de 44 px, au moins.
  const sw = page.getByRole('switch', { name: 'Sortir du congélateur' })
  expect((await sw.boundingBox())!.height).toBeGreaterThanOrEqual(44)

  // Activer : l'écran, puis la base.
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => reglages(foyer.userId)).toEqual([{ type: 'sortir_du_congelateur', actif: true }])
  await expect(page.getByText('Activé', { exact: true })).toHaveCount(1)
  await capture(page, '02-un-actif')

  // Rechargée, la page relit la base : le réglage tient.
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Sortir du congélateur' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('switch', { name: 'Une barquette va périmer' })).toHaveAttribute('aria-checked', 'false')

  // Couper : la ligne reste, à faux.
  await page.getByRole('switch', { name: 'Sortir du congélateur' }).click()
  await expect(page.getByRole('switch', { name: 'Sortir du congélateur' })).toHaveAttribute('aria-checked', 'false')
  await expect.poll(() => reglages(foyer.userId)).toEqual([{ type: 'sortir_du_congelateur', actif: false }])

  // Aucun rappel n'est dû pour qui n'a rien d'activé : la base ne rend rien à ce foyer.
  const dus = await db.rpc('rappels_a_envoyer', { p_maintenant: new Date().toISOString() })
  expect(dus.error).toBeNull()
  expect((dus.data as { user_id: string }[]).filter(d => [foyer.userId, foyer.elleId].includes(d.user_id))).toEqual([])
})

test('chacun règle les siens : on ne voit pas ceux de l’autre membre, et on ne les change pas', async ({ page, browser }) => {
  // Thauba a activé « Choisir les repas » ; Kamil « Une barquette va périmer ».
  await db.from('rappel_reglage').upsert([
    { user_id: foyer.elleId, type: 'choisir_les_repas', actif: true },
    { user_id: foyer.userId, type: 'barquette_perime', actif: true },
  ])

  await connecte(page, foyer.email)
  await page.goto('/rappels')
  await expect(page.getByRole('switch', { name: 'Une barquette va périmer' })).toHaveAttribute('aria-checked', 'true')
  // Ce que Thauba a activé n'apparaît pas chez Kamil.
  await expect(page.getByRole('switch', { name: 'Choisir les repas' })).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('[data-regle="chacun-les-siens"]')).toContainText('Thauba règle les siens de son côté')
  await expect(page.locator('[data-regle="chacun-les-siens"]')).toContainText('personne ne voit les tiens')

  // Kamil active « Choisir les repas » : c'est SA ligne ; celle de Thauba ne bouge pas.
  await page.getByRole('switch', { name: 'Choisir les repas' }).click()
  await expect(page.getByRole('switch', { name: 'Choisir les repas' })).toHaveAttribute('aria-checked', 'true')
  await expect.poll(async () => (await reglages(foyer.userId)).map(r => `${r.type}:${r.actif}`))
    .toEqual(['barquette_perime:true', 'choisir_les_repas:true', 'sortir_du_congelateur:false'])
  expect(await reglages(foyer.elleId)).toEqual([{ type: 'choisir_les_repas', actif: true }])
  await capture(page, '03-les-siens')

  // Thauba, chez elle : ses réglages à elle, pas ceux de Kamil.
  const ctxElle = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })
  const elle = await ctxElle.newPage()
  await connecte(elle, foyer.elleEmail)
  await elle.goto('/rappels')
  await expect(elle.getByRole('switch', { name: 'Choisir les repas' })).toHaveAttribute('aria-checked', 'true')
  await expect(elle.getByRole('switch', { name: 'Une barquette va périmer' })).toHaveAttribute('aria-checked', 'false')
  await expect(elle.getByRole('switch', { name: 'Sortir du congélateur' })).toHaveAttribute('aria-checked', 'false')
  await expect(elle.locator('[data-regle="chacun-les-siens"]')).toContainText('Kamil règle les siens de son côté')
  // Ce qu'elle coupe est à elle : Kamil garde le sien.
  await elle.getByRole('switch', { name: 'Choisir les repas' }).click()
  await expect.poll(async () => (await reglages(foyer.elleId)).map(r => r.actif)).toEqual([false])
  expect((await reglages(foyer.userId)).find(r => r.type === 'choisir_les_repas')!.actif).toBe(true)
  await ctxElle.close()
})

test('/frigo?sortir=… demande confirmation, puis sort les barquettes ; le reste est ignoré', async ({ page }) => {
  const wraps = [await unePortion(foyer.householdId, { label: 'Wraps poulet', lieu: 'congelateur' }),
    await unePortion(foyer.householdId, { label: 'Wraps poulet', lieu: 'congelateur' }),
    await unePortion(foyer.householdId, { label: 'Wraps poulet', lieu: 'congelateur' })]
  const dejaAuFrigo = await unePortion(foyer.householdId, { label: 'Soupe', lieu: 'frigo' })
  const dUnAutreFoyer = await unePortion(autreFoyer, { label: 'Wraps poulet', lieu: 'congelateur' })
  const inconnue = randomUUID()
  const ids = [...wraps.map(w => w.id), dejaAuFrigo.id, dUnAutreFoyer.id, inconnue, 'pas-un-id']

  await connecte(page, foyer.email)
  await page.goto(`/frigo?sortir=${ids.join(',')}`)

  // Une confirmation, avec la phrase du mail : rien n'a bougé.
  const feuille = page.getByRole('dialog', { name: 'Sortir 3 wraps du congélateur ?' })
  await expect(feuille).toBeVisible()
  await expect(feuille).toContainText('à manger dans les 24 heures')
  await capture(page, '04-frigo-confirmation')
  const avant = await db.from('portion').select('id, location, state').in('id', wraps.map(w => w.id))
  expect(avant.data!.every(p => p.location === 'congelateur' && p.state === 'au_frais')).toBe(true)

  // « Pas maintenant » : rien n'est écrit, et l'adresse est nettoyée (un rechargement ne repose pas la question).
  await feuille.getByRole('button', { name: 'Pas maintenant' }).click()
  await expect(feuille).toBeHidden()
  await expect(page).toHaveURL(/\/frigo$/)
  const apresNon = await db.from('portion').select('location').in('id', wraps.map(w => w.id))
  expect(apresNon.data!.every(p => p.location === 'congelateur')).toBe(true)

  // Le même lien, et « Oui, je les sors ».
  await page.goto(`/frigo?sortir=${ids.join(',')}`)
  const feuille2 = page.getByRole('dialog', { name: 'Sortir 3 wraps du congélateur ?' })
  await feuille2.getByRole('button', { name: 'Oui, je les sors' }).click()
  await expect(page.getByRole('dialog', { name: 'C’est fait' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '3 wraps sont au frigo, à manger dans les 24 heures.' })).toBeVisible()
  await capture(page, '05-frigo-fait')

  // La base : les trois sont au frigo, décongelées, à manger sous 24 h. Les autres n'ont pas bougé.
  const apres = await db.from('portion').select('id, location, state, expires_at, frozen_at').in('id', wraps.map(w => w.id))
  for (const p of apres.data!) {
    expect(p.location).toBe('frigo')
    expect(p.state).toBe('decongelee')
    expect(p.frozen_at).toBeNull()
    const reste = new Date(p.expires_at).getTime() - Date.now()
    expect(reste).toBeGreaterThan(23 * 3_600_000)
    expect(reste).toBeLessThanOrEqual(24 * 3_600_000 + 60_000)
  }
  const soupe = await db.from('portion').select('location, state').eq('id', dejaAuFrigo.id).single()
  expect(soupe.data).toEqual({ location: 'frigo', state: 'au_frais' })
  const voisine = await db.from('portion').select('location, state').eq('id', dUnAutreFoyer.id).single()
  expect(voisine.data).toEqual({ location: 'congelateur', state: 'au_frais' })

  await page.getByRole('dialog', { name: 'C’est fait' }).getByRole('button', { name: 'Fermer' }).click()
  await expect(page).toHaveURL(/\/frigo$/)

  // Le même lien rouvert : plus rien à sortir, sans erreur.
  await page.goto(`/frigo?sortir=${ids.join(',')}`)
  const rien = page.getByRole('dialog', { name: 'Rien à sortir' })
  await expect(rien).toBeVisible()
  await expect(rien).toContainText('ne sont plus au congélateur')
  await capture(page, '06-frigo-rien-a-sortir')
  await rien.getByRole('button', { name: 'D’accord' }).click()
  await expect(rien).toBeHidden()

  // Un lien sans identifiant valable ne demande rien, une adresse sans `sortir` non plus.
  await page.goto('/frigo?sortir=nimporte-quoi')
  await expect(page.getByRole('dialog', { name: 'Rien à sortir' })).toBeVisible()
  await page.goto('/frigo')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('le bandeau de la semaine suit le réglage', async ({ page }) => {
  // Deux wraps congelés posés sur le dîner d'après-demain+1, un par personne.
  const j = 3
  const jour = jourLocal(j)
  const wrapK = await unePortion(foyer.householdId, { label: 'Wraps poulet', lieu: 'congelateur' })
  const wrapE = await unePortion(foyer.householdId, { label: 'Wraps poulet', lieu: 'congelateur' })
  const poses = await db.from('meal_slot').insert([
    { household_id: foyer.householdId, user_profile_id: foyer.userId, day: jour, meal: 'diner', portion_id: wrapK.id, state: 'prevu' },
    { household_id: foyer.householdId, user_profile_id: foyer.elleId, day: jour, meal: 'diner', portion_id: wrapE.id, state: 'prevu' },
  ]).select()
  expect(poses.error).toBeNull()
  // Le rappel de Kamil est coupé.
  await db.from('rappel_reglage').upsert({ user_id: foyer.userId, type: 'sortir_du_congelateur', actif: false })

  await connecte(page, foyer.email)
  await page.goto(`/semaine?jour=${jour}`)
  const carte = page.locator('[data-carte]').filter({ hasText: 'Wraps' }).first()
  await expect(carte).toContainText('Pense à sortir les 2 wraps la veille au soir.')

  // Il l'active sur l'écran des rappels : le bandeau promet désormais le mail.
  await page.goto('/rappels')
  await page.getByRole('switch', { name: 'Sortir du congélateur' }).click()
  await expect(page.getByRole('switch', { name: 'Sortir du congélateur' })).toHaveAttribute('aria-checked', 'true')
  await expect.poll(async () => (await reglages(foyer.userId)).find(r => r.type === 'sortir_du_congelateur')?.actif).toBe(true)
  await page.goto(`/semaine?jour=${jour}`)
  const veille = jourDeSemaine(j - 1)
  await expect(page.locator('[data-carte]').filter({ hasText: 'Wraps' }).first())
    .toContainText(`Mail ${veille} à 19 h : sortir 2 wraps du congélateur pour la nuit au frigo.`)
  await capture(page, '07-semaine-bandeau-mail')

  // Et il le coupe : le bandeau revient à « Pense à sortir… ».
  await page.goto('/rappels')
  await page.getByRole('switch', { name: 'Sortir du congélateur' }).click()
  await expect.poll(async () => (await reglages(foyer.userId)).find(r => r.type === 'sortir_du_congelateur')?.actif).toBe(false)
  await page.goto(`/semaine?jour=${jour}`)
  await expect(page.locator('[data-carte]').filter({ hasText: 'Wraps' }).first())
    .toContainText('Pense à sortir les 2 wraps la veille au soir.')
})

test('« M’envoyer un exemple » appelle la fonction avec le type, et dit le résultat', async ({ page }) => {
  const appels: unknown[] = []
  let panne = false
  await page.route('**/functions/v1/rappels', async route => {
    const cors = {
      'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS',
    }
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    appels.push(req.postDataJSON())
    if (panne) return route.fulfill({ status: 502, headers: cors, contentType: 'text/plain', body: 'Le mail n’a pas pu partir. Réessaie dans un instant.' })
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"ok":true}' })
  })
  await connecte(page, foyer.email)
  await page.goto('/rappels')

  await page.getByRole('button', { name: 'M’envoyer un exemple : Clôturer le mois' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Un exemple vient de partir pour' })).toContainText(foyer.email.toLowerCase())
  expect(appels).toEqual([{ essai: 'cloturer_le_mois' }])
  await capture(page, '08-exemple-parti')

  panne = true
  await page.getByRole('button', { name: 'M’envoyer un exemple : Noter les dépenses' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Le mail n’a pas pu partir' })).toBeVisible()
  expect(appels).toEqual([{ essai: 'cloturer_le_mois' }, { essai: 'noter_les_depenses' }])
  // Un exemple n'écrit rien : ni réglage, ni « envoyé ».
  const envoyes = await db.from('rappel_envoye').select('*').in('user_id', [foyer.userId, foyer.elleId])
  expect(envoyes.data).toEqual([])
})

for (const largeur of [390, 320]) {
  test(`captures à ${largeur} px, cibles de 44 px, rien ne déborde`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 844 })
    await connecte(page, foyer.email)
    await page.goto('/rappels')
    await expect(page.getByRole('switch')).toHaveCount(7)
    await capture(page, `10-rappels-${largeur}`, true)
    const debord = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(debord, 'défilement horizontal').toBe(false)
    expect(await ciblesPetites(page), 'cibles de moins de 44 px').toEqual([])

    // La confirmation du frigo, à la même largeur.
    const wrap = await unePortion(foyer.householdId, { label: 'Wraps poulet', lieu: 'congelateur' })
    await page.goto(`/frigo?sortir=${wrap.id}`)
    await expect(page.getByRole('dialog', { name: 'Sortir 1 wrap du congélateur ?' })).toBeVisible()
    await capture(page, `11-frigo-confirmation-${largeur}`)
    expect(await ciblesDeLaFeuille(page), 'cibles de la feuille').toEqual([])
  })
}
