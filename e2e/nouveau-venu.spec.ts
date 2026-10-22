/**
 * Le grand test (22/10), parcours A — « le nouveau venu » : ce qui a été trouvé en jouant
 * l'invitation, l'arrivée, les premiers écrans, la session perdue et le réseau coupé.
 *
 * Chaque test rejoue UN défaut trouvé au clic, pas un écran :
 *   1. inviter quelqu'un déjà dans le foyer ; le double clic sur « Créer l'invitation » ;
 *   2. un revenu hors de ce que la base accepte ;
 *   3. « Changer mon mot de passe » : une sortie ;
 *   4. le jeton disparu en cours de geste : la connexion, une phrase ;
 *   5. le réseau coupé : ni « mot de passe incorrect », ni « le lien est parti » ;
 *   6. celle qui arrive ce mois-ci ne manque de revenu à personne le mois d'avant.
 *
 * ⚠️ LOCAL, ET RIEN D'AUTRE : le banc crée des comptes, des invitations et des foyers.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, db, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'

let foyer: Foyer

test.beforeAll(async () => {
  const url = process.env.VITE_SUPABASE_URL ?? ''
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(`Ce banc ne se joue qu'en local. Base visée : ${url || '(non renseignée)'}.`)
  }
  foyer = await amorce()
})
test.afterAll(async () => { if (foyer) await efface(foyer) })

async function connecte(page: Page, email: string) {
  await page.goto('/')
  await page.getByLabel('Ton e-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

test('inviter : un membre du foyer est refusé, et un double clic ne montre pas d’erreur SQL', async ({ page }) => {
  await connecte(page, foyer.email)
  await page.goto('/reglages')
  const champ = page.getByLabel('Son e-mail')

  await champ.fill(foyer.elleEmail)
  await page.getByRole('button', { name: 'Créer l’invitation' }).click()
  await expect(page.getByText('Cette personne est déjà dans ton foyer.')).toBeVisible()
  const { data: inutiles } = await db.from('invitation').select('id').eq('email', foyer.elleEmail)
  expect(inutiles, 'une invitation inutile est restée en base').toHaveLength(0)

  const neuve = `double-${Date.now()}@nv.test`
  await champ.fill(neuve)
  await page.getByRole('button', { name: /Créer l’invitation|Un instant/ }).dblclick()
  await expect(page.getByText(/Son lien, valable 30 jours/)).toBeVisible()
  await expect(page.getByText(/duplicate key|unique constraint/i), 'l’erreur SQL s’affiche').toHaveCount(0)
  const { data } = await db.from('invitation').select('id').eq('email', neuve)
  expect(data).toHaveLength(1)
  await db.from('invitation').delete().eq('email', neuve)
})

test('profil : un revenu hors de la base est refusé par le champ, avec une phrase', async ({ browser }) => {
  // Une personne sans revenu : le profil lui demande le sien.
  const { data: u } = await db.auth.admin.createUser({
    email: `sans-revenu-${Date.now()}@nv.test`, password: MOT_DE_PASSE, email_confirm: true })
  await db.from('user_profile').insert({
    id: u.user!.id, household_id: foyer.householdId, display_name: '', password_set: true })
  const ctx = await browser.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris' })
  const p = await ctx.newPage()
  try {
    await p.goto('/')
    await p.getByLabel('Ton e-mail').fill(u.user!.email!)
    await p.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
    await p.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await expect(p.getByRole('heading', { name: /Deux choses/ })).toBeVisible({ timeout: 15_000 })
    await p.getByLabel('Ton prénom').fill('Test')
    await p.getByLabel(/Ton revenu net/).fill('999999999')
    await expect(p.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    await expect(p.getByText(/Un montant en euros, au-dessus de zéro/)).toBeVisible()
    await p.getByLabel(/Ton revenu net/).fill('2 400,50')
    await expect(p.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
  } finally {
    await ctx.close()
    await db.auth.admin.deleteUser(u.user!.id)
  }
})

test('« Changer mon mot de passe » a une sortie', async ({ page }) => {
  await connecte(page, foyer.email)
  await page.goto('/reglages')
  await page.getByRole('button', { name: 'Changer mon mot de passe' }).click()
  await expect(page.getByRole('heading', { name: 'Ton mot de passe' })).toBeVisible()
  await page.getByRole('button', { name: /Réglages/ }).click()
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible()
})

test('le jeton disparu en cours de geste ramène à la connexion, avec une phrase', async ({ page }) => {
  await connecte(page, foyer.email)
  await page.goto('/reglages')
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible()
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('sb-')) localStorage.removeItem(k)
  })
  // Le premier appel de données refusé suffit ; on en provoque un.
  await page.getByRole('button', { name: 'Enregistrer le plafond' }).click({ timeout: 3000 }).catch(() => {})
  await expect(page.getByText('Ta session a expiré : reconnecte-toi.')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Aucun foyer.')).toHaveCount(0)
})

test('réseau coupé : la connexion et l’oubli le disent, au lieu de mentir', async ({ page }) => {
  await page.route('**/auth/v1/token*', r => r.abort('internetdisconnected'))
  await page.route('**/auth/v1/recover*', r => r.abort('internetdisconnected'))
  await page.goto('/')
  await page.getByLabel('Ton e-mail').fill(foyer.email)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByText(/Pas de réseau/)).toBeVisible()
  await expect(page.getByText('E-mail ou mot de passe incorrect.')).toHaveCount(0)

  await page.getByRole('button', { name: 'Mot de passe oublié' }).click()
  await page.getByRole('button', { name: 'Réinitialiser mon mot de passe' }).click()
  await expect(page.getByText(/Pas de réseau/)).toBeVisible()
  await expect(page.getByText(/le lien vient de partir/)).toHaveCount(0)
})

test('celle qui arrive ce mois-ci ne manque de revenu à personne le mois d’avant', async ({ page }) => {
  // Thauba arrive le 1er du mois courant et n'a encore dit aucun revenu.
  const d = new Date()
  const courant = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  const avant = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  const urlAvant = `/budget/${avant.getFullYear()}-${String(avant.getMonth() + 1).padStart(2, '0')}`
  await db.from('revenu').delete().eq('user_profile_id', foyer.elleId)
  await db.from('user_profile').update({ entre_le: courant }).eq('id', foyer.elleId)

  await connecte(page, foyer.email)
  await page.goto(urlAvant)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  /* ⚠️ Le `h1` s'affiche PENDANT le chargement : asserter une absence juste après passait aussi sur
     le code d'avant. On attend ce qui n'arrive qu'une fois TOUT lu (la carte du reste, puis les
     catégories) avant de dire que le message n'est pas là. */
  await expect(page.getByRole('region', { name: 'Ce qui reste' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Par catégorie' })).toBeVisible()
  await expect(page.getByText(/n’a pas encore dit son revenu/),
    'on réclame un revenu à quelqu’un qui n’était pas là').toHaveCount(0)
})
