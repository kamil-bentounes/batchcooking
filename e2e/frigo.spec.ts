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
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
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

/** Les cibles de moins de 44 px visibles sur l'écran : un pouce doit les trouver. */
const ciblesPetites = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>('button, a[href], [role=radio], input[type=checkbox]')]
    .filter(c => getComputedStyle(c).visibility !== 'hidden' && !c.closest('[inert]'))
    .map(c => ({ c, r: c.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44))
    .map(({ c, r }) => `${(c.getAttribute('aria-label') || c.textContent || '?').trim().slice(0, 30)} ${Math.round(r.width)}×${Math.round(r.height)}`))

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
  await expect(page.locator('[data-magnet]')).toHaveText('Sors les 2 barquettes de burger de feuilles de riz : c’est ce soir')
  /* La photo de demain : celle des lasagnes. */
  await expect(page.locator('[data-polaroid] img')).toHaveAttribute('src', /photos-des-plats/)
  await capture(page, '01-frigo-ferme', true)

  /* Quelqu'un qui n'a rien de prévu ce soir le lit aussi. */
  await db.from('meal_slot').delete().eq('user_profile_id', foyer.userId).eq('day', jourLocal(0))
  await page.reload()
  await expect(page.locator('[data-afficheur]')).toContainText('Rien de prévu ce soir')
  await expect(page.locator('[data-afficheur]')).not.toContainText('Burger')
  /* … et le magnet reste : la part de Thauba est encore posée sur ce soir (1 burger). */
  await expect(page.locator('[data-magnet]')).toHaveText('Sors la barquette de burger de feuilles de riz : c’est ce soir')
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
  expect(await ciblesPetites(page), 'des cibles de moins de 44 px dans le congélateur').toEqual([])

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
  expect(await ciblesPetites(page), 'des cibles de moins de 44 px dans la fiche').toEqual([])

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
    const attendu = new Date(nouvelle.getTime() + 90 * 86_400_000) // la base : 90 × 24 h, comme le front (plusDeJours)
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
  await expect(page.locator('[data-magnet]')).toContainText('barquettes de pizza vietnamienne à prévoir avant')
})

test('le frigo : les plats, les étagères, une photo, congeler, corriger une date, en manger une', async ({ page }) => {
  test.setTimeout(180_000)
  await connecte(page)
  await page.goto('/frigo')
  await porteDroite(page).click()
  const interieur = page.getByRole('region', { name: 'Dans le frigo' })
  await expect(interieur).toBeVisible({ timeout: 5_000 })
  await expect(interieur.getByRole('heading', { name: 'Frigo' })).toBeFocused()
  await expect(interieur.getByRole('button', { name: /^Lasagnes saumon-poireaux, 6 parts, \w+\. midi à \w+\. midi/ })).toBeVisible()
  await expect(interieur.getByRole('button', { name: /^Pizza vietnamienne, 2 parts/ })).toBeVisible()
  await expect(interieur.getByRole('region', { name: 'Laitages et frais' })).toContainText('Yaourts dessert protéinés')
  /* « 3 pot » : l'unité s'accorde avec la quantité. */
  await expect(interieur.getByRole('button', { name: /Yaourts dessert protéinés/ })).toContainText('3 pots')
  await expect(interieur.getByRole('region', { name: 'Laitages et frais' })).toContainText('Lait écrémé')
  await expect(interieur.getByRole('region', { name: 'Bac à légumes' })).toContainText('Poireaux')
  await capture(page, '05-frigo-interieur')
  expect(await ciblesPetites(page), 'des cibles de moins de 44 px dans le frigo').toEqual([])

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
  expect(await ciblesPetites(page), 'des cibles de moins de 44 px dans la fiche').toEqual([])
  const depart = new Date(Date.now() - 2 * JOUR_MS); depart.setSeconds(0, 0)
  await lasagnes.getByRole('button', { name: 'Modifier : Au frigo depuis' }).click()
  await lasagnes.getByLabel('Au frigo depuis').fill(pourLeChamp(depart))
  await lasagnes.getByRole('button', { name: 'Enregistrer' }).click()
  await expect.poll(async () => new Date((await parts('Lasagnes au saumon-poireaux'))[0].prepared_at).getTime(), { timeout: 10_000 })
    .toBe(depart.getTime())
  for (const p of await parts('Lasagnes au saumon-poireaux')) {
    const attendu = new Date(depart.getTime() + 4 * 86_400_000) // la base : 4 × 24 h
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
  await expect(f.getByText('pots', { exact: true }), 'l’unité de la fiche s’accorde avec « 3 »').toBeVisible()
  await capture(page, '08-fiche-ingredient')
  expect(await ciblesPetites(page), 'des cibles de moins de 44 px dans la fiche').toEqual([])

  /* La quantité. */
  await f.getByLabel('Ce qu’il en reste').fill('2')
  await f.getByRole('button', { name: 'Enregistrer', exact: true }).first().click()
  await expect.poll(async () => Number((await db.from('stock_item').select('quantity').eq('household_id', foyer.householdId).eq('label', 'Yaourts dessert protéinés').single()).data!.quantity), { timeout: 10_000 }).toBe(2)
  await expect(f.getByText('pots', { exact: true })).toBeVisible()
  await f.getByLabel('Ce qu’il en reste').fill('1')
  await expect(f.getByText('pot', { exact: true }), 'un seul : au singulier').toBeVisible()
  await f.getByLabel('Ce qu’il en reste').fill('2')
  /* Le lieu : au placard. */
  await f.getByRole('radio', { name: 'Placard' }).click()
  await expect.poll(async () => (await db.from('stock_item').select('location, frozen_at').eq('household_id', foyer.householdId).eq('label', 'Yaourts dessert protéinés').single()).data!.location, { timeout: 10_000 }).toBe('placard')
  /* Le congélateur pose la date de mise au froid (contrainte `stock_item_congele_date`). */
  await f.getByRole('radio', { name: 'Congélateur' }).click()
  await expect.poll(async () => (await db.from('stock_item').select('location, frozen_at').eq('household_id', foyer.householdId).eq('label', 'Yaourts dessert protéinés').single()).data!.frozen_at, { timeout: 10_000 }).not.toBeNull()
  /* L9 : sa péremption suit le lieu, comme celle d'une barquette — trois mois au congélateur… */
  const ligne = async () => (await db.from('stock_item').select('location, frozen_at, expires_at').eq('household_id', foyer.householdId).eq('label', 'Yaourts dessert protéinés').single()).data!
  await expect.poll(async () => new Date((await ligne()).expires_at ?? 0).getTime() - Date.now(), { timeout: 10_000 }).toBeGreaterThan(89 * JOUR_MS)
  await f.getByRole('radio', { name: 'Frigo' }).click()
  await expect.poll(async () => (await ligne()).frozen_at, { timeout: 10_000 }).toBeNull()
  /* … et vingt-quatre heures à la sortie. */
  const reste = new Date((await ligne()).expires_at!).getTime() - Date.now()
  expect(reste, 'un ingrédient décongelé se mange dans les 24 h').toBeGreaterThan(22 * 60 * MIN)
  expect(reste).toBeLessThan(25 * 60 * MIN)
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
  await expect(carte).toContainText('Il est au congélateur : sors-les maintenant')
  await expect(page.getByRole('region', { name: 'Demain' })).toContainText('Demain, midi et soir')
  await expect(page.getByRole('region', { name: 'Demain' })).toContainText('Lasagnes saumon-poireaux')
  /* M9 : pendant la semaine, la carte de ce soir est LE geste de la page, et son titre l'unique <h1>. */
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toHaveText('Burger de feuilles de riz')
  await capture(page, '10-accueil', true)

  /* « Je les sors » : les deux burgers de ce soir passent au frigo, décongelés ; la carte propose alors de les manger. */
  await carte.getByRole('button', { name: 'Je les sors' }).click()
  await expect.poll(async () => (await db.from('portion').select('location, state').in('id', nouveaux!.map(n => n.id))).data!.map(p => `${p.location}/${p.state}`).join(), { timeout: 10_000 })
    .toBe('frigo/decongelee,frigo/decongelee')
  await expect(carte.getByRole('button', { name: 'Je l’ai mangé' })).toBeVisible()
  await expect(carte).not.toContainText('Il est au congélateur')
  /* Les deux burgers, décongelés, se mangent aujourd'hui : « À manger bientôt » les compte sur UNE ligne. */
  const presses = page.getByRole('region', { name: 'À manger bientôt' })
  await expect(presses.getByText('Burger de feuilles de riz', { exact: false })).toHaveCount(1)
  await expect(presses).toContainText(/Burger de feuilles de riz · \d+ barquettes/)

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
  await expect(page).toHaveURL(/\/semaine\?jour=/)
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

/* ═══════════════════════════════════════════════════════════════════════════
 * La revue du frigo (chantier 2) : chaque défaut trouvé a son parcours ici.
 * Chaque test sème SES plats (un nom à lui) et les retire à la fin : les parcours d'au-dessus comptent les
 * barquettes du foyer.
 * ═════════════════════════════════════════════════════════════════════════ */

const MOI = () => foyer.userId
const ELLE = () => foyer.elleId
const ordre = ['petit_dejeuner', 'dejeuner', 'collation', 'diner']

/** Une recette (à nous, sans photo) et ses barquettes, au frigo ou au congélateur. */
async function seme(titre: string, specs: {
  pour?: string | null; expire?: number; grams?: number; kcal?: number; protein_g?: number
  location?: 'frigo' | 'congelateur'; expiresAt?: Date; state?: string
}[]) {
  const hh = foyer.householdId
  const { data: recette } = await db.from('recipe').insert({
    title: titre, yield_servings: 4, origin: 'manuelle', owner_household_id: hh,
  }).select().single()
  const { data, error } = await db.from('portion').insert(specs.map(o => ({
    household_id: hh, recipe_id: recette!.id, label: titre, grams: o.grams ?? 500, kcal: o.kcal ?? 600,
    protein_g: o.protein_g ?? 40, fiber_g: 5, carb_g: 60, fat_g: 20, for_user_id: o.pour ?? null,
    location: o.location ?? 'frigo', state: o.state ?? 'au_frais',
    prepared_at: new Date(Date.now() - 86_400_000).toISOString(),
    ...(o.location === 'congelateur' ? { frozen_at: new Date(Date.now() - 86_400_000).toISOString() } : {}),
    expires_at: (o.expiresAt ?? new Date(Date.now() + (o.expire ?? 2) * JOUR_MS)).toISOString(),
  }))).select()
  expect(error, `la semence de « ${titre} » a échoué`).toBeNull()
  return { recette: recette!.id as string, parts: data! }
}
const pose = async (portionId: string, qui: string, decalage: number, meal: string) => {
  /* Une case est unique par personne, jour et repas : celle qui y est (les parcours d'au-dessus) lâche sa place. */
  await db.from('meal_slot').delete().eq('household_id', foyer.householdId).eq('user_profile_id', qui)
    .eq('day', jourLocal(decalage)).eq('meal', meal)
  const { error } = await db.from('meal_slot').insert({
    household_id: foyer.householdId, user_profile_id: qui, day: jourLocal(decalage), meal, portion_id: portionId, state: 'prevu',
  })
  expect(error).toBeNull()
}
async function retire(...titres: string[]) {
  const hh = foyer.householdId
  const { data: ps } = await db.from('portion').select('id').eq('household_id', hh).in('label', titres)
  const ids = (ps ?? []).map(p => p.id)
  if (ids.length) {
    await db.from('meal_slot').delete().in('portion_id', ids)
    await db.from('portion').delete().in('id', ids)
  }
  await db.from('recipe').delete().eq('owner_household_id', hh).in('title', titres)
}
const ouvreLe = async (page: Page, porte: 'frigo' | 'congelo') => {
  await (porte === 'frigo' ? porteDroite(page) : porteGauche(page)).click()
  const interieur = page.getByRole('region', { name: porte === 'frigo' ? 'Dans le frigo' : 'Dans le congélateur' })
  await expect(interieur).toBeVisible({ timeout: 5_000 })
  return interieur
}

test('H1 · la fiche montre la part de chacun, et « En manger une maintenant » prend LA MIENNE', async ({ page }) => {
  test.setTimeout(120_000)
  const t = 'Chili de la revue'
  /* La part de Thauba est la plus pressée, puis la mienne : l'ordre de péremption ne doit pas décider. */
  const { parts: ps } = await seme(t, [
    { pour: ELLE(), expire: 1, grams: 610, kcal: 530, protein_g: 44 },
    { pour: MOI(), expire: 3, grams: 784, kcal: 682, protein_g: 56 },
    { pour: MOI(), expire: 4, grams: 784, kcal: 682, protein_g: 56 },
  ])
  await db.from('meal_slot').delete().eq('user_profile_id', MOI()).eq('day', jourLocal(0)).eq('meal', repasEnCours())
  try {
    await connecte(page)
    await page.goto('/frigo')
    const interieur = await ouvreLe(page, 'frigo')
    await interieur.getByRole('button', { name: new RegExp(`^${t}`) }).click()
    const f = fiche(page, t)
    await expect(f).toBeVisible()
    /* Pas de moyenne qui ne correspond à aucune part : une ligne par personne. */
    await expect(f.getByText('Kamil : 784 g, 682 kcal, 56 g de protéines')).toBeVisible()
    await expect(f.getByText('Thauba : 610 g, 530 kcal, 44 g de protéines')).toBeVisible()
    await expect(f.getByText(/la part$/)).toHaveCount(0)
    await capture(page, '11-fiche-par-personne')
    await page.setViewportSize({ width: 320, height: 700 })
    await capture(page, '11-fiche-par-personne-320')
    await page.setViewportSize({ width: 390, height: 844 })

    await f.getByRole('button', { name: 'En manger une maintenant' }).click()
    await expect(f.getByRole('status')).toContainText('mangée')
    const ma = (await db.from('meal_slot').select('portion_id, state')
      .eq('user_profile_id', MOI()).eq('day', jourLocal(0)).eq('meal', repasEnCours()).single()).data!
    expect(ma.state).toBe('mange')
    const mangee = ps.find(p => p.id === ma.portion_id)!
    expect(mangee.for_user_id, 'Kamil a mangé la part de Thauba (ses calories, pas les siennes)').toBe(MOI())
    expect((await db.from('portion').select('state').eq('id', ma.portion_id!).single()).data!.state).toBe('mangee')

    /* Un repas déjà noté mangé n'est pas écrasé : on le dit. */
    await f.getByRole('button', { name: 'En manger une maintenant' }).click()
    await expect(f.getByRole('alert')).toContainText('déjà noté mangé')

    /* L8 : une photo que le navigateur ne lit pas (HEIC…) se dit en français. */
    await f.locator('input[type=file]').setInputFiles({ name: 'plat.heic', mimeType: 'image/heic', buffer: Buffer.from('pas une image') })
    await expect(f.getByRole('alert')).toContainText('ne se lit pas', { timeout: 10_000 })
    await expect(f.getByRole('alert')).not.toContainText(/decoded|InvalidState|Failed/i)
  } finally { await retire(t) }
})

test('H2, H3, M8 · jeter lâche le repas, retirer supprime sans compter, et on dit quel repas n’a plus de barquette', async ({ page }) => {
  test.setTimeout(120_000)
  const t = 'Cassoulet de la revue'
  const { parts: ps } = await seme(t, [{ expire: 3 }, { expire: 3 }])
  await pose(ps[0].id, ELLE(), 1, 'diner')
  await pose(ps[1].id, MOI(), 2, 'dejeuner')
  try {
    await connecte(page)
    await page.goto('/frigo')
    const interieur = await ouvreLe(page, 'frigo')
    await interieur.getByRole('button', { name: new RegExp(`^${t}`) }).click()
    const f = fiche(page, t)
    await expect(f.getByRole('button', { name: 'Retirer du frigo' })).toBeVisible()
    await expect(f.getByText('ni mangée ni jetée')).toBeVisible()

    /* Jeter UNE part (les deux sont réclamées : celle du repas le plus tardif part). */
    await f.getByRole('button', { name: 'Jeter', exact: true }).click()
    const combien = f.getByRole('group', { name: 'Combien tu en jettes ?' })
    await combien.getByRole('button', { name: 'Une de moins' }).click()
    await combien.getByRole('button', { name: 'Jeter 1' }).click()
    await expect.poll(async () => (await db.from('portion').select('state').eq('id', ps[1].id).single()).data!.state, { timeout: 10_000 }).toBe('jetee')
    /* La case du repas ne reste pas pointée sur une part jetée… */
    expect((await db.from('meal_slot').select('portion_id').eq('household_id', foyer.householdId).eq('user_profile_id', MOI()).eq('day', jourLocal(2)).eq('meal', 'dejeuner').single()).data!.portion_id).toBeNull()
    /* … et l'autre repas garde la sienne. */
    expect((await db.from('meal_slot').select('portion_id').eq('household_id', foyer.householdId).eq('user_profile_id', ELLE()).eq('day', jourLocal(1)).eq('meal', 'diner').single()).data!.portion_id).toBe(ps[0].id)
    await expect(f.getByRole('status')).toContainText('1 part jetée')
    await expect(f.getByRole('status')).toContainText('n’a plus de barquette')

    /* Retirer la dernière : ni mangée ni jetée. */
    await f.getByRole('button', { name: 'Retirer du frigo' }).click()
    await expect.poll(async () => (await db.from('portion').select('id').eq('id', ps[0].id)).data!.length, { timeout: 10_000 }).toBe(0)
    expect((await db.from('portion_event').select('kind').eq('portion_id', ps[0].id)).data, 'retirer ne compte pas comme jeté').toEqual([])
    expect((await db.from('meal_slot').select('portion_id').eq('household_id', foyer.householdId).eq('user_profile_id', ELLE()).eq('day', jourLocal(1)).eq('meal', 'diner').single()).data!.portion_id).toBeNull()
    await expect(interieur.getByRole('status')).toContainText('retirée du frigo')
    await expect(interieur.getByRole('button', { name: new RegExp(`^${t}`) })).toHaveCount(0)
  } finally { await retire(t) }
})

test('M1 · tant que les repas ne sont pas lus, la porte ne dit pas « rien de prévu » et la fiche ne fait rien', async ({ page }) => {
  test.setTimeout(120_000)
  const t = 'Gratin des repas'
  const { parts: ps } = await seme(t, [{ expire: 3 }])
  await pose(ps[0].id, MOI(), 0, 'diner')
  try {
    await connecte(page)
    /* Lecture lente : pendant l'attente, ni dessin ni « Rien de prévu ce soir ». */
    await page.route('**/rest/v1/meal_slot*', async route => { await new Promise(r => setTimeout(r, 3_000)); await route.continue() })
    await page.goto('/frigo')
    await expect(page.getByRole('heading', { name: 'Le frigo' })).toBeVisible()
    await expect(page.locator('[data-afficheur]')).toHaveCount(0)
    await expect(page.getByText('Rien de prévu ce soir')).toHaveCount(0)
    await expect(page.locator('[data-afficheur]')).toContainText(`Ce soir`, { timeout: 15_000 })
    await page.unroute('**/rest/v1/meal_slot*')

    /* Lecture en panne : la porte dit qu'elle ne sait pas, le magnet se tait, l'erreur est dite. */
    await page.route('**/rest/v1/meal_slot*', route => route.abort())
    await page.reload()
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 40_000 })
    await expect(page.locator('[data-afficheur]')).toContainText('Indisponible')
    await expect(page.getByText('Rien de prévu ce soir')).toHaveCount(0)
    await expect(page.locator('[data-magnet]')).toHaveCount(0)
    const interieur = await ouvreLe(page, 'frigo')
    await expect(interieur.getByRole('alert')).toBeVisible()
    await interieur.getByRole('button', { name: new RegExp(`^${t}`) }).click()
    const f = fiche(page, t)
    await expect(f.getByRole('button', { name: 'En manger une maintenant' })).toBeDisabled()
    await expect(f.getByRole('button', { name: 'Jeter', exact: true })).toBeDisabled()
    await expect(f.getByRole('button', { name: 'Retirer du frigo' })).toBeDisabled()
    await expect(f.getByRole('button', { name: 'Congeler', exact: true })).toBeDisabled()
    await page.unroute('**/rest/v1/meal_slot*')
  } finally { await retire(t) }
})

test('M2, M3, M5, M6 · l’urgence quand tout est réclamé, le magnet qui dit « à jeter », les portes décrites, l’intérieur modal', async ({ page }) => {
  test.setTimeout(120_000)
  const hier = new Date(Date.now() - JOUR_MS)
  await seme('Soupe de la revue', [{ expiresAt: hier }, { expiresAt: hier }])
  /* Un plat entièrement réclamé APRÈS sa péremption (dans 36 h : « demain dernier délai »). */
  const gratin = await seme('Gratin de la revue', [{ expiresAt: new Date(Date.now() + 36 * 3_600_000) }, { expiresAt: new Date(Date.now() + 36 * 3_600_000) }])
  await pose(gratin.parts[0].id, MOI(), 4, 'diner')
  await pose(gratin.parts[1].id, ELLE(), 4, 'diner')
  /* Un plat pour ce soir, sur le distributeur. */
  const tajine = await seme('Tajine de la revue', [{ expire: 3 }])
  await db.from('meal_slot').delete().eq('user_profile_id', MOI()).eq('day', jourLocal(0)).eq('meal', 'diner')
  await pose(tajine.parts[0].id, MOI(), 0, 'diner')
  try {
    await connecte(page)
    await page.goto('/frigo')
    await expect(porteDroite(page)).toBeVisible({ timeout: 20_000 })

    /* M3 : une part DÉJÀ périmée, libre : « à jeter », pas « à prévoir avant ce soir ». */
    await expect(page.locator('[data-magnet]')).toHaveText('2 barquettes de soupe de la revue à jeter')
    /* M5 : ce que disent le distributeur et le magnet est dans la description des portes. */
    await expect(porteGauche(page)).toHaveAccessibleDescription(/Ce soir.*Tajine de la revue/)
    await expect(porteDroite(page)).toHaveAccessibleDescription('2 barquettes de soupe de la revue à jeter')

    const interieur = await ouvreLe(page, 'frigo')
    /* M2 : la ligne d'un plat dont TOUTES les parts sont posées, après sa péremption. */
    await expect(interieur.getByRole('button', { name: /^Soupe de la revue, 2 parts, périmée/ })).toBeVisible()
    await expect(interieur.getByRole('button', { name: /^Gratin de la revue, 2 parts, demain dernier délai/ })).toBeVisible()
    await capture(page, '12-urgence-et-reclame')

    /* M6 : la page derrière est inerte tant que l'intérieur est ouvert… */
    expect(await page.locator('[inert] main').count(), 'le frigo fermé reste atteignable derrière l’intérieur').toBe(1)
    expect(await page.locator('[inert] nav').count(), 'la barre du bas reste atteignable derrière l’intérieur').toBe(1)
    await expect(interieur.getByRole('heading', { name: 'Frigo' })).toBeFocused()
    /* … et Échap le ferme d'où que soit le focus. */
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Escape')
    await expect(interieur).toBeHidden({ timeout: 5_000 })
    await expect(porteDroite(page)).toBeFocused({ timeout: 5_000 })
    expect(await page.locator('[inert] main').count(), 'la page reste inerte après la fermeture').toBe(0)
  } finally { await retire('Soupe de la revue', 'Gratin de la revue', 'Tajine de la revue') }
})

test('M4 · on ne sort pas de demain soir le matin : la part décongelée vit 24 h', async ({ page }) => {
  test.setTimeout(120_000)
  const t = 'Quiche de la revue'
  const q = await seme(t, [{ location: 'congelateur', expire: 80 }, { location: 'congelateur', expire: 80 }])
  await pose(q.parts[0].id, MOI(), 1, 'diner')
  await pose(q.parts[1].id, ELLE(), 1, 'diner')
  const heure = (h: number, m: number) => page.evaluate(([hh, mm]) => {
    const d = new Date(); d.setHours(hh, mm, 0, 0); localStorage.setItem('popote.maintenant', d.toISOString())
  }, [h, m])
  try {
    await connecte(page)
    await page.goto('/frigo')
    await heure(8, 30)
    await page.reload()
    const interieur = await ouvreLe(page, 'congelo')
    /* Le matin : on le dit, on ne le sort pas. */
    await expect(interieur.getByRole('button', { name: new RegExp(`^${t}, 2 parts, Demain soir : à sortir dès 19 h`) })).toBeVisible()
    await expect(page.locator('[data-magnet]'), 'le magnet dit « sors-les » avant l’heure').not.toContainText('Quiche')
    await interieur.getByRole('button', { name: new RegExp(`^${t}`) }).click()
    const f = fiche(page, t)
    await expect(f.getByText('C’est pour demain soir : sors-les à partir de 19 h')).toBeVisible()
    await f.getByRole('button', { name: 'Je les sors du congélateur' }).click()
    /* Rien n'est posé pour AUJOURD'HUI : on demande combien, on ne sort pas les parts de demain d'office. */
    await expect(f.getByRole('group', { name: 'Combien tu en sors du congélateur ?' })).toBeVisible()
    expect((await parts(t)).map(p => p.location)).toEqual(['congelateur', 'congelateur'])
    await f.press('Escape')

    /* Le soir venu : « à sortir maintenant », et les deux parts de demain sortent. */
    await interieur.getByRole('button', { name: 'Fermer la porte' }).click()
    await heure(19, 30)
    await page.reload()
    await expect(page.locator('[data-magnet]')).toHaveText('Sors les 2 barquettes de quiche de la revue : c’est demain soir', { timeout: 15_000 })
    const interieur2 = await ouvreLe(page, 'congelo')
    await expect(interieur2.getByRole('button', { name: new RegExp(`^${t}, 2 parts, Demain soir : à sortir maintenant`) })).toBeVisible()
    await interieur2.getByRole('button', { name: new RegExp(`^${t}`) }).click()
    await fiche(page, t).getByRole('button', { name: 'Je les sors du congélateur' }).click()
    await expect.poll(async () => (await parts(t)).map(p => `${p.location}/${p.state}`).join(), { timeout: 10_000 })
      .toBe('frigo/decongelee,frigo/decongelee')
  } finally {
    await page.evaluate(() => localStorage.removeItem('popote.maintenant')).catch(() => {})
    await retire(t)
  }
})

test('M7 · placard → un ingrédient → on le ferme : on revient sur la liste du placard', async ({ page }) => {
  test.setTimeout(120_000)
  await connecte(page)
  await page.goto('/frigo')
  await expect(porteDroite(page)).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Le placard' }).click()
  const placard = page.getByRole('dialog', { name: 'Le placard' })
  await expect(placard).toBeVisible()
  await placard.getByRole('button', { name: /Tortillas/ }).click()
  const f = fiche(page, 'Tortillas')
  await expect(f).toBeVisible()
  await f.press('Escape')
  await expect(f).toBeHidden()
  await expect(placard, 'la liste du placard n’est pas revenue').toBeVisible()
  await expect(placard.getByRole('button', { name: /Tortillas/ })).toBeVisible()
  /* Et fermer le placard le ferme pour de bon. */
  await placard.press('Escape')
  await expect(placard).toBeHidden()
})

test('L4, L5 · une date inchangée n’écrit rien ; le focus entre dans le champ et revient sur « Modifier »', async ({ page }) => {
  test.setTimeout(120_000)
  const t = 'Flan de la revue'
  const a = new Date(Date.now() + 2 * JOUR_MS); a.setHours(10, 0, 0, 0)
  const b = new Date(Date.now() + 3 * JOUR_MS); b.setHours(15, 0, 0, 0)
  await seme(t, [{ expiresAt: a }, { expiresAt: b }])
  const fins = async () => (await parts(t)).map(p => new Date(p.expires_at).getTime()).sort()
  try {
    await connecte(page)
    await page.goto('/frigo')
    const interieur = await ouvreLe(page, 'frigo')
    await interieur.getByRole('button', { name: new RegExp(`^${t}`) }).click()
    const f = fiche(page, t)
    const modifier = f.getByRole('button', { name: 'Modifier : À manger avant' })
    await modifier.click()
    /* L5 : le focus entre dans le champ… */
    await expect(f.getByLabel('À manger avant')).toBeFocused()
    /* L4 : enregistrer SANS changer ne réécrit rien (les deux péremptions restent distinctes). */
    await f.getByRole('button', { name: 'Enregistrer' }).click()
    /* … et revient sur « Modifier ». */
    await expect(modifier).toBeFocused()
    await page.waitForTimeout(800)
    expect(await fins(), 'une date inchangée a réécrasé les péremptions').toEqual([a.getTime(), b.getTime()])

    /* Annuler rend aussi le focus. */
    await modifier.click()
    await expect(f.getByLabel('À manger avant')).toBeFocused()
    await f.getByRole('button', { name: 'Annuler' }).click()
    await expect(modifier).toBeFocused()

    /* Une vraie correction : le jour de la seconde. La seconde garde son heure, la première s'y aligne. */
    await modifier.click()
    await f.getByLabel('À manger avant').fill(jourLocal(3))
    await f.getByRole('button', { name: 'Enregistrer' }).click()
    await expect.poll(fins, { timeout: 10_000 }).toEqual([b.getTime(), new Date(`${jourLocal(3)}T23:59:00`).getTime()].sort())
  } finally { await retire(t) }
})

test('L7 · à 320 px le frigo tient, et l’intérieur ne charge ses photos qu’à l’ouverture', async ({ browser }) => {
  test.setTimeout(120_000)
  const ctx = await browser.newContext({ viewport: { width: 320, height: 700 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })
  const page = await ctx.newPage()
  const { image_url: photo } = (await db.from('recipe').select('image_url').eq('id', recettes['Pizza vietnamienne protéinée']).single()).data!
  expect(photo, 'la pizza devrait avoir une photo à ce stade du banc').toBeTruthy()
  const requetes: string[] = []
  page.on('request', r => { if (r.url().includes('photos-des-plats')) requetes.push(r.url()) })
  try {
    await connecte(page)
    await page.goto('/frigo')
    await expect(porteDroite(page)).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1500)
    const frigo = await page.locator('[data-frigo=ferme]').boundingBox()
    expect(frigo!.x, 'le frigo déborde à gauche').toBeGreaterThanOrEqual(0)
    expect(frigo!.x + frigo!.width, 'le frigo déborde à droite à 320 px').toBeLessThanOrEqual(320.5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
    /* Les deux portes restent des cibles de 44 px. */
    for (const porte of [porteGauche(page), porteDroite(page)]) {
      const r = (await porte.boundingBox())!
      expect(r.width).toBeGreaterThanOrEqual(44)
    }
    await capture(page, '01-frigo-ferme-320', true)
    expect(requetes.filter(u => u === photo), 'la photo d’un plat du congélateur est demandée avant d’ouvrir la porte').toEqual([])
    await ouvreLe(page, 'congelo')
    await expect.poll(() => requetes.filter(u => u === photo).length, { timeout: 10_000 }).toBeGreaterThan(0)
  } finally { await ctx.close() }
})

test('M9 · hors semaine, le geste du cycle vient avant la carte de ce soir, et la page n’a qu’un <h1>', async ({ browser }) => {
  test.setTimeout(120_000)
  const f2 = await amorce({ cycleEtat: 'en_cuisine', budget: false })
  try {
    const hh = f2.householdId
    const { data: p } = await db.from('portion').insert({
      household_id: hh, label: 'Dahl du soir', grams: 400, kcal: 600, protein_g: 30, fiber_g: 5, carb_g: 60, fat_g: 20,
    }).select().single()
    await db.from('meal_slot').delete().eq('household_id', hh).eq('day', jourLocal(0))
    await db.from('meal_slot').insert({
      household_id: hh, user_profile_id: f2.userId, day: jourLocal(0), meal: 'diner', portion_id: p!.id, state: 'prevu',
    })
    for (const largeur of [390, 320]) {
      const ctx = await browser.newContext({ viewport: { width: largeur, height: 844 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' })
      const page = await ctx.newPage()
      await page.goto('/')
      await page.getByLabel(/e-?mail/i).fill(f2.email)
      await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
      await page.getByRole('button', { name: 'Entrer', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
      await page.goto('/cuisine-accueil')
      const carte = page.getByRole('region', { name: 'Le prochain repas' })
      await expect(carte).toBeVisible({ timeout: 20_000 })
      await expect(page.locator('h1')).toHaveCount(1)
      await expect(page.locator('h1')).toHaveText('Session en cours')
      await expect(carte.getByRole('heading', { level: 2 })).toHaveText('Dahl du soir')
      const geste = (await page.getByRole('button', { name: 'Reprendre la cuisine' }).boundingBox())!
      const bloc = (await carte.boundingBox())!
      expect(geste.y + geste.height, 'le geste du cycle doit être AVANT la carte de ce soir').toBeLessThan(bloc.y)
      expect(geste.y + geste.height, 'le geste du cycle est sous le pli').toBeLessThan(844 - 80)
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${CAPTURES}/13-accueil-en-cuisine-${largeur}.png`, fullPage: true })
      await ctx.close()
    }
  } finally { await efface(f2) }
})

test('L10 · la liste de courses accorde « 3 pots »', async ({ page }) => {
  test.setTimeout(120_000)
  const { data: magasin } = await db.from('store').select('id').eq('household_id', foyer.householdId).limit(1).single()
  const { data: article } = await db.from('shopping_item').insert({
    cycle_id: foyer.cycleId, household_id: foyer.householdId, store_id: magasin!.id,
    label: 'yaourts de la revue', aisle: 'Frais', quantity: 3, unit: 'pot',
  }).select().single()
  try {
    await connecte(page)
    await page.goto('/magasin')
    const ligne = page.getByRole('listitem').filter({ hasText: 'yaourts de la revue' })
    await expect(ligne).toBeVisible({ timeout: 20_000 })
    await expect(ligne).toContainText('3 pots')
  } finally { await db.from('shopping_item').delete().eq('id', article!.id) }
})
