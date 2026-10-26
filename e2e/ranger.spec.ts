/**
 * « On range » : la seconde étape du dressage, jouée de bout en bout.
 *
 * On dresse (et celle qui n'a pas d'objectifs reçoit quand même ses parts), on règle ce qui reste
 * au frigo, on change l'heure du rangement, on lit « La session a pris », on en corrige une ligne,
 * on range — puis on RELIT LA BASE : lieu, `prepared_at` et `frozen_at` de chaque barquette, le
 * stock, l'état du cycle. Ce que l'écran affiche ne prouve rien de ce qui est écrit.
 *
 * Les captures de l'étape (390 px, clair) sont posées dans `CAPTURES`, à regarder à côté de la
 * maquette `Ranger.dc.html`.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'

const CAPTURES = process.env.CAPTURES_RANGER ?? '.shots/ranger'

test.use({ viewport: { width: 390, height: 844 } })

let foyer: Foyer

/** Un aliment du référentiel, par un bout de son nom. */
async function aliment(mot: string): Promise<string> {
  const { data } = await db.from('food').select('id').ilike('name', `%${mot}%`).limit(1)
  if (data?.[0]) return data[0].id
  const { data: n } = await db.from('food').select('id').limit(1)
  return n![0].id
}

test.beforeAll(async () => {
  foyer = await amorce({ cycleEtat: 'dressage' })

  // L'amorce sème déjà quatre barquettes et deux repas : ici, la session n'a encore rien dressé.
  await db.from('meal_slot').delete().eq('cycle_id', foyer.cycleId)
  await db.from('portion').delete().eq('cycle_id', foyer.cycleId)

  const poireau = await aliment('poireau')
  const tortilla = await aliment('tortilla')
  const lait = await aliment('lait écrémé')
  const ail = await aliment('ail,')
  const courgette = await aliment('courgette')

  const { data: cr } = await db.from('cycle_recipe').select('recipe_id, recipe:recipe_id(title)')
    .eq('cycle_id', foyer.cycleId)
  const parTitre = new Map(cr!.map(c => [(c.recipe as unknown as { title: string }).title, c.recipe_id]))
  const dahl = parTitre.get('Dahl de lentilles corail')!
  const poulet = parTitre.get('Poulet rôti aux herbes')!

  // Chaque recette est cuisinée pour 4 parts et en donne 4 : le besoin = la ligne de la recette.
  await db.from('recipe_ingredient').insert([
    { recipe_id: dahl, ordinal: 3, raw_text: '1,5 kg de poireaux', food_id: poireau,
      qty: 1500, unit: 'g', grams_reference: 1500 },
    { recipe_id: dahl, ordinal: 4, raw_text: '20 tortillas', food_id: tortilla,
      qty: 20, unit: null, grams_reference: 800 },
    { recipe_id: poulet, ordinal: 3, raw_text: '75 cl de lait', food_id: lait,
      qty: 750, unit: 'ml', grams_reference: 750 },
    { recipe_id: poulet, ordinal: 4, raw_text: 'de l’ail', food_id: ail,
      qty: null, unit: null, grams_reference: null },
  ]).select()
  const { data: gratin } = await db.from('recipe').insert({
    title: 'Gratin de courgettes', yield_servings: 4, total_time_min: 50, origin: 'importee',
    source_name: 'exemple.fr', source_url: `https://exemple.fr/gratin-${Date.now()}`,
    plannable: true, freezable: true,
  }).select().single()
  await db.from('recipe_ingredient').insert({
    recipe_id: gratin!.id, ordinal: 1, raw_text: '600 g de courgettes', food_id: courgette,
    qty: 600, unit: 'g', grams_reference: 600,
  })
  await db.from('cycle_recipe').insert({
    cycle_id: foyer.cycleId, household_id: foyer.householdId, recipe_id: gratin!.id,
    servings: 4, position: 2,
  })
  await db.from('cycle_recipe').update({ position: 0 }).eq('cycle_id', foyer.cycleId).eq('recipe_id', dahl)
  await db.from('cycle_recipe').update({ position: 1 }).eq('cycle_id', foyer.cycleId).eq('recipe_id', poulet)

  await db.from('stock_item').insert([
    { household_id: foyer.householdId, label: 'Poireaux', food_id: poireau, quantity: 1500, unit: 'g', location: 'frigo' },
    { household_id: foyer.householdId, label: 'Tortillas', food_id: tortilla, quantity: 20, unit: null, location: 'placard' },
    { household_id: foyer.householdId, label: 'Lait écrémé', food_id: lait, quantity: 1000, unit: 'ml', location: 'frigo' },
    { household_id: foyer.householdId, label: 'Ail', food_id: ail, quantity: null, unit: null, location: 'frigo' },
  ]).select()
})
test.afterAll(async () => { if (foyer) await efface(foyer) })

async function connecte(page: Page, f: Foyer = foyer) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(f.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

async function capture(page: Page, nom: string) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${CAPTURES}/${nom}.png`, fullPage: true })
}

const carte = (page: Page, titre: string) => page.getByRole('region', { name: titre })
const frigo = (page: Page, titre: string) => carte(page, titre).getByText(/^Frigo · \d+$/)
const congelo = (page: Page, titre: string) => carte(page, titre).getByText(/^Congélateur · \d+$/)

test('on dresse pour tout le foyer, on range, et la base garde ce qu’on a choisi', async ({ page }) => {
  test.setTimeout(180_000)
  await connecte(page)

  /* ── Le dressage : celle qui n'a pas d'objectifs a ses parts ────────────── */
  await page.goto('/dressage')
  await expect(page.getByRole('heading', { name: /Dresse\s*12 barquettes/ }),
    'la moitié des parts disparaît : un membre sans objectifs est omis').toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Thauba n’a pas encore fixé ses objectifs : ses barquettes sont dressées à parts égales.'))
    .toBeVisible()
  await expect(page.getByText(/pour Thauba · parts égales/).first()).toBeVisible()
  await capture(page, '01-dressage')

  await page.getByRole('button', { name: 'C’est dressé' }).click()

  /* ── On range : la proposition de départ ────────────────────────────────── */
  await expect(page.getByRole('heading', { name: 'On range' })).toBeVisible()
  await expect(page.getByText('12 barquettes pour vous deux.')).toBeVisible()
  // Quatre jours de dîners pour deux : huit au frigo, dans l'ordre du cycle (Dahl, puis Poulet).
  await expect(frigo(page, 'Dahl de lentilles corail')).toHaveText('Frigo · 4')
  await expect(frigo(page, 'Poulet rôti aux herbes')).toHaveText('Frigo · 4')
  await expect(frigo(page, 'Gratin de courgettes')).toHaveText('Frigo · 0')
  await expect(congelo(page, 'Gratin de courgettes')).toHaveText('Congélateur · 4')
  await expect(page.getByText('8 barquettes au frigo')).toBeVisible()
  await expect(page.getByText('De quoi tenir 4 jours de dîners pour vous deux. Le frigo garde 4 jours.')).toBeVisible()
  await capture(page, '02-on-range-proposition')

  /* ── Trop au frigo : le bilan le dit, en ocre sur sable ─────────────────── */
  const plusGratin = carte(page, 'Gratin de courgettes').getByRole('button', { name: 'Une de plus au frigo' })
  for (let i = 0; i < 4; i++) await plusGratin.click()
  await expect(frigo(page, 'Gratin de courgettes')).toHaveText('Frigo · 4')
  await expect(plusGratin, 'on ne met pas plus au frigo qu’il n’y a de barquettes').toBeDisabled()
  await expect(page.getByText(/C’est plus de 4 jours de dîners pour vous deux/)).toBeVisible()
  await capture(page, '03-on-range-trop')

  /* ── On règle : Dahl 1 au frigo, Poulet 4, Gratin 1 ─────────────────────── */
  const moinsGratin = carte(page, 'Gratin de courgettes').getByRole('button', { name: 'Une de moins au frigo' })
  for (let i = 0; i < 3; i++) await moinsGratin.click()
  const moinsDahl = carte(page, 'Dahl de lentilles corail').getByRole('button', { name: 'Une de moins au frigo' })
  for (let i = 0; i < 3; i++) await moinsDahl.click()
  await expect(frigo(page, 'Dahl de lentilles corail')).toHaveText('Frigo · 1')
  await expect(congelo(page, 'Dahl de lentilles corail')).toHaveText('Congélateur · 3')
  await expect(page.getByText('6 barquettes au frigo')).toBeVisible()
  await expect(page.getByText('De quoi tenir 3 jours de dîners pour vous deux.')).toBeVisible()

  /* ── L'heure du rangement : hier à 18 h 30 ──────────────────────────────── */
  const hier = new Date()
  hier.setDate(hier.getDate() - 1)
  hier.setHours(18, 30, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  await page.getByRole('button', { name: 'Modifier' }).click()
  /* Au plus quatre jours en arrière : au-delà, un message en français, et « Ranger » ne part pas. */
  const loin = new Date()
  loin.setDate(loin.getDate() - 6)
  const champ = page.getByLabel('Date et heure du rangement')
  await champ.fill(`${loin.getFullYear()}-${p(loin.getMonth() + 1)}-${p(loin.getDate())}T18:30`)
  await expect(page.getByRole('alert').filter({ hasText: /plus de 4 jours/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Ranger / })).toBeDisabled()
  await champ.fill(`${hier.getFullYear()}-${p(hier.getMonth() + 1)}-${p(hier.getDate())}T18:30`)
  await expect(page.getByRole('alert').filter({ hasText: /plus de 4 jours/ })).toHaveCount(0)
  await expect(page.getByText(/ à 18 h 30$/)).toBeVisible()
  await page.getByRole('button', { name: 'Terminé' }).click()

  /* ── La session a pris : le calcul, puis une correction ─────────────────── */
  await expect(page.getByRole('heading', { name: 'La session a pris' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Poireaux 1,5 kg$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Tortillas 20$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Lait écrémé 750 ml$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Ail/ }), 'une ligne sans quantité n’est pas retirée')
    .toHaveCount(0)
  // Ce que les recettes n'ont pas touché reste au frigo.
  const resteAuFrigo = page.getByText('Reste au frigo :', { exact: true }).locator('..')
  await expect(resteAuFrigo).toContainText('yaourt nature')
  await expect(resteAuFrigo).toContainText('Ail')

  // Le texte dit où l'on retire : le congélateur aussi (la base le fait).
  await expect(page.getByText('Retiré du frigo, du congélateur et du placard d’après les recettes.')).toBeVisible()
  await page.getByRole('button', { name: /^Lait écrémé/ }).click()
  await expect(page.getByLabel(/Lait écrémé : il en reste/)).toHaveValue('250')
  await capture(page, '04-on-range-correction')
  /* Une saisie qui n'est pas un nombre : un message, et « Corriger » ne part pas. */
  await page.getByLabel(/Lait écrémé : il en reste/).fill('beaucoup')
  await expect(page.getByRole('alert').filter({ hasText: 'Écris un nombre' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Corriger', exact: true })).toBeDisabled()
  await page.getByLabel(/Lait écrémé : il en reste/).fill('100')
  await page.getByRole('button', { name: 'Corriger', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Lait écrémé 900 ml$/ })).toBeVisible()
  /* Le panneau fermé, le focus revient à la puce corrigée (il était dans le champ qui vient de disparaître). */
  await expect(page.getByRole('button', { name: /^Lait écrémé 900 ml$/ })).toBeFocused()
  await capture(page, '05-on-range-pret')

  /* ── Les cibles tactiles de l'étape : 44 px au moins ────────────────────── */
  const petits = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('button, input')]
    .map(e => ({ e, r: e.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
    .map(({ e, r }) => `${e.getAttribute('aria-label') || e.textContent} ${Math.round(r.width)}×${Math.round(r.height)}`))
  expect(petits, 'des cibles sont trop petites pour un pouce').toEqual([])

  /* ── On range ───────────────────────────────────────────────────────────── */
  await page.getByRole('button', { name: 'Ranger les 12 barquettes' }).click()
  // « Ranger » mène à la semaine : c'est là qu'on choisit ce qu'on mange chaque jour.
  await expect(page).toHaveURL(/\/semaine$/, { timeout: 20_000 })

  /* ── La base relue ──────────────────────────────────────────────────────── */
  const { data: parts } = await db.from('portion').select('*').eq('cycle_id', foyer.cycleId)
  expect(parts, '12 barquettes, pas la moitié').toHaveLength(12)

  const lieux = (titre: string) => {
    const l = parts!.filter(x => x.label === titre)
    return { frigo: l.filter(x => x.location === 'frigo').length,
             froid: l.filter(x => x.location === 'congelateur').length }
  }
  expect(lieux('Dahl de lentilles corail')).toEqual({ frigo: 1, froid: 3 })
  expect(lieux('Poulet rôti aux herbes')).toEqual({ frigo: 4, froid: 0 })
  expect(lieux('Gratin de courgettes')).toEqual({ frigo: 1, froid: 3 })

  const rangeLe = hier.getTime()
  const JOUR = 86_400_000
  for (const x of parts!) {
    expect(new Date(x.prepared_at).getTime(), 'prepared_at n’est pas l’heure donnée').toBe(rangeLe)
    if (x.location === 'congelateur') {
      expect(new Date(x.frozen_at!).getTime(), 'frozen_at n’est pas l’heure donnée').toBe(rangeLe)
      expect((new Date(x.expires_at).getTime() - rangeLe) / JOUR).toBeCloseTo(90, 0)
    } else {
      expect(x.frozen_at).toBeNull()
      expect((new Date(x.expires_at).getTime() - rangeLe) / JOUR).toBeCloseTo(4, 0)
    }
  }

  // Les deux membres ont leurs parts, au même poids (aucun n'est omis, l'un n'a pas d'objectifs).
  const parQui = new Map<string, number[]>()
  for (const x of parts!.filter(y => y.label === 'Poulet rôti aux herbes')) {
    parQui.set(x.for_user_id!, [...(parQui.get(x.for_user_id!) ?? []), Number(x.grams)])
  }
  expect([...parQui.keys()].sort()).toEqual([foyer.userId, foyer.elleId].sort())
  expect(parQui.get(foyer.userId)).toEqual(parQui.get(foyer.elleId))
  // Chacun garde du frais : le frigo ne va pas tout entier au premier.
  const fraisDe = (qui: string) => parts!.filter(x => x.for_user_id === qui && x.location === 'frigo').length
  expect(fraisDe(foyer.userId)).toBe(3)
  expect(fraisDe(foyer.elleId)).toBe(3)

  // Le stock : les poireaux et les tortillas sont partis, le lait garde la correction (100 ml).
  const { data: stock } = await db.from('stock_item').select('label, quantity').eq('household_id', foyer.householdId)
  const reste = new Map(stock!.map(s => [s.label, s.quantity === null ? null : Number(s.quantity)]))
  expect(reste.has('Poireaux'), 'les poireaux sont toujours au stock').toBe(false)
  expect(reste.has('Tortillas'), 'les tortillas sont toujours au stock').toBe(false)
  expect(reste.get('Lait écrémé')).toBe(100)
  expect(reste.has('Ail') && reste.get('Ail') === null, 'l’ail, sans quantité, est resté tel quel').toBe(true)
  expect(reste.get('yaourt nature'), 'ce qu’aucune recette ne prend n’a pas bougé').toBe(4)

  // Le cycle est passé à la semaine, et AUCUN repas n'a été distribué à la place de l'hôte.
  const { data: cycle } = await db.from('cycle').select('state, stock_retire_le').eq('id', foyer.cycleId).single()
  expect(cycle!.state).toBe('semaine')
  expect(cycle!.stock_retire_le).not.toBeNull()
  const { count: repas } = await db.from('meal_slot').select('id', { count: 'exact', head: true })
    .eq('cycle_id', foyer.cycleId)
  expect(repas, 'le dressage ne distribue plus la semaine').toBe(0)
})

test.describe('reprise : ce que la base a déjà écrit', () => {
  let second: Foyer
  test.beforeAll(async () => { second = await amorce({ cycleEtat: 'dressage' }) })
  test.afterAll(async () => { if (second) await efface(second) })

  test('des barquettes déjà rangées s’affichent telles qu’elles sont écrites, en lecture seule, et on finit', async ({ page }) => {
    test.setTimeout(120_000)
    // L'amorce a déjà quatre barquettes (deux par recette, au frigo) : le rangement « a déjà eu lieu ».
    await db.from('meal_slot').delete().eq('cycle_id', second.cycleId)
    // Une barquette du congélateur, rangée il y a deux jours : ce que l'écran doit montrer, pas ses défauts.
    const il = new Date(Date.now() - 2 * 86_400_000)
    il.setSeconds(0, 0)
    const { data: une } = await db.from('portion').select('id').eq('cycle_id', second.cycleId).limit(1)
    await db.from('portion').update({ location: 'congelateur', frozen_at: il.toISOString(), prepared_at: il.toISOString() })
      .eq('id', une![0].id)

    await connecte(page, second)
    await page.goto('/dressage')
    await page.getByRole('button', { name: 'C’est dressé' }).click()
    await expect(page.getByRole('heading', { name: 'On range' })).toBeVisible()
    await expect(page.getByText(/4 barquettes déjà rangées pour vous deux/)).toBeVisible()
    // Les vrais nombres, par lieu : une des quatre est au congélateur.
    await expect(page.getByText(/^Frigo · \d+$/)).toHaveCount(2)
    await expect(page.getByText('Congélateur · 1', { exact: true })).toBeVisible()
    await expect(page.getByText('Congélateur · 0', { exact: true })).toBeVisible()
    // Lecture seule : ni « − » ni « + », ni « Modifier » la date.
    await expect(page.getByRole('button', { name: /de (moins|plus) au frigo/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Modifier' })).toHaveCount(0)
    await capture(page, '06-on-range-deja-fait')

    await page.getByRole('button', { name: 'Terminer le rangement' }).click()
    await expect(page).toHaveURL(/\/semaine$/, { timeout: 20_000 })

    const { data: parts } = await db.from('portion').select('location, prepared_at').eq('cycle_id', second.cycleId)
    expect(parts, 'les barquettes ont été recréées').toHaveLength(4)
    expect(parts!.filter(x => x.location === 'congelateur'), 'le lieu écrit a été écrasé').toHaveLength(1)
    const { data: cycle } = await db.from('cycle').select('state, stock_retire_le').eq('id', second.cycleId).single()
    expect(cycle!.state).toBe('semaine')
    expect(cycle!.stock_retire_le).not.toBeNull()
  })
})

test.describe('la lecture de ce que la session prend', () => {
  let tiers: Foyer
  let farine: string

  test.beforeAll(async () => {
    tiers = await amorce({ cycleEtat: 'dressage' })
    await db.from('meal_slot').delete().eq('cycle_id', tiers.cycleId)
    await db.from('portion').delete().eq('cycle_id', tiers.cycleId)
    farine = await aliment('farine')
    const { data: cr } = await db.from('cycle_recipe').select('recipe_id').eq('cycle_id', tiers.cycleId).limit(1)
    await db.from('recipe_ingredient').insert({
      recipe_id: cr![0].recipe_id, ordinal: 9, raw_text: '500 g de farine', food_id: farine,
      qty: 500, unit: 'g', grams_reference: 500,
    })
    await db.from('stock_item').insert({
      household_id: tiers.householdId, label: 'Farine de blé', food_id: farine, quantity: 2000, unit: 'g', location: 'placard',
    })
  })
  test.afterAll(async () => { if (tiers) await efface(tiers) })

  test('« Ranger » attend la lecture, « Reste au frigo » ne montre pas tout le frigo, puis la liste arrive', async ({ page }) => {
    test.setTimeout(120_000)
    // La lecture traîne : trois secondes avant que la base réponde.
    await page.route(/ce_que_la_session_prend/, async route => {
      await new Promise(r => setTimeout(r, 3_000))
      await route.continue()
    })
    await connecte(page, tiers)
    await page.goto('/dressage')
    await page.getByRole('button', { name: 'C’est dressé' }).click()
    await expect(page.getByRole('heading', { name: 'On range' })).toBeVisible()

    const ranger = page.getByRole('button', { name: /^Ranger / })
    await expect(page.getByText('Je regarde ce que la session prend dans le stock…')).toBeVisible()
    await expect(ranger, 'on range avant d’avoir vu ce que la session retire').toBeDisabled()
    await expect(page.getByText('Reste au frigo :', { exact: true }), 'tout le frigo pendant le chargement').toHaveCount(0)

    await expect(page.getByRole('button', { name: /^Farine de blé 500 g$/ })).toBeVisible({ timeout: 15_000 })
    await expect(ranger).toBeEnabled()
    await page.unroute(/ce_que_la_session_prend/)
  })

  test('la lecture en panne : on range sans toucher au stock, et l’écran dit vrai', async ({ page }) => {
    test.setTimeout(120_000)
    await page.route(/ce_que_la_session_prend/, route => route.abort())
    await connecte(page, tiers)
    await page.goto('/dressage')
    await page.getByRole('button', { name: 'C’est dressé' }).click()
    await expect(page.getByText('Je n’ai pas pu lire ce que la session prend dans le stock : il ne sera pas retiré.'))
      .toBeVisible({ timeout: 40_000 })
    await expect(page.getByText('Reste au frigo :', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: /^Ranger / }).click()
    await expect(page).toHaveURL(/\/semaine$/, { timeout: 20_000 })

    const { data: stock } = await db.from('stock_item').select('quantity').eq('household_id', tiers.householdId).eq('label', 'Farine de blé')
    expect(Number(stock![0].quantity), 'le stock a été retiré sans que l’hôte l’ait vu').toBe(2000)
    const { data: cycle } = await db.from('cycle').select('state, stock_retire_le').eq('id', tiers.cycleId).single()
    expect(cycle!.state).toBe('semaine')
    expect(cycle!.stock_retire_le, 'la date de retrait dirait que c’est fait').toBeNull()
    const { count } = await db.from('portion').select('id', { count: 'exact', head: true }).eq('cycle_id', tiers.cycleId)
    expect(count).toBeGreaterThan(0)
  })
})
