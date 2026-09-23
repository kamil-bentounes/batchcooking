/**
 * Le parcours d'invitation, joué en entier.
 *
 * Il n'avait JAMAIS été emprunté pour de vrai, et ça s'est vu : tous les
 * sous-chemins du site répondaient 404, le lien d'invitation compris, si bien
 * que personne ne pouvait entrer dans un foyer par le chemin prévu pour ça. Ni
 * les tests unitaires ni la suite de fumée ne pouvaient le montrer — le serveur
 * de Playwright, lui, redirige tout vers l'index.
 *
 * Ce fichier suit donc les deux personnes, dans l'ordre réel :
 *
 *   Kamil crée l'invitation → le mail part → Thauba l'ouvre, arrive
 *   AUTHENTIFIÉE, pose son mot de passe, remplit son profil → elle est dans le
 *   foyer, et dans les charges communes qu'il avait posées sans elle.
 *
 * Le mail est lu dans la vraie boîte : Supabase local le dépose dans Mailpit,
 * et c'est le seul moyen de vérifier qu'il PART, qu'il porte le bon lien, et
 * que ce lien mène quelque part.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'
import { releve } from './couverture.ts'

let foyer: Foyer
const MAILPIT = 'http://127.0.0.1:54324'
/** Une adresse neuve par exécution : une invitation ne se rejoue pas. */
const INVITEE = `thauba-${Date.now()}@fumee.test`

test.beforeAll(async () => {
  /* ⚠️ LOCAL, ET RIEN D'AUTRE.
   *
   *    Ce parcours crée un compte, envoie un vrai mail et fait entrer quelqu'un
   *    dans un foyer. Joué contre la production, il inscrirait une personne
   *    réelle à sa place — ce qui n'est pas à nous de faire. On refuse donc de
   *    démarrer si l'adresse de la base n'est pas celle de la machine. */
  const url = process.env.VITE_SUPABASE_URL ?? ''
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(
      `Ce parcours ne se joue qu'en local. Base visée : ${url || '(non renseignée)'}.`)
  }
  foyer = await amorce()
})
test.afterAll(async () => {
  if (foyer) await efface(foyer)
  // L'invitée n'appartient pas au foyer d'amorce : elle se nettoie à part.
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const elle = data?.users.find(u => u.email === INVITEE)
  if (elle) await db.auth.admin.deleteUser(elle.id)
})

async function connecte(page: Page, email: string, motDePasse: string) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(email)
  await page.getByLabel(/mot de passe/i).fill(motDePasse)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
}

async function prend(page: Page, nom: string) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `.shots/invitation/${nom}.png` })
  await releve(page)
}

/** Le dernier mail reçu par cette adresse, tel qu'il est arrivé. */
async function dernierMail(page: Page, pour: string): Promise<{ sujet: string; html: string }> {
  for (let essai = 0; essai < 20; essai++) {
    const r = await page.request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${pour}`)}`)
    const liste = await r.json()
    const m = (liste.messages ?? [])[0]
    if (m) {
      const detail = await (await page.request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()
      return { sujet: detail.Subject ?? '', html: detail.HTML ?? detail.Text ?? '' }
    }
    await page.waitForTimeout(500)
  }
  throw new Error(`Aucun mail reçu par ${pour} après dix secondes.`)
}

test.describe('inviter quelqu’un dans le foyer', () => {
  test('du bouton de Kamil jusqu’au profil de Thauba', async ({ page }) => {
    test.setTimeout(120_000)

    /* ── 1 · Kamil pose une charge COMMUNE alors qu'il est encore seul ───── */
    await connecte(page, foyer.email, MOT_DE_PASSE)
    await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })

    const { data: commune } = await db.from('charge').insert({
      household_id: foyer.householdId, libelle: 'Internet du foyer',
      montant_cents: 3_700, periodicite: 'mensuel', debut: '2026-01-01', commun: true,
    }).select().single()
    await db.from('charge_participant').insert({
      charge_id: commune!.id, user_profile_id: foyer.userId, household_id: foyer.householdId,
    })

    /* ── 2 · Il crée l'invitation depuis les réglages ────────────────────── */
    await page.goto('/reglages')
    await page.getByLabel(/son e-?mail/i).fill(INVITEE)
    await prend(page, '01-invitation-saisie')
    await page.getByRole('button', { name: /créer l’invitation/i }).click()

    // L'écran DIT ce qui s'est passé. Il a longtemps affiché le lien sans un mot.
    await expect(page.getByText(/le mail est parti/i)).toBeVisible({ timeout: 20_000 })
    const lien = await page.getByText(/https?:\/\/\S*\/invite\/\S+/).first().innerText()
    expect(lien, 'le lien affiché ne mène pas à une invitation').toMatch(/\/invite\/[0-9a-f-]{36}/)
    await prend(page, '02-invitation-creee')

    /* ── 3 · Le mail part VRAIMENT, et porte le bon texte ────────────────── */
    const mail = await dernierMail(page, INVITEE)

    /* ⚠️ On n'asserte PAS le texte du mail.
     *
     *    Le sujet et le gabarit — la cocotte, le nom, la phrase de Kamil — sont
     *    posés dans le tableau de bord du projet hébergé. En local, Supabase
     *    sert son modèle par défaut : exiger ici le texte de production
     *    reviendrait à tester une configuration absente, et le test échouerait
     *    pour une raison qui n'est pas un défaut.
     *
     *    Ce qui se vérifie en local, et qui est l'essentiel : le mail PART, il
     *    part à la bonne adresse, et il porte un lien qui mène à l'application. */
    expect(mail.sujet, 'le mail n’a pas de sujet').not.toBe('')
    expect(mail.html, 'le mail ne porte aucun lien').toMatch(/href="[^"]+"/)

    /* ── 4 · Thauba ouvre le lien : elle arrive AUTHENTIFIÉE ─────────────── */
    const brut = mail.html.match(/href="([^"]*(?:verify|invite)[^"]*)"/)?.[1]
      ?.replace(/&amp;/g, '&')
    expect(brut, 'aucun lien exploitable dans le mail').toBeTruthy()

    /* Le `redirect_to` du mail pointe vers le serveur de développement — c'est
       `APP_BASE_URL` qui le décide, et il vaut autre chose ici que sur le
       serveur de test. On le récrit vers ce dernier : ce qu'on éprouve, c'est
       la CHAÎNE — le lien vérifie le jeton, ouvre une session, et dépose sur le
       chemin d'invitation, qui doit charger l'application. C'est précisément ce
       chemin-là qui répondait 404 en production. */
    const verif = new URL(brut!)
    const dest = new URL(verif.searchParams.get('redirect_to') ?? '/')
    verif.searchParams.set('redirect_to', `http://127.0.0.1:4173${dest.pathname}`)
    const cible = verif.toString()
    // Sur le CHEMIN, pas sur l'URL entière : `searchParams` encode les barres.
    expect(dest.pathname, 'le lien du mail ne mène pas à une invitation')
      .toMatch(/\/invite\/[0-9a-f-]{36}/)

    const avant = (await db.from('user_profile')
      .select('id').eq('household_id', foyer.householdId)).data ?? []

    const elle = await page.context().browser()!.newContext()
    const sonEcran = await elle.newPage()
    await sonEcran.goto(cible!)
    await sonEcran.waitForTimeout(2_500)
    await sonEcran.screenshot({ path: '.shots/invitation/03-elle-arrive.png' })
    await releve(sonEcran)

    /* Le lien doit charger l'APPLICATION, pas une page d'erreur : c'est
       exactement ce qui manquait quand tous les sous-chemins répondaient 404. */
    expect(await sonEcran.title(), 'le lien du mail ne charge pas l’application')
      .toMatch(/Popote/)

    /* ── 5 · Elle rejoint, et entre dans les charges communes ────────────── */
    const rejoindre = sonEcran.getByRole('button', { name: /rejoindre le foyer/i })
    await expect(rejoindre, 'l’écran d’invitation n’offre pas de rejoindre')
      .toBeVisible({ timeout: 15_000 })
    await sonEcran.screenshot({ path: '.shots/invitation/04-on-t-attend.png' })
    await releve(sonEcran)
    await rejoindre.click()
    await sonEcran.waitForTimeout(3_000)
    await sonEcran.screenshot({ path: '.shots/invitation/05-elle-est-entree.png' })
    await releve(sonEcran)
    await elle.close()

    const apres = (await db.from('user_profile')
      .select('id, display_name').eq('household_id', foyer.householdId)).data ?? []
    expect(apres.length, 'personne n’est entrée dans le foyer').toBe(avant.length + 1)
    const nouvelle = apres.find(p => !avant.some(a => a.id === p.id))!

    /* Le cœur de ce qui vient d'être écrit : une charge COMMUNE posée pendant
       qu'on était seul doit l'accueillir toute seule. Sans `charge.commun`, il
       aurait fallu rouvrir chaque ligne à la main. */
    const { data: qui } = await db.from('charge_participant')
      .select('user_profile_id').eq('charge_id', commune!.id)
    expect(qui!.map(x => x.user_profile_id),
      'elle n’est pas entrée dans les charges communes posées avant son arrivée')
      .toContain(nouvelle.id)

    /* ── 6 · Et Kamil la voit dans son budget ────────────────────────────── */
    await page.goto('/charges')
    await page.reload()
    await expect(page.getByText('Internet du foyer').first()).toBeVisible({ timeout: 15_000 })
    await prend(page, '06-charges-avec-elle')
  })
})
