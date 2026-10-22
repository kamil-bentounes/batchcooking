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
/** Le client de service. Exporté pour les parcours qui doivent poser ou
 *  vérifier des faits que l'interface ne montre pas. */
export const db = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } })

export const MOT_DE_PASSE = 'fumee-e2e-12345'

export type Foyer = {
  email: string
  userId: string
  /** La SECONDE personne du foyer. Voir l'amorce : sans elle, tout l'objet de
      l'application n'était photographié nulle part. */
  elleId: string
  /** Son adresse, pour se connecter À SA PLACE : ce qu'elle voit d'elle-même
      n'était photographié nulle part non plus. */
  elleEmail: string
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

/**
 * `budget: false` sème le foyer SANS un centime : ni revenu, ni compte, ni
 * charge, ni enveloppe, ni épargne. C'est le tout premier soir — le premier
 * écran que deux personnes voient — et il n'était photographié nulle part.
 */
export async function amorce(
  o: { budget?: boolean; cycleEtat?: string } = {},
): Promise<Foyer> {
  const avecBudget = o.budget !== false
  /* ⚠️ L'état du cycle se sème À L'INSERT, jamais après.
     Les transitions sont un graphe à SENS UNIQUE — `semaine` ne mène qu'à
     `cloture` ou `interrompue` — et un banc qui veut rejouer le cycle entier ne
     peut donc pas remonter au début. Il le sème au départ. */
  const cycleEtat = o.cycleEtat ?? 'semaine'
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
    household_id: foyer.id, week_of: jour(0), state: cycleEtat, servings_target: 8,
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

  /*
   * Le budget, semé lui aussi.
   *
   * Sans ces lignes, les deux audits de `parcours.spec.ts` — cibles tactiles et
   * contrastes — tournaient sur des écrans de budget VIDES : ils ne mesuraient
   * ni l'ocre d'une enveloppe dépassée, ni le gris d'une ligne de charge, ni la
   * cible de « Retirer ». Un audit qui ne voit rien ne trouve rien, et c'est
   * exactement le « test vide » que ce dépôt s'est déjà reproché.
   */
  /* ⚠️ DEUX personnes, et c'est le point.
     Toutes les captures étaient celles d'un foyer SOLO : le partage au
     prorata, « Kamil et Thauba » sur une ligne, « Changer qui participe », ce
     que chacun doit — le sujet même de l'application — n'était photographié
     nulle part. Le seul écran à deux qui existait, celui du parcours
     d'invitation, a montré du premier coup un bouton qui sortait de la carte.

     `user_profile.id` référence `auth.users` : elle a donc un vrai compte, même
     si aucune capture ne s'y connecte — l'invitation a déjà son parcours. */
  const elleEmail = `thauba-${Date.now()}@test.local`
  const ue = ou(await db.auth.admin.createUser({
    email: elleEmail, password: MOT_DE_PASSE, email_confirm: true,
  }))
  const elle = ue.user.id
  ou(await db.from('user_profile').insert({
    id: elle, household_id: foyer.id, display_name: 'Thauba', password_set: true,
    entre_le: `${new Date().getFullYear()}-01-01`,
  }).select())
  /* ⚠️ `entre_le` par DÉFAUT vaut aujourd'hui, et aucun mois passé ne
     contenait alors la moindre dépense : `ouvre_le_mois` exige un participant
     déjà arrivé. Les captures d'un mois vécu montraient donc un écran vide, et
     le bouton « ce mois est déjà réglé » n'était jamais atteignable. On habite
     là depuis janvier, ce qui est aussi le cas ordinaire. */
  ou(await db.from('user_profile')
    .update({ entre_le: `${new Date().getFullYear()}-01-01` })
    .eq('id', u.user.id).select())

  if (!avecBudget) {
    return { email, userId: u.user.id, elleId: elle, elleEmail,
             householdId: foyer.id, cycleId: cycle.id }
  }

  for (const [qui, cents] of [[u.user.id, 370_000], [elle, 240_000]] as const) {
    ou(await db.from('revenu').insert({
      household_id: foyer.id, user_profile_id: qui,
      net_mensuel_cents: cents, valid_from: moisCourant(),
    }).select())
  }
  /* Le premier revenu de chacun remonte au mois de son arrivée, janvier (0103) :
     les mois passés ont donc un revenu. C'est ce qui rend le mois précédent
     « à clôturer » — sur le hub, et dans le bandeau. */

  const compte = ou(await db.from('compte').insert({
    household_id: foyer.id, nom: 'Compte commun', genre: 'commun', matelas_cents: 100_000,
  }).select().single())

  /* Une charge de chaque façon, dans plusieurs catégories. Sans catégorie, tout
     tombait dans « Autre », et l'écran du mois n'avait qu'une carte. */
  for (const c of [
    { libelle: 'Internet', cents: 3_700, mode: 'fixe', categorie: 'maison', pour: 'deux',
      compte: true, periodicite: 'mensuel' },
    { libelle: 'Électricité', cents: 5_000, mode: 'facture', categorie: 'maison', pour: 'deux',
      compte: true, periodicite: 'mensuel' },
    { libelle: 'Courses', cents: 80_000, mode: 'au_fil', categorie: 'vie_courante', pour: 'deux',
      compte: true, periodicite: 'mensuel' },
    { libelle: 'Restaurant', cents: 26_000, mode: 'au_fil', categorie: 'vie_courante',
      pour: 'deux', compte: true, periodicite: 'mensuel' },
    /* Une charge PERSO de chacun : D80 — le foyer voit tout, mais « Il te reste »
       ne compte que ses parts. */
    { libelle: 'Forfait mobile', cents: 1_990, mode: 'fixe', categorie: 'abonnements',
      pour: 'lui', compte: true, periodicite: 'mensuel' },
    { libelle: 'Pharmacie', cents: 2_000, mode: 'au_fil', categorie: 'sante', pour: 'elle',
      compte: true, periodicite: 'mensuel' },
    { libelle: 'Entretien auto', cents: 50_004, mode: 'mis_de_cote', categorie: 'auto',
      pour: 'lui', compte: true, periodicite: 'annuel' },
    /* La pire ligne : un libellé long, NON MENSUELLE, et SANS COMPTE — trois
       actions côte à côte dans « Mes charges ». */
    { libelle: 'Charges de copropriété du bâtiment B', cents: 30_000, mode: 'mis_de_cote',
      categorie: 'maison', pour: 'deux', compte: false, periodicite: 'trimestriel' },
    /* Les BORNES : 80 caractères, un montant à six chiffres. */
    { libelle: 'Crédit immobilier de la résidence principale et de '
               + 'l’investissement locatif', cents: 158_000, mode: 'fixe',
      categorie: 'credits', pour: 'deux', compte: true, periodicite: 'mensuel' },
    { libelle: 'Impôt sur le revenu', cents: 1_284_000, mode: 'mis_de_cote',
      categorie: 'impots', pour: 'deux', compte: true, periodicite: 'annuel' },
  ]) {
    const charge = ou(await db.from('charge').insert({
      household_id: foyer.id, libelle: c.libelle, montant_cents: c.cents,
      periodicite: c.periodicite, mode: c.mode, categorie: c.categorie,
      debut: `${new Date().getFullYear()}-01-01`, compte_id: c.compte ? compte.id : null,
      commun: c.pour === 'deux',
    }).select().single())
    const qui = c.pour === 'deux' ? [u.user.id, elle] : c.pour === 'elle' ? [elle] : [u.user.id]
    ou(await db.from('charge_participant').insert(qui.map(p => ({
      charge_id: charge.id, user_profile_id: p, household_id: foyer.id,
    }))).select())
  }

  const poche = ou(await db.from('poche_epargne').insert({
    household_id: foyer.id, libelle: 'Urgence', genre: 'urgence', objectif_cents: 450_000,
  }).select().single())
  ou(await db.from('versement_epargne').insert({
    household_id: foyer.id, poche_id: poche.id, user_profile_id: u.user.id,
    montant_cents: 31_000,
  }).select())

  return { email, userId: u.user.id, elleId: elle, elleEmail,
           householdId: foyer.id, cycleId: cycle.id }
}

/** Le premier du mois courant, en heure LOCALE. */
function moisCourant(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
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

/**
 * Quelqu'un d'AUTHENTIFIÉ mais SANS FOYER.
 *
 * `Onboarding` est le premier écran d'une personne qui arrive sans son lien
 * d'invitation, et il n'était rendu par aucune capture — zéro branche mesurée.
 * C'est pourtant là que se joue le choix entre « crée ton foyer » et « on
 * t'attend », et ce choix décide si un couple se retrouve avec deux budgets
 * séparés.
 */
export async function sansFoyer(): Promise<{ email: string; userId: string }> {
  /* ⚠️ On remet le verrou dans l'état de la PRODUCTION.
     0070 referme la création dès qu'un foyer existe, mais les tests unitaires
     la rouvrent pour éprouver un autre garde, et l'ordre d'exécution décidait
     donc de ce que cette capture montre. Une image qui dépend du test d'à côté
     ne prouve rien. */
  ou(await db.from('instance_setting')
    .update({ value: { enabled: false } })
    .eq('key', 'allow_household_creation').select())

  const email = `sans-foyer-${Date.now()}@test.local`
  const u = ou(await db.auth.admin.createUser({
    email, password: MOT_DE_PASSE, email_confirm: true,
  }))
  return { email, userId: u.user.id }
}

export async function efface(f: Foyer) {
  /* Les deux recettes semées appartiennent au CATALOGUE (aucun foyer propriétaire) : effacer le
     foyer ne les retirait pas, et chaque passage de banc en laissait deux de plus — 44 « Dahl » et
     « Poulet » en double dans la liste locale à la fin du grand test. On les retire avec le
     foyer, seulement si ce sont les nôtres (`exemple.fr`) et que rien d'autre ne s'en sert. */
  const { data: lignes } = await db.from('cycle_recipe').select('recipe_id').eq('household_id', f.householdId)
  const ids = [...new Set((lignes ?? []).map(l => l.recipe_id))]
  await db.from('cycle_recipe').delete().eq('household_id', f.householdId)
  if (ids.length > 0) {
    await db.from('recipe').delete().in('id', ids).eq('source_name', 'exemple.fr').is('owner_household_id', null)
  }
  await db.auth.admin.deleteUser(f.userId)
  if (f.elleId) await db.auth.admin.deleteUser(f.elleId)
  await db.from('household').delete().eq('id', f.householdId)
}
