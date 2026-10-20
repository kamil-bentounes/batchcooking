/**
 * Les recettes, jouées comme une personne les joue — et relues EN BASE.
 *
 * Banc de CLÔTURE du chantier « Recettes » (spec du 19/10/2026). Les tests
 * unitaires disent que chaque règle tient ; ils ne disent pas qu'un pouce, sur un
 * téléphone, arrive au bout. Ici tout se fait au CLIC, une capture est prise à
 * chaque écran, et la base est relue après chaque geste : un écran qui dit
 * « Retenue » sur une ligne que la base n'a pas écrite est exactement l'échec
 * qu'on cherche.
 *
 *   1. Arriver sur « Choisir » : dix lignes, vignettes, carte encre, recherche.
 *   2. Chercher sans accents ni apostrophes typographiques ; un résultat vide.
 *   3. Les filtres : appareils, puces, « Tout effacer », le compte.
 *   4. « Avec ce que j’ai » : le placard, les « il manque… ».
 *   5. La pagination : « + » en page 2, la recherche qui ramène en page 1.
 *   6. Ajouter depuis la liste et depuis la fiche (i), les parts, « Retirer ».
 *   7. La fiche (i) : étapes, macros, ingrédients, lien web, Échap et voile.
 *   8. L’image neutre : sans photo, photo qui ne charge pas.
 *   9. Une recette collée : l’import (réponse du modèle simulée), puis la base.
 *  10. Les cas limites : gestes qui échouent, champs de parts, mots sans espace.
 *
 * Chaque écran est photographié dans `.shots/recettes/<dev|build>/<n>-<nom>/`,
 * dans l'ordre, et `journal.json` relie chaque capture à ce que la base disait
 * à ce moment-là. Le dossier suit `SHOTS=dev|build` (défaut : build).
 *
 * LOCAL, ET RIEN D'AUTRE. Tout ce que le banc crée — foyer, compte, recettes
 * « Banc recettes … », placard, cycle — s'efface à la fin, quoi qu'il arrive,
 * et les comptes d'avant et d'après doivent être identiques.
 */
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { MOT_DE_PASSE, db } from './amorce.ts'
import { releve } from './couverture.ts'

const SHOTS = process.env.SHOTS === 'dev' ? 'dev' : 'build'
const DOSSIER = `.shots/recettes/${SHOTS}`
const STAMP = Date.now()
const EMAIL = `recettes-${STAMP}@banc.test`
/* ⚠️ LOCAL, ET RIEN D'AUTRE : ce banc crée un compte, un foyer et des recettes
   avec la clé de service. Le verrou vit au niveau du fichier : `afterAll` tourne
   MÊME quand `beforeAll` a échoué. */
const LOCAL = /127\.0\.0\.1|localhost/.test(process.env.VITE_SUPABASE_URL ?? '')

const PARCOURS: Record<number, string> = {
  1: 'arrivee', 2: 'recherche', 3: 'filtres', 4: 'avec-ce-que-jai', 5: 'pagination',
  6: 'ajouts', 7: 'fiche', 8: 'image-neutre', 9: 'recette-collee', 10: 'cas-limites',
}

type Entree = { parcours: string; titre: string; capture?: string; base?: unknown }
/** Ce que le banc a vu, dans l'ordre : les captures, et ce que disait la base. */
const journal: Entree[] = []
let comptesAvant: Record<string, number> | null = null
let comptesApres: Record<string, number> | null = null

/** Le numéro du parcours en cours, lu dans le titre du test (« 3 · … »). */
const numero = () => parseInt(test.info().title, 10)
const dossierDuParcours = () => `${DOSSIER}/${numero()}-${PARCOURS[numero()]}`

async function photo(page: Page, nom: string, titre: string) {
  // Le temps qu'une transition finisse : on photographie ce qu'on lirait.
  await page.waitForTimeout(450)
  const deja = journal.filter(e => e.capture && e.parcours === test.info().title).length
  const capture = `${String(deja + 1).padStart(2, '0')}-${nom}.png`
  /* L'ÉCRAN, pas la page entière : ce que la personne voit sans faire défiler.
     Ce qui doit y être est amené à l'écran avant la photo. */
  await page.screenshot({ path: `${dossierDuParcours()}/${capture}` })
  journal.push({
    parcours: test.info().title, titre, capture: `${numero()}-${PARCOURS[numero()]}/${capture}`,
  })
  await releve(page)
}

function constate(titre: string, base: unknown) {
  journal.push({ parcours: test.info().title, titre, base })
}

/** Les erreurs qu'une personne ne voit pas mais qui disent qu'un écran a cassé. */
function surveille(page: Page): string[] {
  const erreurs: string[] = []
  page.on('pageerror', e => erreurs.push(e.message))
  page.on('console', m => {
    // Une photo refusée exprès (`route.abort`) laisse « Failed to load resource » : attendu.
    if (m.type() === 'error' && !/Failed to load resource|ServiceWorker|favicon/i.test(m.text())) {
      erreurs.push(m.text())
    }
  })
  return erreurs
}

// ── Les données ─────────────────────────────────────────────────────────────

/** Le prochain lundi : `cycle.week_of` est le lundi couvert, et l'écran affiche le dimanche d'avant. */
function prochainLundi(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ou<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('la base n’a rien rendu')
  return data
}

type Aliment = 'oignon' | 'carotte' | 'poireau'
type Graine = {
  i: number
  titre: string
  parts: number
  /** Minutes de GESTES : ce que la base calcule, et ce que la liste trie. */
  actif: number
  appareils: string[]
  gel: boolean | null
  photo: 'ok' | 'casse' | null
  macros: boolean
  ingredients: { texte: string; aliment: Aliment | null }[]
  id: string
}

const PLATS = ['Soupe de lentilles', 'Gratin de courge', 'Curry de pois chiches', 'Risotto aux champignons',
  'Poulet au citron', 'Chili végétarien', 'Quiche aux poireaux', 'Pâtes à la crème de courgette',
  'Tajine de légumes', 'Riz cantonais', 'Boulettes tomate', 'Salade de lentilles']
const APPAREILS_PAR_RESTE: string[][] = [['four'], [], ['plaques'], ['four', 'plaques'], ['blender'], []]

const URL_PHOTO = 'https://photos.banc.invalid'
const TITRE_BRULEE = 'Banc recettes 28 · Crème brûlée'
const TITRE_AGNEAU = 'Banc recettes 29 · Navarin d’agneau'
const TITRE_FICHE = 'Banc recettes 30 · Joue de bœuf façon grand-mère'

function graine(i: number): Omit<Graine, 'id'> {
  const nn = String(i).padStart(2, '0')
  const titre = i === 28 ? TITRE_BRULEE : i === 29 ? TITRE_AGNEAU : i === 30 ? TITRE_FICHE
    : `Banc recettes ${nn} · ${PLATS[i % PLATS.length]}`
  const aliments: Aliment[] = i <= 6 ? ['oignon']
    : i <= 10 ? ['oignon', 'carotte']
      : i <= 12 ? ['oignon', 'carotte', 'poireau'] : []
  const texte: Record<Aliment, string> = {
    oignon: '2 oignons', carotte: '400 g de carottes', poireau: '3 poireaux',
  }
  return {
    i, titre, parts: i === 30 ? 10 : 2 + (i % 4),
    // La fiche complète (30) compte 15 minutes de gestes ; les autres, i, et
    // deux de plus quand le blender tourne (une étape ACTIVE de deux minutes).
    actif: i === 30 ? 15 : i + (APPAREILS_PAR_RESTE[i % 6].includes('blender') ? 2 : 0),
    appareils: i === 30 ? ['autocuiseur', 'plaques'] : APPAREILS_PAR_RESTE[i % 6],
    gel: i % 2 === 0 ? true : i % 3 === 0 ? false : null,
    // Une photo qui charge, une qui ne charge pas (7, 21…), et beaucoup sans.
    photo: i % 7 === 0 ? 'casse' : i % 2 === 1 || i === 30 ? 'ok' : null,
    macros: i === 30 || i % 3 !== 2,
    ingredients: aliments.map(a => ({ texte: texte[a], aliment: a })),
  }
}

const GRAINES: Graine[] = []
let foyerId = ''
let utilisateurId = ''
let cycleId = ''
const aliments = {} as Record<Aliment, string>

const urlPhoto = (g: Pick<Graine, 'i' | 'photo'>) =>
  g.photo ? `${URL_PHOTO}/${g.photo === 'ok' ? 'ok' : 'casse'}-${g.i}.svg` : null

/** L'ordre de la liste : temps actif croissant, puis le titre (`trie`, catalogue.ts). */
const rangees = (l: Graine[]) =>
  [...l].sort((a, b) => a.actif - b.actif || a.titre.localeCompare(b.titre, 'fr'))

/** Ce que les filtres du banc doivent laisser passer : la règle, réécrite à la main. */
function attendues(f: { actifMax?: number; gel?: boolean; appareils?: string[]; faisables?: Set<string> }) {
  return GRAINES.filter(g => {
    if (f.actifMax !== undefined && !(g.actif > 0 && g.actif <= f.actifMax)) return false
    if (f.gel && g.gel !== true) return false
    if (f.appareils && g.appareils.some(a => !f.appareils!.includes(a))) return false
    if (f.faisables) {
      const mine = g.ingredients.filter(x => x.aliment)
      if (mine.length === 0 || mine.some(x => !f.faisables!.has(x.aliment!))) return false
    }
    return true
  })
}

async function semeLeFoyer() {
  const u = ou(await db.auth.admin.createUser({ email: EMAIL, password: MOT_DE_PASSE, email_confirm: true }))
  utilisateurId = u.user.id
  const foyer = ou(await db.from('household')
    .insert({ name: 'Foyer du banc recettes', food_budget_eur: 320 }).select().single())
  foyerId = foyer.id
  ou(await db.from('user_profile').insert({
    id: utilisateurId, household_id: foyerId, display_name: 'Kamil', password_set: true,
  }).select().single())
  const cycle = ou(await db.from('cycle').insert({
    household_id: foyerId, week_of: prochainLundi(), state: 'selection', servings_target: 10,
  }).select().single())
  cycleId = cycle.id

  for (const [cle, code] of [['oignon', '20034'], ['carotte', '20009'], ['poireau', '20039']] as const) {
    aliments[cle] = ou(await db.from('food').select('id').eq('source', 'ciqual')
      .eq('source_code', code).single()).id
  }
}

async function semeLesRecettes() {
  const brutes = Array.from({ length: 30 }, (_, k) => graine(k + 1))
  const recettes = ou(await db.from('recipe').insert(brutes.map(g => ({
    title: g.titre, yield_servings: g.parts, origin: 'importee', plannable: true,
    total_time_min: g.i === 30 ? 120 : g.actif + 30,
    freezable: g.gel, image_url: urlPhoto(g),
    source_name: 'exemple.fr',
    // Un lien d'un autre schéma : la base l'accepte, l'écran ne doit PAS en faire un lien.
    source_url: g.i === 27 ? `javascript:alert(${STAMP})`
      : `https://exemple.fr/banc-recettes/${STAMP}/${g.i}`,
  }))).select('id, title'))
  const idDe = new Map(recettes.map(r => [r.title as string, r.id as string]))
  for (const g of brutes) GRAINES.push({ ...g, id: idDe.get(g.titre)! })

  const etapes: object[] = []
  for (const g of GRAINES) {
    if (g.i === 30) {
      etapes.push(
        { recipe_id: g.id, ordinal: 1, load_type: 'passif', duration_min: 60, gesture_min: 5,
          text: 'Faire tremper la viande 1 heure dans le vin avec les oignons émincés, le thym et le laurier.' },
        { recipe_id: g.id, ordinal: 2, load_type: 'bloquant', duration_min: 6, appliance_type: 'autocuiseur',
          text: 'Égoutter la viande. Dans un autocuiseur, faire revenir les lardons, les oignons et la joue de bœuf.' },
        { recipe_id: g.id, ordinal: 3, load_type: 'actif', duration_min: 3,
          text: 'Ajouter les carottes débitées en tronçons et l’ail entier en chemise.' },
        { recipe_id: g.id, ordinal: 4, load_type: 'passif', duration_min: 60, gesture_min: 1,
          appliance_type: 'plaques', text: 'Laisser cuire 60 minutes.' },
      )
      continue
    }
    etapes.push({ recipe_id: g.id, ordinal: 1, load_type: 'actif', duration_min: g.i,
      text: 'Préparer et couper les ingrédients' })
    g.appareils.forEach((a, n) => etapes.push({
      recipe_id: g.id, ordinal: n + 2, load_type: a === 'blender' ? 'actif' : 'passif',
      duration_min: a === 'blender' ? 2 : 30, appliance_type: a, text: `Cuire ou mixer (${a})`,
    }))
  }
  ou(await db.from('recipe_step').insert(etapes).select('id'))

  const lignes: object[] = []
  for (const g of GRAINES) {
    if (g.i === 30) {
      ['2 kg de joue de bœuf', '200 g de lardons', '1 kg de carottes', '3 gousses d’ail', 'Thym']
        .forEach((t, n) => lignes.push({ recipe_id: g.id, ordinal: n + 1, raw_text: t }))
      continue
    }
    if (g.ingredients.length === 0) {
      lignes.push({ recipe_id: g.id, ordinal: 1, raw_text: '1 boîte de pois chiches' })
    }
    g.ingredients.forEach((x, n) => lignes.push({
      recipe_id: g.id, ordinal: n + 1, raw_text: x.texte, food_id: aliments[x.aliment!],
    }))
  }
  ou(await db.from('recipe_ingredient').insert(lignes).select('id'))

  ou(await db.from('recipe_nutrition').insert(GRAINES.filter(g => g.macros).map(g => g.i === 30
    ? { recipe_id: g.id, grams: 420, kcal: 506, protein_g: 50, fiber_g: 5, carb_g: 20, fat_g: 25,
        kcal_margin: 9, protein_g_margin: 1, coverage: 0.95 }
    : { recipe_id: g.id, grams: 340, kcal: 400 + g.i * 10, protein_g: 20 + g.i, fiber_g: 6,
        carb_g: 50, fat_g: 15, kcal_margin: 20, protein_g_margin: 2,
        coverage: g.i % 5 === 0 ? 0.8 : 0.95 })).select('recipe_id'))
}

/** Les photos du banc : un dessin pour celles qui chargent, un refus pour les autres. */
async function sertLesPhotos(page: Page) {
  await page.route(`${URL_PHOTO}/**`, route => {
    const u = route.request().url()
    if (/\/casse-/.test(u)) return route.abort('failed')
    const n = Number(u.match(/-(\d+)\.svg/)?.[1] ?? 0)
    const teinte = (n * 47) % 360
    return route.fulfill({
      status: 200, contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${teinte} 55% 52%)"/><stop offset="1" stop-color="hsl(${(teinte + 40) % 360} 60% 32%)"/>
        </linearGradient></defs><rect width="320" height="320" fill="url(#g)"/>
        <circle cx="160" cy="160" r="92" fill="hsl(${teinte} 30% 92%)" opacity=".85"/></svg>`,
    })
  })
}

// ── Ce que la base dit ──────────────────────────────────────────────────────

async function nombre(table: string): Promise<number> {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`${table} : ${error.message}`)
  return count as number
}

async function nombreDeComptes(): Promise<number> {
  let n = 0
  for (let p = 1; ; p++) {
    const { data, error } = await db.auth.admin.listUsers({ page: p, perPage: 1000 })
    if (error) throw error
    n += data.users.length
    if (data.users.length < 1000) return n
  }
}

async function releveLesComptes() {
  const t: Record<string, number> = {}
  for (const table of ['household', 'user_profile', 'recipe', 'recipe_step', 'recipe_ingredient',
    'recipe_nutrition', 'cycle', 'cycle_recipe', 'stock_item']) t[table] = await nombre(table)
  t.auth_users = await nombreDeComptes()
  return t
}

/** Les recettes retenues par le cycle du banc, telles que la base les garde. */
async function retenues() {
  const { data, error } = await db.from('cycle_recipe')
    .select('servings, recipe(title)').eq('cycle_id', cycleId)
  if (error) throw error
  return (data as unknown as { servings: number; recipe: { title: string } }[])
    .map(r => ({ recette: r.recipe.title, parts: r.servings }))
    .sort((a, b) => a.recette.localeCompare(b.recette))
}

async function placard() {
  const { data } = await db.from('stock_item').select('label, food_id, location').eq('household_id', foyerId)
  return data
}

/** Ce que voit la personne : le même catalogue, sous sa propre identité (RLS comprise). */
async function commeLui() {
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: EMAIL, password: MOT_DE_PASSE })
  if (error) throw error
  return c
}

/** La même pliure que la recherche : minuscules, sans accents, une apostrophe. */
const plie = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/œ/g, 'oe').replace(/[’‘`´]/g, '\'')

async function titresVisibles(): Promise<string[]> {
  const c = await commeLui()
  const lignes: string[] = []
  let apres: string | null = null
  for (;;) {
    let q = c.from('recipe').select('id, title').not('title', 'is', null).eq('plannable', true)
    if (apres) q = q.gt('id', apres)
    const { data, error } = await q.order('id').limit(1000)
    if (error) throw error
    lignes.push(...data.map(r => r.title as string))
    if (data.length < 1000) return lignes
    apres = data[data.length - 1].id
  }
}

async function nettoie(): Promise<string[]> {
  const ratees: string[] = []
  const essaie = async (nom: string, f: () => PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await f()
    if (error) ratees.push(`${nom} : ${error.message}`)
  }
  if (foyerId) {
    await essaie('stock_item', () => db.from('stock_item').delete().eq('household_id', foyerId))
    await essaie('cycle_recipe (foyer)', () => db.from('cycle_recipe').delete().eq('household_id', foyerId))
  }
  const { data: bancs } = await db.from('recipe').select('id').like('title', 'Banc recettes %')
  const ids = (bancs ?? []).map(r => r.id)
  if (ids.length > 0) {
    await essaie('cycle_recipe (recettes)', () => db.from('cycle_recipe').delete().in('recipe_id', ids))
    await essaie('recipe', () => db.from('recipe').delete().in('id', ids))
  }
  // Une recette collée par le foyer, même si son titre n'a pas été retenu.
  if (foyerId) await essaie('recipe (foyer)', () => db.from('recipe').delete().eq('owner_household_id', foyerId))
  if (cycleId) await essaie('cycle', () => db.from('cycle').delete().eq('id', cycleId))
  if (utilisateurId) {
    const { error } = await db.auth.admin.deleteUser(utilisateurId)
    if (error && !/not found/i.test(error.message)) ratees.push(`compte : ${error.message}`)
  }
  if (foyerId) await essaie('household', () => db.from('household').delete().eq('id', foyerId))
  return ratees
}

// ── Les gestes ──────────────────────────────────────────────────────────────

const HUB = (page: Page) => page.getByRole('heading', { name: 'Popote' })
const TITRE_CHOISIR = (page: Page) => page.getByRole('heading', { name: 'Choisir', exact: true })
const cherche = (page: Page) => page.getByPlaceholder(/chercher une recette/i)
const carte = (page: Page, titre: string) => page.getByRole('article')
  .filter({ has: page.getByRole('heading', { name: titre, exact: true }) })
const bas = (page: Page) => page.getByRole('navigation', { name: 'Pages de recettes' })
const encre = (page: Page) => page.getByRole('region', { name: 'Ce qu’on cuisine' })
const bouton = (page: Page) => page.getByRole('button', { name: /appareils et filtres/i })

async function entre(page: Page) {
  await page.goto('/')
  await page.getByLabel('Ton e-mail').fill(EMAIL)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(HUB(page)).toBeVisible({ timeout: 20_000 })
}

/** Du hub à « Choisir », au clic : la carte « Cuisine », puis « Continuer à choisir ». */
async function versChoisir(page: Page) {
  await page.getByRole('button', { name: /^Cuisine/ }).click()
  await page.getByRole('button', { name: 'Continuer à choisir' }).click()
  await expect(TITRE_CHOISIR(page)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 30_000 })
}

async function arrive(page: Page) {
  await sertLesPhotos(page)
  await entre(page)
  await versChoisir(page)
}

/** On isole les recettes du banc : la base locale en garde des centaines d'autres. */
async function isole(page: Page, texte = 'banc recettes') {
  await cherche(page).fill(texte)
}

const compteur = (page: Page, total: number) => {
  const dernier = Math.min(10, total)
  return total === 0 ? page.getByText(/^0$/) : page.getByText(new RegExp(`^${total}, de 1 à ${dernier}$`))
}

async function titresAffiches(page: Page): Promise<string[]> {
  return page.getByRole('article').getByRole('heading').allInnerTexts()
}

test.describe.serial('les recettes, de bout en bout', () => {
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 })

  test.beforeAll(async () => {
    if (!LOCAL) {
      throw new Error(`Ce banc ne se joue qu'en local. Base visée : ${
        process.env.VITE_SUPABASE_URL || '(non renseignée)'}.`)
    }
    rmSync(DOSSIER, { recursive: true, force: true })
    for (const n of Object.keys(PARCOURS)) mkdirSync(`${DOSSIER}/${n}-${PARCOURS[Number(n)]}`, { recursive: true })
    // Un passage interrompu a pu laisser des recettes : on part d'une base propre.
    const { data } = await db.from('recipe').select('id').like('title', 'Banc recettes %')
    const anciennes = (data ?? []).map(r => r.id)
    if (anciennes.length > 0) {
      await db.from('cycle_recipe').delete().in('recipe_id', anciennes)
      await db.from('recipe').delete().in('id', anciennes)
    }
    comptesAvant = await releveLesComptes()
    await semeLeFoyer()
    await semeLesRecettes()
    // Ce que la base a CALCULÉ doit être ce que le banc croit avoir semé.
    const { data: calcule } = await db.from('recipe').select('id, title, active_time_min, appliances')
      .in('id', GRAINES.map(g => g.id))
    const ecarts = GRAINES.filter(g => {
      const r = calcule!.find(x => x.id === g.id)!
      return Number(r.active_time_min) !== g.actif
        || [...(r.appliances ?? [])].sort().join() !== [...g.appareils].sort().join()
    }).map(g => ({ titre: g.titre, attendu: g.actif, appareils: g.appareils,
      base: calcule!.find(x => x.id === g.id) }))
    expect(ecarts, 'la base ne calcule pas ce que le banc a semé').toEqual([])
  })

  test.afterAll(async () => {
    if (!LOCAL) return
    const ratees = await nettoie()
    comptesApres = await releveLesComptes()
    writeFileSync(`${DOSSIER}/journal.json`, JSON.stringify(
      { comptes: { avant: comptesAvant, apres: comptesApres }, journal }, null, 2))
    expect(ratees, 'le nettoyage a laissé des choses').toEqual([])
    expect(comptesApres, 'la base n’est plus dans l’état où le banc l’a trouvée').toEqual(comptesAvant)
  })

  test('1 · On arrive sur « Choisir »', async ({ page }) => {
    test.setTimeout(150_000)
    const erreurs = surveille(page)
    await sertLesPhotos(page)
    await entre(page)
    await photo(page, 'hub', 'Le hub, après la connexion')
    await page.getByRole('button', { name: /^Cuisine/ }).click()
    await expect(page.getByRole('button', { name: 'Continuer à choisir' })).toBeVisible()
    await photo(page, 'accueil-cuisine', 'L’accueil de la cuisine : « Continuer à choisir »')
    await page.getByRole('button', { name: 'Continuer à choisir' }).click()
    await expect(TITRE_CHOISIR(page)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 30_000 })

    // Dix lignes, chacune avec sa vignette (photo ou image neutre).
    await expect(page.getByRole('article')).toHaveCount(10)
    for (const a of await page.getByRole('article').all()) {
      await expect(a.locator('img, [data-photo="neutre"]'), 'une ligne sans vignette').toHaveCount(1)
    }
    await photo(page, 'arrivee', 'Choisir : la carte encre, la recherche, les puces, les premières lignes')

    // La carte encre dit ce qu'il reste à couvrir, le cycle vide.
    await expect(encre(page).getByText('Il manque')).toBeVisible()
    await expect(encre(page).getByText('10 parts', { exact: true })).toBeVisible()
    await expect(encre(page).getByText('Rien de retenu pour l’instant.', { exact: false })).toBeVisible()
    await expect(cherche(page)).toBeVisible()
    for (const puce of ['≤ 20 min actives', '≥ 30 g de protéines', 'Se congèle', 'Avec ce que j’ai']) {
      await expect(page.getByRole('button', { name: puce })).toBeAttached()
    }
    await expect(bouton(page)).toHaveAccessibleName('Appareils et filtres')

    /* Le catalogue entier tient dans l'écran : le total affiché est celui que la
       personne a le droit de lire en base. */
    const visibles = await titresVisibles()
    const total = visibles.length
    await expect(page.getByText(new RegExp(`^${total.toLocaleString('fr-FR')}, de 1 à 10$`)),
      'le total de la liste n’est pas celui de la base').toBeVisible()
    constate('Ce que la base laisse lire à cette personne', {
      recettes_lisibles: total, recettes_du_banc: visibles.filter(t => t.startsWith('Banc recettes')).length,
      cycle: (await db.from('cycle').select('state, servings_target').eq('id', cycleId).single()).data,
      retenues: await retenues(),
    })
    expect(await retenues(), 'le cycle n’est pas vide au départ').toEqual([])

    // Le bas de la liste : le bouton, les numéros.
    await bas(page).scrollIntoViewIfNeeded()
    await expect(bas(page).getByRole('button', { name: 'Les 10 suivantes' })).toBeVisible()
    await expect(bas(page).getByText(new RegExp(`^Recettes 1 à 10 sur ${total.toLocaleString('fr-FR')}$`))).toBeVisible()
    await photo(page, 'bas-de-liste', 'Le bas de la liste : « Les 10 suivantes » et les numéros')

    // Sur les recettes du banc : trente, donc trois pages.
    await page.getByRole('heading', { name: 'Recettes', exact: true }).scrollIntoViewIfNeeded()
    await isole(page)
    await expect(compteur(page, 30)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('article')).toHaveCount(10)
    expect(await titresAffiches(page)).toEqual(rangees(GRAINES).slice(0, 10).map(g => g.titre))
    await page.evaluate(() => window.scrollTo(0, 0))
    await photo(page, 'recettes-du-banc', 'La recherche « banc recettes » isole les trente du banc')
    await bas(page).scrollIntoViewIfNeeded()
    await expect(bas(page).getByRole('button', { name: 'Page 3' })).toBeVisible()
    await photo(page, 'bas-trois-pages', 'Trente recettes : trois pages')
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
  })

  test('2 · Chercher sans accents ni apostrophes', async ({ page }) => {
    test.setTimeout(150_000)
    const erreurs = surveille(page)
    await arrive(page)
    const titres = await titresVisibles()

    // « creme brulee » trouve « Crème brûlée ».
    await cherche(page).fill('creme brulee')
    const brulee = titres.filter(t => plie(t).includes('creme brulee'))
    expect(brulee, 'le banc a semé une crème brûlée').toContain(TITRE_BRULEE)
    await expect(compteur(page, brulee.length)).toBeVisible({ timeout: 10_000 })
    await expect(carte(page, TITRE_BRULEE)).toBeVisible()
    // Un seul anneau de focus : celui du champ entier, pas un second autour de la saisie.
    await expect(cherche(page)).toBeFocused()
    expect(await cherche(page).evaluate((e: HTMLElement) => getComputedStyle(e).outlineStyle),
      'la saisie dessine son propre anneau de focus dans celui du champ').toBe('none')
    await photo(page, 'creme-brulee', '« creme brulee », sans accents, trouve « Crème brûlée »')

    // « d'agneau » (droite) trouve « d’agneau » (typographique).
    await cherche(page).fill('d\'agneau')
    const agneau = titres.filter(t => plie(t).includes('d\'agneau'))
    expect(agneau, 'le banc a semé un navarin d’agneau').toContain(TITRE_AGNEAU)
    await expect(compteur(page, agneau.length)).toBeVisible({ timeout: 10_000 })
    // Au-delà de dix résultats, la nôtre peut être en page 2 : on descend jusqu'à elle.
    for (let p = 0; p < 20 && (await carte(page, TITRE_AGNEAU).count()) === 0; p++) {
      await bas(page).getByRole('button', { name: /suivantes?$/ }).click()
    }
    await expect(carte(page, TITRE_AGNEAU)).toBeVisible()
    await carte(page, TITRE_AGNEAU).scrollIntoViewIfNeeded()
    await photo(page, 'agneau', '« d\'agneau » trouve un titre écrit « d’agneau »')

    // Les majuscules et les accents du clavier : « CRÈME BRÛLÉE » aussi.
    await cherche(page).fill('CRÈME BRÛLÉE')
    await expect(compteur(page, brulee.length)).toBeVisible({ timeout: 10_000 })

    // Un résultat vide le dit, et donne une issue.
    await cherche(page).fill('zzqx introuvable')
    await expect(page.getByText('Rien ne correspond')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Desserre un filtre, ou invente une recette/)).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(0)
    await expect(compteur(page, 0)).toBeVisible()
    await expect(bas(page)).toHaveCount(0)
    await page.evaluate(() => window.scrollTo(0, 0))
    await photo(page, 'vide', 'Rien ne correspond : l’écran le dit')

    // Effacer la recherche rend la liste.
    await cherche(page).fill('')
    await expect(page.getByRole('article')).toHaveCount(10)
    constate('Recherche : ce que la base contenait', {
      creme_brulee: brulee.length, d_agneau: agneau.length,
      titre_de_la_base: TITRE_AGNEAU, apostrophe_du_titre: TITRE_AGNEAU.match(/d(.)agneau/)![1],
    })
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
  })

  test('3 · Les filtres', async ({ page }) => {
    test.setTimeout(150_000)
    const erreurs = surveille(page)
    await arrive(page)
    await isole(page)
    await expect(compteur(page, 30)).toBeVisible({ timeout: 10_000 })

    // Le panneau « Appareils et filtres ».
    await bouton(page).click()
    await expect(page.getByText('Temps les mains prises')).toBeVisible()
    await expect(bouton(page)).toHaveAttribute('aria-expanded', 'true')
    await photo(page, 'panneau', 'Le panneau « Appareils et filtres », rien de posé')

    // Un appareil : « Four » seul écarte tout ce qui exige autre chose.
    await page.getByRole('button', { name: 'Four', exact: true }).click()
    await expect(bouton(page)).toHaveAccessibleName('Appareils et filtres, 1 posés')
    let attendu = attendues({ appareils: ['four'] })
    await expect(compteur(page, attendu.length)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Tout effacer' })).toBeVisible()
    await photo(page, 'four', `« Four » : ${attendu.length} recettes sur 30, et « Tout effacer »`)

    // Deux appareils : toujours UN filtre posé.
    await page.getByRole('button', { name: 'Plaques', exact: true }).click()
    await expect(bouton(page)).toHaveAccessibleName('Appareils et filtres, 1 posés')
    attendu = attendues({ appareils: ['four', 'plaques'] })
    await expect(compteur(page, attendu.length)).toBeVisible({ timeout: 10_000 })
    await photo(page, 'four-et-plaques', `« Four » et « Plaques » : ${attendu.length} recettes`)

    // Les puces s'y ajoutent : trois filtres posés.
    await page.getByRole('button', { name: '≤ 20 min actives' }).first().click()
    await page.getByRole('button', { name: 'Se congèle' }).click()
    await expect(bouton(page)).toHaveAccessibleName('Appareils et filtres, 3 posés')
    attendu = attendues({ appareils: ['four', 'plaques'], actifMax: 20, gel: true })
    expect(attendu.length, 'le banc n’a rien à montrer sous trois filtres').toBeGreaterThan(0)
    await expect(compteur(page, attendu.length)).toBeVisible({ timeout: 10_000 })
    expect(await titresAffiches(page)).toEqual(rangees(attendu).slice(0, 10).map(g => g.titre))
    await photo(page, 'trois-filtres', `Trois filtres posés : ${attendu.length} recettes, dans l’ordre du temps actif`)

    // « Tout effacer » rend les trente, et garde la recherche.
    await page.getByRole('button', { name: 'Tout effacer' }).click()
    await expect(compteur(page, 30)).toBeVisible({ timeout: 10_000 })
    await expect(bouton(page)).toHaveAccessibleName('Appareils et filtres')
    await expect(page.getByRole('button', { name: 'Tout effacer' })).toHaveCount(0)
    await expect(cherche(page)).toHaveValue('banc recettes')
    await photo(page, 'effaces', '« Tout effacer » : les trente reviennent, la recherche reste')

    // Un filtre qui ne laisse rien le dit, au lieu d'une liste vide muette.
    await page.getByRole('button', { name: '≥ 30 g de protéines' }).click()
    await page.getByRole('button', { name: 'Se congèle' }).click()
    await page.getByRole('button', { name: '≤ 20 min actives' }).first().click()
    const peu = GRAINES.filter(g => g.macros && g.actif <= 20 && g.gel === true
      && (g.i === 30 ? 49 : 20 + g.i - 2) >= 30)
    await expect(compteur(page, peu.length)).toBeVisible({ timeout: 10_000 })
    constate('Filtres : ce que le banc a semé', GRAINES.map(g => ({
      recette: g.titre, actif: g.actif, gel: g.gel, appareils: g.appareils })))
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
  })

  test('4 · « Avec ce que j’ai »', async ({ page }) => {
    test.setTimeout(150_000)
    const erreurs = surveille(page)
    await arrive(page)
    await isole(page)
    await expect(compteur(page, 30)).toBeVisible({ timeout: 10_000 })

    try {
      // Placard vide : le filtre le dit, il ne rend rien en silence.
      expect(await placard()).toEqual([])
      await page.getByRole('button', { name: 'Avec ce que j’ai' }).click()
      await expect(page.getByText('Rien ne correspond')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(/Tes placards sont vides dans l’app/)).toBeVisible()
      await photo(page, 'placard-vide', 'Placard vide : « ce filtre ne rendra rien »')
      constate('En base, le placard avant', await placard())

      // L'oignon entre au placard ; la personne rouvre l'écran.
      ou(await db.from('stock_item').insert({
        household_id: foyerId, label: 'oignon', food_id: aliments.oignon,
        quantity: 3, unit: 'u', location: 'placard',
      }).select())
      const apres = await placard()
      constate('En base, le placard après avoir rangé un oignon', apres)
      expect(apres).toEqual([{ label: 'oignon', food_id: aliments.oignon, location: 'placard' }])
      await page.reload()
      await expect(TITRE_CHOISIR(page)).toBeVisible({ timeout: 20_000 })
      await isole(page)
      await expect(compteur(page, 30)).toBeVisible({ timeout: 10_000 })

      // Sans le filtre : les « il manque… » apparaissent pour ce qui n'est pas au placard.
      const ordre = rangees(GRAINES)
      const manque = (liste: Graine[], n: number) => liste.filter(g => {
        const absents = g.ingredients.filter(x => x.aliment && x.aliment !== 'oignon')
        return absents.length === n
      })
      for (const [numeroDePage, nom] of [[0, 'il-manque'], [1, 'il-manque-page-2']] as const) {
        const duPage = ordre.slice(numeroDePage * 10, numeroDePage * 10 + 10)
        if (numeroDePage === 1) await bas(page).getByRole('button', { name: 'Les 10 suivantes' }).click()
        await expect(page.getByRole('article')).toHaveCount(duPage.length)
        await expect(page.getByText('il manque 400 g de carottes'),
          `« il manque 400 g de carottes » : page ${numeroDePage + 1}`).toHaveCount(manque(duPage, 1).length)
        await expect(page.getByText('il manque 2 ingrédients'),
          `« il manque 2 ingrédients » : page ${numeroDePage + 1}`).toHaveCount(manque(duPage, 2).length)
        for (const g of duPage.filter(x => x.ingredients.length === 1 && x.ingredients[0].aliment === 'oignon')) {
          await expect(carte(page, g.titre).getByText(/il manque/),
            'une recette dont tout est au placard ne manque de rien').toHaveCount(0)
        }
        const [premiere] = [...manque(duPage, 1), ...manque(duPage, 2)]
        await carte(page, premiere.titre).scrollIntoViewIfNeeded()
        await photo(page, nom, `Page ${numeroDePage + 1}, sans le filtre : « il manque… » sous les recettes concernées`)
      }
      await bas(page).getByRole('button', { name: 'Page 1' }).click()

      // Avec le filtre : seules les recettes faisables.
      await page.getByRole('button', { name: 'Avec ce que j’ai' }).click()
      const faisables = attendues({ faisables: new Set(['oignon']) })
      expect(faisables.length).toBe(6)
      await expect(compteur(page, 6)).toBeVisible({ timeout: 10_000 })
      expect((await titresAffiches(page)).sort()).toEqual(faisables.map(g => g.titre).sort())
      await expect(bouton(page)).toHaveAccessibleName('Appareils et filtres, 1 posés')
      await page.evaluate(() => window.scrollTo(0, 0))
      await photo(page, 'faisables', 'Avec l’oignon seul : six recettes du banc sont faisables')
      await expect(page.getByText(/il manque/)).toHaveCount(0)

      // Le même filtre, relu par la base : c'est elle qui répond (0092).
      const c = await commeLui()
      const { data: faisablesBase } = await c.rpc('recettes_faisables')
      const duBanc = GRAINES.filter(g => (faisablesBase as string[]).includes(g.id)).map(g => g.titre)
      constate('En base, recettes_faisables() parmi celles du banc', duBanc)
      expect(duBanc.sort()).toEqual(faisables.map(g => g.titre).sort())
    } finally {
      await db.from('stock_item').delete().eq('household_id', foyerId)
    }
    expect(await placard(), 'le placard du banc n’est pas vidé').toEqual([])
    constate('En base, le placard à la fin', await placard())
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
  })

  test('5 · La pagination', async ({ page }) => {
    test.setTimeout(150_000)
    const erreurs = surveille(page)
    await arrive(page)
    await isole(page)
    await expect(compteur(page, 30)).toBeVisible({ timeout: 10_000 })
    const ordre = rangees(GRAINES)

    try {
      await bas(page).scrollIntoViewIfNeeded()
      await bas(page).getByRole('button', { name: 'Les 10 suivantes' }).click()
      await expect(bas(page).getByText('Recettes 11 à 20 sur 30')).toBeVisible()
      await expect(bas(page).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
      expect(await titresAffiches(page)).toEqual(ordre.slice(10, 20).map(g => g.titre))
      await expect(page.getByRole('heading', { name: 'Recettes', exact: true })).toBeFocused()
      await photo(page, 'page-2', 'Page 2 : les dix suivantes, la liste remonte en haut')

      // « + » en page 2 : on reste en page 2, la ligne passe à « Retenue ».
      const premiere = ordre[14]
      const parts1 = Math.max(1, Math.min(10 - 0 || 2, premiere.parts))
      const c1 = carte(page, premiere.titre)
      await c1.scrollIntoViewIfNeeded()
      await c1.getByRole('button', { name: `Ajouter ${premiere.titre}` }).click()
      await expect(c1.getByLabel('Retenue', { exact: true })).toBeVisible({ timeout: 10_000 })
      await expect(c1.getByRole('button', { name: /^Ajouter /i })).toHaveCount(0)
      await expect(page.getByRole('article')).toHaveCount(10)
      await expect(bas(page).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
      await expect.poll(retenues, { message: 'le « + » n’a rien écrit en base', timeout: 10_000 })
        .toEqual([{ recette: premiere.titre, parts: parts1 }])
      constate('En base, après le premier « + » (page 2)', await retenues())
      await photo(page, 'retenue', `« ${premiere.titre} » est retenue, on reste en page 2`)

      // Un second « + », de l'autre côté de la page.
      const seconde = ordre[18]
      const parts2 = Math.max(1, Math.min(10 - parts1 || 2, seconde.parts))
      const c2 = carte(page, seconde.titre)
      await c2.scrollIntoViewIfNeeded()
      await c2.getByRole('button', { name: `Ajouter ${seconde.titre}` }).click()
      await expect(c2.getByLabel('Retenue', { exact: true })).toBeVisible({ timeout: 10_000 })
      await expect.poll(retenues, { timeout: 10_000 }).toEqual([
        { recette: premiere.titre, parts: parts1 }, { recette: seconde.titre, parts: parts2 },
      ].sort((a, b) => a.recette.localeCompare(b.recette)))
      constate('En base, après le second « + » (page 2)', await retenues())
      await expect(bas(page).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')

      // Page 3 : la dernière, plus rien à suivre.
      await bas(page).getByRole('button', { name: /suivantes?$/ }).click()
      await expect(bas(page).getByText('Recettes 21 à 30 sur 30')).toBeVisible()
      await expect(bas(page).getByRole('button', { name: /suivantes?$/ })).toHaveCount(0)
      await bas(page).scrollIntoViewIfNeeded()
      await photo(page, 'page-3', 'Page 3 : la dernière, « Les 10 suivantes » a disparu')

      // La carte encre a compté les parts, d'où qu'on soit.
      const prises = parts1 + parts2
      await page.evaluate(() => window.scrollTo(0, 0))
      await expect(encre(page).getByText(`${prises} déjà retenues.`, { exact: false })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Ce qu’on cuisine' })).toContainText(`${10 - prises} part${10 - prises > 1 ? 's' : ''}`)

      // Changer la recherche ramène en page 1.
      await cherche(page).fill('banc recette')
      await expect(compteur(page, 30)).toBeVisible({ timeout: 10_000 })
      await expect(bas(page).getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
      await expect(page.getByRole('article')).toHaveCount(10)
      expect(await titresAffiches(page)).toEqual(ordre.slice(0, 10).map(g => g.titre))
      await photo(page, 'recherche-change', 'La recherche a changé : retour en page 1')
      // Une recette retenue garde sa coche sur la page où elle se trouve.
      await bas(page).getByRole('button', { name: 'Page 2' }).click()
      await expect(carte(page, premiere.titre).getByLabel('Retenue', { exact: true })).toBeVisible()
    } finally {
      await db.from('cycle_recipe').delete().eq('cycle_id', cycleId)
    }
    expect(await retenues()).toEqual([])
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
  })

  test('6 · Ajouter, régler les parts, retirer', async ({ page }) => {
    test.setTimeout(150_000)
    const erreurs = surveille(page)
    await arrive(page)
    const g3 = GRAINES.find(g => g.i === 3)!
    const g4 = GRAINES.find(g => g.i === 4)!
    const attendu = (g: Graine, deja: number) => Math.max(1, Math.min(10 - deja || 2, g.parts))

    try {
      // Depuis la liste.
      await cherche(page).fill(g3.titre)
      await expect(page.getByRole('article')).toHaveCount(1)
      await carte(page, g3.titre).getByRole('button', { name: `Ajouter ${g3.titre}` }).click()
      await expect(carte(page, g3.titre).getByLabel('Retenue', { exact: true })).toBeVisible({ timeout: 10_000 })
      const p3 = attendu(g3, 0)
      await expect.poll(retenues, { timeout: 10_000 }).toEqual([{ recette: g3.titre, parts: p3 }])
      constate('En base, après « + » dans la liste', await retenues())
      await expect(encre(page).getByText(g3.titre)).toBeVisible()
      // Le titre d'une recette retenue se lit en entier : il n'est ni coupé ni suivi de « … ».
      const coupe = await encre(page).getByText(g3.titre).evaluate((e: HTMLElement) => ({
        largeur: e.scrollWidth > e.clientWidth + 1, hauteur: e.scrollHeight > e.clientHeight + 1,
      }))
      expect(coupe, 'le titre de la recette retenue est coupé dans la carte encre').toEqual({ largeur: false, hauteur: false })
      await photo(page, 'ajoutee-depuis-la-liste', 'Ajoutée depuis la liste : la ligne dit « Retenue », la carte encre la liste')

      // Depuis la fiche (i).
      await cherche(page).fill(g4.titre)
      await page.getByRole('button', { name: `${g4.titre}, la recette en détail` }).click()
      const fiche = page.getByRole('dialog', { name: g4.titre })
      await expect(fiche).toBeVisible()
      const p4 = attendu(g4, p3)
      const ajoute = fiche.getByRole('button', { name: `Ajouter à dimanche · ${p4} part${p4 > 1 ? 's' : ''}` })
      await expect(ajoute).toBeVisible({ timeout: 10_000 })
      await photo(page, 'fiche-avant', 'La fiche (i) : « Ajouter à dimanche »')
      await ajoute.click()
      await expect(fiche.getByText(/^Retenue pour dimanche · /)).toBeVisible({ timeout: 10_000 })
      await expect.poll(retenues, { timeout: 10_000 }).toEqual([
        { recette: g3.titre, parts: p3 }, { recette: g4.titre, parts: p4 },
      ])
      constate('En base, après « Ajouter à dimanche » dans la fiche', await retenues())
      await photo(page, 'fiche-apres', 'Dans la fiche : « Retenue pour dimanche »')
      await page.keyboard.press('Escape')
      await expect(fiche).toHaveCount(0)

      // Régler les parts de la première, dans la carte encre.
      await page.evaluate(() => window.scrollTo(0, 0))
      const champ = page.getByLabel(`Parts de ${g3.titre}`)
      await champ.fill('6')
      await expect.poll(retenues, { message: 'les parts réglées n’ont pas été écrites', timeout: 10_000 })
        .toEqual([{ recette: g3.titre, parts: 6 }, { recette: g4.titre, parts: p4 }])
      constate('En base, après avoir réglé 6 parts', await retenues())
      await expect(encre(page)).toContainText(`${6 + p4} déjà retenues`)
      await photo(page, 'parts-reglees', 'Six parts pour la première : la carte encre recompte')

      // Régler la cible de la semaine.
      await page.getByRole('button', { name: '10 repas à couvrir' }).click()
      await page.getByLabel('Parts visées cette semaine').fill('8')
      await expect.poll(async () => (await db.from('cycle').select('servings_target')
        .eq('id', cycleId).single()).data?.servings_target, { timeout: 10_000 }).toBe(8)
      constate('En base, après avoir visé 8 repas', (await db.from('cycle').select('servings_target')
        .eq('id', cycleId).single()).data)
      await expect(encre(page).getByText('8 repas à couvrir')).toBeVisible()
      await photo(page, 'cible', 'La cible de la semaine : 8 repas')

      // « Retirer », une recette puis l'autre.
      await encre(page).getByRole('button', { name: 'Retirer' }).first().click()
      await expect.poll(async () => (await retenues()).length, { timeout: 10_000 }).toBe(1)
      constate('En base, après un premier « Retirer »', await retenues())
      await photo(page, 'une-retiree', 'Une recette retirée')
      await encre(page).getByRole('button', { name: 'Retirer' }).click()
      await expect.poll(retenues, { timeout: 10_000 }).toEqual([])
      constate('En base, après le second « Retirer »', await retenues())
      await expect(encre(page).getByText('Rien de retenu pour l’instant.', { exact: false })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Faire la liste' })).toBeDisabled()
      await photo(page, 'tout-retire', 'Tout est retiré : « Faire la liste » s’éteint')
      // Et la ligne de la liste redevient « + ».
      await expect(carte(page, g4.titre).getByRole('button', { name: `Ajouter ${g4.titre}` })).toBeVisible()
    } finally {
      await db.from('cycle_recipe').delete().eq('cycle_id', cycleId)
      await db.from('cycle').update({ servings_target: 10 }).eq('id', cycleId)
    }
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
  })

  test('7 · La fiche (i)', async ({ page }) => {
    test.setTimeout(150_000)
    const erreurs = surveille(page)
    await arrive(page)
    const g = GRAINES.find(x => x.i === 30)!
    const javascript = GRAINES.find(x => x.i === 27)!

    await cherche(page).fill(g.titre)
    const info = page.getByRole('button', { name: `${g.titre}, la recette en détail` })
    await info.click()
    const fiche = page.getByRole('dialog', { name: g.titre })
    await expect(fiche).toBeVisible()
    await expect(fiche.getByText('Faire tremper la viande 1 heure', { exact: false })).toBeVisible({ timeout: 10_000 })
    await photo(page, 'ouverte-haut', 'La fiche ouverte : la photo, le titre, le temps, les macros')

    // Les macros en valeur, avec leur précision.
    await expect(fiche.getByText('Par part')).toBeVisible()
    await expect(fiche.getByText(/^49–51\sg$/)).toBeVisible()
    await expect(fiche.getByText('de protéines')).toBeVisible()
    await expect(fiche.getByText('à 9 kcal près')).toBeVisible()
    await expect(fiche.getByText(/^497–515$/)).toBeVisible()
    // Les appareils de la recette, et leurs pictos dans les étapes.
    await expect(fiche.getByText('Autocuiseur', { exact: true })).toBeVisible()
    await expect(fiche.getByRole('listitem').filter({ hasText: 'faire revenir les lardons' })
      .getByRole('img', { name: 'Autocuiseur' })).toBeVisible()
    await expect(fiche.getByRole('listitem').filter({ hasText: 'Laisser cuire 60 minutes' })
      .getByRole('img', { name: 'Plaques' })).toBeVisible()
    // Les durées : les gestes d'abord, ce qui cuit seul ensuite.
    await expect(fiche.getByText('5 min · tes gestes')).toBeVisible()
    await expect(fiche.getByText('1 h · sans toi').first()).toBeVisible()
    await expect(fiche.getByText('6 min · à surveiller')).toBeVisible()
    await expect(fiche.getByText('15 min de gestes, le reste cuit seul')).toBeVisible()
    // Les ingrédients en deux colonnes : la quantité, puis le nom.
    for (const [qte, nom] of [['2 kg', 'Joue de bœuf'], ['200 g', 'Lardons'], ['1 kg', 'Carottes']]) {
      const ligne = fiche.getByRole('listitem').filter({ has: page.getByText(qte, { exact: true }) })
        .filter({ has: page.getByText(nom, { exact: true }) })
      await expect(ligne, `« ${qte} » et « ${nom} » ne sont pas sur une même ligne`).toHaveCount(1)
    }
    await fiche.getByText('Lardons', { exact: true }).scrollIntoViewIfNeeded()
    await photo(page, 'ingredients', 'Les ingrédients, quantité à gauche, nom à droite')
    await fiche.getByText('Laisser cuire 60 minutes.').scrollIntoViewIfNeeded()
    await photo(page, 'etapes', 'Les étapes, avec leurs pilules et leurs pictos d’appareil')

    // Le lien de la source, seulement quand c'est une adresse web.
    const lien = fiche.getByRole('link', { name: /Voir la recette sur exemple\.fr/ })
    await lien.scrollIntoViewIfNeeded()
    await expect(lien).toHaveAttribute('href', new RegExp(`^https://exemple\\.fr/banc-recettes/${STAMP}/30$`))
    await expect(lien).toHaveAttribute('rel', /noopener/)
    await photo(page, 'bas', 'Le bas de la fiche : le lien vers le site, et « Ajouter à dimanche »')
    const { data: source } = await db.from('recipe').select('source_url, yield_servings').eq('id', g.id).single()
    constate('En base, la source de la fiche', source)

    // Échap : la fiche se ferme, et le focus revient sur le bouton (i).
    await page.keyboard.press('Escape')
    await expect(fiche).toHaveCount(0)
    await expect(info, 'le focus n’est pas revenu sur le bouton (i)').toBeFocused()
    await photo(page, 'fermee-echap', 'Fermée par Échap : on est revenu sur la liste, le focus sur (i)')

    // Le voile : un clic hors de la fiche la ferme aussi.
    await info.click()
    await expect(fiche).toBeVisible()
    await page.mouse.click(8, 8)
    await expect(fiche).toHaveCount(0)
    await expect(info).toBeFocused()
    await photo(page, 'fermee-voile', 'Fermée par le voile')

    // Un lien qui n'est pas http(s) ne devient pas un lien.
    await cherche(page).fill(javascript.titre)
    await page.getByRole('button', { name: `${javascript.titre}, la recette en détail` }).click()
    const autre = page.getByRole('dialog', { name: javascript.titre })
    await expect(autre).toBeVisible()
    await expect(autre.getByText('Préparer et couper les ingrédients')).toBeVisible({ timeout: 10_000 })
    // La fourchette de protéines (« 45–49 g ») tient sur UNE ligne, quelle que soit celle des kcal.
    const chiffres = await autre.locator('.chiffre').filter({ hasText: /\sg$/ }).first().evaluate(
      (e: HTMLElement) => ({ texte: e.textContent, lignes: Math.round(e.getBoundingClientRect().height
        / parseFloat(getComputedStyle(e).lineHeight)) }))
    expect(chiffres, 'la fourchette de protéines passe à la ligne').toMatchObject({ lignes: 1 })
    await expect(autre.getByRole('link')).toHaveCount(0)
    await expect(autre.locator('a[href^="javascript:"]')).toHaveCount(0)
    await autre.getByRole('heading', { name: 'Étapes' }).scrollIntoViewIfNeeded()
    await photo(page, 'sans-lien', 'Une source « javascript: » : aucun lien dans la fiche')
    constate('En base, la source refusée par l’écran', (await db.from('recipe')
      .select('source_url').eq('id', javascript.id).single()).data)
    await page.keyboard.press('Escape')
    await expect(autre).toHaveCount(0)
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
  })

  test('8 · L’image neutre', async ({ page }) => {
    test.setTimeout(150_000)
    const erreurs = surveille(page)
    await arrive(page)
    await isole(page)
    await expect(compteur(page, 30)).toBeVisible({ timeout: 10_000 })

    const sans = GRAINES.find(g => g.photo === null && g.i === 2)!
    const cassee = GRAINES.find(g => g.photo === 'casse' && g.i === 7)!
    const bonne = GRAINES.find(g => g.photo === 'ok' && g.i === 1)!
    const { data: urls } = await db.from('recipe').select('title, image_url')
      .in('id', [sans.id, cassee.id, bonne.id])
    constate('En base, les adresses de photo', urls)

    // Pas de photo : l'image neutre.
    await expect(carte(page, sans.titre).locator('[data-photo="neutre"]')).toBeVisible()
    await expect(carte(page, sans.titre).locator('img')).toHaveCount(0)
    // Une photo qui ne charge pas : l'image neutre, après l'échec.
    await expect(carte(page, cassee.titre).locator('[data-photo="neutre"]'),
      'une photo en échec ne laisse pas l’image neutre').toBeVisible({ timeout: 15_000 })
    await expect(carte(page, cassee.titre).locator('img')).toHaveCount(0)
    // Une photo qui charge : l'image, pas le neutre.
    await expect(carte(page, bonne.titre).locator('[data-photo="neutre"]')).toHaveCount(0)
    await expect.poll(() => carte(page, bonne.titre).locator('img')
      .evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { timeout: 10_000 }).toBe(true)

    // Aucune image cassée sur l'écran : toutes celles qui restent ont chargé.
    const cassees = await page.locator('img').evaluateAll(
      (imgs: HTMLImageElement[]) => imgs.filter(i => i.complete && i.naturalWidth === 0).length)
    expect(cassees, 'une icône d’image cassée est visible').toBe(0)
    await carte(page, sans.titre).scrollIntoViewIfNeeded()
    await photo(page, 'liste', 'La liste : photos, image neutre sans photo, image neutre quand la photo échoue')

    // La carte encre : la même image neutre pour la recette retenue.
    try {
      await carte(page, cassee.titre).getByRole('button', { name: `Ajouter ${cassee.titre}` }).click()
      await expect(encre(page).getByText(cassee.titre)).toBeVisible({ timeout: 10_000 })
      await expect(encre(page).locator('[data-photo="neutre"]')).toHaveCount(1)
      await expect(encre(page).locator('img')).toHaveCount(0)
      await page.evaluate(() => window.scrollTo(0, 0))
      await photo(page, 'carte-encre', 'La carte encre : l’image neutre de la recette dont la photo échoue')
      constate('En base, la recette retenue', await retenues())

      // La fiche : la grande image neutre.
      await page.getByRole('button', { name: `${cassee.titre}, la recette en détail` }).click()
      const fiche = page.getByRole('dialog', { name: cassee.titre })
      await expect(fiche).toBeVisible()
      await expect(fiche.locator('[data-photo="neutre"]')).toBeVisible()
      await expect(fiche.locator('img')).toHaveCount(0)
      await photo(page, 'fiche-neutre', 'La fiche d’une recette sans photo : la grande image neutre')
      await page.keyboard.press('Escape')
      await expect(fiche).toHaveCount(0)

      const fiche2 = await (async () => {
        await page.getByRole('button', { name: `${bonne.titre}, la recette en détail` }).click()
        return page.getByRole('dialog', { name: bonne.titre })
      })()
      await expect(fiche2.locator('img')).toHaveCount(1)
      await expect.poll(() => fiche2.locator('img')
        .evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { timeout: 10_000 }).toBe(true)
      await photo(page, 'fiche-photo', 'La fiche d’une recette avec photo, pour comparer')
      await page.keyboard.press('Escape')
    } finally {
      await db.from('cycle_recipe').delete().eq('cycle_id', cycleId)
    }
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
  })

  test('9 · Une recette collée', async ({ page }) => {
    test.setTimeout(180_000)
    const erreurs = surveille(page)
    const TITRE_BONNE = 'Banc recettes 91 · Soupe collée du carnet'
    const TITRE_GEANTE = 'Banc recettes 92 · Marmite géante'

    const lue = (titre: string, kg: number) => ({
      titre, parts: kg === 8000 ? 1 : 4,
      ingredients: [
        { ordinal: 1, raw_text: kg === 8000 ? '8 kg d’oignons' : '300 g d’oignons',
          food_id: aliments.oignon, food_nom: 'Oignon, cru', qty: kg === 8000 ? 8 : 300,
          unit: kg === 8000 ? 'kg' : 'g', grams_reference: kg, confidence: 0.95 },
        ...(kg === 8000 ? [] : [{ ordinal: 2, raw_text: '400 g de carottes',
          food_id: aliments.carotte, food_nom: 'Carotte, crue', qty: 400, unit: 'g',
          grams_reference: 400, confidence: 0.93 }]),
      ],
      etapes: [
        { ordinal: 1, text: 'Éplucher et émincer les légumes', verb: 'émincer', duration_min: 5,
          duration_source: 'declaree', appliance_type: null, temperature_c: null,
          load_type: 'actif', gesture_min: 4, confidence: 0.9 },
        { ordinal: 2, text: 'Laisser mijoter à feu doux', verb: 'mijoter', duration_min: 30,
          duration_source: 'declaree', appliance_type: 'plaques', temperature_c: null,
          load_type: 'passif', gesture_min: 1, confidence: 0.88 },
      ],
      aCompleter: [], restantes: 9, quota: 20, ms: 1800, par: 'texte',
    })
    let reponse = lue(TITRE_BONNE, 300)
    await page.route('**/functions/v1/importer', r => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(reponse),
    }))
    await arrive(page)

    const colle = async (texte: string) => {
      await page.getByRole('button', { name: 'J’ai ma propre recette à coller' }).click()
      await expect(page.getByRole('heading', { name: /Coller\s*une recette/ })).toBeVisible()
      await page.getByRole('textbox').first().fill(texte)
    }

    // ── Une recette plausible ────────────────────────────────────────────
    await page.getByRole('button', { name: 'J’ai ma propre recette à coller' })
      .scrollIntoViewIfNeeded()
    await photo(page, 'bouton', '« J’ai ma propre recette à coller », en bas de la liste')
    await colle('Soupe du carnet, pour 4 : 300 g d’oignons, 400 g de carottes. '
      + 'Éplucher et émincer, puis laisser mijoter 30 minutes à feu doux.')
    await photo(page, 'texte-colle', 'Le texte collé, avant de ranger')
    await page.getByRole('button', { name: 'Ranger la recette' }).click()
    await expect(page.getByRole('heading', { name: /ce que j’ai compris/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('input').first()).toHaveValue(TITRE_BONNE)
    await photo(page, 'comprise', 'Ce que le modèle a compris : titre, ingrédients, étapes')
    await page.getByRole('button', { name: 'Garder cette recette' }).click()
    await expect(TITRE_CHOISIR(page)).toBeVisible({ timeout: 20_000 })

    const lueEnBase = async (titre: string) => {
      const { data } = await db.from('recipe')
        .select('id, title, origin, plannable, owner_household_id, yield_servings, active_time_min, import_note')
        .eq('title', titre).maybeSingle()
      if (!data) return null
      const { data: etapes } = await db.from('recipe_step')
        .select('ordinal, text, duration_min, gesture_min, load_type, appliance_type').eq('recipe_id', data.id).order('ordinal')
      const { data: nutrition } = await db.from('recipe_nutrition')
        .select('grams, kcal, protein_g, coverage').eq('recipe_id', data.id)
      const { count } = await db.from('recipe_ingredient')
        .select('*', { count: 'exact', head: true }).eq('recipe_id', data.id)
      return { recette: data, etapes, nutrition, ingredients: count }
    }

    const bonne = await lueEnBase(TITRE_BONNE)
    constate('En base, la recette collée', bonne)
    expect(bonne, 'la recette collée n’est pas en base').not.toBeNull()
    expect(bonne!.recette.origin).toBe('manuelle')
    expect(bonne!.recette.owner_household_id, 'elle n’appartient pas au foyer').toBe(foyerId)
    expect(bonne!.recette.plannable, 'toutes ses étapes ont une durée : elle se planifie').toBe(true)
    expect(bonne!.ingredients).toBe(2)
    expect(bonne!.etapes!.map(e => e.gesture_min).map(Number), 'les gestes de l’analyse ne sont pas gardés')
      .toEqual([4, 1])
    expect(bonne!.etapes!.map(e => e.load_type)).toEqual(['actif', 'passif'])
    // 5 min d'étape active + 1 min de gestes dans l'étape passive.
    expect(Number(bonne!.recette.active_time_min), 'le temps actif ne compte pas les gestes').toBe(6)
    expect(bonne!.nutrition, 'les macros plausibles ne sont pas écrites').toHaveLength(1)
    expect(Number(bonne!.nutrition![0].kcal)).toBeGreaterThan(20)

    // Elle apparaît dans « Choisir ».
    await cherche(page).fill(TITRE_BONNE)
    await expect(carte(page, TITRE_BONNE)).toBeVisible({ timeout: 15_000 })
    await expect(carte(page, TITRE_BONNE).getByText(/de protéines/)).toBeVisible()
    await expect(carte(page, TITRE_BONNE).getByText('6 min actives')).toBeVisible()
    await photo(page, 'dans-choisir', 'La recette collée apparaît dans « Choisir », avec ses macros')

    // ── Une recette aux macros impossibles ───────────────────────────────
    reponse = lue(TITRE_GEANTE, 8000)
    await cherche(page).fill('')
    await colle('Marmite géante, pour 1 : 8 kg d’oignons. Émincer, puis laisser mijoter 30 minutes.')
    await page.getByRole('button', { name: 'Ranger la recette' }).click()
    await expect(page.getByRole('heading', { name: /ce que j’ai compris/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('input').first()).toHaveValue(TITRE_GEANTE)
    await photo(page, 'comprise-impossible', 'Une part de 8 kg : l’écran la montre telle quelle')
    await page.getByRole('button', { name: 'Garder cette recette' }).click()
    await expect(TITRE_CHOISIR(page)).toBeVisible({ timeout: 20_000 })

    const geante = await lueEnBase(TITRE_GEANTE)
    constate('En base, la recette aux macros impossibles', geante)
    expect(geante, 'la recette n’est pas en base').not.toBeNull()
    expect(geante!.nutrition, 'des macros impossibles ont été écrites : elles serviraient à filtrer')
      .toEqual([])
    expect(geante!.etapes!.map(e => e.gesture_min).map(Number)).toEqual([4, 1])

    await cherche(page).fill(TITRE_GEANTE)
    await expect(carte(page, TITRE_GEANTE)).toBeVisible({ timeout: 15_000 })
    await expect(carte(page, TITRE_GEANTE).getByText('Macros inconnues')).toBeVisible()
    // Sans macros, elle n'est pas écartée par défaut, mais « ≥ 30 g de protéines » la retire.
    await page.getByRole('button', { name: '≥ 30 g de protéines' }).click()
    await expect(page.getByRole('article')).toHaveCount(0)
    await page.getByRole('button', { name: '≥ 30 g de protéines' }).click()
    await expect(carte(page, TITRE_GEANTE)).toBeVisible()
    await photo(page, 'sans-macros', 'Aucune macro écrite : « Macros inconnues »')
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
  })

  /*
   * Ce que la revue adverse de clôture a trouvé : des gestes qui échouent sans un
   * mot, des champs qu'on ne peut pas vider, des mots sans espace qui élargissent
   * la page. Une recette à elle, créée ici et retirée ici.
   */
  test('10 · Les cas limites de l’écran', async ({ page }) => {
    test.setTimeout(180_000)
    const erreurs = surveille(page)
    const TITRE_LONG = `Banc recettes 93 · ${'x'.repeat(200)}`
    const alerte = (texte: RegExp) => page.getByRole('alert').filter({ hasText: texte })

    // Sept appareils (la rangée de pictos), un ingrédient dont le « nom » est une adresse de 80 caractères.
    const CODES = ['four', 'plaques', 'air_fryer', 'micro_ondes', 'autocuiseur', 'blender', 'batteur']
    const URL_LONGUE = `https://exemple.fr/${'a'.repeat(61)}`
    const recette = ou(await db.from('recipe').insert({
      title: TITRE_LONG, yield_servings: 4, origin: 'importee', plannable: true,
      total_time_min: 60, source_name: 'exemple.fr',
    }).select('id').single())
    ou(await db.from('recipe_step').insert(CODES.map((a, n) => ({
      recipe_id: recette.id, ordinal: n + 1, load_type: 'passif', duration_min: 10, gesture_min: 1,
      appliance_type: a, text: n === 0 ? `Cuire ${'y'.repeat(150)}` : `Cuire (${a})`,
    }))).select('id'))
    ou(await db.from('recipe_ingredient').insert([
      { recipe_id: recette.id, ordinal: 1, raw_text: `1 kg de ${URL_LONGUE}` },
      { recipe_id: recette.id, ordinal: 2, raw_text: '2 oignons' },
    ]).select('id'))
    // Des fourchettes à trois chiffres : « 385–425 kcal » doit tenir sur une ligne.
    ou(await db.from('recipe_nutrition').insert({
      recipe_id: recette.id, grams: 340, kcal: 405, protein_g: 24, fiber_g: 6, carb_g: 50, fat_g: 15,
      kcal_margin: 20, protein_g_margin: 2, coverage: 0.8,
    }).select('recipe_id'))

    try {
      await arrive(page)
      await isole(page, 'banc recettes 93')
      await expect(page.getByRole('article')).toHaveCount(1, { timeout: 15_000 })
      const c = carte(page, TITRE_LONG)
      const ajouter = c.getByRole('button', { name: `Ajouter ${TITRE_LONG}` })
      const champ = page.getByLabel(`Parts de ${TITRE_LONG}`)
      const partsEnBase = async () => (await retenues()).map(r => r.parts)
      /* Un refus du réseau sur UNE méthode : l'écriture rate, la lecture continue. */
      const casse = (motif: RegExp, methode: string) => page.route(motif, r =>
        r.request().method() === methode ? r.abort('failed') : r.continue())
      const REST_RETENUES = /\/rest\/v1\/cycle_recipe/
      const REST_CYCLE = /\/rest\/v1\/cycle\?/

      // ── 1 · Un geste qui rate le dit, et le dit près de lui ───────────────
      await casse(REST_RETENUES, 'POST')
      await ajouter.click()
      await expect(alerte(/Je n’ai pas pu retenir cette recette/).first(),
        'un « + » qui échoue ne dit rien').toBeVisible({ timeout: 10_000 })
      expect(await retenues(), 'le « + » raté a écrit quand même').toEqual([])
      await expect(c.getByLabel('Retenue', { exact: true })).toHaveCount(0)
      await photo(page, 'ajout-rate', 'Un « + » qui échoue : le message, la ligne reste à ajouter')
      await page.unroute(REST_RETENUES)
      await ajouter.click()
      await expect(c.getByLabel('Retenue', { exact: true })).toBeVisible({ timeout: 10_000 })
      await expect(alerte(/Je n’ai pas pu retenir/), 'le message reste après un succès').toHaveCount(0)
      expect(await partsEnBase()).toEqual([4])

      await page.evaluate(() => window.scrollTo(0, 0))

      // ── 2 · L'anneau de focus se voit sur l'encre : `fond`, pas `herbe` (1,9:1) ──
      const anneau = (l: Locator) => l.evaluate(e => {
        const s = getComputedStyle(e)
        return { couleur: s.outlineColor, style: s.outlineStyle, largeur: s.outlineWidth }
      })
      const ANNEAU_CLAIR = { couleur: 'rgb(242, 244, 239)', style: 'solid', largeur: '2px' }
      const retirer = encre(page).getByRole('button', { name: 'Retirer' })
      await champ.press('Tab') // au clavier : c'est ce qui allume `:focus-visible`
      await expect(retirer).toBeFocused()
      expect(await anneau(retirer), '« Retirer » : anneau invisible sur l’encre').toEqual(ANNEAU_CLAIR)
      await retirer.press('Shift+Tab')
      await expect(champ).toBeFocused()
      expect(await anneau(champ), 'le champ des parts : anneau invisible sur l’encre').toEqual(ANNEAU_CLAIR)
      const pastille = encre(page).getByRole('button', { name: /repas à couvrir/ })
      await pastille.focus()
      expect(await anneau(pastille), 'la pastille : anneau invisible sur l’encre').toEqual(ANNEAU_CLAIR)
      await photo(page, 'anneau-sur-encre', 'Le focus clavier sur la pastille : un anneau clair sur l’encre')
      // Les parts : un décimal et un nombre trop grand sont refusés sans rien écrire.
      await champ.fill('2.5')
      await expect(alerte(/nombres entiers/)).toBeVisible()
      await champ.fill('21')
      await expect(alerte(/Pas plus de 20 parts\./)).toBeVisible()
      await page.waitForTimeout(600)
      expect(await partsEnBase(), 'un refus du champ a quand même écrit').toEqual([4])
      // Les parts, quand le réseau lâche.
      await casse(REST_RETENUES, 'POST')
      await champ.fill('7')
      await expect(alerte(/Je n’ai pas pu changer les parts\./)).toBeVisible({ timeout: 10_000 })
      expect(await partsEnBase()).toEqual([4])
      await page.unroute(REST_RETENUES)
      await champ.fill('8')
      await expect.poll(partsEnBase, { timeout: 10_000 }).toEqual([8])
      await expect(alerte(/Je n’ai pas pu changer les parts/)).toHaveCount(0)

      // ── 3 · Le champ des parts : 44 px, il se vide, « effacer puis 12 » = 12 ──
      const boite = await champ.boundingBox()
      expect(boite!.height, 'la cible du champ de parts fait moins de 44 px').toBeGreaterThanOrEqual(44)
      await champ.click()
      await page.keyboard.press('Control+A')
      await page.keyboard.press('Backspace')
      await expect(champ, 'le champ se remplit de lui-même quand on l’efface').toHaveValue('')
      await page.waitForTimeout(600)
      await expect(champ, 'le champ vide est revenu à une valeur').toHaveValue('')
      expect(await partsEnBase(), 'un champ vide a écrit quelque chose').toEqual([8])
      await page.keyboard.type('12')
      await expect(champ, '« effacer puis 12 » donne autre chose que 12').toHaveValue('12')
      await expect.poll(partsEnBase, { timeout: 10_000 }).toEqual([12])
      // Sorti vide, le champ reprend la valeur de la base ; Entrée valide et le quitte.
      await page.keyboard.press('Control+A')
      await page.keyboard.press('Backspace')
      await page.keyboard.press('Tab')
      await expect(champ).toHaveValue('12')
      await champ.fill('9')
      await champ.press('Enter')
      await expect.poll(partsEnBase, { timeout: 10_000 }).toEqual([9])
      await expect(champ, 'Entrée ne quitte pas le champ').not.toBeFocused()
      await expect(champ).toHaveValue('9')

      // ── 4 · Un mot sans espace n'élargit ni la page, ni la carte, ni la fiche ──
      const largeurs = (l: Locator) => l.evaluate(e => ({ contenu: e.scrollWidth, boite: e.clientWidth }))
      const tient = async (l: Locator, quoi: string) => {
        const w = await largeurs(l)
        expect(w.contenu, `${quoi} déborde (${w.contenu} px pour ${w.boite})`).toBeLessThanOrEqual(w.boite)
      }
      await tient(page.locator('html'), 'la page de « Choisir », avec un titre de 200 caractères,')
      await tient(c, 'la vignette')
      await tient(encre(page), 'la carte encre')
      await photo(page, 'mot-long-liste', 'Un titre de 200 caractères sans espace : la liste ne déborde pas')
      await page.getByRole('button', { name: `${TITRE_LONG}, la recette en détail` }).click()
      const fiche = page.getByRole('dialog', { name: TITRE_LONG })
      await expect(fiche.getByText(URL_LONGUE, { exact: false }).first()).toBeVisible({ timeout: 10_000 })
      await tient(fiche.locator('.overflow-y-auto').first(), 'la fiche (ingrédient de 80 caractères, titre de 200)')
      await tient(page.locator('html'), 'la page derrière la fiche')
      await photo(page, 'mot-long-fiche', 'La fiche : titre de 200 caractères et adresse en guise d’ingrédient')
      await page.keyboard.press('Escape')
      await expect(fiche).toHaveCount(0)

      // Les parts visées : refus du plafond, puis réseau qui lâche.
      await page.getByRole('button', { name: '10 repas à couvrir' }).click()
      const cible = page.getByLabel('Parts visées cette semaine')
      await cible.fill('41')
      await expect(alerte(/Pas plus de 40 parts\./)).toBeVisible()
      await casse(REST_CYCLE, 'PATCH')
      await cible.fill('9')
      await expect(alerte(/Je n’ai pas pu changer les parts visées\./)).toBeVisible({ timeout: 10_000 })
      await page.unroute(REST_CYCLE)
      await cible.fill('11')
      await expect.poll(async () => (await db.from('cycle').select('servings_target')
        .eq('id', cycleId).single()).data?.servings_target, { timeout: 10_000 }).toBe(11)

      // « Retirer » qui rate : la recette reste retenue, et on le dit.
      await casse(REST_RETENUES, 'DELETE')
      await encre(page).getByRole('button', { name: 'Retirer' }).click()
      await expect(alerte(/Je n’ai pas pu retirer cette recette/)).toBeVisible({ timeout: 10_000 })
      expect(await partsEnBase(), 'le « Retirer » raté a retiré quand même').toEqual([9])
      await photo(page, 'retrait-rate', 'Un « Retirer » qui échoue : le message dans la carte encre')
      await page.unroute(REST_RETENUES)
      await encre(page).getByRole('button', { name: 'Retirer' }).click()
      await expect.poll(retenues, { timeout: 10_000 }).toEqual([])
      await expect(alerte(/Je n’ai pas pu retirer/)).toHaveCount(0)
    } finally {
      await db.from('cycle_recipe').delete().eq('cycle_id', cycleId)
      await db.from('cycle').update({ servings_target: 10 }).eq('id', cycleId)
      await db.from('recipe').delete().eq('id', recette.id)
    }
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
  })
})
