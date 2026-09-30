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
import { MOT_DE_PASSE, amorce, efface, db, remetLeMotDePasse } from './amorce.ts'
import type { Foyer } from './amorce.ts'
import { releve } from './couverture.ts'

let foyer: Foyer
const MAILPIT = 'http://127.0.0.1:54324'
/** Une adresse neuve par exécution : une invitation ne se rejoue pas. */
const INVITEE = `thauba-${Date.now()}@fumee.test`
/** Toutes les invitées créées ici : aucune n'appartient au foyer d'amorce. */
const INVITEES = [INVITEE]

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
  // Les invitées n'appartiennent pas au foyer d'amorce : elles se nettoient à part.
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const elle of data?.users.filter(u => INVITEES.includes(u.email ?? '')) ?? []) {
    await db.auth.admin.deleteUser(elle.id)
  }
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

    /* Le mot de passe, puis SON écran à elle. On ne fabrique plus de prénom
       depuis son adresse — `thauba-1790147184836` finissait pré-rempli, validé
       sans regarder, puis lu sur chaque ligne de charge — et l'application la
       mène donc au profil avant tout le reste : sa date d'entrée et son revenu
       décident de tout le partage, et le hub ne lui en parle jamais. */
    const mdp = sonEcran.getByLabel(/mot de passe/i)
    if (await mdp.count()) {
      await mdp.fill(MOT_DE_PASSE)
      await sonEcran.getByRole('button', { name: /enregistrer/i }).click()
      await sonEcran.waitForTimeout(2_500)
    }
    await expect(sonEcran.getByLabel(/ton prénom/i),
      'elle n’est pas menée à son profil, où tout se décide')
      .toBeVisible({ timeout: 15_000 })
    await expect(sonEcran.getByLabel(/ton prénom/i),
      'un prénom a été fabriqué depuis son adresse').toHaveValue('')
    await sonEcran.screenshot({ path: '.shots/invitation/07-son-profil.png' })
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

/**
 * Le fragment qu'un lien EXPIRÉ dépose dans la barre d'adresse — mot pour mot
 * celui que le Supabase hébergé a produit le 30 septembre 2026 (journaux
 * d'authentification, 17:01:12 UTC), quand l'invitée a ouvert un mail
 * d'invitation vieux de huit jours.
 */
const EXPIRE = '#error=access_denied&error_code=otp_expired'
  + '&error_description=Email+link+is+invalid+or+has+expired&sb='

/** Vide la boîte de cette adresse : le mail attendu sera alors le seul. */
async function videLaBoite(page: Page, pour: string) {
  await page.request.delete(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${pour}`)}`)
}

/** Le lien de vérification du dernier mail, TEL QUEL : rien n'est récrit. */
async function lienDuMail(page: Page, pour: string): Promise<string> {
  const { html } = await dernierMail(page, pour)
  const lien = html.match(/href="([^"]*verify[^"]*)"/)?.[1]?.replace(/&amp;/g, '&')
  expect(lien, 'le mail ne porte aucun lien de vérification').toBeTruthy()
  /* La CAUSE, pas seulement le symptôme : `fragmentRepare` rattrape
     aujourd'hui un lien empoisonné, et masquerait donc le retour du défaut.
     C'est l'adresse de retour elle-même qui ne doit porter aucun fragment. */
  expect(new URL(lien!).searchParams.get('redirect_to') ?? '',
    'l’adresse de retour du lien porte un fragment : c’est ce qui l’empoisonne')
    .not.toContain('#')
  return lien!
}

/** Une invitation en attente, pour une adresse neuve. */
async function invitation(email: string): Promise<string> {
  const { data, error } = await db.from('invitation')
    .insert({ household_id: foyer.householdId, email, created_by: foyer.userId })
    .select('token').single()
  if (error) throw error
  return data.token
}

test.describe('un lien expiré ne condamne pas les suivants', () => {
  /*
   * Le 30 septembre, l'invitée a ouvert un mail d'invitation vieux de huit
   * jours. Le lien ne vit qu'une heure : l'application l'a déposée sur l'écran
   * de connexion, `#error=…otp_expired…` dans la barre d'adresse. Elle a
   * redemandé trois liens. Supabase les a tous acceptés — trois connexions au
   * journal — et l'application les a tous jetés : son téléphone n'a jamais
   * fait une seule requête authentifiée.
   *
   * L'écran de connexion donnait `window.location.href` pour adresse de
   * retour, fragment compris. Supabase colle `#access_token=…` derrière : deux
   * `#`, supabase-js lit le premier, y trouve l'erreur, et refuse la session.
   *
   * Le parcours d'invitation au-dessus ne pouvait pas le voir : il suit un lien
   * NEUF, et récrit l'adresse de retour à partir du seul chemin. Ici, rien
   * n'est récrit — on suit le lien du mail tel qu'il arrive.
   */
  test('l’invitée redemande un lien, et le nouveau lui ouvre le foyer', async ({ page }) => {
    test.setTimeout(90_000)
    const email = `invitee-expire-${Date.now()}@fumee.test`
    INVITEES.push(email)
    const jeton = await invitation(email)
    // Comme en production : un compte créé par l'invitation, jamais confirmé.
    await db.auth.admin.inviteUserByEmail(email, {
      redirectTo: `http://127.0.0.1:4173/invite/${jeton}` })
    await videLaBoite(page, email)

    await page.goto(`/invite/${jeton}${EXPIRE}`)
    await page.getByRole('button', { name: /première connexion/i }).click()
    await page.getByLabel(/e-?mail/i).fill(email)
    await page.getByRole('button', { name: /recevoir le lien/i }).click()
    await expect(page.getByText(/lien envoyé/i)).toBeVisible({ timeout: 10_000 })

    await page.goto(await lienDuMail(page, email))
    const rejoindre = page.getByRole('button', { name: /rejoindre le foyer/i })
    await expect(rejoindre,
      'le nouveau lien n’a pas ouvert de session : l’erreur de l’ancien l’a empoisonné')
      .toBeVisible({ timeout: 15_000 })
    await rejoindre.click()
    await expect(page.getByRole('heading', { name: /ton mot de passe/i }),
      'rejoindre le foyer ne mène pas au mot de passe').toBeVisible({ timeout: 15_000 })
  })

  test('« mot de passe oublié » mène au mot de passe, même après un lien mort', async ({ page }) => {
    test.setTimeout(90_000)
    await videLaBoite(page, foyer.email)
    await page.goto(`/${EXPIRE}`)
    await page.getByRole('button', { name: /mot de passe oublié/i }).click()
    await page.getByLabel(/e-?mail/i).fill(foyer.email)
    await page.getByRole('button', { name: /réinitialiser mon mot de passe/i }).click()
    await expect(page.getByText(/le lien vient de partir/i)).toBeVisible({ timeout: 10_000 })

    try {
      await page.goto(await lienDuMail(page, foyer.email))
      await expect(page.getByRole('heading', { name: /ton mot de passe/i }),
        'le lien de réinitialisation n’a pas ouvert de session')
        .toBeVisible({ timeout: 15_000 })
      await page.getByLabel(/mot de passe/i).fill('nouveau-mot-de-passe-9')
      await page.getByRole('button', { name: /enregistrer/i }).click()
      await expect(page.getByRole('heading', { name: /ton mot de passe/i })).toHaveCount(0,
        { timeout: 15_000 })
    } finally {
      /* Tous les tests suivants se connectent avec le mot de passe de
         l'amorce : sans cette remise en état, l'échec d'ici apparaîtrait
         sur un test sans rapport. */
      await remetLeMotDePasse(foyer)
      await db.from('user_profile').update({ password_set: true }).eq('id', foyer.userId)
    }
  })

  test('l’écran de connexion DIT que le lien a expiré', async ({ page }) => {
    await page.goto(`/invite/00000000-0000-0000-0000-000000000000${EXPIRE}`)
    await expect(page.getByText(/ce lien a expiré/i)).toBeVisible({ timeout: 15_000 })
    // Et il l'efface de la barre d'adresse : un fragment d'erreur qui traîne
    // est exactement ce qui empoisonnait les liens suivants.
    await expect.poll(() => new URL(page.url()).hash).toBe('')
    await prend(page, '08-lien-expire')
  })

  test('qui a déjà un foyer ne se voit pas offrir de le rejoindre', async ({ page }) => {
    /* Le 30 septembre, le seul « Rejoindre le foyer » cliqué venait de la
       session de l'hôte, sur son ordinateur : un bouton qui ne pouvait
       qu'échouer (« Déjà rattaché à un foyer »), à la place de la phrase qui
       dit à qui ce lien s'adresse.
       ⚠️ Et la phrase ne présume PAS que c'est l'hôte qui lit : l'invitée
       déjà entrée qui rouvre son mail, ou revient en arrière après avoir
       rejoint, tombe sur le même écran. */
    const email = `invitee-hote-${Date.now()}@fumee.test`
    const jeton = await invitation(email)
    await connecte(page, foyer.email, MOT_DE_PASSE)
    await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
    await page.goto(`/invite/${jeton}`)
    await expect(page.getByRole('heading', { name: /tu es déjà dans un foyer/i }))
      .toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/si c’est\s+toi qui l’as créé/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /rejoindre le foyer/i })).toHaveCount(0)
    await prend(page, '09-pas-pour-toi')

    /* Sur un appareil PARTAGÉ, c'est l'invitée qui lit cet écran — sur la
       session de l'hôte. Elle doit voir quel compte est ouvert, et pouvoir en
       sortir sans le fermer ailleurs : `scope: 'local'`, sinon l'hôte serait
       déconnecté de tous ses appareils. */
    await expect(page.getByText(foyer.email)).toBeVisible()
    const sortie = page.waitForRequest(r => r.url().includes('/auth/v1/logout'))
    await page.getByRole('button', { name: /ce n’est pas moi/i }).click()
    expect(new URL((await sortie).url()).searchParams.get('scope'),
      'se déconnecter ici fermait la session de l’hôte partout').toBe('local')
    await expect(page.getByRole('button', { name: 'Se connecter', exact: true }))
      .toBeVisible({ timeout: 15_000 })
    expect(new URL(page.url()).pathname, 'on a quitté le lien d’invitation')
      .toBe(`/invite/${jeton}`)
  })

  test('se connecter sur un lien d’invitation ne montre pas « Rejoindre » à un membre', async ({ page }) => {
    /* La session arrivait AVANT le foyer : `relire` posait la session, puis
       attendait `current_household`. Pendant cet aller-retour, l'écran
       croyait la personne sans foyer et lui offrait de rejoindre — un clic,
       et le refus (409). On ralentit ici l'aller-retour pour le rendre
       visible : sur un téléphone, il l'est sans aide. */
    const jeton = await invitation(`invitee-eclair-${Date.now()}@fumee.test`)
    await page.route('**/rest/v1/rpc/current_household', async r => {
      await new Promise(s => setTimeout(s, 2_000))
      await r.continue()
    })
    await page.goto(`/invite/${jeton}`)
    await page.getByLabel(/e-?mail/i).fill(foyer.email)
    await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
    const jeton_ = page.waitForResponse(r => r.url().includes('/auth/v1/token'))
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    // L'aller-retour ralenti commence APRÈS la connexion : c'est de là qu'on observe.
    await jeton_
    /* Et le bouton reste en attente : réactivé, un second clic ouvrait une
       seconde session — ou, pris par la limite de débit, disait « mot de
       passe incorrect » à quelqu'un de connecté. */
    await expect(page.getByRole('button', { name: /un instant/i })).toBeDisabled()
    /* ⚠️ On OBSERVE pendant l'aller-retour, on n'attend pas la fin.
       `toHaveCount(0)` réessaie jusqu'à ce que le compte tombe à zéro : il
       passait donc dès que le bouton disparaissait, c'est-à-dire toujours. */
    let vu = false
    for (let i = 0; i < 15 && !vu; i++) {
      vu = await page.getByRole('button', { name: /rejoindre le foyer/i }).count() > 0
      await page.waitForTimeout(100)
    }
    expect(vu, 'un membre s’est vu offrir de rejoindre le foyer, le temps d’un aller-retour')
      .toBe(false)
    await expect(page.getByRole('heading', { name: /tu es déjà dans un foyer/i }))
      .toBeVisible({ timeout: 15_000 })
  })

  test('un lien déjà empoisonné ouvre quand même la session', async ({ page }) => {
    /* Les liens partis AVANT la correction portent encore les deux fragments,
       et le premier chargement après un déploiement tourne sur l'ancien code
       que le service worker sert depuis son cache : il peut donc en émettre
       un dernier. On le fabrique ici tel que Supabase le rend — l'adresse de
       retour porte l'erreur, le jeton est collé derrière — et il doit mener
       à l'écran du mot de passe, comme un lien sain. */
    const { data, error } = await db.auth.admin.generateLink({
      type: 'recovery', email: foyer.email,
      options: { redirectTo: `http://127.0.0.1:4173/${EXPIRE}` },
    })
    if (error) throw error
    try {
      await page.goto(data.properties.action_link)
      await expect(page.getByRole('heading', { name: /ton mot de passe/i }),
        'le lien empoisonné n’a pas ouvert de session').toBeVisible({ timeout: 15_000 })
    } finally {
      await db.from('user_profile').update({ password_set: true }).eq('id', foyer.userId)
    }
  })
})
