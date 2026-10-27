/**
 * L'inscription, jouée comme une personne la joue — et relue EN BASE.
 *
 * Cinq invitées réelles n'ont jamais dépassé la création de compte. Les bancs
 * d'avant suivaient des écrans ; celui-ci suit des PERSONNES, du premier écran
 * jusqu'au jour où elles reviennent, et relit après chaque geste ce que la base
 * a vraiment enregistré : un écran qui dit « bienvenue » sur un compte qui
 * n'existe pas est exactement l'échec qu'on cherche.
 *
 * Tout se fait au CLIC, comme sur un téléphone. On ne tape une adresse que là
 * où une personne le ferait : un lien reçu, un lien de mail.
 *
 *   1. Kamil crée son compte et son foyer, par « Première connexion ».
 *   2. Il se déconnecte, se trompe de mot de passe, revient.
 *   3. Il invite Thauba ; elle ouvre le lien, choisit son mot de passe, entre.
 *   4. Elle revient sur un autre appareil, puis oublie son mot de passe.
 *   5. Les liens qui ne marchent pas le disent.
 *   6. Une adresse qui a déjà un compte Popote.
 *   7. Elle supprime son compte : le foyer reste.
 *   8. Le cas réel de Thauba : un compte laissé par l'ancien mail d'invitation.
 *
 * Chaque écran est photographié dans `.shots/inscription/`, dans l'ordre, et
 * `journal.json` relie chaque capture à ce que la base disait à ce moment-là.
 */
import { devices, expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { db } from './amorce.ts'
import { releve } from './couverture.ts'

const MAILPIT = 'http://127.0.0.1:54324'
const DOSSIER = '.shots/inscription'
const STAMP = Date.now()
const KAMIL = `kamil-${STAMP}@inscription.test`
const THAUBA = `thauba-${STAMP}@inscription.test`
const MDP_KAMIL = 'kamil-cuisine-2026'
const MDP_THAUBA = 'thauba-choisit-12'
const MDP_THAUBA_NOUVEAU = 'thauba-nouveau-34'
const TELEPHONE = { ...devices['Pixel 7'], locale: 'fr-FR', timezoneId: 'Europe/Paris' }
/* ⚠️ LOCAL, ET RIEN D'AUTRE : ce banc crée des comptes et des foyers. Le verrou
   vit au niveau du fichier : `afterAll` tourne MÊME quand `beforeAll` a échoué,
   et aurait écrit dans l'autre base avec la clé de service. */
const LOCAL = /127\.0\.0\.1|localhost/.test(process.env.VITE_SUPABASE_URL ?? '')

type Entree = { parcours: string; titre: string; capture?: string; base?: unknown }
/** Ce que le banc a vu, dans l'ordre : les captures, et ce que disait la base. */
const journal: Entree[] = []
/** Toutes les adresses créées ici : elles s'effacent à la fin, quoi qu'il arrive. */
const adresses: string[] = [KAMIL, THAUBA]
const foyers: string[] = []
let creationAvant: unknown = null

let foyerDeKamil = ''
let idDeKamil = ''
let lienDeThauba = ''

/** Le parcours en cours : le titre du test, tel que le rapport le regroupe. */
const parcours = () => test.info().title

async function photo(page: Page, nom: string, titre: string) {
  // Le temps qu'une transition finisse : on photographie ce qu'on lirait.
  await page.waitForTimeout(350)
  /* Deux téléphones ouverts à la fois : Chromium sans fenêtre ne dessine pas
     toujours celui qui n'est pas au premier plan, et la capture attendait une
     image qui ne venait jamais (deux fois sur neuf passages). */
  await page.bringToFront()
  const n = journal.filter(e => e.capture).length + 1
  const capture = `${String(n).padStart(2, '0')}-${nom}.png`
  /* L'ÉCRAN, pas la page entière : ce que la personne voit sans faire défiler.
     Ce qui doit y être est amené à l'écran avant la photo. */
  await page.screenshot({ path: `${DOSSIER}/${capture}` })
  journal.push({ parcours: parcours(), titre, capture })
  await releve(page)
}

function constate(titre: string, base: unknown) {
  journal.push({ parcours: parcours(), titre, base })
}

/**
 * Les erreurs qu'une personne ne voit pas mais qui disent qu'un écran a cassé :
 * exceptions, avertissements de React. Les requêtes refusées exprès (mauvais
 * mot de passe, compte existant) ne comptent pas : l'écran les explique.
 */
function surveille(page: Page): string[] {
  const erreurs: string[] = []
  page.on('pageerror', e => erreurs.push(e.message))
  page.on('console', m => {
    if (m.type() === 'error' && !/Failed to load resource|ServiceWorker|favicon/i.test(m.text())) {
      erreurs.push(m.text())
    }
  })
  return erreurs
}

/** Le compte de cette adresse, tel que la base le garde ; `null` s'il n'existe pas. */
async function compte(email: string) {
  const { data, error } = await db.rpc('compte_pour_invitation', { adresse: email })
  if (error) throw error
  const id = (data as { id: string }[] | null)?.[0]?.id
  if (!id) return null
  const { data: u } = await db.auth.admin.getUserById(id)
  const { data: profil } = await db.from('user_profile')
    .select('household_id, display_name, password_set, entre_le').eq('id', id).maybeSingle()
  const { data: revenus } = await db.from('revenu')
    .select('net_mensuel_cents, valid_from').eq('user_profile_id', id)
  return {
    id,
    email_confirme: !!u.user?.email_confirmed_at,
    derniere_connexion: u.user?.last_sign_in_at ?? null,
    profil,
    revenus,
  }
}

async function nombreDeComptes(email: string): Promise<number> {
  const { data } = await db.rpc('compte_pour_invitation', { adresse: email })
  return (data as unknown[] | null)?.length ?? 0
}

async function invitationDe(email: string) {
  const { data } = await db.from('invitation')
    .select('household_id, expires_at, accepted_at').eq('email', email)
  return data
}

type Mail = { de: string; sujet: string; html: string }

async function mails(page: Page, pour: string) {
  const r = await page.request.get(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${pour}`)}`)
  return ((await r.json()).messages ?? []) as { ID: string }[]
}

/** Le dernier mail reçu par cette adresse, tel qu'il est arrivé. */
async function dernierMail(page: Page, pour: string): Promise<Mail> {
  for (let essai = 0; essai < 20; essai++) {
    const m = (await mails(page, pour))[0]
    if (m) {
      const d = await (await page.request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()
      return {
        de: `${d.From?.Name ?? ''} <${d.From?.Address ?? ''}>`,
        sujet: d.Subject ?? '',
        html: d.HTML || `<pre>${d.Text ?? ''}</pre>`,
      }
    }
    await page.waitForTimeout(500)
  }
  throw new Error(`Aucun mail reçu par ${pour} après dix secondes.`)
}

/** Le mail tel que la personne le lit, sur un téléphone. */
async function photoDuMail(browser: Browser, mail: Mail, nom: string, titre: string) {
  const ctx = await browser.newContext(TELEPHONE)
  const p = await ctx.newPage()
  const echappe = (t: string) => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  await p.setContent(`<div style="font:14px system-ui;padding:12px 16px;background:#eee">
    <div><b>De :</b> ${echappe(mail.de)}</div><div><b>Objet :</b> ${echappe(mail.sujet)}</div>
    </div><div style="padding:8px 16px">${mail.html}</div>`)
  await photo(p, nom, titre)
  await ctx.close()
}

function lienDuMail(mail: Mail): string {
  const lien = mail.html.match(/href="([^"]*verify[^"]*)"/)?.[1]?.replace(/&amp;/g, '&')
  if (!lien) throw new Error('Le mail ne porte aucun lien de vérification.')
  return lien
}

/** Se connecter depuis l'écran d'entrée, comme on le fait : e-mail, mot de passe, bouton. */
async function connecte(page: Page, email: string, motDePasse: string) {
  await page.goto('/')
  await page.getByLabel('Ton e-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(motDePasse)
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
}

/** Du hub aux réglages, au clic : la carte « Cuisine », puis la roue. */
async function versLesReglages(page: Page) {
  await page.getByRole('button', { name: /^Cuisine/ }).click()
  await page.getByRole('button', { name: 'Réglages' }).click()
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible({ timeout: 15_000 })
}

const HUB = (page: Page) => page.getByRole('heading', { name: 'Popote' })
const ENTREE = (page: Page) => page.getByRole('heading', { name: 'Connexion', exact: true })

test.describe.serial('l’inscription, de bout en bout', () => {
  /* Une action qui ne trouve pas son bouton échoue en vingt secondes, en le
     NOMMANT. Sans délai d'action, elle attendait la fin du parcours — deux
     minutes et demie — et l'échec ne disait plus où il avait eu lieu. */
  test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 })

  test.beforeAll(async () => {
    if (!LOCAL) {
      throw new Error(`Ce banc ne se joue qu'en local. Base visée : ${
        process.env.VITE_SUPABASE_URL || '(non renseignée)'}.`)
    }
    rmSync(DOSSIER, { recursive: true, force: true })
    mkdirSync(DOSSIER, { recursive: true })
    /* La création d'un foyer se ferme dès qu'un foyer existe (0070) : on
       l'ouvre le temps de jouer celui qui crée le sien, puis on rend l'état
       d'avant. */
    const { data } = await db.from('instance_setting')
      .select('value').eq('key', 'allow_household_creation').single()
    creationAvant = data?.value ?? null
    await db.from('instance_setting').update({ value: { enabled: true } })
      .eq('key', 'allow_household_creation')
  })

  test.afterAll(async () => {
    if (!LOCAL) return
    writeFileSync(`${DOSSIER}/journal.json`, JSON.stringify(journal, null, 2))
    await db.from('instance_setting').update({ value: creationAvant ?? { enabled: false } })
      .eq('key', 'allow_household_creation')
    for (const email of adresses) {
      const c = await compte(email).catch(() => null)
      if (c?.profil?.household_id) foyers.push(c.profil.household_id)
      if (c) await db.auth.admin.deleteUser(c.id)
    }
    for (const id of new Set(foyers)) await db.from('household').delete().eq('id', id)
  })

  test('1 · Kamil crée son compte et son foyer', async ({ page, browser }) => {
    test.setTimeout(120_000)
    const erreurs = surveille(page)

    await page.goto('/')
    await expect(ENTREE(page)).toBeVisible({ timeout: 15_000 })
    await photo(page, 'accueil', 'Le tout premier écran')

    await page.getByRole('button', { name: 'Première connexion' }).click()
    await page.getByLabel('Ton e-mail').fill(KAMIL)
    await photo(page, 'premiere-connexion', '« Première connexion » : il donne son adresse')
    await page.getByRole('button', { name: 'Recevoir le lien' }).click()
    await expect(page.getByText(`Lien envoyé à ${KAMIL}`)).toBeVisible({ timeout: 10_000 })
    await photo(page, 'lien-envoye', 'L’écran dit que le lien est parti')

    const mail = await dernierMail(page, KAMIL)
    await photoDuMail(browser, mail, 'mail-de-connexion', 'Le mail qu’il reçoit')

    await page.goto(lienDuMail(mail))
    await expect(page.getByRole('heading', { name: 'Votre foyer' }),
      'le lien du mail ne mène pas à la création du foyer').toBeVisible({ timeout: 15_000 })
    await photo(page, 'votre-foyer', 'Le lien l’a connecté : il nomme son foyer')
    const apresLien = await compte(KAMIL)
    constate('En base, juste après le lien du mail', apresLien)
    expect(apresLien, 'le lien n’a créé aucun compte').not.toBeNull()
    expect(apresLien!.email_confirme, 'son adresse n’est pas confirmée').toBe(true)
    expect(apresLien!.profil, 'un profil existe avant le foyer').toBeNull()

    await page.getByRole('button', { name: 'Créer le foyer' }).click()
    await expect(page.getByRole('heading', { name: 'Ton mot de passe' }),
      'le foyer créé ne mène pas au mot de passe').toBeVisible({ timeout: 15_000 })
    await photo(page, 'son-mot-de-passe', 'Il choisit son mot de passe')
    await page.getByLabel('Mot de passe').fill(MDP_KAMIL)
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(page.getByLabel('Ton prénom'),
      'le mot de passe posé ne mène pas au profil').toBeVisible({ timeout: 15_000 })
    await photo(page, 'son-profil', 'Son profil : deux choses, et c’est fini')
    await page.getByLabel('Ton prénom').fill('Kamil')
    await page.getByLabel('Ton revenu net mensuel (€)').fill('3200')
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(HUB(page), 'le profil enregistré ne mène pas au hub').toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Mon profil' })).toHaveText('K')
    await expect(page.getByText(/complète ton profil/i)).toHaveCount(0)
    await photo(page, 'son-hub', 'Il est dans l’application')

    const fin = await compte(KAMIL)
    constate('En base, une fois dans l’application', fin)
    expect(fin!.profil?.household_id, 'aucun foyer en base').toBeTruthy()
    expect(fin!.profil?.display_name).toBe('Kamil')
    expect(fin!.profil?.password_set, 'le mot de passe n’est pas noté comme posé').toBe(true)
    expect(fin!.revenus?.map(r => r.net_mensuel_cents)).toEqual([320_000])
    const { data: f } = await db.from('household').select('name')
      .eq('id', fin!.profil!.household_id).single()
    expect(f?.name).toBe('Notre foyer')
    foyerDeKamil = fin!.profil!.household_id
    idDeKamil = fin!.id
    foyers.push(foyerDeKamil)

    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
  })

  test('2 · Kamil se déconnecte, se trompe de mot de passe, revient', async ({ page }) => {
    test.setTimeout(90_000)
    const erreurs = surveille(page)
    await connecte(page, KAMIL, MDP_KAMIL)
    await expect(HUB(page)).toBeVisible({ timeout: 15_000 })

    await versLesReglages(page)
    await page.getByRole('button', { name: 'Me déconnecter' }).scrollIntoViewIfNeeded()
    await photo(page, 'reglages', 'Les réglages, jusqu’à « Me déconnecter »')

    /* Sans réseau, la déconnexion échoue — et le DIT. Elle échouait en
       silence : la page rechargée avait l'air déconnectée, et la session
       revenait avec le réseau, pour la personne suivante. */
    /* Le jeton a expiré et le réseau manque pour le rafraîchir : supabase-js
       rend l'erreur AVANT d'effacer la session. On l'expire à la main, et on
       coupe le rafraîchissement — pas `setOffline`, que Chromium ne fait pas
       valoir pour l'adresse locale. */
    await page.evaluate(() => {
      const cle = Object.keys(localStorage).find(k => k.endsWith('-auth-token'))!
      const s = JSON.parse(localStorage.getItem(cle)!)
      s.expires_at = Math.floor(Date.now() / 1000) - 60
      localStorage.setItem(cle, JSON.stringify(s))
    })
    await page.route('**/auth/v1/token**', r => r.abort('internetdisconnected'))
    await page.getByRole('button', { name: 'Me déconnecter' }).click()
    // supabase-js réessaie trente secondes avant d'abandonner.
    await expect(page.getByRole('button', { name: 'Un instant…' })).toBeDisabled()
    await expect(page.getByText('La déconnexion n’a pas abouti : vérifie ta connexion, puis réessaie.'))
      .toBeVisible({ timeout: 45_000 })
    await expect(ENTREE(page), 'l’écran fait croire à une déconnexion qui n’a pas eu lieu').toHaveCount(0)
    await photo(page, 'deconnexion-sans-reseau', 'Sans réseau, la déconnexion échoue : l’écran le dit')
    await page.unroute('**/auth/v1/token**')

    /* Le réseau revient, et il rouvre l'appli : la session se rafraîchit, et
       cette fois la déconnexion passe. (Juste après l'échec, supabase-js garde
       l'erreur un moment sans retenter le réseau : rouvrir est le geste réel.) */
    await page.reload()
    await page.getByRole('button', { name: 'Me déconnecter' }).click()
    await expect(ENTREE(page), 'se déconnecter ne ramène pas à l’entrée')
      .toBeVisible({ timeout: 15_000 })
    await photo(page, 'deconnecte', 'Déconnecté : retour à l’entrée')

    await page.getByLabel('Ton e-mail').fill(KAMIL)
    await page.getByLabel('Mot de passe').fill('pas-le-bon-1')
    await page.getByRole('button', { name: 'Entrer', exact: true }).click()
    await expect(page.getByText('E-mail ou mot de passe incorrect.')).toBeVisible({ timeout: 10_000 })
    await photo(page, 'mauvais-mot-de-passe', 'Un mauvais mot de passe : l’écran le dit')

    await page.getByLabel('Mot de passe').fill(MDP_KAMIL)
    await page.getByRole('button', { name: 'Entrer', exact: true }).click()
    await expect(HUB(page), 'le bon mot de passe ne fait pas entrer').toBeVisible({ timeout: 15_000 })
    await photo(page, 'reconnecte', 'Avec le bon, il retrouve son foyer')
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
  })

  test('3 · Kamil invite Thauba ; elle ouvre le lien et crée son compte', async ({ page, browser }) => {
    test.setTimeout(150_000)
    await connecte(page, KAMIL, MDP_KAMIL)
    await expect(HUB(page)).toBeVisible({ timeout: 15_000 })
    await versLesReglages(page)

    await page.getByLabel('Son e-mail').fill(THAUBA)
    await page.getByLabel('Son e-mail').scrollIntoViewIfNeeded()
    await photo(page, 'inviter', 'Réglages → Inviter : l’adresse de Thauba')
    await page.getByRole('button', { name: 'Créer l’invitation' }).click()
    await expect(page.getByText(`Invitation créée pour ${THAUBA}. Envoie-lui ce lien.`))
      .toBeVisible({ timeout: 20_000 })
    /* Sous le bouton, pas tout en bas de la page : sur un téléphone, il
       tombait hors de l'écran, et le bouton semblait sans effet. */
    await expect(page.getByText(`Invitation créée pour ${THAUBA}. Envoie-lui ce lien.`),
      'le message de l’invitation tombe hors de l’écran').toBeInViewport()
    lienDeThauba = await page.getByText(/\/invite\/[0-9a-f-]{36}$/).first().innerText()
    await page.getByRole('button', { name: 'Copier le lien' }).scrollIntoViewIfNeeded()
    await photo(page, 'le-lien', 'Le lien à lui envoyer, valable 30 jours')

    await page.waitForTimeout(1_500)
    const avant = {
      invitation: await invitationDe(THAUBA),
      compte: await compte(THAUBA),
      mails_recus: (await mails(page, THAUBA)).length,
    }
    constate('En base, l’invitation créée', avant)
    expect(avant.invitation).toHaveLength(1)
    expect(avant.invitation![0].household_id).toBe(foyerDeKamil)
    expect(avant.invitation![0].accepted_at).toBeNull()
    expect(avant.compte, 'un compte existe avant qu’elle ait rien fait').toBeNull()
    expect(avant.mails_recus, 'un mail est parti : il ne doit plus y en avoir').toBe(0)

    /* ── Thauba, sur SON téléphone, sans compte ─────────────────────────── */
    const elle = await browser.newContext(TELEPHONE)
    const tel = await elle.newPage()
    const erreurs = surveille(tel)
    await tel.goto(lienDeThauba)
    await expect(tel.getByRole('heading', { name: 'Kamil t’invite' }),
      'elle ne lit pas qui l’invite').toBeVisible({ timeout: 15_000 })
    await expect(tel.getByLabel('Ton e-mail')).toHaveValue(THAUBA)
    await expect(tel.getByRole('button', { name: 'Créer mon compte' })).toBeDisabled()
    await photo(tel, 'elle-ouvre-le-lien', 'Thauba ouvre le lien sur son téléphone')

    await tel.getByLabel('Choisis ton mot de passe').fill('court')
    await expect(tel.getByText('Il en faut au moins 8.')).toBeVisible()
    await expect(tel.getByRole('button', { name: 'Créer mon compte' })).toBeDisabled()
    await photo(tel, 'trop-court', 'Trop court : le bouton reste éteint')

    await tel.getByLabel('Choisis ton mot de passe').fill(MDP_THAUBA)
    await tel.getByRole('button', { name: 'Afficher le mot de passe' }).click()
    await expect(tel.getByLabel('Choisis ton mot de passe')).toHaveAttribute('type', 'text')
    await photo(tel, 'mot-de-passe-choisi', 'Son mot de passe, affiché pour le vérifier')
    await tel.getByRole('button', { name: 'Créer mon compte' }).click()

    await expect(tel.getByLabel('Ton prénom'),
      'son compte créé ne mène pas à son profil').toBeVisible({ timeout: 20_000 })
    expect(new URL(tel.url()).pathname, 'elle est restée sur le lien').not.toMatch(/\/invite\//)
    await photo(tel, 'son-profil', 'Son compte est né : elle arrive sur son profil')
    const ne = await compte(THAUBA)
    constate('En base, juste après « Créer mon compte »', { compte: ne, invitation: await invitationDe(THAUBA) })
    expect(ne, 'aucun compte n’a été créé').not.toBeNull()
    expect(ne!.email_confirme, 'son adresse n’est pas confirmée : elle ne pourrait pas revenir').toBe(true)
    expect(ne!.derniere_connexion, 'elle n’a jamais été connectée').toBeTruthy()
    expect(ne!.profil?.household_id, 'elle n’est pas dans le foyer de Kamil').toBe(foyerDeKamil)
    expect(ne!.profil?.password_set).toBe(true)
    expect((await invitationDe(THAUBA))![0].accepted_at, 'l’invitation n’est pas consommée').toBeTruthy()

    await tel.getByLabel('Ton prénom').fill('Thauba')
    await tel.getByLabel('Ton revenu net mensuel (€)').fill('2500')
    await photo(tel, 'son-profil-rempli', 'Elle remplit son profil')
    await tel.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(HUB(tel), 'son profil enregistré ne mène pas au hub').toBeVisible({ timeout: 20_000 })
    await expect(tel.getByRole('button', { name: 'Mon profil' })).toHaveText('T')
    await expect(tel.getByText(/complète ton profil/i)).toHaveCount(0)
    await photo(tel, 'son-hub', 'Elle est dans le foyer')
    const dedans = await compte(THAUBA)
    constate('En base, une fois son profil rempli', dedans)
    expect(dedans!.profil?.display_name).toBe('Thauba')
    expect(dedans!.revenus?.map(r => r.net_mensuel_cents)).toEqual([250_000])
    expect(erreurs, 'des erreurs sont tombées dans la console de son téléphone').toEqual([])
    await elle.close()

    /* ── Et chez Kamil, son profil parle d'elle ─────────────────────────── */
    await page.goto('/')
    await page.getByRole('button', { name: 'Mon profil' }).click()
    await expect(page.getByText(/aujourd’hui avec Thauba/)).toBeVisible({ timeout: 15_000 })
    await photo(page, 'kamil-la-voit', 'Chez Kamil : « aujourd’hui avec Thauba »')
  })

  test('4 · Thauba revient sur un autre appareil, puis oublie son mot de passe', async ({ page, browser }) => {
    test.setTimeout(150_000)
    const erreurs = surveille(page)
    await page.goto('/')
    await page.getByLabel('Ton e-mail').fill(THAUBA)
    await page.getByLabel('Mot de passe').fill(MDP_THAUBA)
    await photo(page, 'elle-revient', 'Autre appareil : son e-mail et son mot de passe')
    await page.getByRole('button', { name: 'Entrer', exact: true }).click()
    await expect(HUB(page), 'son mot de passe ne la fait pas entrer').toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Mon profil' })).toHaveText('T')
    await photo(page, 'elle-est-reconnue', 'Son mot de passe marche')

    /* Par son avatar, cette fois : c'est le chemin du hub, côté Budget comme
       côté Cuisine. */
    await page.getByRole('button', { name: 'Mon profil' }).click()
    await page.getByRole('button', { name: 'Me déconnecter' }).scrollIntoViewIfNeeded()
    await photo(page, 'profil-deconnexion', 'Depuis son profil : « Me déconnecter »')
    await page.getByRole('button', { name: 'Me déconnecter' }).click()
    await expect(ENTREE(page)).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Mot de passe oublié' }).click()
    await page.getByLabel('Ton e-mail').fill(THAUBA)
    await page.getByRole('button', { name: 'Réinitialiser mon mot de passe' }).click()
    await expect(page.getByText(/le lien vient de partir/)).toBeVisible({ timeout: 10_000 })
    await photo(page, 'oubli', '« Mot de passe oublié » : le lien part')

    const mail = await dernierMail(page, THAUBA)
    await photoDuMail(browser, mail, 'mail-reinitialisation', 'Le mail de réinitialisation')
    await page.goto(lienDuMail(mail))
    await expect(page.getByRole('heading', { name: 'Ton mot de passe' }),
      'le lien du mail ne mène pas au nouveau mot de passe').toBeVisible({ timeout: 15_000 })
    await photo(page, 'nouveau-mot-de-passe', 'Le lien mène à son nouveau mot de passe')
    /* On retape souvent l'ancien, qu'on croyait perdu : Supabase le refuse,
       en anglais. L'écran doit le dire en français. */
    await page.getByLabel('Mot de passe').fill(MDP_THAUBA)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('C’est déjà ton mot de passe : choisis-en un autre.'))
      .toBeVisible({ timeout: 10_000 })
    await photo(page, 'meme-mot-de-passe', 'Elle retape l’ancien : l’écran le dit, en français')
    await page.getByLabel('Mot de passe').fill(MDP_THAUBA_NOUVEAU)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(HUB(page), 'le nouveau mot de passe ne mène pas au hub').toBeVisible({ timeout: 15_000 })
    await photo(page, 'mot-de-passe-change', 'Nouveau mot de passe : elle est dedans')
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])

    /* Sur un troisième appareil : l'ancien est refusé, le nouveau ouvre. */
    const ailleurs = await browser.newContext(TELEPHONE)
    const p = await ailleurs.newPage()
    await connecte(p, THAUBA, MDP_THAUBA)
    await expect(p.getByText('E-mail ou mot de passe incorrect.'),
      'l’ancien mot de passe marche encore').toBeVisible({ timeout: 10_000 })
    await p.getByLabel('Mot de passe').fill(MDP_THAUBA_NOUVEAU)
    await p.getByRole('button', { name: 'Entrer', exact: true }).click()
    await expect(HUB(p), 'le nouveau mot de passe ne fait pas entrer').toBeVisible({ timeout: 15_000 })
    await ailleurs.close()
    constate('En base, après le nouveau mot de passe', await compte(THAUBA))
  })

  test('5 · Les liens qui ne marchent pas le disent', async ({ page }) => {
    test.setTimeout(90_000)
    const erreurs = surveille(page)

    await page.goto(lienDeThauba)
    await expect(page.getByRole('heading', { name: 'Ce lien a déjà servi' })).toBeVisible({ timeout: 15_000 })
    await photo(page, 'lien-deja-servi', 'Le lien de Thauba, rouvert : il a déjà servi')
    await page.getByRole('button', { name: 'Me connecter' }).click()
    await expect(ENTREE(page), '« Me connecter » ne mène pas à l’entrée').toBeVisible()

    const perime = `perime-${STAMP}@inscription.test`
    const { data: inv, error } = await db.from('invitation').insert({
      household_id: foyerDeKamil, email: perime, created_by: idDeKamil,
      expires_at: new Date(Date.now() - 864e5).toISOString(),
    }).select('token').single()
    if (error) throw error
    await page.goto(`/invite/${inv.token}`)
    await expect(page.getByRole('heading', { name: 'Ce lien a expiré' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/Demande à Kamil de t’en envoyer un nouveau/)).toBeVisible()
    await photo(page, 'lien-expire', 'Un lien de plus de 30 jours')

    await page.goto(`/invite/${randomUUID()}`)
    await expect(page.getByRole('heading', { name: 'Ce lien ne mène nulle part' })).toBeVisible({ timeout: 15_000 })
    await photo(page, 'lien-inconnu', 'Un lien qui n’existe pas')

    await page.goto(`/invite/${inv.token.slice(0, 20)}`)
    await expect(page.getByRole('heading', { name: 'Ce lien ne mène nulle part' }),
      'un lien tronqué au copier-coller ne le dit pas').toBeVisible({ timeout: 15_000 })

    await page.route('**/rest/v1/rpc/invitation_par_jeton', r => r.abort('internetdisconnected'))
    await page.goto(`/invite/${randomUUID()}`)
    await expect(page.getByRole('heading', { name: 'Ce lien n’a pas pu être lu' })).toBeVisible({ timeout: 15_000 })
    await photo(page, 'sans-reseau', 'Sans réseau : l’écran le dit, et propose de recharger')
    await page.unroute('**/rest/v1/rpc/invitation_par_jeton')
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
  })

  test('6 · Une adresse qui a déjà un compte Popote', async ({ page }) => {
    test.setTimeout(90_000)
    const sam = `sam-${STAMP}@inscription.test`
    adresses.push(sam)
    const { data: u, error } = await db.auth.admin.createUser({
      email: sam, password: 'sam-a-son-compte-1', email_confirm: true })
    if (error) throw error
    const { data: autre } = await db.from('household').insert({ name: 'Le foyer de Sam' }).select().single()
    foyers.push(autre!.id)
    await db.from('user_profile').insert({
      id: u.user.id, household_id: autre!.id, display_name: 'Sam', password_set: true })
    const { data: inv } = await db.from('invitation').insert({
      household_id: foyerDeKamil, email: sam, created_by: idDeKamil }).select('token').single()

    await page.goto(`/invite/${inv!.token}`)
    await page.getByLabel('Choisis ton mot de passe').fill('un-autre-mot-2')
    await page.getByRole('button', { name: 'Créer mon compte' }).click()
    await expect(page.getByText('Cette adresse a déjà un compte Popote. Connecte-toi avec ton mot de passe.'))
      .toBeVisible({ timeout: 15_000 })
    await photo(page, 'compte-existant', 'Une adresse qui a déjà un compte : l’écran le dit')
    const apres = { compte: await compte(sam), invitation: await invitationDe(sam) }
    constate('En base : rien n’a bougé, le lien n’est pas consommé', apres)
    expect(apres.invitation![0].accepted_at, 'le lien a été consommé pour rien').toBeNull()
    expect(apres.compte!.profil?.household_id, 'son compte a changé de foyer').toBe(autre!.id)

    await page.getByRole('button', { name: 'Me connecter' }).click()
    await page.getByLabel('Ton e-mail').fill(sam)
    await page.getByLabel('Mot de passe').fill('sam-a-son-compte-1')
    await page.getByRole('button', { name: 'Entrer', exact: true }).click()
    await expect(page.getByRole('heading', { name: /tu es déjà dans un foyer/i }))
      .toBeVisible({ timeout: 15_000 })
    await photo(page, 'deja-dans-un-foyer', 'Connecté : il est déjà dans un autre foyer, l’écran le dit')
  })

  test('7 · Thauba supprime son compte : le foyer reste', async ({ page }) => {
    test.setTimeout(90_000)
    const erreurs = surveille(page)
    await connecte(page, THAUBA, MDP_THAUBA_NOUVEAU)
    await expect(HUB(page)).toBeVisible({ timeout: 15_000 })
    await versLesReglages(page)
    await page.getByRole('button', { name: 'Supprimer mon compte' }).scrollIntoViewIfNeeded()
    await photo(page, 'supprimer', 'Réglages : « Supprimer mon compte »')
    page.once('dialog', d => d.accept())
    await page.getByRole('button', { name: 'Supprimer mon compte' }).click()
    await expect(ENTREE(page), 'la suppression ne ramène pas à l’entrée').toBeVisible({ timeout: 15_000 })
    await photo(page, 'supprime', 'Compte supprimé : retour à l’entrée')

    const elle = await compte(THAUBA)
    const lui = await compte(KAMIL)
    const { data: f } = await db.from('household').select('id').eq('id', foyerDeKamil)
    constate('En base, après la suppression', { thauba: elle, kamil: lui, foyer_existe: (f ?? []).length === 1 })
    expect(elle, 'son compte existe encore').toBeNull()
    expect(lui!.profil?.household_id, 'Kamil a perdu son foyer').toBe(foyerDeKamil)
    expect(f, 'le foyer a disparu avec elle').toHaveLength(1)

    await page.getByLabel('Ton e-mail').fill(THAUBA)
    await page.getByLabel('Mot de passe').fill(MDP_THAUBA_NOUVEAU)
    await page.getByRole('button', { name: 'Entrer', exact: true }).click()
    await expect(page.getByText('E-mail ou mot de passe incorrect.'),
      'un compte supprimé ouvre encore une session').toBeVisible({ timeout: 10_000 })
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
  })

  test('8 · Le cas réel de Thauba : un compte laissé par l’ancien mail', async ({ page, browser }) => {
    /* En production, l'ancien mail d'invitation du 17/09 a créé son compte
       — jamais confirmé, sans mot de passe, sans foyer. Kamil va la réinviter
       depuis les réglages : c'est ce geste-là, sur ce compte-là, qu'on joue. */
    test.setTimeout(150_000)
    const ancienne = `ancienne-${STAMP}@inscription.test`
    adresses.push(ancienne)
    const { error } = await db.auth.admin.inviteUserByEmail(ancienne)
    if (error) throw error
    const laisse = await compte(ancienne)
    constate('En base, le compte laissé par l’ancien mail', laisse)
    expect(laisse!.email_confirme).toBe(false)
    expect(laisse!.profil).toBeNull()

    await connecte(page, KAMIL, MDP_KAMIL)
    await expect(HUB(page)).toBeVisible({ timeout: 15_000 })
    await versLesReglages(page)
    await page.getByLabel('Son e-mail').fill(ancienne)
    await page.getByRole('button', { name: 'Créer l’invitation' }).click()
    await expect(page.getByText(`Invitation créée pour ${ancienne}. Envoie-lui ce lien.`))
      .toBeVisible({ timeout: 20_000 })
    const lien = await page.getByText(/\/invite\/[0-9a-f-]{36}$/).first().innerText()

    const sonTel = await browser.newContext(TELEPHONE)
    const tel = await sonTel.newPage()
    const erreurs = surveille(tel)
    await tel.goto(lien)
    await expect(tel.getByRole('heading', { name: 'Kamil t’invite' })).toBeVisible({ timeout: 15_000 })
    await tel.getByLabel('Choisis ton mot de passe').fill('ancienne-invitee-9')
    await photo(tel, 'ancienne-invitee', 'Le même formulaire, sur le compte de l’ancien mail')
    // Deux tapes, comme un pouce impatient : un seul compte doit naître.
    await tel.getByRole('button', { name: 'Créer mon compte' }).dblclick()
    await expect(tel.getByLabel('Ton prénom')).toBeVisible({ timeout: 20_000 })
    await photo(tel, 'ancienne-entre', 'Elle entre : son profil')

    /* Elle le remet à plus tard : le hub la laisse entrer, sans rond vide à la
       place de l'avatar, et lui dit ce qui manque. */
    await tel.getByRole('button', { name: 'Popote', exact: true }).click()
    await expect(HUB(tel)).toBeVisible({ timeout: 15_000 })
    await expect(tel.getByRole('button', { name: 'Mon profil' })).toHaveText('?')
    await expect(tel.getByText('Complète ton profil.')).toBeVisible()
    await photo(tel, 'profil-plus-tard', 'Profil remis à plus tard : « ? », et ce qui manque')

    const entree = await compte(ancienne)
    constate('En base : le MÊME compte, confirmé, dans le foyer', entree)
    expect(entree!.id, 'un second compte est né au lieu de reprendre le sien').toBe(laisse!.id)
    expect(await nombreDeComptes(ancienne)).toBe(1)
    expect(entree!.email_confirme).toBe(true)
    expect(entree!.profil?.household_id).toBe(foyerDeKamil)
    expect(entree!.profil?.password_set).toBe(true)
    expect(erreurs, 'des erreurs sont tombées dans la console').toEqual([])
    await sonTel.close()

    const ailleurs = await browser.newContext(TELEPHONE)
    const p = await ailleurs.newPage()
    await connecte(p, ancienne, 'ancienne-invitee-9')
    await expect(p.getByLabel('Ton prénom'), 'son mot de passe ne la fait pas revenir')
      .toBeVisible({ timeout: 15_000 })
    await ailleurs.close()
  })
})
