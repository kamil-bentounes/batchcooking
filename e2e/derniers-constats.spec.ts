/**
 * Le grand test (22/10), la revue adverse du front des correctifs : un test par défaut corrigé,
 * rejoué au clic, et vu rougir sur le code d'avant.
 *
 *   1. mode avion : une écriture échoue tout de suite (« Pas de réseau »), ne part pas à la
 *      reconnexion, et n'est pas écrite deux fois ; les lectures disent aussi la coupure ;
 *   2. jeton expiré + réseau coupé : « Hors ligne », pas « Entrer » ;
 *   3. `current_household` en 503 : « Ça ne répond pas », jamais « aucun foyer » ; en cours
 *      d'usage, une relecture ratée garde l'écran (et ce qu'on y a tapé) ;
 *   4. courses : la quantité qui manque d'une ligne déjà prise revient à la régénération ;
 *   5. épargne : « Je retire » attend le solde ;
 *   6. mois clos d'avant l'arrivée : une phrase honnête, pas de « Revenir dessus » ;
 *   8. courses : l'erreur d'un geste en bas de liste reste à l'écran ;
 *   9. cuisine : le focus suit la question d'interruption ; quitter une session d'ami se rattrape ;
 *      une session interrompue d'il y a un mois n'est plus proposée.
 *
 * ⚠️ LOCAL, ET RIEN D'AUTRE.
 */
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, db, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'
import { remetLHeure } from './horloge.ts'

test.use({ viewport: { width: 390, height: 844 }, actionTimeout: 15_000 })
test.beforeAll(async () => {
  if (!/127\.0\.0\.1|localhost/.test(process.env.VITE_SUPABASE_URL ?? '')) {
    throw new Error('Ce banc ne se joue qu’en local.')
  }
  await remetLHeure()
})

/** Un foyer neuf pour UN test, effacé ensuite : ces tests changent l'état du cycle et de la base. */
async function avecFoyer(o: Parameters<typeof amorce>[0], jeu: (f: Foyer) => Promise<void>) {
  /* PostgREST ferme ses connexions quand le banc remet l'heure de la base : le premier amorçage
     peut tomber dessus (« terminating connection due to administrator command »). */
  let f: Foyer | undefined
  for (let essai = 0; !f; essai++) {
    try { f = await amorce(o) } catch (e) {
      if (essai >= 2) throw e
      await new Promise(r => setTimeout(r, 1_500))
    }
  }
  try { await jeu(f) } finally { await efface(f) }
}

async function connecte(page: Page, f: Foyer, email = f.email) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

/** Va à une adresse SANS recharger la page (ce que fait `va`), pour que le réseau coupé reste coupé. */
const va = (page: Page, chemin: string) => page.evaluate(c => {
  window.history.pushState(null, '', c)
  window.dispatchEvent(new PopStateEvent('popstate'))
}, chemin)

const lemoisPrecedent = () => {
  const d = new Date()
  const p = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`
}

/* ── 1 · Le mode avion ─────────────────────────────────────────────────────────────────────── */

test('mode avion : « Ajouter 9 € » échoue tout de suite, ne part pas au retour du réseau, et ne s’écrit qu’une fois', async ({ page, context }) => {
  await avecFoyer({}, async f => {
    await connecte(page, f)
    await page.goto('/budget')
    const cat = page.getByRole('region', { name: 'Catégorie Vie courante' }).locator('button[aria-expanded]').first()
    await expect(cat).toBeVisible({ timeout: 15_000 })
    if (await cat.getAttribute('aria-expanded') === 'false') await cat.click()
    await page.getByRole('button', { name: 'Déclarer pour Courses' }).click()
    const feuille = page.getByRole('dialog', { name: 'Courses' })
    await expect(feuille).toBeVisible()
    const saisies = async () => (await db.from('saisie').select('id').eq('household_id', f.householdId)).data?.length

    await context.setOffline(true)
    expect(await page.evaluate(() => navigator.onLine), 'le banc ne coupe pas vraiment le réseau').toBe(false)
    await feuille.getByLabel('Nouvelle dépense').fill('9')
    await feuille.getByRole('button', { name: 'Ajouter 9 €' }).click()
    await expect(feuille.getByText(/Pas de réseau/)).toBeVisible({ timeout: 5_000 })
    await expect(feuille.getByRole('button', { name: /J’ajoute/ }), 'l’écriture est restée en pause').toHaveCount(0)

    // Le réseau revient : rien ne part tout seul.
    await context.setOffline(false)
    await page.waitForTimeout(2_000)
    expect(await saisies(), 'l’écriture en pause est partie au retour du réseau').toBe(0)

    // On recommence, une fois : une seule saisie en base.
    await feuille.getByRole('button', { name: 'Ajouter 9 €' }).click()
    await expect.poll(saisies, { timeout: 10_000 }).toBe(1)
    await page.waitForTimeout(1_000)
    expect(await saisies(), 'la saisie est écrite deux fois').toBe(1)
  })
})

test('mode avion : une lecture dit la coupure au lieu d’« Un instant… » sans fin', async ({ page, context }) => {
  test.setTimeout(60_000)
  await avecFoyer({}, async f => {
    await connecte(page, f)
    await context.setOffline(true)
    await va(page, '/charges')
    await expect(page.getByText(/Pas de réseau|plus de connexion/).first()).toBeVisible({ timeout: 25_000 })
    await context.setOffline(false)
  })
})

/* ── 2 et 3 · Le jeton expiré, la base qui ne répond pas ───────────────────────────────────── */

test('jeton expiré et réseau coupé : « Hors ligne », jamais « Entrer »', async ({ page }) => {
  test.setTimeout(90_000)
  await avecFoyer({}, async f => {
    await connecte(page, f)
    // Le jeton a plus d'une heure : auth-js doit le rafraîchir, et le réseau manque.
    await page.evaluate(() => {
      const cle = Object.keys(localStorage).find(k => k.endsWith('-auth-token'))!
      const s = JSON.parse(localStorage.getItem(cle)!)
      s.expires_at = Math.floor(Date.now() / 1000) - 3_600
      localStorage.setItem(cle, JSON.stringify(s))
    })
    await page.route('**/127.0.0.1:54321/**', r => r.abort('internetdisconnected'))
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Hors ligne' })).toBeVisible({ timeout: 45_000 })
    await expect(page.getByRole('button', { name: 'Entrer', exact: true })).toHaveCount(0)
    await expect(page.getByText('Ta session a expiré')).toHaveCount(0)

    // Le réseau revient, l'appli se rouvre : le jeton se rafraîchit, et elle s'ouvre. (Pas par
    // « Réessayer » : auth-js garde une minute l'échec d'un rafraîchissement pour ce même jeton.)
    await page.unroute('**/127.0.0.1:54321/**')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 20_000 })
  })
})

test('current_household en 503 : « Ça ne répond pas », jamais « aucun foyer »', async ({ page }) => {
  test.setTimeout(60_000)
  await avecFoyer({}, async f => {
    await connecte(page, f)
    await page.route('**/rest/v1/rpc/current_household', r =>
      r.fulfill({ status: 503, contentType: 'text/plain', body: 'Service Unavailable' }))
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Ça ne répond pas' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('alert')).toContainText('La base ne répond pas')
    await expect(page.getByText('Il te faut une invitation')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /foyer/i }), 'l’écran de création de foyer s’affiche').toHaveCount(0)

    await page.unroute('**/rest/v1/rpc/current_household')
    await page.getByRole('button', { name: 'Réessayer' }).click()
    await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 20_000 })
  })
})

test('une relecture ratée en cours d’usage garde l’écran et ce qu’on y a tapé', async ({ page }) => {
  await avecFoyer({}, async f => {
    await connecte(page, f)
    await page.goto('/charges')
    await page.getByRole('button', { name: 'Autre chose' }).click()
    const quoi = page.getByLabel('Quoi')
    await quoi.fill('Assurance du vélo')

    await page.route('**/rest/v1/rpc/current_household', r =>
      r.fulfill({ status: 503, contentType: 'text/plain', body: 'Service Unavailable' }))
    // Une relecture (jeton rafraîchi, session signalée perdue) tombe sur la panne.
    await page.evaluate(() => window.dispatchEvent(new Event('popote:session-perdue')))
    await expect(page.getByRole('alert').filter({ hasText: 'La base ne répond pas' })).toBeVisible({ timeout: 10_000 })
    await expect(quoi, 'l’écran a été remplacé : la saisie est perdue').toHaveValue('Assurance du vélo')
    await expect(page.getByRole('heading', { name: 'Hors ligne' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Entrer', exact: true })).toHaveCount(0)

    await page.unroute('**/rest/v1/rpc/current_household')
    await page.getByRole('button', { name: 'Réessayer' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'La base ne répond pas' })).toHaveCount(0)
    await expect(quoi).toHaveValue('Assurance du vélo')
  })
})

/* ── 4 · Les courses : le manque revient ───────────────────────────────────────────────────── */

test('courses : le manque d’une ligne déjà prise revient quand on ajoute une recette et qu’on régénère', async ({ page }) => {
  test.setTimeout(90_000)
  await avecFoyer({ budget: false, cycleEtat: 'selection' }, async f => {
    await connecte(page, f)
    await page.goto('/choisir')
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Faire la liste' }).click()
    await expect(page.getByRole('heading', { name: 'La liste' })).toBeVisible({ timeout: 20_000 })
    const lentilles = async () => ((await db.from('shopping_item').select('quantity, unit, checked_at')
      .eq('cycle_id', f.cycleId).ilike('label', 'lentilles corail')).data ?? [])
      .map(l => ({ q: Number(l.quantity), u: l.unit, pris: l.checked_at !== null }))
      .sort((a, b) => Number(b.pris) - Number(a.pris))

    // Deux recettes à 4 parts : 800 g de lentilles. On les prend.
    expect(await lentilles()).toEqual([{ q: 800, u: 'g', pris: false }])
    await page.getByRole('checkbox', { name: /^Lentilles corail/ }).click()
    await expect.poll(async () => (await lentilles())[0]?.pris).toBe(true)

    // Les recettes passent de 4 à 8 parts : il faut 1 600 g, il en reste 800 à prendre.
    await db.from('cycle_recipe').update({ servings: 8 }).eq('cycle_id', f.cycleId)
    await page.goto('/choisir')
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Faire la liste' }).click()
    await expect(page.getByRole('heading', { name: 'La liste' })).toBeVisible({ timeout: 20_000 })
    await expect.poll(lentilles, { timeout: 10_000 }).toEqual([
      { q: 800, u: 'g', pris: true }, { q: 800, u: 'g', pris: false }])
  })
})

/* ── 5 · L'épargne : « Je retire » attend le solde ─────────────────────────────────────────── */

test('épargne : « Je retire » reste éteint tant que le solde n’est pas lu, puis refuse plus que le versé', async ({ page }) => {
  await avecFoyer({}, async f => {
    await connecte(page, f)
    let libere: () => void = () => {}
    const tient = new Promise<void>(r => { libere = r })
    await page.route('**/rest/v1/rpc/solde_epargne', async r => { await tient; await r.continue() })
    await page.goto('/epargne')
    await expect(page.getByText('Urgence').first()).toBeVisible({ timeout: 15_000 })
    await page.getByLabel('Verser (€)').first().fill('100000')
    const retire = page.getByRole('button', { name: 'Je retire' }).first()
    await expect(retire, 'le solde n’est pas lu : on ne retire pas').toBeDisabled()
    await expect(page.getByText(/Tu n’as rien versé ici/)).toHaveCount(0)

    libere()
    await expect(page.getByRole('list', { name: 'Qui a versé quoi' }).first()).toBeVisible({ timeout: 15_000 })
    await expect(retire).toBeEnabled()
    await retire.click()
    await expect(page.getByText(/Tu n’as versé que .* ici : tu ne peux pas en retirer plus\./)).toBeVisible()
  })
})

/* ── 6 · Un mois clos d'avant mon arrivée ──────────────────────────────────────────────────── */

test('un mois clos d’avant son arrivée : « Tu n’étais pas encore dans le foyer », ni tiret ni « Revenir dessus »', async ({ page }) => {
  await avecFoyer({}, async f => {
    const mois = lemoisPrecedent()
    // Thauba arrive ce mois-ci ; Kamil clôture le mois d'avant, sans elle.
    const courant = new Date()
    await db.from('revenu').delete().eq('user_profile_id', f.elleId)
    await db.from('user_profile').update({
      entre_le: `${courant.getFullYear()}-${String(courant.getMonth() + 1).padStart(2, '0')}-01` }).eq('id', f.elleId)
    const lui = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } })
    const { error: eCo } = await lui.auth.signInWithPassword({ email: f.email, password: MOT_DE_PASSE })
    if (eCo) throw new Error(eCo.message)
    const { data: poche } = await db.from('poche_epargne').select('id').eq('household_id', f.householdId).limit(1).single()
    const { error } = await lui.rpc('cloture_le_mois', { le_mois: mois, la_poche: poche!.id })
    if (error) throw new Error(`cloture_le_mois : ${error.message}`)

    await connecte(page, f, f.elleEmail)
    await page.goto(`/budget/${mois.slice(0, 7)}`)
    const carte = page.getByRole('region', { name: 'Ce qui reste' })
    await expect(carte.getByText(/Tu n’étais pas encore dans le foyer/)).toBeVisible({ timeout: 15_000 })
    const t = await carte.innerText()
    expect(t).not.toContain('—')
    expect(t).not.toContain('Il t’est resté')
    await expect(page.getByRole('button', { name: /Revenir dessus/ })).toHaveCount(0)

    await page.goto(`/cloture/${mois.slice(0, 7)}`)
    await expect(page.getByText(/Tu n’étais pas encore dans le foyer/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /Revenir dessus/ })).toHaveCount(0)
  })
})

/* ── 8 · Les courses : l'erreur reste à l'écran ────────────────────────────────────────────── */

test('courses : cocher un article en bas d’une longue liste qui échoue, l’alerte reste à l’écran', async ({ page }) => {
  test.setTimeout(60_000)
  await avecFoyer({ budget: false, cycleEtat: 'courses' }, async f => {
    const { data: magasin } = await db.from('store').select('id').eq('household_id', f.householdId).limit(1).single()
    await db.from('shopping_item').insert(Array.from({ length: 40 }, (_, i) => ({
      cycle_id: f.cycleId, household_id: f.householdId, store_id: magasin!.id,
      label: `Article ${String(i).padStart(2, '0')}`, aisle: 'Épicerie' })))
    await connecte(page, f)
    await page.goto('/magasin')
    await expect(page.getByRole('heading', { name: 'La liste' })).toBeVisible({ timeout: 20_000 })
    await page.route('**/rest/v1/shopping_item**', r =>
      r.request().method() === 'PATCH' ? r.abort('internetdisconnected') : r.continue())
    const dernier = page.getByRole('checkbox', { name: /^Article 39/ })
    await dernier.scrollIntoViewIfNeeded()
    await dernier.click()
    const alerte = page.getByRole('alert').filter({ hasText: 'Je n’ai pas pu cocher cet article.' })
    await expect(alerte).toBeVisible()
    await expect(alerte, 'l’alerte est tombée hors de l’écran').toBeInViewport({ ratio: 1 })
  })
})

/* ── 9 · La cuisine ────────────────────────────────────────────────────────────────────────── */

test('cuisine : la question d’interruption prend le focus, et le rend', async ({ page }) => {
  await avecFoyer({ budget: false, cycleEtat: 'en_cuisine' }, async f => {
    await db.from('cycle').update({ started_at: new Date().toISOString() }).eq('id', f.cycleId)
    await db.from('session_task').insert({
      cycle_id: f.cycleId, household_id: f.householdId, label: 'Émincer les oignons',
      duration_min: 8, planned_start_min: 0, position: 0, is_active: true })
    await connecte(page, f)
    await page.goto('/cuisine')
    const interrompre = page.getByRole('button', { name: 'Interrompre la session' })
    await expect(interrompre).toBeVisible({ timeout: 15_000 })

    await interrompre.click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Non, je continue' }), 'le focus n’est pas dans la question').toBeFocused()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(interrompre, 'le focus est tombé sur body').toBeFocused()

    await interrompre.click()
    await page.getByRole('button', { name: 'Non, je continue' }).click()
    await expect(interrompre, 'le focus n’est pas revenu au bouton').toBeFocused()
  })
})

test('cuisine : quitter la session d’un ami qui échoue se dit, et ne part qu’une fois', async ({ page }) => {
  await avecFoyer({ budget: false }, async f => {
    const erreurs: string[] = []
    page.on('pageerror', e => erreurs.push(e.message))
    await connecte(page, f)
    let envois = 0
    await page.route('**/rest/v1/session_convive**', async r => {
      if (r.request().method() !== 'DELETE') return r.continue()
      envois++
      await new Promise(fin => setTimeout(fin, 400))
      await r.abort('internetdisconnected')
    })
    // Une session qui n'existe (plus) : l'écran offre « Quitter cette session ».
    await va(page, '/cuisine/00000000-0000-4000-8000-000000000001')
    const quitter = page.getByRole('button', { name: 'Quitter cette session' })
    await expect(quitter).toBeVisible({ timeout: 15_000 })
    await quitter.dblclick()
    await expect(page.getByRole('alert')).toContainText('Pas de réseau', { timeout: 10_000 })
    expect(envois, 'un double toucher a fait deux appels').toBe(1)
    expect(erreurs, 'un rejet n’est pas rattrapé').toEqual([])
    await expect(quitter).toBeEnabled()
  })
})

test('cuisine : une session interrompue d’il y a un mois n’est plus proposée à la reprise', async ({ page }) => {
  await avecFoyer({ budget: false, cycleEtat: 'interrompue' }, async f => {
    const jour = (decalage: number) => {
      const d = new Date(); d.setDate(d.getDate() + decalage)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    await db.from('cycle').update({ week_of: jour(-40) }).eq('id', f.cycleId)
    await connecte(page, f)
    await page.goto('/cuisine-accueil')
    await expect(page.getByText('Rien de prévu')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Reprendre la session interrompue' })).toHaveCount(0)

    // Une session de cette semaine, elle, se reprend.
    await db.from('cycle').update({ week_of: jour(0) }).eq('id', f.cycleId)
    await page.goto('/cuisine-accueil')
    await expect(page.getByRole('button', { name: 'Reprendre la session interrompue' })).toBeVisible({ timeout: 15_000 })
  })
})
