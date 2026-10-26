/**
 * La semaine qu'on choisit, jouée de bout en bout.
 *
 * On sème un foyer qui ressemble à celui de Kamil le 26/10 (des lasagnes et des pizzas au frigo, des burgers et
 * des wraps au congélateur, RIEN de posé sur la semaine), puis on choisit les repas au clic : un plat pour vous
 * deux, un autre pour une seule personne, un plat congelé, on change le repas le jour même, on mange — et à
 * CHAQUE geste on RELIT LA BASE : ce que l'écran affiche ne prouve rien de ce qui est écrit.
 *
 * Les captures (390 px et 320 px) sont posées dans `CAPTURES_SEMAINE`, à regarder à côté de la maquette
 * `Semaine.dc.html`.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'

const CAPTURES = process.env.CAPTURES_SEMAINE ?? '.shots/semaine'

test.use({ viewport: { width: 390, height: 844 } })
/* Les parcours se suivent : chacun part de ce que le précédent a laissé dans la base. */
test.describe.configure({ mode: 'serial' })

let foyer: Foyer
const recettes: Record<string, string> = {}
const MIN = 60_000
const JOUR_MS = 24 * 60 * MIN
const LASAGNES = 'Lasagnes au saumon-poireaux'
const PIZZA = 'Pizza vietnamienne protéinée'
const BURGER = 'Burger de feuilles de riz'
const WRAP = 'Wrap'

const jourLocal = (decalage: number) => {
  const d = new Date(); d.setDate(d.getDate() + decalage)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const semaineDe = (decalage: number) => {
  const d = new Date(); d.setDate(d.getDate() + decalage)
  const j = d.toLocaleDateString('fr-FR', { weekday: 'long' })
  return `${j[0].toUpperCase()}${j.slice(1)}`
}

async function connecte(page: Page) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(foyer.email)
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
  [...document.querySelectorAll<HTMLElement>('button, a[href], [role=radio], input[type=checkbox]')]
    .filter(c => getComputedStyle(c).visibility !== 'hidden' && !c.closest('[inert]'))
    .map(c => ({ c, r: c.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
    .map(({ c, r }) => `${(c.getAttribute('aria-label') || c.textContent || '?').trim().slice(0, 30)} ${Math.round(r.width)}×${Math.round(r.height)}`))

const portions = async () =>
  (await db.from('portion').select('*').eq('household_id', foyer.householdId).order('created_at')).data!
const parts = async (titre: string) => (await portions()).filter(p => p.label === titre)
const slots = async () =>
  (await db.from('meal_slot').select('*').eq('household_id', foyer.householdId)).data!
const caseDe = async (qui: string, decalage: number, meal: string) =>
  (await slots()).find(s => s.user_profile_id === qui && s.day === jourLocal(decalage) && s.meal === meal)

test.beforeAll(async () => {
  foyer = await amorce({ cycleEtat: 'semaine', budget: false })
  const hh = foyer.householdId
  await db.from('meal_slot').delete().eq('household_id', hh)
  await db.from('portion').delete().eq('household_id', hh)
  await db.from('stock_item').delete().eq('household_id', hh)

  for (const titre of [LASAGNES, PIZZA, BURGER, WRAP]) {
    const { data } = await db.from('recipe').insert({
      title: titre, yield_servings: 4, origin: 'manuelle', owner_household_id: hh,
    }).select().single()
    recettes[titre] = data!.id
  }
  const il = (jours: number) => new Date(Date.now() - jours * JOUR_MS).toISOString()
  const ligne = (titre: string, o: Record<string, unknown>) => ({
    household_id: hh, recipe_id: recettes[titre], label: titre, grams: 500, kcal: 600, protein_g: 50,
    fiber_g: 5, carb_g: 60, fat_g: 20, ...o,
  })
  const ajoute = async (titre: string, n: number, o: Record<string, unknown>) =>
    (await db.from('portion').insert(Array.from({ length: n }, () => ligne(titre, o))).select()).data!
  await ajoute(LASAGNES, 6, { grams: 784, kcal: 682, protein_g: 56, prepared_at: il(1) })
  await ajoute(PIZZA, 2, { grams: 512, kcal: 595, protein_g: 54, prepared_at: il(2) })
  await ajoute(BURGER, 2, { grams: 259, kcal: 501, protein_g: 36, location: 'congelateur', prepared_at: il(1), frozen_at: il(1) })
  await ajoute(WRAP, 20, { grams: 120, kcal: 300, protein_g: 12, location: 'congelateur', prepared_at: il(1), frozen_at: il(1) })
})
test.afterAll(async () => {
  if (!foyer) return
  await db.from('recipe').delete().eq('owner_household_id', foyer.householdId)
  await efface(foyer)
})

const feuille = (page: Page, nom: string) => page.getByRole('dialog', { name: nom })
const jourBouton = (page: Page, decalage: number) => page.locator(`[data-jour="${jourLocal(decalage)}"]`)
const repas = (page: Page, m: 'dejeuner' | 'diner') => page.locator(`[data-repas="${m}"]`)
const points = (page: Page, decalage: number) => jourBouton(page, decalage).locator('[data-point]')

test('la semaine neuve : sept jours, deux points creux sous chacun, deux cartes vides', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await expect(page.getByRole('heading', { name: 'La semaine', level: 1 })).toBeVisible({ timeout: 20_000 })
  const onglet = page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Semaine' })
  await expect(onglet).toHaveAttribute('aria-current', 'page')

  /* Le bandeau : sept jours, aujourd'hui choisi (`aria-pressed`), tous les points creux. */
  const bandeau = page.getByRole('group', { name: 'Choisir le jour' })
  await expect(bandeau.getByRole('button')).toHaveCount(7)
  await expect(jourBouton(page, 0)).toHaveAttribute('aria-pressed', 'true')
  await expect(jourBouton(page, 1)).toHaveAttribute('aria-pressed', 'false')
  for (let i = 0; i < 7; i++) {
    await expect(points(page, i)).toHaveCount(2)
    await expect(points(page, i).first()).toHaveAttribute('data-point', 'vide')
    await expect(points(page, i).last()).toHaveAttribute('data-point', 'vide')
  }
  await expect(page.getByRole('heading', { level: 2 }).first()).toContainText(semaineDe(0))
  await expect(page.getByText('aujourd’hui', { exact: true })).toBeVisible()
  /* Deux cartes vides. */
  await expect(repas(page, 'dejeuner').getByRole('button', { name: '+ Choisir le midi' })).toBeVisible()
  await expect(repas(page, 'diner').getByRole('button', { name: '+ Choisir le soir' })).toBeVisible()
  /* Les filtres par personne et par repas ont disparu : les cartes disent pour qui. */
  await expect(page.getByRole('group', { name: /Filtrer/ })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await capture(page, '01-semaine-neuve', true)

  /* Choisir un autre jour. */
  await jourBouton(page, 2).click()
  await expect(jourBouton(page, 2)).toHaveAttribute('aria-pressed', 'true')
  await expect(jourBouton(page, 0)).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('heading', { level: 2 }).first()).toContainText(semaineDe(2))
})

test('la feuille « Lundi midi » : une vraie modale, ses trois sections, le plus pressé d’abord', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  const ouvrir = repas(page, 'dejeuner').getByRole('button', { name: '+ Choisir le midi' })
  await expect(ouvrir).toBeVisible({ timeout: 20_000 })
  await ouvrir.click()

  const f = feuille(page, `${semaineDe(0)} midi`)
  await expect(f).toBeVisible()
  await expect(f.getByRole('heading', { name: `${semaineDe(0)} midi`, level: 2 })).toBeVisible()
  /* « Pour » : vous deux et chaque personne, vous deux d'abord. */
  const pour = f.getByRole('group', { name: 'Pour qui' })
  await expect(pour.getByRole('button')).toHaveText([/Vous deux/, /Kamil/, /.+/])
  await expect(pour.getByRole('button', { name: /Vous deux/ })).toHaveAttribute('aria-pressed', 'true')
  /* Les trois sections, dans l'ordre. */
  await expect(f.getByRole('heading', { level: 3 })).toHaveText(['Au frigo', 'Au congélateur', 'Autre chose'])
  /* Au frigo : la pizza (périme plus tôt) avant les lasagnes, avec combien de libres. */
  const frigo = f.getByRole('region', { name: 'Au frigo' })
  await expect(frigo.getByRole('button')).toHaveCount(2)
  await expect(frigo.getByRole('button').first()).toContainText('Pizza vietnamienne')
  await expect(frigo.getByRole('button').first()).toContainText('2 libres')
  await expect(frigo.getByRole('button').last()).toContainText('Lasagnes saumon-poireaux')
  await expect(frigo.getByRole('button').last()).toContainText('6 libres')
  await expect(frigo.getByRole('button').last()).toContainText(/à manger avant/)
  /* Au congélateur : à sortir la veille, dès l'heure du repas moins 24 h (la même que le frigo). */
  const congelo = f.getByRole('region', { name: 'Au congélateur' })
  await expect(congelo.getByRole('button', { name: /Wrap/ })).toContainText('20 libres')
  await expect(congelo.getByRole('button', { name: /Wrap/ })).toContainText('à sortir')
  /* Autre chose : les repères du midi, et « On saute ce repas ». */
  const autre = f.getByRole('region', { name: 'Autre chose' })
  await expect(autre.getByRole('button', { name: /Restaurant/ })).toBeVisible()
  await expect(autre.getByRole('button', { name: /Sandwich/ })).toBeVisible()
  await expect(autre.getByRole('button', { name: /On saute ce repas/ })).toBeVisible()
  await capture(page, '02-feuille-midi')
  await f.evaluate(el => { el.scrollTo(0, el.scrollHeight) })
  await capture(page, '02b-feuille-midi-bas')
  expect(await ciblesPetites(page), 'cibles de moins de 44 px dans la feuille').toEqual([])

  /* Le focus est dans la feuille ; Échap la ferme et le focus revient à « + Choisir le midi ». */
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(f).toBeHidden()
  await expect(ouvrir).toBeFocused()
  /* Aucun repas n'a été écrit. */
  expect(await slots()).toHaveLength(0)
})

test('choisir un repas pour vous deux : une barquette par personne, dans la base', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await repas(page, 'dejeuner').getByRole('button', { name: '+ Choisir le midi' }).click()
  const f = feuille(page, `${semaineDe(0)} midi`)
  await f.getByRole('region', { name: 'Au frigo' }).getByRole('button', { name: /Lasagnes saumon-poireaux/ }).click()
  await expect(f).toBeHidden({ timeout: 10_000 })

  /* La carte : le plat, pour qui, d'où il vient. */
  const carte = repas(page, 'dejeuner').getByRole('group', { name: 'Midi : Lasagnes saumon-poireaux' })
  await expect(carte).toBeVisible()
  await expect(carte).toContainText('Du frigo, pour vous deux')
  await expect(carte.getByRole('button', { name: /Changer/ })).toBeVisible()
  /* Aujourd'hui : « Je l'ai mangé ». */
  await expect(carte.getByRole('button', { name: 'Je l’ai mangé' })).toBeVisible()
  /* Le point de midi d'aujourd'hui est devenu vert, celui du soir reste creux. */
  await expect(points(page, 0).first()).toHaveAttribute('data-point', 'frigo')
  await expect(points(page, 0).last()).toHaveAttribute('data-point', 'vide')
  /* Le focus revient à la carte qu'on vient de remplir. */
  await expect(carte.getByRole('button', { name: /Changer/ })).toBeFocused()
  await capture(page, '03-midi-choisi', true)

  /* La base : deux cases, deux barquettes DISTINCTES de lasagnes, encore au frigo. */
  const mes = await caseDe(foyer.userId, 0, 'dejeuner')
  const elle = await caseDe(foyer.elleId, 0, 'dejeuner')
  expect(mes?.state).toBe('prevu')
  expect(elle?.state).toBe('prevu')
  expect(mes!.portion_id).not.toBeNull()
  expect(mes!.portion_id).not.toBe(elle!.portion_id)
  const lasagnes = await parts(LASAGNES)
  for (const id of [mes!.portion_id, elle!.portion_id]) {
    expect(lasagnes.find(p => p.id === id), 'la barquette posée n’est pas une lasagne').toBeTruthy()
  }
  expect(lasagnes.every(p => p.state === 'au_frais' && p.location === 'frigo')).toBe(true)

  /* Un second repas pour une seule personne : Kamil prend la pizza au dîner. */
  await repas(page, 'diner').getByRole('button', { name: '+ Choisir le soir' }).click()
  const g = feuille(page, `${semaineDe(0)} soir`)
  /* Les lasagnes du midi ne comptent plus parmi les libres : 4 sur 6. */
  await expect(g.getByRole('region', { name: 'Au frigo' }).getByRole('button', { name: /Lasagnes saumon-poireaux/ })).toContainText('4 libres')
  await g.getByRole('group', { name: 'Pour qui' }).getByRole('button', { name: 'Kamil' }).click()
  await expect(g.getByRole('group', { name: 'Pour qui' }).getByRole('button', { name: 'Kamil' })).toHaveAttribute('aria-pressed', 'true')
  await g.getByRole('region', { name: 'Au frigo' }).getByRole('button', { name: /Pizza vietnamienne/ }).click()
  await expect(g).toBeHidden({ timeout: 10_000 })
  const soir = repas(page, 'diner')
  await expect(soir.getByRole('group', { name: 'Soir : Pizza vietnamienne' })).toContainText('Du frigo, pour Kamil')
  /* L'autre personne n'a rien : la porte reste ouverte pour elle. */
  await expect(soir.getByRole('button', { name: /^\+ Choisir le soir pour / })).toBeVisible()
  expect((await caseDe(foyer.userId, 0, 'diner'))?.portion_id).not.toBeNull()
  expect(await caseDe(foyer.elleId, 0, 'diner')).toBeUndefined()
  await capture(page, '04-soir-pour-kamil', true)
})

test('changer le repas le jour même : l’ancienne barquette est lâchée, on le dit, le plat congelé a son bandeau', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  const midi = repas(page, 'dejeuner')
  await midi.getByRole('button', { name: /Changer/ }).click()
  const f = feuille(page, `${semaineDe(0)} midi`)
  /* La feuille s'ouvre « Pour » vous deux, comme la carte. */
  await expect(f.getByRole('group', { name: 'Pour qui' }).getByRole('button', { name: /Vous deux/ })).toHaveAttribute('aria-pressed', 'true')
  /* Les lasagnes de CE repas redeviennent candidates : 6 libres, pas 4. */
  const frigo = f.getByRole('region', { name: 'Au frigo' })
  await expect(frigo.getByRole('button', { name: /Lasagnes saumon-poireaux/ })).toContainText('6 libres')
  /* La pizza du soir (Kamil) n'en laisse qu'une : pas assez pour vous deux, la ligne est éteinte et le dit. */
  const pizza = frigo.getByRole('button', { name: /Pizza vietnamienne/ })
  await expect(pizza).toBeDisabled()
  await expect(pizza).toContainText('il en faut 2, 1 libre')
  await capture(page, '05-changer-le-midi')

  /* Des wraps, du congélateur. */
  await f.getByRole('region', { name: 'Au congélateur' }).getByRole('button', { name: /Wrap/ }).click()
  await expect(f).toBeHidden({ timeout: 10_000 })
  const statut = page.getByRole('status').filter({ hasText: 'lasagnes' })
  await expect(statut).toHaveText('Les lasagnes retournent au frigo, libres pour un autre jour.')
  const carte = midi.getByRole('group', { name: 'Midi : Wrap' })
  await expect(carte).toContainText('Du congélateur, pour vous deux')
  /* Le bandeau bleu : c'est pour aujourd'hui. */
  await expect(carte.locator('[data-bandeau="congele"]')).toHaveText('C’est pour aujourd’hui : décongèle les 2 wraps au micro-ondes.')
  await expect(points(page, 0).first()).toHaveAttribute('data-point', 'congelateur')
  await capture(page, '06-midi-congele', true)

  /* La base : les lasagnes ne sont plus réclamées par personne, les deux wraps le sont. */
  const toutes = await slots()
  const lasagnes = await parts(LASAGNES)
  expect(toutes.filter(x => lasagnes.some(p => p.id === x.portion_id)), 'les lasagnes sont encore posées').toEqual([])
  const wraps = await parts(WRAP)
  const posees = toutes.filter(x => wraps.some(p => p.id === x.portion_id))
  expect(posees).toHaveLength(2)
  expect(new Set(posees.map(x => x.portion_id)).size).toBe(2)
  expect(posees.every(x => x.day === jourLocal(0) && x.meal === 'dejeuner')).toBe(true)
  /* Le message s'efface quand on change de jour. */
  await jourBouton(page, 1).click()
  await expect(statut).toHaveCount(0)
})

test('un plat congelé dans quelques jours : « Pense à sortir… », puis il retourne au congélateur', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await jourBouton(page, 2).click()
  await repas(page, 'diner').getByRole('button', { name: '+ Choisir le soir' }).click()
  const f = feuille(page, `${semaineDe(2)} soir`)
  await f.getByRole('region', { name: 'Au congélateur' }).getByRole('button', { name: /Wrap/ }).click()
  await expect(f).toBeHidden({ timeout: 10_000 })
  const carte = repas(page, 'diner').getByRole('group', { name: 'Soir : Wrap' })
  await expect(carte.locator('[data-bandeau="congele"]')).toHaveText('Pense à sortir les 2 wraps la veille au soir.')
  /* Ce n'est pas aujourd'hui : pas de « Je l'ai mangé ». */
  await expect(carte.getByRole('button', { name: 'Je l’ai mangé' })).toHaveCount(0)
  await expect(points(page, 2).last()).toHaveAttribute('data-point', 'congelateur')
  await capture(page, '07-soir-congele-dans-deux-jours', true)
  expect((await slots()).filter(x => x.day === jourLocal(2) && x.meal === 'diner')).toHaveLength(2)

  /* On change : les wraps RESTENT au congélateur. */
  await carte.getByRole('button', { name: /Changer/ }).click()
  await f.getByRole('region', { name: 'Au frigo' }).getByRole('button', { name: /Lasagnes saumon-poireaux/ }).click()
  await expect(f).toBeHidden({ timeout: 10_000 })
  await expect(page.getByRole('status').filter({ hasText: 'wraps' })).toHaveText('Les wraps restent au congélateur.')
  await expect(repas(page, 'diner').getByRole('group', { name: 'Soir : Lasagnes saumon-poireaux' })).toContainText('Du frigo, pour vous deux')
  expect(await caseDe(foyer.userId, 2, 'diner')).toBeTruthy()
})

test('« Je l’ai mangé » : ma case est mangée, la barquette est consommée', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  const soir = repas(page, 'diner')
  const carte = soir.getByRole('group', { name: 'Soir : Pizza vietnamienne' })
  await expect(carte).toBeVisible({ timeout: 20_000 })
  const posee = (await caseDe(foyer.userId, 0, 'diner'))!.portion_id!
  await carte.getByRole('button', { name: 'Je l’ai mangé' }).click()
  await expect.poll(async () => (await caseDe(foyer.userId, 0, 'diner'))?.state, { timeout: 10_000 }).toBe('mange')
  expect((await db.from('portion').select('state').eq('id', posee).single()).data!.state).toBe('mangee')
  /* La carte le dit, et il n'y a plus rien à changer ni à cocher. */
  await expect(carte).toContainText('mangé')
  await expect(carte.getByRole('button', { name: 'Je l’ai mangé' })).toHaveCount(0)
  await expect(carte.getByRole('button', { name: /Changer/ })).toHaveCount(0)
  await capture(page, '08-soir-mange', true)
})

test('autre chose, et on saute : une carte par repas, le point safran', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  await jourBouton(page, 1).click()
  const midi = repas(page, 'dejeuner')

  /* Kamil seul : un restaurant. */
  await midi.getByRole('button', { name: '+ Choisir le midi' }).click()
  const f = feuille(page, `${semaineDe(1)} midi`)
  await f.getByRole('group', { name: 'Pour qui' }).getByRole('button', { name: 'Kamil' }).click()
  await f.getByRole('region', { name: 'Autre chose' }).getByRole('button', { name: /Restaurant/ }).click()
  await expect(f).toBeHidden({ timeout: 10_000 })
  const resto = midi.getByRole('group', { name: 'Midi : Restaurant' })
  await expect(resto).toContainText('Pour Kamil')
  /* L'autre personne n'a rien : elle saute ce repas. */
  await midi.getByRole('button', { name: /^\+ Choisir le midi pour / }).click()
  await f.getByRole('region', { name: 'Autre chose' }).getByRole('button', { name: /On saute ce repas/ }).click()
  await expect(f).toBeHidden({ timeout: 10_000 })
  await expect(midi.getByRole('group', { name: 'Midi : On saute ce repas' })).toContainText(/^On saute ce repas\s*Pour /)
  await expect(midi.getByRole('button', { name: /^\+ Choisir le midi/ })).toHaveCount(0)
  await expect(points(page, 1).first()).toHaveAttribute('data-point', 'autre')
  await capture(page, '09-autre-chose-et-saute', true)

  /* La base : Kamil « prévu » sans barquette avec son extra ; elle « sautée ». */
  const mienne = (await caseDe(foyer.userId, 1, 'dejeuner'))!
  expect(mienne).toMatchObject({ state: 'prevu', portion_id: null })
  const { data: extras } = await db.from('meal_extra').select('label, kcal').eq('meal_slot_id', mienne.id)
  expect(extras!.map(e => e.label)).toEqual(['Restaurant'])
  expect(Number(extras![0].kcal)).toBe(900)
  expect(await caseDe(foyer.elleId, 1, 'dejeuner')).toMatchObject({ state: 'saute', portion_id: null })

  /* Changer le restaurant en lasagnes : l'extra du repas s'en va. */
  await resto.getByRole('button', { name: /Changer/ }).click()
  await f.getByRole('region', { name: 'Au frigo' }).getByRole('button', { name: /Lasagnes saumon-poireaux/ }).click()
  await expect(f).toBeHidden({ timeout: 10_000 })
  await expect(midi.getByRole('group', { name: 'Midi : Lasagnes saumon-poireaux' })).toContainText('Du frigo, pour Kamil')
  expect((await db.from('meal_extra').select('id').eq('meal_slot_id', mienne.id)).data).toEqual([])
})

test('le petit déjeuner et la collation se notent encore en plus', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/semaine')
  const autres = page.getByRole('region', { name: 'Autres moments' })
  await expect(autres.getByText('Mangé sans barquette ?')).toBeVisible({ timeout: 20_000 })
  await autres.getByRole('button', { name: 'Collation', exact: true }).click()
  await autres.getByRole('button', { name: /^Yaourt/ }).click()
  await expect(autres.getByText('Yaourt · 60 kcal', { exact: false }).first()).toBeVisible({ timeout: 10_000 })
  const c = (await slots()).find(x => x.user_profile_id === foyer.userId && x.day === jourLocal(0) && x.meal === 'collation')!
  expect(c).toMatchObject({ state: 'prevu', portion_id: null })
  const { data: extras } = await db.from('meal_extra').select('label').eq('meal_slot_id', c.id)
  expect(extras!.map(e => e.label)).toEqual(['Yaourt'])
  await capture(page, '10-en-plus', true)
})

test('l’accueil : « Changer » ouvre la semaine sur aujourd’hui, la feuille du bon repas ouverte', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/cuisine-accueil')
  const carte = page.getByRole('region', { name: 'Le prochain repas' })
  await expect(carte).toBeVisible({ timeout: 20_000 })
  await capture(page, '11-accueil', true)
  await carte.getByRole('button', { name: 'Changer' }).click()
  await expect(page).toHaveURL(new RegExp(`/semaine\\?jour=${jourLocal(0)}&repas=dejeuner$`))
  const f = feuille(page, `${semaineDe(0)} midi`)
  await expect(f).toBeVisible({ timeout: 10_000 })
  await expect(jourBouton(page, 0)).toHaveAttribute('aria-pressed', 'true')
  /* On referme : l'adresse redevient /semaine (un rechargement ne rouvre pas la feuille). */
  await page.keyboard.press('Escape')
  await expect(f).toBeHidden()
  await expect(page).toHaveURL(/\/semaine$/)

  /* « Demain » mène à la semaine sur demain. */
  await page.goto('/cuisine-accueil')
  const demain = page.getByRole('region', { name: 'Demain' })
  await expect(demain).toBeVisible({ timeout: 20_000 })
  await demain.getByRole('button', { name: 'La semaine' }).click()
  await expect(page).toHaveURL(new RegExp(`/semaine\\?jour=${jourLocal(1)}$`))
  await expect(jourBouton(page, 1)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  /* Une adresse hors du bandeau est ignorée : on ouvre aujourd'hui. */
  await page.goto('/semaine?jour=1999-01-01&repas=diner')
  await expect(jourBouton(page, 0)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('à 320 px : rien ne déborde, le bandeau défile de lui-même, la feuille tient, les cibles font 44 px', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ viewport: { width: 320, height: 700 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  try {
    await connecte(page)
    await page.goto('/semaine')
    await expect(page.getByRole('heading', { name: 'La semaine', level: 1 })).toBeVisible({ timeout: 20_000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth), 'la page déborde à 320 px').toBeLessThanOrEqual(320)
    /* Le bandeau défile DANS son cadre : il est plus large que lui, et la page ne bouge pas. */
    const mesure = await page.evaluate(() => {
      const b = document.querySelector<HTMLElement>('[data-bandeau="jours"]')!
      return { dedans: b.scrollWidth, cadre: b.clientWidth }
    })
    expect(mesure.dedans, 'le bandeau devrait défiler à 320 px').toBeGreaterThan(mesure.cadre)
    await jourBouton(page, 6).click()
    await expect(jourBouton(page, 6)).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    const box = (await jourBouton(page, 6).boundingBox())!
    expect(box.x + box.width, 'le jour choisi sort de l’écran').toBeLessThanOrEqual(320.5)
    expect(box.width).toBeGreaterThanOrEqual(44)
    await capture(page, '12-semaine-320', true)
    expect(await ciblesPetites(page), 'cibles de moins de 44 px').toEqual([])

    await repas(page, 'dejeuner').getByRole('button', { name: /^\+ Choisir le midi/ }).click()
    const f = feuille(page, `${semaineDe(6)} midi`)
    await expect(f).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    const largeur = await f.evaluate(el => ({ dedans: el.scrollWidth, cadre: el.clientWidth }))
    expect(largeur.dedans, 'la feuille déborde en largeur').toBeLessThanOrEqual(largeur.cadre)
    await capture(page, '13-feuille-320')
    expect(await ciblesPetites(page), 'cibles de moins de 44 px dans la feuille').toEqual([])
  } finally { await ctx.close() }
})
