/**
 * Le foyer de démonstration sur lequel les écrans sont rendus.
 *
 * Il est construit en base avec la clé de service, PAS par l'interface : un
 * test de fumée doit dire si un écran s'affiche, pas échouer parce qu'un
 * formulaire trois écrans plus tôt a changé de libellé.
 *
 * Les données sont choisies pour que chaque écran ait quelque chose à montrer —
 * un écran vide passerait le test sans rien prouver.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config()

const URL = process.env.VITE_SUPABASE_URL!
const db = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } })

export const MOT_DE_PASSE = 'fumee-e2e-12345'

export type Foyer = {
  email: string
  userId: string
  householdId: string
  cycleId: string
}

function ou<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  if (data === null) throw new Error('la base n’a rien rendu')
  return data
}

const jour = (decalage: number) => {
  const d = new Date()
  d.setDate(d.getDate() + decalage)
  return d.toISOString().slice(0, 10)
}

export async function amorce(): Promise<Foyer> {
  const email = `fumee-${Date.now()}@test.local`
  const u = ou(await db.auth.admin.createUser({
    email, password: MOT_DE_PASSE, email_confirm: true,
  }))
  const foyer = ou(await db.from('household')
    .insert({ name: 'Foyer de fumée', food_budget_eur: 320 }).select().single())
  ou(await db.from('user_profile').insert({
    id: u.user.id, household_id: foyer.id, display_name: 'Kamil', password_set: true,
  }).select().single())
  ou(await db.from('nutrition_target').insert({
    user_profile_id: u.user.id, kcal: 2200, protein_g: 150,
    fiber_g: 30, carb_g: 220, fat_g: 70,
  }).select().single())

  const magasin = ou(await db.from('store')
    .insert({ household_id: foyer.id, name: 'Super U', is_default: true }).select().single())

  // L'oignon du référentiel : il porte un poids unitaire de référence, donc
  // l'écran de pesée peut annoncer « on compte 110 g en attendant ».
  const oignon = ou(await db.from('food')
    .select('id').eq('source', 'ciqual').eq('source_code', '20034').single()).id

  // ── Deux recettes complètes : le catalogue doit avoir de quoi filtrer ────
  const recettes = []
  for (const [titre, kcal, prot] of [
    ['Dahl de lentilles corail', 620, 34], ['Poulet rôti aux herbes', 540, 46],
  ] as const) {
    const r = ou(await db.from('recipe').insert({
      title: titre, yield_servings: 4, total_time_min: 45,
      origin: 'importee', source_name: 'exemple.fr',
      source_url: `https://exemple.fr/${encodeURIComponent(titre)}-${Date.now()}`,
      plannable: true, freezable: true,
    }).select().single())
    ou(await db.from('recipe_step').insert([
      { recipe_id: r.id, ordinal: 1, text: 'Émincer les oignons',
        duration_min: 8, load_type: 'actif' },
      { recipe_id: r.id, ordinal: 2, text: 'Laisser mijoter', duration_min: 25,
        load_type: 'passif', appliance_type: 'plaques' },
    ]).select())
    // Une ligne AU COMPTE (« 2 oignons ») : quantité posée, unité vide. C'est
    // exactement ce que l'écran de pesée doit réclamer.
    ou(await db.from('recipe_ingredient').insert([
      { recipe_id: r.id, ordinal: 1, raw_text: '2 oignons', qty: 2, unit: null,
        food_id: oignon },
      { recipe_id: r.id, ordinal: 2, raw_text: '400 g de lentilles corail',
        qty: 400, unit: 'g', grams_reference: 400 },
    ]).select())
    ou(await db.from('recipe_nutrition').insert({
      recipe_id: r.id, grams: 340, kcal, protein_g: prot,
      fiber_g: 9, carb_g: 60, fat_g: 18,
      kcal_margin: 30, protein_g_margin: 2, coverage: 0.92,
    }).select().single())
    recettes.push(r)
  }

  // ── Un cycle en cours, avec sa liste et ses barquettes ───────────────────
  const cycle = ou(await db.from('cycle').insert({
    household_id: foyer.id, week_of: jour(0), state: 'semaine', servings_target: 8,
  }).select().single())
  for (const r of recettes) {
    ou(await db.from('cycle_recipe')
      .insert({ cycle_id: cycle.id, recipe_id: r.id, servings: 4 }).select().single())
  }

  ou(await db.from('shopping_item').insert([
    { cycle_id: cycle.id, household_id: foyer.id, store_id: magasin.id,
      label: 'poulet', aisle: 'Boucherie', quantity: 800, unit: 'g', est_price_eur: 7 },
    { cycle_id: cycle.id, household_id: foyer.id, store_id: magasin.id,
      label: 'lentilles corail', aisle: 'Épicerie', quantity: 400, unit: 'g',
      est_price_eur: 2.4 },
    { cycle_id: cycle.id, household_id: foyer.id, store_id: magasin.id,
      label: 'oignon', aisle: 'Fruits et légumes', quantity: 3, unit: 'u' },
  ]).select())

  const parts = ou(await db.from('portion').insert(
    recettes.flatMap(r => [0, 1].map(() => ({
      household_id: foyer.id, cycle_id: cycle.id, recipe_id: r.id,
      label: r.title!, grams: 340,
      kcal: r.title!.startsWith('Dahl') ? 620 : 540,
      protein_g: r.title!.startsWith('Dahl') ? 34 : 46,
      fiber_g: 9, carb_g: 60, fat_g: 18,
    }))),
  ).select())

  // Deux dîners déjà mangés, un jour laissé vide : c'est le trou du graphique
  // qui prouve que l'écran ne compte pas les blancs comme des zéros (D33).
  ou(await db.from('meal_slot').insert([
    { household_id: foyer.id, cycle_id: cycle.id, user_profile_id: u.user.id,
      day: jour(-2), meal: 'diner', portion_id: parts[0].id,
      state: 'mange', eaten_at: new Date().toISOString() },
    { household_id: foyer.id, cycle_id: cycle.id, user_profile_id: u.user.id,
      day: jour(-1), meal: 'diner', portion_id: parts[1].id,
      state: 'mange', eaten_at: new Date().toISOString() },
  ]).select())

  ou(await db.from('stock_item').insert([
    { household_id: foyer.id, label: 'yaourt nature', quantity: 4, unit: 'pot', location: 'frigo' },
    { household_id: foyer.id, label: 'beurre', quantity: 1, unit: 'u', location: 'frigo' },
  ]).select())

  return { email, userId: u.user.id, householdId: foyer.id, cycleId: cycle.id }
}

/**
 * Un vrai lien de RÉINITIALISATION, tel que Supabase l'envoie par e-mail.
 *
 * C'est la seule façon d'éprouver ce parcours de bout en bout : vérifier que
 * trois boutons existent ne dit rien de ce qui se passe au retour du lien, et
 * c'est précisément là que le défaut vivait.
 */
export async function lienDeReinitialisation(email: string): Promise<string> {
  const { data, error } = await db.auth.admin.generateLink({
    type: 'recovery', email,
    // ⚠️ Sans cela, le lien redirige vers le `site_url` du projet — la machine
    //    de développement — et pas vers le serveur de test.
    options: { redirectTo: 'http://127.0.0.1:4173/' },
  })
  if (error) throw error
  const brut = data.properties.action_link
  // Le lien passe par `/auth/v1/verify`, qui redirige vers l'application avec
  // le fragment `#access_token=…&type=recovery`. On garde l'URL telle quelle :
  // c'est ce que quelqu'un ouvre depuis sa boîte mail.
  return brut
}

/**
 * Remet le mot de passe d'origine.
 *
 * Le test de réinitialisation en pose forcément un nouveau — c'est son objet —
 * et tous les tests suivants se connectent avec celui de l'amorce. Sans cette
 * remise en état, il les faisait tous échouer derrière lui, et l'échec
 * apparaissait sur un test sans rapport.
 */
export async function remetLeMotDePasse(f: Foyer) {
  const { error } = await db.auth.admin.updateUserById(f.userId, { password: MOT_DE_PASSE })
  if (error) throw error
}

export async function efface(f: Foyer) {
  await db.auth.admin.deleteUser(f.userId)
  await db.from('household').delete().eq('id', f.householdId)
}
