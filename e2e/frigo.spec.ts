/**
 * Le frigo américain, joué de bout en bout.
 *
 * On sème un foyer qui ressemble à celui de Kamil le 26/10 (des lasagnes et des pizzas au frigo, des burgers
 * et des wraps au congélateur, des burgers posés sur ce soir, des lasagnes posées sur demain et après-demain,
 * des yaourts sans valeurs), puis on ouvre chaque porte, on lit l'intérieur, on ouvre des fiches, on corrige
 * une date, on congèle, on sort, on mange, on photographie un plat — et à CHAQUE geste on RELIT LA BASE :
 * ce que l'écran affiche ne prouve rien de ce qui est écrit.
 *
 * Les captures (390 px) sont posées dans `CAPTURES`, à regarder à côté de la maquette `FrigoUS.dc.html`.
 * `PHOTO_LASAGNES` (un chemin, facultatif) pose une vraie photo sur les lasagnes ; sans elle, une image dessinée.
 */
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'

const CAPTURES = process.env.CAPTURES_FRIGO ?? '.shots/frigo'

test.use({ viewport: { width: 390, height: 844 } })
/* Les parcours se suivent : chacun part de ce que le précédent a laissé dans la base. */
test.describe.configure({ mode: 'serial' })

let foyer: Foyer
const recettes: Record<string, string> = {}
const MIN = 60_000
const JOUR_MS = 24 * 60 * MIN

const jourLocal = (decalage: number) => {
  const d = new Date(); d.setDate(d.getDate() + decalage)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** « 2026-10-26T21:26 » : ce que `datetime-local` attend, en heure locale. */
const pourLeChamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
/** Le repas en cours, comme `repasEnCours` du front. */
const repasEnCours = () => { const h = new Date().getHours(); return h < 10 ? 'petit_dejeuner' : h < 16 ? 'dejeuner' : 'diner' }

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

/** Une photo JPEG dessinée dans le navigateur : un fichier de test sans fichier dans le dépôt. */
async function unePhoto(page: Page, teinte: number): Promise<Buffer> {
  const url = await page.evaluate(t => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480
    const x = c.getContext('2d')!
    const g = x.createLinearGradient(0, 0, 640, 480)
    g.addColorStop(0, `hsl(${t} 70% 70%)`); g.addColorStop(1, `hsl(${t + 40} 60% 45%)`)
    x.fillStyle = g; x.fillRect(0, 0, 640, 480)
    x.fillStyle = 'rgba(255,255,255,.8)'; x.beginPath(); x.arc(320, 240, 130, 0, 7); x.fill()
    return c.toDataURL('image/jpeg', 0.85)
  }, teinte)
  return Buffer.from(url.split(',')[1], 'base64')
}

const portions = async () =>
  (await db.from('portion').select('*').eq('household_id', foyer.householdId).order('created_at')).data!
const parts = async (titre: string) => (await portions()).filter(p => p.label === titre)

test.beforeAll(async () => {
  foyer = await amorce({ cycleEtat: 'semaine', budget: false })
  const hh = foyer.householdId
  await db.from('meal_slot').delete().eq('household_id', hh)
  await db.from('portion').delete().eq('household_id', hh)
  await db.from('stock_item').delete().eq('household_id', hh)

  for (const titre of ['Lasagnes au saumon-poireaux', 'Pizza vietnamienne protéinée', 'Burger de feuilles de riz', 'Wrap']) {
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
  const lasagnes = await ajoute('Lasagnes au saumon-poireaux', 6, { grams: 784, kcal: 682, protein_g: 56, prepared_at: il(1) })
  await ajoute('Pizza vietnamienne protéinée', 2, { grams: 512, kcal: 595, protein_g: 54, prepared_at: il(2) })
  const burgers = await ajoute('Burger de feuilles de riz', 2, { grams: 259, kcal: 501, protein_g: 36, location: 'congelateur', prepared_at: il(1), frozen_at: il(1) })
  await ajoute('Wrap', 20, { grams: 120, kcal: 300, protein_g: 12, location: 'congelateur', prepared_at: il(1), frozen_at: il(1) })

  const qui = [foyer.userId, foyer.elleId]
  const pose = (decalage: number, meal: string, ids: string[]) => ids.map((id, i) => ({
    household_id: hh, user_profile_id: qui[i], day: jourLocal(decalage), meal, portion_id: id, state: 'prevu',
  }))
  const { error } = await db.from('meal_slot').insert([
    ...pose(0, 'diner', burgers.map(b => b.id)),
    ...pose(1, 'dejeuner', [lasagnes[0].id, lasagnes[1].id]),
    ...pose(1, 'diner', [lasagnes[2].id, lasagnes[3].id]),
    ...pose(2, 'dejeuner', [lasagnes[4].id, lasagnes[5].id]),
  ])
  expect(error, 'l’amorce a échoué : les repas ne sont pas posés').toBeNull()

  const { data: lait } = await db.from('food').select('id').eq('name', 'Lait écrémé, UHT').limit(1)
  const { data: poireau } = await db.from('food').select('id').eq('name', 'Poireau, cru').limit(1)
  await db.from('stock_item').insert([
    { household_id: hh, label: 'Yaourts dessert protéinés', quantity: 3, unit: 'pot', location: 'frigo' },
    { household_id: hh, label: 'Lait écrémé', food_id: lait?.[0]?.id, quantity: 1000, unit: 'ml', location: 'frigo' },
    { household_id: hh, label: 'Poireaux', food_id: poireau?.[0]?.id, quantity: 500, unit: 'g', location: 'frigo' },
    { household_id: hh, label: 'Tortillas', quantity: 20, location: 'placard' },
    { household_id: hh, label: 'Petits pois', quantity: 600, unit: 'g', location: 'congelateur', frozen_at: new Date().toISOString() },
  ])
})
test.afterAll(async () => {
  if (!foyer) return
  const { data: fichiers } = await db.storage.from('photos-des-plats').list(foyer.householdId)
  if (fichiers?.length) await db.storage.from('photos-des-plats').remove(fichiers.map(f => `${foyer.householdId}/${f.name}`))
  await db.from('recipe').delete().eq('owner_household_id', foyer.householdId)
  await efface(foyer)
})

const porteGauche = (page: Page) => page.getByRole('button', { name: 'Ouvrir le congélateur' })
const porteDroite = (page: Page) => page.getByRole('button', { name: 'Ouvrir le frigo' })
const fiche = (page: Page, nom: string) => page.getByRole('dialog', { name: nom })

test('le frigo fermé dit le dîner de ce soir et ce qui presse', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)

  /* Les lasagnes ont une photo : la nôtre, dans le seau, posée comme le fait la fiche. */
  const photo = process.env.PHOTO_LASAGNES ? readFileSync(process.env.PHOTO_LASAGNES) : await unePhoto(page, 30)
  const chemin = `${foyer.householdId}/${recettes['Lasagnes au saumon-poireaux']}-seme.jpg`
  const envoi = await db.storage.from('photos-des-plats').upload(chemin, photo, {
    contentType: process.env.PHOTO_LASAGNES ? 'image/webp' : 'image/jpeg',
  })
  expect(envoi.error, 'la photo des lasagnes n’est pas envoyée').toBeNull()
  await db.from('recipe').update({ image_url: db.storage.from('photos-des-plats').getPublicUrl(chemin).data.publicUrl })
    .eq('id', recettes['Lasagnes au saumon-poireaux'])

  await page.goto('/stock')
  await expect(page, '/stock doit mener au frigo').toHaveURL(/\/frigo$/, { timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Le frigo' })).toBeVisible()

  /* L'onglet de la barre du bas. */
  const onglet = page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Frigo' })
  await expect(onglet).toHaveAttribute('aria-current', 'page')

  /* Deux portes, de vrais boutons. */
  await expect(porteGauche(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(porteDroite(page)).toHaveAttribute('aria-expanded', 'false')

  /* L'afficheur : le dîner de ce soir pour MOI (les burgers). */
  const afficheur = page.locator('[data-afficheur]')
  await expect(afficheur).toContainText('Ce soir')
  await expect(afficheur).toContainText('Burger de feuilles de riz')
  /* Le magnet : des congelés posés sur ce soir passent avant le frigo qui presse. */
  await expect(page.locator('[data-magnet]')).toHaveText('Sors les 2 burgers : c’est ce soir')
  /* La photo de demain : celle des lasagnes. */
  await expect(page.locator('[data-polaroid] img')).toHaveAttribute('src', /photos-des-plats/)
  await capture(page, '01-frigo-ferme', true)

  /* Quelqu'un qui n'a rien de prévu ce soir le lit aussi. */
  await db.from('meal_slot').delete().eq('user_profile_id', foyer.userId).eq('day', jourLocal(0))
  await page.reload()
  await expect(page.locator('[data-afficheur]')).toContainText('Rien de prévu ce soir')
  await expect(page.locator('[data-afficheur]')).not.toContainText('Burger')
  /* … et le magnet reste : la part de Thauba est encore posée sur ce soir (1 burger). */
  await expect(page.locator('[data-magnet]')).toHaveText('Sors 1 burger : c’est ce soir')
  /* On remet le repas. */
  const burgers = await parts('Burger de feuilles de riz')
  const dejaPose = (await db.from('meal_slot').select('portion_id').eq('household_id', foyer.householdId).eq('day', jourLocal(0))).data!
  const libre = burgers.find(b => !dejaPose.some(s => s.portion_id === b.id))!
  await db.from('meal_slot').insert({
    household_id: foyer.householdId, user_profile_id: foyer.userId, day: jourLocal(0), meal: 'diner',
    portion_id: libre.id, state: 'prevu',
  })
})

test('le congélateur : la porte pivote, l’intérieur s’ouvre, on sort les burgers de ce soir', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/frigo')
  await expect(porteGauche(page)).toBeVisible({ timeout: 20_000 })

  await porteGauche(page).click()
  await expect(porteGauche(page)).toHaveAttribute('aria-expanded', 'true')
  /* La porte est en mouvement : on la regarde à mi-course. */
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${CAPTURES}/02-porte-en-mouvement.png` })
  const interieur = page.getByRole('region', { name: 'Dans le congélateur' })
  await expect(interieur).toBeVisible({ timeout: 5_000 })
  await expect(interieur.getByRole('heading', { name: 'Congélateur' })).toBeFocused()
  await expect(interieur).toContainText('22 parts')
  await expect(interieur.getByRole('button', { name: /^Burger de feuilles de riz, 2 parts, Ce soir : à sortir maintenant/ })).toBeVisible()
  await expect(interieur.getByRole('button', { name: /^Wrap, 20 parts/ })).toBeVisible()
  await expect(interieur.getByRole('region', { name: 'Tiroir du bas' })).toContainText('Petits pois')
  await capture(page, '03-congelateur')

  /* La fiche des burgers : ce soir, « sors-les maintenant ». */
  await interieur.getByRole('button', { name: /^Burger de feuilles de riz/ }).click()
  const f = fiche(page, 'Burger de feuilles de riz')
  await expect(f).toBeVisible()
  await expect(f.getByText('Au congélateur', { exact: true })).toBeVisible()
  await expect(f.getByRole('heading', { name: 'Prévues pour vous deux' })).toBeVisible()
  await expect(f.getByText('ce soir', { exact: true })).toBeVisible()
  await expect(f.getByText('C’est pour ce soir : sors-les maintenant, ou passe-les au micro-ondes avant de manger.')).toBeVisible()
  await expect(f.getByText('259 g, 501 kcal et 36 g de protéines la part')).toBeVisible()
  await capture(page, '04-fiche-congelee')

  /* « Congelés le » : on corrige la date, la péremption suit (+90 jours, comme le trigger). */
  const avant = await parts('Burger de feuilles de riz')
  const nouvelle = new Date(Date.now() - 5 * JOUR_MS); nouvelle.setSeconds(0, 0)
  await f.getByRole('button', { name: 'Modifier : Congelés le' }).click()
  await f.getByLabel('Congelés le').fill(pourLeChamp(nouvelle))
  await f.getByRole('button', { name: 'Enregistrer' }).click()
  await expect.poll(async () => (await parts('Burger de feuilles de riz'))[0].frozen_at.slice(0, 16), { timeout: 10_000 })
    .toBe(nouvelle.toISOString().slice(0, 16))
  for (const p of await parts('Burger de feuilles de riz')) {
    expect(new Date(p.frozen_at).getTime()).toBe(nouvelle.getTime())
    const attendu = new Date(nouvelle); attendu.setDate(attendu.getDate() + 90)
    expect(new Date(p.expires_at).getTime(), 'la péremption ne suit pas la date de congélation').toBe(attendu.getTime())
    expect(p.location).toBe('congelateur')
  }
  expect(avant).toHaveLength(2)

  /* Une date dans le futur est refusée, en toutes lettres. */
  await f.getByRole('button', { name: 'Modifier : Congelés le' }).click()
  await f.getByLabel('Congelés le').fill(pourLeChamp(new Date(Date.now() + 3 * JOUR_MS)))
  await f.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(f.getByRole('alert')).toContainText('Pas dans le futur')
  await f.getByRole('button', { name: 'Annuler' }).click()

  /* « Je les sors du congélateur » : les deux sont posés sur ce soir, donc les deux sortent sans question. */
  await f.getByRole('button', { name: 'Je les sors du congélateur' }).click()
  await expect(f).toBeHidden({ timeout: 10_000 })
  await expect.poll(async () => (await parts('Burger de feuilles de riz')).map(p => `${p.location}/${p.state}`).join(), { timeout: 10_000 })
    .toBe('frigo/decongelee,frigo/decongelee')
  for (const p of await parts('Burger de feuilles de riz')) {
    const reste = new Date(p.expires_at).getTime() - Date.now()
    expect(reste, 'une part décongelée se mange dans les 24 h').toBeGreaterThan(22 * 60 * MIN)
    expect(reste).toBeLessThan(25 * 60 * MIN)
    expect(p.frozen_at).toBeNull()
  }
  await expect(interieur.getByRole('status')).toContainText('2 parts sorties du congélateur')
  await expect(interieur.getByRole('button', { name: /^Burger de feuilles de riz/ })).toHaveCount(0)

  /* « Fermer la porte » : le focus revient à la porte. */
  await interieur.getByRole('button', { name: 'Fermer la porte' }).click()
  await expect(interieur).toBeHidden()
  await expect(porteGauche(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(porteGauche(page)).toBeFocused({ timeout: 5_000 })
  /* Plus rien de congelé pour ce soir : le magnet passe au frigo qui presse. */
  await expect(page.locator('[data-magnet]')).toContainText('pizzas à prévoir avant')
})

test('le frigo : les plats, les étagères, une photo, congeler, corriger une date, en manger une', async ({ page }) => {
  test.setTimeout(180_000)
  await connecte(page)
  await page.goto('/frigo')
  await porteDroite(page).click()
  const interieur = page.getByRole('region', { name: 'Dans le frigo' })
  await expect(interieur).toBeVisible({ timeout: 5_000 })
  await expect(interieur.getByRole('heading', { name: 'Frigo' })).toBeFocused()
  await expect(interieur.getByRole('button', { name: /^Lasagnes saumon-poireaux, 6 parts, \w+\. midi → \w+\. midi/ })).toBeVisible()
  await expect(interieur.getByRole('button', { name: /^Pizza vietnamienne, 2 parts/ })).toBeVisible()
  await expect(interieur.getByRole('region', { name: 'Laitages et frais' })).toContainText('Yaourts dessert protéinés')
  await expect(interieur.getByRole('region', { name: 'Laitages et frais' })).toContainText('Lait écrémé')
  await expect(interieur.getByRole('region', { name: 'Bac à légumes' })).toContainText('Poireaux')
  await capture(page, '05-frigo-interieur')

  /* ── Une photo pour la pizza (sa recette est la nôtre, sans photo) ──────── */
  await interieur.getByRole('button', { name: /^Pizza vietnamienne, 2 parts/ }).click()
  const pizza = fiche(page, 'Pizza vietnamienne protéinée')
  await expect(pizza.getByText('Prendre le plat en photo')).toBeVisible()
  await capture(page, '06-fiche-sans-photo')
  const image = await unePhoto(page, 200)
  await pizza.locator('input[type=file]').setInputFiles({ name: 'pizza.jpg', mimeType: 'image/jpeg', buffer: image })
  await expect.poll(async () =>
    (await db.from('recipe').select('image_url').eq('id', recettes['Pizza vietnamienne protéinée']).single()).data!.image_url,
  { timeout: 20_000 }).toMatch(new RegExp(`/storage/v1/object/public/photos-des-plats/${foyer.householdId}/${recettes['Pizza vietnamienne protéinée']}-\\d+\\.jpg$`))
  const { image_url: url } = (await db.from('recipe').select('image_url').eq('id', recettes['Pizza vietnamienne protéinée']).single()).data!
  const lue = await fetch(url!)
  expect(lue.status, 'la photo n’est pas lisible à son adresse publique').toBe(200)
  expect(lue.headers.get('content-type')).toContain('image/jpeg')
  await expect(pizza.getByText('Prendre le plat en photo')).toHaveCount(0)
  await expect(pizza.getByText('Changer la photo')).toBeVisible()
  await expect(pizza.locator('img')).toHaveAttribute('src', url!)

  /* ── Congeler UNE des deux pizzas : on demande combien ──────────────────── */
  await pizza.getByRole('button', { name: 'Congeler', exact: true }).click()
  const combien = pizza.getByRole('group', { name: 'Combien tu en congèles ?' })
  await expect(combien).toBeVisible()
  await combien.getByRole('button', { name: 'Une de moins' }).click()
  await combien.getByRole('button', { name: 'Congeler 1' }).click()
  await expect.poll(async () => (await parts('Pizza vietnamienne protéinée')).filter(p => p.location === 'congelateur').length, { timeout: 10_000 }).toBe(1)
  const pizzas = await parts('Pizza vietnamienne protéinée')
  const congelee = pizzas.find(p => p.location === 'congelateur')!
  expect(pizzas.find(p => p.location === 'frigo'), 'l’autre pizza doit rester au frigo').toBeTruthy()
  expect(congelee.frozen_at).not.toBeNull()
  expect(new Date(congelee.expires_at).getTime() - Date.now(), 'trois mois').toBeGreaterThan(89 * JOUR_MS)
  await expect(pizza.getByText('1', { exact: true }).first()).toBeVisible()
  await pizza.press('Escape')
  await expect(pizza).toBeHidden()
  await expect(interieur.getByRole('button', { name: /^Pizza vietnamienne, 1 part/ })).toBeVisible()

  /* ── Corriger « Au frigo depuis » des lasagnes : la péremption suit (+4 jours) ─ */
  await interieur.getByRole('button', { name: /^Lasagnes saumon-poireaux/ }).click()
  const lasagnes = fiche(page, 'Lasagnes au saumon-poireaux')
  await expect(lasagnes.getByRole('heading', { name: 'Prévues pour vous deux' })).toBeVisible()
  await expect(lasagnes.getByText(/^(lun|mar|mer|jeu|ven|sam|dim)\. midi$/).first()).toBeVisible()
  await capture(page, '07-fiche-lasagnes')
  const depart = new Date(Date.now() - 2 * JOUR_MS); depart.setSeconds(0, 0)
  await lasagnes.getByRole('button', { name: 'Modifier : Au frigo depuis' }).click()
  await lasagnes.getByLabel('Au frigo depuis').fill(pourLeChamp(depart))
  await lasagnes.getByRole('button', { name: 'Enregistrer' }).click()
  await expect.poll(async () => new Date((await parts('Lasagnes au saumon-poireaux'))[0].prepared_at).getTime(), { timeout: 10_000 })
    .toBe(depart.getTime())
  for (const p of await parts('Lasagnes au saumon-poireaux')) {
    const attendu = new Date(depart); attendu.setDate(attendu.getDate() + 4)
    expect(new Date(p.prepared_at).getTime()).toBe(depart.getTime())
    expect(new Date(p.expires_at).getTime(), 'la péremption ne suit pas « Au frigo depuis »').toBe(attendu.getTime())
  }
  /* « À manger avant » corrigée à la main : elle prime, sans recalcul. */
  const fin = jourLocal(6)
  await lasagnes.getByRole('button', { name: 'Modifier : À manger avant' }).click()
  await lasagnes.getByLabel('À manger avant').fill(fin)
  await lasagnes.getByRole('button', { name: 'Enregistrer' }).click()
  await expect.poll(async () => new Date((await parts('Lasagnes au saumon-poireaux'))[0].expires_at).getTime(), { timeout: 10_000 })
    .toBe(new Date(`${fin}T23:59:00`).getTime())
  for (const p of await parts('Lasagnes au saumon-poireaux')) {
    expect(new Date(p.expires_at).getTime()).toBe(new Date(`${fin}T23:59:00`).getTime())
    expect(new Date(p.prepared_at).getTime(), '« Au frigo depuis » ne doit pas bouger').toBe(depart.getTime())
  }

  /* ── « En manger une maintenant » : ma case du repas en cours, mangée ───── */
  await lasagnes.getByRole('button', { name: 'En manger une maintenant' }).click()
  const repas = repasEnCours()
  await expect.poll(async () => (await db.from('meal_slot').select('state, eaten_at, portion_id')
    .eq('user_profile_id', foyer.userId).eq('day', jourLocal(0)).eq('meal', repas).maybeSingle()).data?.state,
  { timeout: 10_000 }).toBe('mange')
  const case_ = (await db.from('meal_slot').select('state, eaten_at, portion_id')
    .eq('user_profile_id', foyer.userId).eq('day', jourLocal(0)).eq('meal', repas).single()).data!
  expect(case_.eaten_at).not.toBeNull()
  const mangee = (await portions()).find(p => p.id === case_.portion_id)!
  expect(mangee.label).toBe('Lasagnes au saumon-poireaux')
  expect(mangee.state, 'la part mangée doit être consommée (trigger)').toBe('mangee')
  /* Les six étaient posées : celle qu'on mange vient d'un repas qui la perd. */
  const encore = (await parts('Lasagnes au saumon-poireaux')).filter(p => p.state === 'au_frais')
  expect(encore).toHaveLength(5)
  await expect(lasagnes.getByRole('status')).toContainText('mangée')
  await lasagnes.press('Escape')
  await expect(lasagnes).toBeHidden()
  await expect(interieur.getByRole('button', { name: /^Lasagnes saumon-poireaux, 5 parts/ })).toBeVisible()

  /* ── Jeter : un seul geste quand il n'en reste qu'une, un choix sinon ───── */
  await interieur.getByRole('button', { name: /^Pizza vietnamienne, 1 part/ }).click()
  const seule = fiche(page, 'Pizza vietnamienne protéinée')
  await seule.getByRole('button', { name: 'Jeter', exact: true }).click()
  await expect.poll(async () => (await parts('Pizza vietnamienne protéinée')).map(p => `${p.location}/${p.state}`).sort().join(), { timeout: 10_000 })
    .toBe('congelateur/au_frais,frigo/jetee'.split(',').sort().join())
})

test('les ingrédients : quantité, lieu, date, « Fini » — et le placard', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/frigo')
  await porteDroite(page).click()
  const interieur = page.getByRole('region', { name: 'Dans le frigo' })
  await expect(interieur).toBeVisible({ timeout: 5_000 })

  await interieur.getByRole('button', { name: /Yaourts dessert protéinés/ }).click()
  const f = fiche(page, 'Yaourts dessert protéinés')
  await expect(f.getByText('Au frigo', { exact: true })).toBeVisible()
  await capture(page, '08-fiche-ingredient')

  /* La quantité. */
  await f.getByLabel('Ce qu’il en reste').fill('2')
  await f.getByRole('button', { name: 'Enregistrer', exact: true }).first().click()
  await expect.poll(async () => Number((await db.from('stock_item').select('quantity').eq('household_id', foyer.householdId).eq('label', 'Yaourts dessert protéinés').single()).data!.quantity), { timeout: 10_000 }).toBe(2)
  /* Le lieu : au placard. */
  await f.getByRole('radio', { name: 'Placard' }).click()
  await expect.poll(async () => (await db.from('stock_item').select('location, frozen_at').eq('household_id', foyer.householdId).eq('label', 'Yaourts dessert protéinés').single()).data!.location, { timeout: 10_000 }).toBe('placard')
  /* Le congélateur pose la date de mise au froid (contrainte `stock_item_congele_date`). */
  await f.getByRole('radio', { name: 'Congélateur' }).click()
  await expect.poll(async () => (await db.from('stock_item').select('location, frozen_at').eq('household_id', foyer.householdId).eq('label', 'Yaourts dessert protéinés').single()).data!.frozen_at, { timeout: 10_000 }).not.toBeNull()
  await f.getByRole('radio', { name: 'Frigo' }).click()
  await expect.poll(async () => (await db.from('stock_item').select('location, frozen_at').eq('household_id', foyer.householdId).eq('label', 'Yaourts dessert protéinés').single()).data!.frozen_at, { timeout: 10_000 }).toBeNull()
  /* Une date limite : le mot d'urgence apparaît. */
  await f.getByRole('button', { name: 'Modifier : À manger avant' }).click()
  await f.getByLabel('À manger avant').fill(jourLocal(1))
  await f.getByRole('button', { name: 'Enregistrer' }).last().click()
  await expect.poll(async () => (await db.from('stock_item').select('expires_at').eq('household_id', foyer.householdId).eq('label', 'Yaourts dessert protéinés').single()).data!.expires_at, { timeout: 10_000 }).not.toBeNull()
  await expect(f.getByText(/demain dernier délai|aujourd'hui/)).toBeVisible()
  /* « Fini » retire la ligne. */
  await f.getByRole('button', { name: 'Fini', exact: true }).click()
  await expect(f).toBeHidden({ timeout: 10_000 })
  expect((await db.from('stock_item').select('id').eq('household_id', foyer.householdId).eq('label', 'Yaourts dessert protéinés')).data).toHaveLength(0)
  await expect(interieur.getByRole('button', { name: /Yaourts dessert protéinés/ })).toHaveCount(0)

  /* « + Ajouter au frigo » : le formulaire d'avant, dans une feuille. */
  await interieur.getByRole('button', { name: '+ Ajouter au frigo' }).click()
  const ajout = page.getByRole('dialog', { name: 'Ajouter au frigo' })
  await expect(ajout).toBeVisible()
  await capture(page, '09-ajouter-au-frigo')
  await ajout.press('Escape')
  await expect(ajout).toBeHidden()

  /* Le placard : une liste. */
  await interieur.getByRole('button', { name: 'Fermer la porte' }).click()
  await page.getByRole('button', { name: 'Le placard' }).click()
  const placard = page.getByRole('dialog', { name: 'Le placard' })
  await expect(placard).toContainText('Tortillas')
})

test('l’accueil montre le petit frigo, les parts, le repas de ce soir et demain', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  /* On remet des burgers congelés posés sur ce soir : le repas du jour dit quoi faire avant. */
  const hh = foyer.householdId
  await db.from('meal_slot').delete().eq('household_id', hh).eq('day', jourLocal(0))
  const { data: nouveaux } = await db.from('portion').insert(Array.from({ length: 2 }, () => ({
    household_id: hh, recipe_id: recettes['Burger de feuilles de riz'], label: 'Burger de feuilles de riz',
    grams: 259, kcal: 501, protein_g: 36, fiber_g: 4, carb_g: 40, fat_g: 20,
    location: 'congelateur', frozen_at: new Date().toISOString(),
  }))).select()
  await db.from('meal_slot').insert([foyer.userId, foyer.elleId].map((u, i) => ({
    household_id: hh, user_profile_id: u, day: jourLocal(0), meal: 'diner', portion_id: nouveaux![i].id, state: 'prevu',
  })))

  await page.goto('/cuisine-accueil')
  const frigo = page.getByRole('region', { name: 'Le frigo' })
  await expect(frigo).toBeVisible({ timeout: 20_000 })
  /* Les chiffres sont ceux de la base. */
  const actives = (await portions()).filter(p => p.state === 'au_frais' || p.state === 'decongelee')
  await expect(frigo.locator('[data-compte=frigo]')).toHaveText(String(actives.filter(p => p.location === 'frigo').length))
  await expect(frigo.locator('[data-compte=congelateur]')).toHaveText(String(actives.filter(p => p.location === 'congelateur').length))

  const carte = page.getByRole('region', { name: 'Le prochain repas' })
  await expect(carte).toContainText('Ce soir, pour vous deux')
  await expect(carte).toContainText('Burger de feuilles de riz')
  await expect(carte).toContainText('Il est au congélateur : sors-le maintenant')
  await expect(page.getByRole('region', { name: 'Demain' })).toContainText('Demain, midi et soir')
  await expect(page.getByRole('region', { name: 'Demain' })).toContainText('Lasagnes saumon-poireaux')
  await capture(page, '10-accueil', true)

  /* « Je les sors » : les deux burgers de ce soir passent au frigo, décongelés ; la carte propose alors de les manger. */
  await carte.getByRole('button', { name: 'Je les sors' }).click()
  await expect.poll(async () => (await db.from('portion').select('location, state').in('id', nouveaux!.map(n => n.id))).data!.map(p => `${p.location}/${p.state}`).join(), { timeout: 10_000 })
    .toBe('frigo/decongelee,frigo/decongelee')
  await expect(carte.getByRole('button', { name: 'Je l’ai mangé' })).toBeVisible()
  await expect(carte).not.toContainText('Il est au congélateur')

  /* « Je l'ai mangé » : MA case, et la part est consommée. */
  await carte.getByRole('button', { name: 'Je l’ai mangé' }).click()
  await expect.poll(async () => (await db.from('meal_slot').select('state').eq('user_profile_id', foyer.userId).eq('day', jourLocal(0)).eq('meal', 'diner').single()).data!.state, { timeout: 10_000 }).toBe('mange')
  expect((await db.from('portion').select('state').eq('id', nouveaux![0].id).single()).data!.state).toBe('mangee')

  /* Le lien vers le frigo. */
  await frigo.getByRole('button', { name: 'Ouvrir le frigo' }).click()
  await expect(page).toHaveURL(/\/frigo$/)
  /* « La semaine » mène à la semaine. */
  await page.goto('/cuisine-accueil')
  await page.getByRole('region', { name: 'Demain' }).getByRole('button', { name: 'La semaine' }).click()
  await expect(page).toHaveURL(/\/semaine$/)
})

test('rien ne dépasse la largeur de l’écran, et « prefers-reduced-motion » ne bouge rien', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await connecte(page)
  await page.goto('/frigo')
  await expect(porteDroite(page)).toBeVisible({ timeout: 20_000 })
  const largeur = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(largeur, 'la page déborde en largeur').toBeLessThanOrEqual(390)
  await porteDroite(page).click()
  /* Sans animation : l'intérieur est là tout de suite. */
  await expect(page.getByRole('region', { name: 'Dans le frigo' })).toBeVisible({ timeout: 1_500 })
  await ctx.close()
})
