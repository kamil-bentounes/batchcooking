/**
 * « La semaine » remonte : on note hier, et ce qu'on a mangé en plus, comme un dessert — joué de bout en bout.
 *
 * Le foyer ressemble à celui de Kamil le 26/10 : des lasagnes au frigo, des burgers au congélateur, un yaourt à l'unité
 * et des céréales qu'on pèse dans nos aliments. Hier : un midi VIDE (on y note une barquette, qui sort du stock), un soir
 * posé mais « pas encore noté » (« Je l'ai mangé »), puis le dessert — à la main (refusé sans protéines), deux pots de
 * yaourt, 30 g de céréales, une étiquette photographiée (la fonction `etiquette` est rejouée : aucun modèle n'est appelé).
 * À CHAQUE geste on RELIT LA BASE : ce que l'écran affiche ne prouve rien de ce qui est écrit.
 *
 * Les captures (390 px et 320 px) des quatre écrans de la maquette sont posées dans `CAPTURES_HIER`.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'

const CAPTURES = process.env.CAPTURES_HIER ?? '.shots/semaine-hier'

test.use({ viewport: { width: 390, height: 844 } })
test.describe.configure({ mode: 'serial' })

let foyer: Foyer
const LASAGNES = 'Lasagnes au saumon-poireaux'
const BURGER = 'Burger de feuilles de riz'
const YAOURT = 'Yaourt nature'
const CEREALES = 'Céréales'

const jourLocal = (decalage: number) => {
  const d = new Date(); d.setDate(d.getDate() + decalage)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const semaineDe = (decalage: number) => {
  const d = new Date(); d.setDate(d.getDate() + decalage)
  const j = d.toLocaleDateString('fr-FR', { weekday: 'long' })
  return `${j[0].toUpperCase()}${j.slice(1)}`
}
const HIER = () => jourLocal(-1)

async function connecte(page: Page) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(foyer.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

async function capture(page: Page, nom: string, plein = false) {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${CAPTURES}/${nom}.png`, fullPage: plein })
}

/** Les deux largeurs de la maquette : 390 px, puis 320 px (sans défilement horizontal), puis on revient. */
async function captureAuxDeuxLargeurs(page: Page, nom: string, plein = false) {
  await capture(page, `${nom}-390`, plein)
  await page.setViewportSize({ width: 320, height: 700 })
  expect(await debordement(page), `défilement horizontal à 320 px : ${nom}`).toBeLessThanOrEqual(0)
  await capture(page, `${nom}-320`, plein)
  await page.setViewportSize({ width: 390, height: 844 })
}

const debordement = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

/** Les cibles de moins de 44 px, visibles et touchables : un pouce doit les trouver. */
const ciblesPetites = (page: Page, racine = 'body') => page.evaluate(sel =>
  [...(document.querySelector(sel) ?? document.body).querySelectorAll<HTMLElement>('button, a[href], [role=radio], input[type=checkbox], label:has(input[type=file])')]
    .filter(c => getComputedStyle(c).visibility !== 'hidden' && !c.closest('[inert]') && !c.classList.contains('sr-only'))
    /* Une case à cocher est visée par son cadre (le `<label>` qui la porte), pas par la case nue. */
    .map(c => ({ c, r: (c.matches('input') ? (c.closest('label') ?? c) : c).getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
    .map(({ c, r }) => `${(c.getAttribute('aria-label') || c.textContent || '?').trim().slice(0, 50)} ${Math.round(r.width)}×${Math.round(r.height)}`), racine)

/** Une photo JPEG dessinée dans le navigateur : un fichier de test sans fichier dans le dépôt. */
async function unePhoto(page: Page): Promise<Buffer> {
  const url = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480
    const x = c.getContext('2d')!
    x.fillStyle = '#F7F5EE'; x.fillRect(0, 0, 640, 480)
    x.fillStyle = '#1C2B23'; x.fillRect(80, 60, 300, 24)
    for (let i = 0; i < 8; i++) { x.fillStyle = '#9AA59E'; x.fillRect(80, 120 + i * 34, 200 + (i % 3) * 90, 10) }
    return c.toDataURL('image/jpeg', 0.8)
  })
  return Buffer.from(url.split(',')[1], 'base64')
}

/** Une lecture de la base, rejouée quand une connexion est coupée (un autre banc règle l'heure de la base : PostgREST se reconnecte). */
async function relis<T>(f: () => PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  let derniere = ''
  for (let i = 0; i < 6; i++) {
    const { data, error } = await f()
    if (!error && data !== null) return data
    derniere = error?.message ?? 'rien'
    await new Promise(r => setTimeout(r, 700))
  }
  throw new Error(`la base ne répond pas : ${derniere}`)
}

const portions = async (label?: string) => {
  return relis(() => {
    const q = db.from('portion').select('*').eq('household_id', foyer.householdId).order('created_at')
    return label ? q.eq('label', label) : q
  })
}
const slots = async () => relis(() => db.from('meal_slot').select('*').eq('household_id', foyer.householdId))
const caseDe = async (qui: string, jour: string, meal: string) =>
  (await slots()).find(s => s.user_profile_id === qui && s.day === jour && s.meal === meal)
const extras = async () =>
  relis(() => db.from('meal_extra').select('*, meal_slot:meal_slot_id(day, meal, user_profile_id, state)').eq('household_id', foyer.householdId)
    .order('created_at'))
const extrasDe = async (jour: string, meal: string, qui = foyer.userId) =>
  (await extras()).filter(e => e.meal_slot.day === jour && e.meal_slot.meal === meal && e.meal_slot.user_profile_id === qui)
const alimentDe = async (label: string) =>
  (await db.from('aliment').select('*').eq('household_id', foyer.householdId).eq('label', label).maybeSingle()).data

/** Le bilan d'un jour, relu de la base comme l'application le calcule : la barquette mangée, plus les extras. */
async function bilanDe(jour: string, qui = foyer.userId) {
  const { data } = await db.from('meal_slot').select('state, portion:portion_id(kcal, protein_g), extras:meal_extra(kcal, protein_g)')
    .eq('household_id', foyer.householdId).eq('day', jour).eq('user_profile_id', qui)
  let kcal = 0, prot = 0
  for (const c of (data ?? []) as unknown as { state: string; portion: { kcal: number; protein_g: number } | null; extras: { kcal: number; protein_g: number }[] }[]) {
    if (c.state === 'mange' && c.portion) { kcal += Number(c.portion.kcal); prot += Number(c.portion.protein_g) }
    for (const e of c.extras) { kcal += Number(e.kcal); prot += Number(e.protein_g) }
  }
  return { kcal: Math.round(kcal), prot: Math.round(prot * 10) / 10 }
}

test.beforeAll(async () => {
  foyer = await amorce({ cycleEtat: 'semaine', budget: false })
  const hh = foyer.householdId
  await db.from('meal_slot').delete().eq('household_id', hh)
  await db.from('portion').delete().eq('household_id', hh)
  await db.from('stock_item').delete().eq('household_id', hh)
  await db.from('aliment').delete().eq('household_id', hh)

  const il = (jours: number) => new Date(Date.now() - jours * 86_400_000).toISOString()
  const ligne = (label: string, o: Record<string, unknown>) => ({
    household_id: hh, label, grams: 500, kcal: 600, protein_g: 50, fiber_g: 5, carb_g: 60, fat_g: 20,
    location: 'frigo', frozen_at: null, ...o,
  })
  const { error: erreurPortions } = await db.from('portion').insert([
    ...Array.from({ length: 4 }, () => ligne(LASAGNES, { grams: 784, kcal: 682, protein_g: 56, prepared_at: il(1) })),
    ...Array.from({ length: 2 }, () => ligne(BURGER, {
      grams: 259, kcal: 501, protein_g: 36, location: 'congelateur', prepared_at: il(2), frozen_at: il(2),
    })),
  ])
  if (erreurPortions) throw new Error(erreurPortions.message)
  /* Nos aliments : un yaourt qu'on compte en pots, des céréales qu'on pèse (leur unité est le gramme). */
  const { data: aliments, error: erreurAliments } = await db.from('aliment').insert([
    { household_id: hh, label: YAOURT, kcal_100g: 76, protein_100g: 10, carb_100g: 5.6, fat_100g: 1.4, fiber_100g: 0, unite: 'pot', unite_g: 125 },
    { household_id: hh, label: CEREALES, kcal_100g: 380, protein_100g: 10, carb_100g: 70, fat_100g: 5, fiber_100g: 8, unite: 'g', unite_g: 100 },
  ]).select()
  if (erreurAliments) throw new Error(erreurAliments.message)
  const cereales = aliments!.find(a => a.label === CEREALES)!
  /* L'historique de Kamil : 60 g de céréales il y a deux jours, puis 30 g avant-hier — ses quantités récentes. */
  for (const [decalage, g] of [[-3, 60], [-2, 30]] as const) {
    const { data: s } = await db.from('meal_slot').insert({
      household_id: hh, user_profile_id: foyer.userId, day: jourLocal(decalage), meal: 'petit_dejeuner', state: 'mange', eaten_at: il(-decalage),
    }).select().single()
    await db.from('meal_extra').insert({
      household_id: hh, meal_slot_id: s!.id, label: `${CEREALES}, ${g} g`, aliment_id: cereales.id, grams: g, kcal: g * 3.8, protein_g: g * 0.1,
    })
  }
  /* Hier soir : le burger est posé pour vous deux, mais personne ne l'a noté. */
  const burgers = await portions(BURGER)
  for (const [i, qui] of [foyer.userId, foyer.elleId].entries()) {
    await db.from('meal_slot').insert({
      household_id: hh, user_profile_id: qui, day: HIER(), meal: 'diner', state: 'prevu', portion_id: burgers[i].id,
    })
  }
})
test.afterAll(async () => {
  if (!foyer) return
  await efface(foyer)
})

const feuille = (page: Page, nom: string) => page.getByRole('dialog', { name: nom })
const jourBouton = (page: Page, decalage: number) => page.locator(`[data-jour="${jourLocal(decalage)}"]`)
const repas = (page: Page, m: 'dejeuner' | 'diner') => page.locator(`[data-repas="${m}"]`)
const points = (page: Page, decalage: number) => jourBouton(page, decalage).locator('[data-point]')

test('le bandeau remonte de sept jours et s’ouvre sur aujourd’hui, hier visible à gauche', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await expect(page.getByRole('heading', { name: 'La semaine', level: 1 })).toBeVisible({ timeout: 20_000 })

  const bandeau = page.getByRole('group', { name: 'Choisir le jour' })
  await expect(bandeau.getByRole('button')).toHaveCount(14)
  await expect(jourBouton(page, 0)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('aujourd’hui', { exact: true })).toBeVisible()
  /* Sept jours passés, en pointillé ; « hier » remplace l'abréviation d'hier ; aujourd'hui s'écrit « auj. ». */
  for (let i = -7; i <= -1; i++) await expect(jourBouton(page, i)).toHaveAttribute('data-passe', '')
  for (let i = 0; i <= 6; i++) await expect(jourBouton(page, i)).not.toHaveAttribute('data-passe', '')
  await expect(jourBouton(page, -1)).toContainText('hier')
  await expect(jourBouton(page, 0)).toContainText('auj.')
  await expect(jourBouton(page, -2)).not.toContainText('hier')
  await expect(jourBouton(page, -8)).toHaveCount(0)
  /* Le nom accessible dit que c'est hier. */
  await expect(jourBouton(page, -1)).toHaveAttribute('aria-label', /, hier, midi : rien de choisi, soir : du congélateur$/)
  await expect(jourBouton(page, -2)).toHaveAttribute('aria-label', /, jour passé, midi : /)
  /* Les deux points restent : creux = rien de noté ; le burger posé hier soir est bleu. */
  await expect(points(page, -1)).toHaveCount(2)
  await expect(points(page, -1).first()).toHaveAttribute('data-point', 'vide')
  await expect(points(page, -1).last()).toHaveAttribute('data-point', 'congelateur')
  await expect(points(page, -4).first()).toHaveAttribute('data-point', 'vide')
  /* Aujourd'hui est choisi, et hier se voit à sa gauche, sans toucher au bandeau. */
  const dans = async (d: number) => {
    const b = (await jourBouton(page, d).boundingBox())!
    const w = page.viewportSize()!.width
    return b.x >= 0 && b.x + b.width <= w
  }
  expect(await dans(0), 'aujourd’hui est visible').toBe(true)
  expect(await dans(-1), 'hier est visible à gauche d’aujourd’hui').toBe(true)
  const hier = (await jourBouton(page, -1).boundingBox())!
  const auj = (await jourBouton(page, 0).boundingBox())!
  expect(hier.x).toBeLessThan(auj.x)
  await expect(page.locator('[data-plus-ancien]'), 'des jours plus anciens à gauche').toBeVisible()
  /* Le « ‹ » a sa gouttière : il ne recouvre aucune puce du bandeau (à 390 px comme à 320 px). */
  for (const largeur of [390, 320]) {
    await page.setViewportSize({ width: largeur, height: 800 })
    const chev = (await page.locator('[data-plus-ancien]').boundingBox())!
    const piste = (await page.locator('[data-bandeau="jours"]').boundingBox())!
    expect(chev.x + chev.width, `« ‹ » déborde sur le bandeau à ${largeur} px`).toBeLessThanOrEqual(piste.x + 0.5)
    /* Le bandeau coupe ses puces à son bord gauche (il défile dans son cadre) : ce qui est visible commence après le « ‹ ». */
    expect(await page.locator('[data-bandeau="jours"]').evaluate(el => getComputedStyle(el).overflowX)).toBe('auto')
  }
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await debordement(page)).toBeLessThanOrEqual(0)
  expect(hier.width).toBeGreaterThanOrEqual(43.5)
  /* Aujourd'hui garde ses cartes : rien de passé. */
  await expect(repas(page, 'dejeuner').getByRole('button', { name: '+ Choisir le midi' })).toBeVisible()
  await expect(page.locator('[data-jour-passe]')).toHaveCount(0)
})

test('hier : un jour passé se dessine, se dit, et son midi vide se note avec une barquette qui sort du stock', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await jourBouton(page, -1).click()
  await expect(jourBouton(page, -1)).toHaveAttribute('aria-pressed', 'true')
  const titre = page.getByRole('heading', { level: 2 }).first()
  await expect(titre).toContainText(semaineDe(-1))
  /* « hier » en ocre à côté du titre ; la phrase dessous. */
  await expect(page.locator('[data-hier]')).toHaveText('hier')
  await expect(page.getByText('Un jour passé : tu notes ce que tu as mangé. Les barquettes que tu coches sortent du frigo ou du congélateur.'))
    .toBeVisible()
  await expect(page.getByText('aujourd’hui', { exact: true })).toHaveCount(0)
  /* Un jour passé plus ancien : la date suffit, pas de « hier ». */
  await jourBouton(page, -3).click()
  await expect(page.locator('[data-hier]')).toHaveCount(0)
  await expect(page.locator('[data-jour-passe]')).toBeVisible()
  await jourBouton(page, -1).click()

  /* Le midi est vide ; le soir est posé, mais pas encore noté. */
  const midi = repas(page, 'dejeuner')
  const soir = repas(page, 'diner')
  await expect(midi.getByRole('button', { name: '+ Noter ce que j’ai mangé ce midi' })).toBeVisible()
  await expect(soir).toContainText(BURGER)
  await expect(soir).toContainText('Du congélateur, pour vous deux · pas encore noté')
  await expect(soir.getByRole('button', { name: 'Je l’ai mangé' })).toBeVisible()
  await expect(soir.getByRole('button', { name: 'Changer le soir' })).toBeVisible()
  /* Pas de « périme avant ce repas » ni de bandeau de congélateur sur un repas qui a eu lieu. */
  await expect(soir.locator('[data-bandeau="congele"]')).toHaveCount(0)
  await expect(soir.locator('[data-peremption]')).toHaveCount(0)
  expect(await ciblesPetites(page), 'cibles de moins de 44 px').toEqual([])
  await captureAuxDeuxLargeurs(page, 'e1-semaine-hier', true)

  /* « + Noter ce que j'ai mangé ce midi » ouvre la feuille de choix. */
  await midi.getByRole('button', { name: '+ Noter ce que j’ai mangé ce midi' }).click()
  const f = feuille(page, `${semaineDe(-1)} midi`)
  await expect(f).toBeVisible()
  await expect(f.getByText('Un jour passé : ce que tu choisis est noté mangé')).toBeVisible()
  /* « Pour » commence sur MOI : un appui note mangé et consomme la barquette, on n'agit pas au nom de l'autre. */
  await expect(f.getByRole('button', { name: 'Kamil' })).toHaveAttribute('aria-pressed', 'true')
  await expect(f.getByRole('button', { name: 'Vous deux' })).toHaveAttribute('aria-pressed', 'false')
  await expect(f.getByRole('button', { name: 'Thauba' })).toHaveAttribute('aria-pressed', 'false')
  const frigo = f.getByRole('region', { name: 'Au frigo' })
  await expect(frigo.getByRole('button', { name: /Lasagnes/ })).toContainText('sort du frigo')
  await expect(f.getByRole('region', { name: 'Au congélateur' })).toContainText('sort du congélateur')
  await expect(f.getByRole('region', { name: 'Autre chose' }).getByRole('button', { name: /On saute ce repas/ })).toBeVisible()
  await captureAuxDeuxLargeurs(page, 'e1b-feuille-hier-midi')
  const avant = (await portions(LASAGNES)).filter(p => p.state === 'au_frais').length
  expect(avant).toBe(4)
  await frigo.getByRole('button', { name: /Lasagnes/ }).click()
  await expect(f).toBeHidden({ timeout: 10_000 })

  /* La carte dit « mangé » pour moi ; Thauba n'a rien : sa carte reste vide, à noter par lui ou en son nom, nommé. */
  await expect(midi).toContainText('Du frigo, pour Kamil · mangé')
  await expect(midi.getByRole('button', { name: 'Je l’ai mangé' })).toHaveCount(0)
  await expect(midi.getByRole('button', { name: '+ Noter ce que Thauba a mangé ce midi' })).toBeVisible()
  await expect(points(page, -1).first()).toHaveAttribute('data-point', 'frigo')

  /* La base : SEULE ma case d'hier midi est mangée, avec une heure ; SEULE ma barquette est consommée. */
  const c = (await caseDe(foyer.userId, HIER(), 'dejeuner'))!
  expect(c.state).toBe('mange')
  expect(c.eaten_at).not.toBeNull()
  expect(new Date(c.eaten_at!).getTime()).toBeLessThanOrEqual(Date.now())
  expect(await caseDe(foyer.elleId, HIER(), 'dejeuner'), 'Thauba n’a pas de case : on n’a rien noté en son nom').toBeUndefined()
  const lasagnes = await portions(LASAGNES)
  expect(lasagnes.filter(p => p.state === 'mangee').map(p => p.id), 'une seule barquette sortie du stock : la mienne').toEqual([c.portion_id])
  expect(lasagnes.filter(p => p.state === 'au_frais'), 'trois restent au frigo').toHaveLength(3)
})

test('« Vous deux » sur un jour passé reste un choix explicite : les deux cases, les deux barquettes', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await jourBouton(page, -3).click()
  await repas(page, 'dejeuner').getByRole('button', { name: '+ Noter ce que j’ai mangé ce midi' }).click()
  const f = feuille(page, `${semaineDe(-3)} midi`)
  await expect(f.getByRole('button', { name: 'Kamil' })).toHaveAttribute('aria-pressed', 'true')
  await f.getByRole('button', { name: 'Vous deux' }).click()
  await expect(f.getByRole('button', { name: 'Vous deux' })).toHaveAttribute('aria-pressed', 'true')
  await f.getByRole('region', { name: 'Au frigo' }).getByRole('button', { name: /Lasagnes/ }).click()
  await expect(f).toBeHidden({ timeout: 10_000 })
  const jour = jourLocal(-3)
  for (const qui of [foyer.userId, foyer.elleId]) {
    const c = (await caseDe(qui, jour, 'dejeuner'))!
    expect(c.state).toBe('mange')
    expect((await db.from('portion').select('state').eq('id', c.portion_id!).single()).data!.state).toBe('mangee')
  }
  expect((await portions(LASAGNES)).filter(p => p.state === 'mangee'), '1 d’hier midi + 2 d’il y a trois jours').toHaveLength(3)
})

test('à deux, sur un jour passé : la carte vide de l’autre se note en son nom, nommé, sans toucher à ma case', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await jourBouton(page, -1).click()
  /* Hier midi : j'ai mangé, Thauba pas noté. Sa carte vide ouvre la feuille sur ELLE (je n'ai plus rien à noter). */
  await repas(page, 'dejeuner').getByRole('button', { name: '+ Noter ce que Thauba a mangé ce midi' }).click()
  const f = feuille(page, `${semaineDe(-1)} midi`)
  await expect(f.getByRole('button', { name: 'Thauba' })).toHaveAttribute('aria-pressed', 'true')
  await expect(f.getByRole('button', { name: 'Kamil' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(f).toBeHidden()
})

test('on peut toujours laisser un repas vide, passé ou à venir', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  /* Avant-hier : rien n'est noté, et rien n'est exigé. */
  await jourBouton(page, -2).click()
  await expect(repas(page, 'dejeuner').getByRole('button', { name: '+ Noter ce que j’ai mangé ce midi' })).toBeVisible()
  await expect(repas(page, 'diner').getByRole('button', { name: '+ Noter ce que j’ai mangé ce soir' })).toBeVisible()
  /* Le jour à venir aussi. */
  await jourBouton(page, 3).click()
  await expect(repas(page, 'dejeuner').getByRole('button', { name: '+ Choisir le midi' })).toBeVisible()
  /* Ouvrir la feuille d'un repas passé et la refermer n'écrit rien. */
  await jourBouton(page, -2).click()
  const avant = (await slots()).length
  await repas(page, 'diner').getByRole('button', { name: '+ Noter ce que j’ai mangé ce soir' }).click()
  const f = feuille(page, `${semaineDe(-2)} soir`)
  await expect(f).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(f).toBeHidden()
  /* Le focus revient au bouton qui l'a ouverte. */
  await expect(repas(page, 'diner').getByRole('button', { name: '+ Noter ce que j’ai mangé ce soir' })).toBeFocused()
  expect((await slots()).length, 'rien n’a été écrit').toBe(avant)
  /* « On saute ce repas » est une réponse : il reste « sauté », pas « mangé ». */
  await repas(page, 'diner').getByRole('button', { name: '+ Noter ce que j’ai mangé ce soir' }).click()
  await f.getByRole('region', { name: 'Autre chose' }).getByRole('button', { name: /On saute ce repas/ }).click()
  await expect(f).toBeHidden({ timeout: 10_000 })
  await expect(repas(page, 'diner')).toContainText('On saute ce repas')
  expect((await caseDe(foyer.userId, jourLocal(-2), 'diner'))!.state).toBe('saute')
})

test('hier soir : « pas encore noté », « Je l’ai mangé » ; le burger sort du congélateur', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await jourBouton(page, -1).click()
  const soir = repas(page, 'diner')
  await expect(soir).toContainText('pas encore noté')
  await soir.getByRole('button', { name: 'Je l’ai mangé' }).click()
  /* Kamil l'a mangé ; Thauba, pas encore noté. */
  await expect(soir).toContainText('Kamil l’a mangé, pas encore noté pour Thauba', { timeout: 10_000 })
  const c = (await caseDe(foyer.userId, HIER(), 'diner'))!
  expect(c.state).toBe('mange')
  expect((await db.from('portion').select('state').eq('id', c.portion_id!).single()).data!.state).toBe('mangee')
  const elle = (await caseDe(foyer.elleId, HIER(), 'diner'))!
  expect(elle.state, 'la case de Thauba n’a pas bougé').toBe('prevu')
  /* Thauba l'a mangé aussi : la carte se ferme sur « mangé ». On le note à sa place par la base, puis on relit l'écran. */
  await db.from('meal_slot').update({ state: 'mange', eaten_at: new Date().toISOString() }).eq('id', elle.id)
  await page.reload()
  await jourBouton(page, -1).click()
  await expect(repas(page, 'diner')).toContainText('Du congélateur, pour vous deux · mangé')
  await expect(points(page, -1).last()).toHaveAttribute('data-point', 'congelateur')
})

test('le dessert à la main : « Quoi », « Calories », « Protéines, en g » — refusé sans protéines, puis accepté', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await jourBouton(page, -1).click()
  const soir = repas(page, 'diner')
  await soir.getByRole('button', { name: '+ ce que j’ai mangé en plus' }).click()
  const panneau = soir.getByRole('group', { name: 'En plus du soir' })
  await expect(panneau.getByRole('heading', { name: 'En plus du soir' })).toBeVisible()
  await expect(panneau.getByText('Autre chose, à la main : les calories et les protéines sont obligatoires')).toBeVisible()
  /* Des libellés visibles, pas seulement des placeholders. */
  const quoi = panneau.getByLabel('Quoi', { exact: true })
  const cal = panneau.getByLabel('Calories', { exact: true })
  const prot = panneau.getByLabel('Protéines, en g', { exact: true })
  await expect(quoi).toBeVisible()
  const ajouter = panneau.getByRole('button', { name: 'Ajouter au soir' })

  /* Rien : chaque manque a sa phrase, sous sa case, et rien n'est écrit (aujourd'hui une case vide passait pour 0 kcal). */
  await ajouter.click()
  await expect(panneau.getByText('Dis ce que c’est.')).toBeVisible()
  await expect(panneau.getByText('Il manque les calories.')).toBeVisible()
  await expect(panneau.getByText('Il manque les protéines.')).toBeVisible()
  await expect(quoi).toBeFocused()
  expect(await extrasDe(HIER(), 'diner')).toHaveLength(0)

  /* Sans protéines : seul ce manque est dit. */
  await quoi.fill('Tiramisu')
  await cal.fill('320')
  await expect(panneau.getByText('Dis ce que c’est.')).toHaveCount(0)
  await expect(panneau.getByText('Il manque les calories.')).toHaveCount(0)
  await ajouter.click()
  await expect(panneau.getByText('Il manque les protéines.')).toBeVisible()
  await expect(panneau.getByText('Il manque les calories.')).toHaveCount(0)
  await expect(prot).toBeFocused()
  await expect(prot).toHaveAttribute('aria-invalid', 'true')
  expect(await extrasDe(HIER(), 'diner')).toHaveLength(0)
  expect(await ciblesPetites(page, '[data-repas="diner"]'), 'cibles de moins de 44 px').toEqual([])
  await panneau.scrollIntoViewIfNeeded()
  await captureAuxDeuxLargeurs(page, 'e2-dessert-a-la-main', true)

  /* Illisible, négatif : refusés, chacun avec sa phrase. */
  await prot.fill('beaucoup')
  await ajouter.click()
  await expect(panneau.getByText('Je ne lis pas ce nombre.')).toBeVisible()
  await prot.fill('-3')
  await ajouter.click()
  await expect(panneau.getByText('Pas de valeur négative.')).toBeVisible()
  expect(await extrasDe(HIER(), 'diner')).toHaveLength(0)

  /* Avec les deux : accepté. */
  await prot.fill('5')
  await ajouter.click()
  await expect(panneau.getByLabel('Quoi', { exact: true })).toHaveValue('', { timeout: 10_000 })
  const [e] = await extrasDe(HIER(), 'diner')
  expect(e).toMatchObject({ label: 'Tiramisu', planifie: false, aliment_id: null })
  expect([e.kcal, e.protein_g].map(Number)).toEqual([320, 5])
  await expect(soir).toContainText('Tiramisu · 320 kcal · 5 g de protéines')
})

test('la quantité de nos aliments : deux pots de yaourt, puis 30 g de céréales ; le bilan du jour suit', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await jourBouton(page, -1).click()
  const soir = repas(page, 'diner')
  const avant = await bilanDe(HIER())
  await soir.getByRole('button', { name: '+ ce que j’ai mangé en plus' }).click()
  const panneau = soir.getByRole('group', { name: 'En plus du soir' })

  /* Les pastilles disent l'unité (« pot », « 100 g »), plus les calories d'une seule : la quantité n'est pas encore dite. */
  const pYaourt = panneau.getByRole('button', { name: new RegExp(`^${YAOURT}\\s*pot$`) })
  const pCereales = panneau.getByRole('button', { name: new RegExp(`^${CEREALES}\\s*100 g$`) })
  await expect(pYaourt).toBeVisible()
  await expect(pCereales).toBeVisible()

  /* Un appui n'ajoute RIEN : il demande combien. */
  await pYaourt.click()
  expect(await extrasDe(HIER(), 'diner')).toHaveLength(1)
  const combienY = panneau.getByRole('group', { name: `${YAOURT} : combien ?` })
  await expect(combienY.getByRole('heading', { name: `${YAOURT} : combien ?` })).toBeVisible()
  await expect(combienY).toContainText('1 pot')
  await expect(combienY).toContainText('125 g')
  await expect(combienY).toContainText('95 kcal · 12,5 g de protéines')
  await expect(pYaourt).toHaveAttribute('aria-pressed', 'true')
  /* « − » ne descend pas sous un pot. */
  await expect(combienY.getByRole('button', { name: 'Un pot de moins' })).toBeDisabled()
  await combienY.getByRole('button', { name: 'Un pot de plus' }).click()
  await expect(combienY).toContainText('2 pots')
  await expect(combienY).toContainText('250 g')
  await expect(combienY).toContainText('190 kcal · 25 g de protéines')
  expect(await ciblesPetites(page, '[data-repas="diner"]'), 'cibles de moins de 44 px').toEqual([])
  await combienY.scrollIntoViewIfNeeded()
  await captureAuxDeuxLargeurs(page, 'e4-quantite-yaourt', true)
  /* « ou en grammes » : on pèse, 250 g (deux pots), c'est autre chose que « Autre ». */
  await combienY.getByRole('button', { name: 'ou en grammes' }).click()
  await expect(combienY.getByLabel('Combien, en grammes')).toHaveValue('250')
  await expect(combienY).toContainText('190 kcal · 25 g de protéines')
  await combienY.getByRole('button', { name: 'ou en pots' }).click()
  await expect(combienY).toContainText('1 pot')
  await combienY.getByRole('button', { name: 'Un pot de plus' }).click()
  await expect(combienY).toContainText('2 pots')

  await combienY.getByRole('button', { name: 'Ajouter au soir' }).click()
  await expect(combienY).toHaveCount(0, { timeout: 10_000 })
  /* Le panneau qui portait le focus a disparu : il revient à la pastille de l'aliment, pas au vide. */
  await expect(pYaourt).toBeFocused()
  await expect(soir).toContainText('Yaourt nature × 2 pots · 190 kcal · 25 g de protéines')
  const ex = (await extrasDe(HIER(), 'diner')).find(e => e.label === `${YAOURT} × 2 pots`)!
  const al = (await alimentDe(YAOURT))!
  expect(ex).toMatchObject({ aliment_id: al.id, planifie: false })
  expect([ex.grams, ex.kcal, ex.protein_g, ex.carb_g, ex.fat_g].map(Number)).toEqual([250, 190, 25, 14, 3.5])

  /* Les céréales : au gramme, avec les quantités récentes de Kamil (30 g, 60 g) et « Autre ». */
  await pCereales.click()
  const combienC = panneau.getByRole('group', { name: `${CEREALES} : combien ?` })
  const recentes = combienC.getByRole('group', { name: 'Quantités récentes' })
  await expect(recentes.getByRole('button')).toHaveText(['30 g', '60 g', 'Autre'])
  /* La dernière quantité est déjà choisie : deux gestes, l'aliment puis « Ajouter ». */
  await expect(recentes.getByRole('button', { name: '30 g' })).toHaveAttribute('aria-pressed', 'true')
  await expect(combienC).toContainText('114 kcal · 3 g de protéines')
  await combienC.scrollIntoViewIfNeeded()
  await captureAuxDeuxLargeurs(page, 'e4-quantite-cereales', true)
  /* 60 g, puis « Autre » : taper, avec ses refus. */
  await recentes.getByRole('button', { name: '60 g' }).click()
  await expect(combienC).toContainText('228 kcal · 6 g de protéines')
  await recentes.getByRole('button', { name: 'Autre' }).click()
  const autre = combienC.getByLabel('Autre quantité, en grammes')
  await expect(autre).toBeFocused()
  await combienC.getByRole('button', { name: 'Ajouter au soir' }).click()
  await expect(combienC.getByText('Dis combien, en grammes.')).toBeVisible()
  await autre.fill('-5')
  await combienC.getByRole('button', { name: 'Ajouter au soir' }).click()
  await expect(combienC.getByText('Pas de valeur négative.')).toBeVisible()
  await autre.fill('0,04')
  await combienC.getByRole('button', { name: 'Ajouter au soir' }).click()
  await expect(combienC.getByText('Il faut au moins 0,1 g.')).toBeVisible()
  await expect(autre).toHaveAttribute('aria-invalid', 'true')
  await autre.fill('trente')
  await combienC.getByRole('button', { name: 'Ajouter au soir' }).click()
  await expect(combienC.getByText('Je ne lis pas ce nombre.')).toBeVisible()
  expect((await extrasDe(HIER(), 'diner')).some(e => e.label.startsWith(CEREALES))).toBe(false)
  await recentes.getByRole('button', { name: '30 g' }).click()
  await expect(combienC).toContainText('114 kcal · 3 g de protéines')
  await combienC.getByRole('button', { name: 'Ajouter au soir' }).dblclick()
  await expect(combienC).toHaveCount(0, { timeout: 10_000 })
  await page.waitForTimeout(1200)
  const cer = (await extrasDe(HIER(), 'diner')).filter(e => e.label.startsWith(CEREALES))
  expect(cer, 'un double toucher, une seule ligne').toHaveLength(1)
  expect(cer[0]).toMatchObject({ label: `${CEREALES}, 30 g`, planifie: false })
  expect([cer[0].grams, cer[0].kcal, cer[0].protein_g, cer[0].carb_g, cer[0].fiber_g].map(Number)).toEqual([30, 114, 3, 21, 2.4])
  await expect(soir).toContainText('Céréales, 30 g · 114 kcal · 3 g de protéines')

  /* Le bilan d'hier : le tiramisu (320 / 5), deux yaourts (190 / 25), 30 g de céréales (114 / 3). */
  const apres = await bilanDe(HIER())
  expect(apres.kcal - avant.kcal).toBe(190 + 114)
  expect(apres.prot - avant.prot).toBeCloseTo(25 + 3, 5)

  /* Les valeurs écrites sont une COPIE : corriger l'aliment demain ne réécrit pas le bilan d'hier. */
  await db.from('aliment').update({ kcal_100g: 999, protein_100g: 50 }).eq('id', al.id)
  expect(await bilanDe(HIER())).toEqual(apres)
  await db.from('aliment').update({ kcal_100g: 76, protein_100g: 10 }).eq('id', al.id)

  /* La prochaine fois, les céréales retrouvent leurs quantités : 30 g d'abord, puis 60 g. */
  await soir.getByRole('button', { name: `Retirer ${CEREALES}, 30 g` }).click()
  await expect(soir).not.toContainText('Céréales, 30 g · 114 kcal')
  await pCereales.click()
  await expect(panneau.getByRole('group', { name: 'Quantités récentes' }).getByRole('button')).toHaveText(['30 g', '60 g', 'Autre'])
})

test('un yaourt déjà pris deux par deux : le panneau recommence à deux pots', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  /* Le geste d'hier se refait en un appui : la dernière fois, c'étaient deux pots. */
  await jourBouton(page, -1).click()
  const soir = repas(page, 'diner')
  await soir.getByRole('button', { name: '+ ce que j’ai mangé en plus' }).click()
  const panneau = soir.getByRole('group', { name: 'En plus du soir' })
  await panneau.getByRole('button', { name: new RegExp(`^${YAOURT}\\s*pot$`) }).click()
  const combien = panneau.getByRole('group', { name: `${YAOURT} : combien ?` })
  await expect(combien).toContainText('2 pots')
  await expect(combien).toContainText('250 g')
})

test('depuis la feuille d’un repas : le même panneau « combien ? », et le repas passé est noté mangé avec l’aliment', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await jourBouton(page, -2).click()
  await repas(page, 'dejeuner').getByRole('button', { name: '+ Noter ce que j’ai mangé ce midi' }).click()
  const f = feuille(page, `${semaineDe(-2)} midi`)
  const autre = f.getByRole('region', { name: 'Autre chose' })
  await autre.getByRole('button', { name: new RegExp(`^${YAOURT}`) }).click()
  const combien = f.getByRole('group', { name: `${YAOURT} : combien ?` })
  await expect(combien).toBeVisible()
  /* Le pot d'hier : « 2 pots » de la dernière fois ne vaut que pour Kamil (l'extra de la base d'hier) ; ici, tout est vu. */
  await combien.getByRole('button', { name: 'Un pot de plus' }).click()
  const n = (await combien.innerText()).match(/(\d+) pots?/)![1]
  await combien.getByRole('button', { name: 'Noter pour le midi' }).click()
  await expect(f).toBeHidden({ timeout: 10_000 })
  const jour = jourLocal(-2)
  /* Pour moi seul (la feuille d'un jour passé commence sur moi) : Thauba n'a rien. */
  const c = (await caseDe(foyer.userId, jour, 'dejeuner'))!
  expect(c.state, 'un repas passé : ce qu’on y choisit est mangé').toBe('mange')
  const [e] = await extrasDe(jour, 'dejeuner', foyer.userId)
  expect(e.label).toBe(`${YAOURT} × ${n} pots`)
  expect(e.aliment_id).toBe((await alimentDe(YAOURT))!.id)
  expect(e.planifie).toBe(false)
  expect(await caseDe(foyer.elleId, jour, 'dejeuner'), 'rien n’est noté au nom de Thauba').toBeUndefined()
  await expect(repas(page, 'dejeuner')).toContainText(`${YAOURT} × ${n} pots`)
})

/* ── L'étiquette photographiée ──────────────────────────────────────────────────────────────────────────────── */

const SKYR = {
  nom: 'Skyr vanille', marque: null, poids_g: 150, unite: 'pot', parts: null, kcal_100g: 64, proteines_100g: 9.5, glucides_100g: 6.1,
  lipides_100g: 0.2, fibres_100g: null, kcal_portion: null, dlc: null, lisible: true, confiance: 0.9, commentaire: null, restantes: 39,
}

/** Rejoue la fonction `etiquette` : aucun modèle n'est appelé. Rend les corps reçus. */
async function etiquetteRepond(page: Page, reponses: (corps: { images?: string[]; consigne?: string }) => { status: number; body: object }) {
  const recus: { images?: string[]; consigne?: string }[] = []
  await page.route('**/functions/v1/etiquette', async route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    }
    const corps = route.request().postDataJSON()
    recus.push(corps)
    const r = reponses(corps)
    return route.fulfill({ status: r.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r.body) })
  })
  return recus
}

test('l’étiquette : la photo, la consigne, les valeurs lues, ce qu’on en a mangé, et l’aliment gardé', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  /* Sans consigne, la lecture rend le nom et le poids du pot ; avec « Skyr vanille, pot de 150 g », le même. */
  const recus = await etiquetteRepond(page, () => ({ status: 200, body: SKYR }))
  await jourBouton(page, -1).click()
  const soir = repas(page, 'diner')
  await soir.getByRole('button', { name: '+ ce que j’ai mangé en plus' }).click()
  const panneau = soir.getByRole('group', { name: 'En plus du soir' })
  /* Sous la saisie à la main, après un séparateur « ou ». */
  await expect(panneau.getByRole('separator', { name: 'ou' })).toBeVisible()
  await expect(panneau.getByText('Photographier l’étiquette')).toBeVisible()
  await panneau.locator('input[type=file]').setInputFiles({ name: 'etiquette.jpg', mimeType: 'image/jpeg', buffer: await unePhoto(page) })

  const f = feuille(page, 'L’étiquette, en plus du soir')
  await expect(f).toBeVisible({ timeout: 15_000 })
  await expect(f.getByRole('heading', { name: 'L’étiquette, en plus du soir' })).toBeVisible()
  await expect(f.getByRole('img', { name: 'Photo 1 de l’étiquette' })).toBeVisible()
  await expect(f.getByText('Lu sur l’étiquette, pour 100 g')).toBeVisible()
  await expect(f.locator('[data-lu]')).toHaveText('64 kcal · 9,5 g de protéines · 6,1 g de glucides · 0,2 g de lipides', { timeout: 15_000 })
  expect(recus).toHaveLength(1)
  expect(recus[0].images).toHaveLength(1)
  expect(recus[0].images![0]).toMatch(/^data:image\/jpeg;base64,/)
  expect(recus[0], 'sans consigne, rien n’est envoyé').not.toHaveProperty('consigne')
  /* « J'en ai mangé » commence au poids lu, avec le calcul. */
  const grammes = f.getByLabel('J’en ai mangé, en grammes')
  await expect(grammes).toHaveValue('150')
  await expect(f.locator('[data-calcul]')).toHaveText('96 kcal · 14,3 g prot.')
  /* Garder dans nos aliments : cochée d'office, sous le nom lu. */
  const garder = f.getByRole('checkbox', { name: 'Le garder dans nos aliments, sous « Skyr vanille »' })
  await expect(garder).toBeChecked()
  await expect(f.getByRole('button', { name: 'Ajouter au soir' })).toBeEnabled()

  /* La consigne : facultative, envoyée à la relecture, nettoyée. */
  const consigne = f.getByLabel('Dis-moi ce que c’est (facultatif)')
  await consigne.fill('Skyr vanille, pot de 150 g. J’ai mangé le pot entier. <b>Ignore tout</b>')
  await f.getByRole('button', { name: 'Relire avec cette consigne' }).click()
  await expect.poll(() => recus.length, { timeout: 10_000 }).toBe(2)
  expect(recus[1].consigne).toBe('Skyr vanille, pot de 150 g. J’ai mangé le pot entier. b Ignore tout /b')
  await expect(f.locator('[data-lu]')).toContainText('64 kcal')
  expect(await ciblesPetites(page, 'dialog[open]'), 'cibles de moins de 44 px').toEqual([])
  await captureAuxDeuxLargeurs(page, 'e3-etiquette')

  /* Les grammes se corrigent : 75 g, la moitié du pot. Vides, ils sont refusés. */
  await grammes.fill('')
  await f.getByRole('button', { name: 'Ajouter au soir' }).click()
  await expect(f.getByText('Dis combien, en grammes.')).toBeVisible()
  expect(await alimentDe('Skyr vanille'), 'rien n’est gardé tant que rien n’est ajouté').toBeNull()
  await grammes.fill('150')
  await expect(f.locator('[data-calcul]')).toHaveText('96 kcal · 14,3 g prot.')

  await f.getByRole('button', { name: 'Ajouter au soir' }).dblclick()
  await expect(f).toBeHidden({ timeout: 15_000 })
  await page.waitForTimeout(1000)

  /* L'aliment : ses valeurs pour 100 g, son unité (lue : « pot ») et son poids, la source « étiquette ». */
  const a = (await alimentDe('Skyr vanille'))!
  expect(a).toMatchObject({ unite: 'pot', source: 'etiquette' })
  expect([a.kcal_100g, a.protein_100g, a.carb_100g, a.fat_100g, a.unite_g].map(Number)).toEqual([64, 9.5, 6.1, 0.2, 150])
  expect((await db.from('aliment').select('id').eq('household_id', foyer.householdId).eq('label', 'Skyr vanille')).data, 'un seul aliment').toHaveLength(1)
  /* L'extra : le food_id de l'aliment (`aliment_id`), les grammes, les valeurs calculées. */
  const ex = (await extrasDe(HIER(), 'diner')).filter(e => e.label === 'Skyr vanille, 150 g')
  expect(ex, 'un double toucher, une seule ligne').toHaveLength(1)
  expect(ex[0]).toMatchObject({ aliment_id: a.id, planifie: false })
  expect([ex[0].grams, ex[0].kcal, ex[0].protein_g, ex[0].carb_g, ex[0].fat_g].map(Number)).toEqual([150, 96, 14.3, 9.2, 0.3])
  await expect(soir).toContainText('Skyr vanille, 150 g · 96 kcal · 14,3 g de protéines')
  /* Il est dans nos aliments : la pastille « Skyr vanille pot » est là. */
  await expect(panneau.getByRole('button', { name: /^Skyr vanille\s*pot$/ })).toBeVisible()
})

test('l’étiquette sans le garder, sans poids lu : on tape les grammes, rien n’entre dans nos aliments', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await etiquetteRepond(page, () => ({ status: 200, body: { ...SKYR, nom: 'Fromage blanc 0 %', poids_g: null, unite: null, kcal_100g: 46, proteines_100g: 8, glucides_100g: 4, lipides_100g: 0.1 } }))
  await jourBouton(page, -1).click()
  const soir = repas(page, 'diner')
  await soir.getByRole('button', { name: '+ ce que j’ai mangé en plus' }).click()
  await soir.getByRole('group', { name: 'En plus du soir' }).locator('input[type=file]')
    .setInputFiles({ name: 'etiquette.jpg', mimeType: 'image/jpeg', buffer: await unePhoto(page) })
  const f = feuille(page, 'L’étiquette, en plus du soir')
  await expect(f.locator('[data-lu]')).toContainText('46 kcal', { timeout: 15_000 })
  const grammes = f.getByLabel('J’en ai mangé, en grammes')
  await expect(grammes).toHaveValue('')
  await f.getByRole('checkbox', { name: /Le garder dans nos aliments/ }).uncheck()
  await grammes.fill('200')
  await expect(f.locator('[data-calcul]')).toHaveText('92 kcal · 16 g prot.')
  await f.getByRole('button', { name: 'Ajouter au soir' }).click()
  await expect(f).toBeHidden({ timeout: 15_000 })
  const ex = (await extrasDe(HIER(), 'diner')).filter(e => e.label === 'Fromage blanc 0 %, 200 g')
  expect(ex).toHaveLength(1)
  expect(ex[0].aliment_id, 'pas gardé : aucun lien').toBeNull()
  expect([ex[0].grams, ex[0].kcal, ex[0].protein_g].map(Number)).toEqual([200, 92, 16])
  expect(await alimentDe('Fromage blanc 0 %')).toBeNull()
})

test('l’étiquette en panne : le message de la fonction, « Réessayer », et on peut corriger à la main', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  let panne = true
  await etiquetteRepond(page, () => (panne
    ? { status: 429, body: { erreur: 'Quota atteint : 40 étiquettes par mois. Il repart le 1er.', restantes: 0 } }
    : { status: 200, body: SKYR }))
  await jourBouton(page, -1).click()
  const soir = repas(page, 'diner')
  await soir.getByRole('button', { name: '+ ce que j’ai mangé en plus' }).click()
  await soir.getByRole('group', { name: 'En plus du soir' }).locator('input[type=file]')
    .setInputFiles({ name: 'etiquette.jpg', mimeType: 'image/jpeg', buffer: await unePhoto(page) })
  const f = feuille(page, 'L’étiquette, en plus du soir')
  await expect(f.getByRole('alert').first()).toContainText('Quota atteint : 40 étiquettes par mois', { timeout: 15_000 })
  await expect(f.getByRole('button', { name: 'Reprendre la photo' })).toBeVisible()
  /* Rien de lu : les cases s'ouvrent, calories et protéines sont exigées. */
  await f.getByLabel('J’en ai mangé, en grammes').fill('100')
  await f.getByRole('button', { name: 'Ajouter au soir' }).click()
  await expect(f.getByText('Donne-lui un nom.')).toBeVisible()
  await expect(f.getByText('Il manque les calories.')).toBeVisible()
  await expect(f.getByText('Il manque les protéines.')).toBeVisible()
  /* Réessayer : la lecture passe. */
  panne = false
  await f.getByRole('button', { name: 'Réessayer' }).click()
  await expect(f.locator('[data-lu]')).toContainText('64 kcal', { timeout: 15_000 })
  await expect(f.getByLabel('J’en ai mangé, en grammes')).toHaveValue('100')
  /* Échap : rien n'est écrit. */
  const avant = (await extras()).length
  await page.keyboard.press('Escape')
  await expect(f).toBeHidden()
  expect((await extras()).length).toBe(avant)
})

test('le focus ne tombe pas sur le vide : après un ajout dans un moment hors barquette, il revient à sa carte ; « annuler » à son bouton', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await jourBouton(page, -1).click()
  const autres = page.getByRole('region', { name: 'Autres moments' })
  /* « annuler » : le focus revient au bouton « Collation » qui avait ouvert le panneau. */
  await autres.getByRole('button', { name: 'Collation', exact: true }).click()
  await autres.getByRole('button', { name: 'annuler' }).click()
  await expect(autres.getByRole('button', { name: 'Collation', exact: true })).toBeFocused()
  /* Un ajout : le panneau se ferme, la carte de la collation paraît, et « + ce que j'ai mangé en plus » a le focus. */
  await autres.getByRole('button', { name: 'Collation', exact: true }).click()
  await autres.getByLabel('Quoi', { exact: true }).fill('Compote')
  await autres.getByLabel('Calories', { exact: true }).fill('80')
  await autres.getByLabel('Protéines, en g', { exact: true }).fill('1')
  await autres.getByRole('button', { name: 'Ajouter à la collation' }).click()
  await expect(page.locator('[data-moment="collation"] [data-en-plus]')).toBeFocused({ timeout: 10_000 })
  expect((await extrasDe(HIER(), 'collation')).map(e => e.label)).toEqual(['Compote'])
})

test('un nom déjà pris dans nos aliments : « Le garder » réutilise cet aliment, l’extra s’écrit', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  /* L'étiquette lit « CÉRÉALES » (autre casse) : le nom, comparé comme la base, existe déjà dans nos aliments. */
  await etiquetteRepond(page, () => ({ status: 200, body: { ...SKYR, nom: 'CEREALES', poids_g: null, unite: null, kcal_100g: 380, proteines_100g: 10, glucides_100g: 70, lipides_100g: 5, fibres_100g: 8 } }))
  const avant = (await db.from('aliment').select('id').eq('household_id', foyer.householdId)).data!.length
  const cereales = (await alimentDe(CEREALES))!
  /* Le midi d'il y a trois jours porte les lasagnes (« Vous deux », plus haut) : « en plus » s'y offre. */
  await jourBouton(page, -3).click()
  const carte = repas(page, 'dejeuner').getByRole('group', { name: /^Midi : / })
  await carte.getByRole('button', { name: '+ ce que j’ai mangé en plus' }).click()
  await carte.getByRole('group', { name: 'En plus du midi' }).locator('input[type=file]')
    .setInputFiles({ name: 'etiquette.jpg', mimeType: 'image/jpeg', buffer: await unePhoto(page) })
  const f = feuille(page, 'L’étiquette, en plus du midi')
  await expect(f.locator('[data-lu]')).toContainText('380 kcal', { timeout: 15_000 })
  await f.getByLabel('J’en ai mangé, en grammes').fill('40')
  await expect(f.getByRole('checkbox', { name: /Le garder dans nos aliments/ })).toBeChecked()
  await expect(f.locator('[data-deja]')).toContainText('est déjà dans nos aliments : c’est lui qui est utilisé')
  await f.getByRole('button', { name: 'Ajouter au midi' }).click()
  await expect(f).toBeHidden({ timeout: 15_000 })
  const ex = (await extrasDe(jourLocal(-3), 'dejeuner')).filter(e => e.label === 'CEREALES, 40 g')
  expect(ex, 'l’extra est écrit').toHaveLength(1)
  expect(ex[0].aliment_id, 'lié à l’aliment qui existait').toBe(cereales.id)
  expect((await db.from('aliment').select('id').eq('household_id', foyer.householdId)).data, 'aucun aliment de plus').toHaveLength(avant)
})

test('« Relire avec cette consigne » garde ce qu’on a corrigé à la main (le nom, un chiffre, les grammes)', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  const recus = await etiquetteRepond(page, () => ({ status: 200, body: SKYR }))
  await jourBouton(page, -1).click()
  const soir = repas(page, 'diner')
  await soir.getByRole('button', { name: '+ ce que j’ai mangé en plus' }).click()
  await soir.getByRole('group', { name: 'En plus du soir' }).locator('input[type=file]')
    .setInputFiles({ name: 'etiquette.jpg', mimeType: 'image/jpeg', buffer: await unePhoto(page) })
  const f = feuille(page, 'L’étiquette, en plus du soir')
  await expect(f.locator('[data-lu]')).toContainText('64 kcal', { timeout: 15_000 })
  await f.getByRole('button', { name: 'Corriger' }).click()
  await f.getByLabel('Son nom').fill('Skyr maison')
  await f.getByLabel('Calories').fill('70')
  await f.getByLabel('J’en ai mangé, en grammes').fill('100')
  await f.getByLabel('Dis-moi ce que c’est (facultatif)').fill('Skyr vanille, pot de 150 g')
  await f.getByRole('button', { name: 'Relire avec cette consigne' }).click()
  await expect.poll(() => recus.length, { timeout: 10_000 }).toBe(2)
  await expect(f.getByText('Je n’ai pas modifié ce que tu avais corrigé : le nom, les calories, les grammes.')).toBeVisible()
  await expect(f.getByLabel('Son nom')).toHaveValue('Skyr maison')
  await expect(f.getByLabel('Calories')).toHaveValue('70')
  await expect(f.getByLabel('J’en ai mangé, en grammes')).toHaveValue('100')
  /* Ce qui n'a pas été corrigé vient de la nouvelle lecture. */
  await expect(f.getByLabel('Protéines')).toHaveValue('9,5')
  await page.keyboard.press('Escape')
  await expect(f).toBeHidden()
})

test('minuit pendant qu’on note : la feuille reste ouverte, et le repas écrit est celui qu’on notait', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await expect(jourBouton(page, 0)).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 })
  await repas(page, 'dejeuner').getByRole('button', { name: '+ Choisir le midi' }).click()
  const f = feuille(page, `${semaineDe(0)} midi`)
  await expect(f).toBeVisible()
  /* La relecture de la semaine (sa fenêtre glisse d'un jour : une nouvelle clé) est lente : pendant ce temps, l'écran ne doit
     pas repasser en attente. */
  await page.route('**/rest/v1/meal_slot?*', async route => { await new Promise(r => setTimeout(r, 2500)); await route.continue() })
  /* Minuit passe : l'horloge du banc avance d'un jour, la page se rallume. */
  await page.evaluate(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 5, 0, 0)
    localStorage.setItem('popote.maintenant', d.toISOString())
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(600)
  await expect(f, 'la feuille a disparu pendant la relecture').toBeVisible({ timeout: 300 })
  await expect(jourBouton(page, 1)).toContainText('auj.', { timeout: 10_000 })
  /* La feuille ne s'est pas refermée, ne s'est pas décalée sur demain, et l'écran n'est pas repassé en attente. */
  await expect(f).toBeVisible()
  await expect(page.getByRole('heading', { name: 'La semaine', level: 1 })).toBeVisible()
  await f.getByRole('region', { name: 'Autre chose' }).getByRole('button', { name: /On saute ce repas/ }).click()
  await expect(f).toBeHidden({ timeout: 10_000 })
  const jour = jourLocal(0)
  expect((await caseDe(foyer.userId, jour, 'dejeuner'))!.state, 'le repas noté est celui d’avant minuit').toBe('saute')
  expect(await caseDe(foyer.userId, jourLocal(1), 'dejeuner'), 'rien n’est écrit sur demain').toBeUndefined()
})
