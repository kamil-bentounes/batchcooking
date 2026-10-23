/**
 * L'aide intégrée, jouée au clic : « Demande à Popote ».
 *
 * La fonction est SIMULÉE ici (réponses fixes) : ce banc mesure l'écran — où est le « ? », ce que la feuille montre,
 * ce que chaque réponse déclenche — pas le modèle. Le modèle se mesure à part (`npm run banc-aide`), et le chemin
 * complet contre la vraie fonction locale se rejoue à la main (voir ETAT.md).
 *
 * ⚠️ LOCAL, ET RIEN D'AUTRE.
 */
import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import { MOT_DE_PASSE, amorce, db, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'

let foyer: Foyer

test.beforeAll(() => {
  const url = process.env.VITE_SUPABASE_URL ?? ''
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(`Ce banc ne se joue qu'en local. Base visée : ${url || '(non renseignée)'}.`)
  }
})
test.afterEach(async () => { if (foyer) await efface(foyer) })

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const INVITER = {
  reponse: 'Sur l’accueil, touche « Inviter quelqu’un », saisis son e-mail, puis « Créer l’invitation ».\nAucun mail ne part : tu lui envoies le lien toi-même.',
  savoir: 'oui',
  sources: [{ id: 'foyer-inviter', titre: 'Inviter quelqu’un', verifie_le: '2026-10-23' }],
  ouvrir: { id: 'inviter', chemin: '/reglages#inviter', bouton: 'Ouvrir « Inviter quelqu’un »' },
  a_verifier: [],
  restantes: 299,
}

/** Simule la fonction : chaque question reçoit la réponse suivante de la file, et les corps reçus sont gardés. */
async function simule(page: Page, reponses: (object | { statut: number; erreur: string })[]) {
  const corps: Record<string, unknown>[] = []
  let i = 0
  await page.route('**/functions/v1/aide', async (route: Route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    corps.push(req.postDataJSON())
    const r = reponses[Math.min(i++, reponses.length - 1)]
    if ('statut' in r) {
      return route.fulfill({ status: r.statut, headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify({ erreur: r.erreur }) })
    }
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(r) })
  })
  return corps
}

async function connecte(page: Page, email: string) {
  await page.goto('/')
  await page.getByLabel('Ton e-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

const bouton = (page: Page) => page.getByRole('button', { name: 'Poser une question à l’aide' })

test('le « ? » est dans l’en-tête de l’accueil, à côté de l’avatar, et la feuille s’ouvre et se ferme au clavier', async ({ page }) => {
  foyer = await amorce({ budget: false })
  await connecte(page, foyer.email)

  await expect(bouton(page), 'un seul « ? » sur l’accueil').toHaveCount(1)
  const aide = await bouton(page).boundingBox()
  const avatar = await page.getByRole('button', { name: 'Mon profil' }).boundingBox()
  expect(aide!.x + aide!.width, 'le « ? » est à gauche de l’avatar').toBeLessThanOrEqual(avatar!.x + 1)
  expect(Math.abs(aide!.y - avatar!.y), 'sur la même ligne').toBeLessThan(4)
  await page.screenshot({ path: '.shots/aide/01-hub.png' })

  await bouton(page).click()
  const feuille = page.getByRole('dialog', { name: 'Demande à Popote' })
  await expect(feuille).toBeVisible()
  await expect(page.getByLabel('Ta question'), 'le focus entre dans le champ').toBeFocused()
  await expect(page.getByText('Souvent demandé')).toBeVisible()
  await page.screenshot({ path: '.shots/aide/02-feuille-ouverte.png' })

  await page.keyboard.press('Escape')
  await expect(feuille).toHaveCount(0)
  await expect(bouton(page), 'le focus revient au « ? »').toBeFocused()
})

test('une question : la réponse, sa source, l’écran à ouvrir — et le bouton mène sur la section', async ({ page }) => {
  foyer = await amorce({ budget: false })
  const corps = await simule(page, [INVITER])
  await connecte(page, foyer.email)
  await bouton(page).click()

  await page.getByRole('button', { name: 'Comment inviter Thauba ?' }).click()
  await expect(page.getByText('Aucun mail ne part', { exact: false })).toBeVisible()
  await expect(page.getByText(/Source : manuel « Inviter quelqu’un », vérifié le 23 octobre/)).toBeVisible()
  await expect(page.getByRole('note'), 'une réponse confirmée ne porte aucune mise en garde').toHaveCount(0)
  expect(corps[0]).toMatchObject({ question: 'Comment inviter Thauba ?', precedent: null, ecran: '/' })
  await page.screenshot({ path: '.shots/aide/03-reponse.png' })

  await page.getByRole('button', { name: 'Ouvrir « Inviter quelqu’un »' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Inviter', exact: true })).toBeInViewport({ timeout: 5_000 })
})

test('la seconde question emporte la première, et la réponse non confirmée le dit', async ({ page }) => {
  foyer = await amorce({ budget: false })
  const partielle = {
    reponse: 'Elle vaut 90 jours.', savoir: 'partiel', ouvrir: null, restantes: 298,
    sources: [{ id: 'foyer-inviter', titre: 'Inviter quelqu’un', verifie_le: '2026-10-23' }],
    a_verifier: ['90'],
  }
  const corps = await simule(page, [INVITER, partielle])
  await connecte(page, foyer.email)
  await bouton(page).click()

  await page.getByRole('button', { name: 'Comment inviter Thauba ?' }).click()
  await expect(page.getByText('Aucun mail ne part', { exact: false })).toBeVisible()
  await page.getByLabel('Ta question').fill('Et elle dure combien de temps ?')
  await page.getByRole('button', { name: 'Envoyer' }).click()
  await expect(page.getByText('Elle vaut 90 jours.')).toBeVisible()
  expect(corps[1]).toMatchObject({
    question: 'Et elle dure combien de temps ?',
    precedent: { question: 'Comment inviter Thauba ?', reponse: expect.stringContaining('Aucun mail ne part') },
  })
  await expect(page.getByRole('note')).toContainText('Je n’ai pas pu confirmer dans le manuel : 90')
  await page.screenshot({ path: '.shots/aide/04-non-confirmee.png' })
})

test('« Cette réponse est fausse » écrit le signalement en base et remercie', async ({ page }) => {
  foyer = await amorce({ budget: false })
  await simule(page, [INVITER])
  await connecte(page, foyer.email)
  await bouton(page).click()
  await page.getByRole('button', { name: 'Comment inviter Thauba ?' }).click()
  await expect(page.getByText('Aucun mail ne part', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Cette réponse est fausse' }).click()
  await expect(page.getByText('Merci, c’est noté.')).toBeVisible({ timeout: 10_000 })
  const { data } = await db.from('aide_signalement').select('question, pages, user_profile_id')
    .eq('household_id', foyer.householdId)
  expect(data).toEqual([{ question: 'Comment inviter Thauba ?', pages: ['foyer-inviter'], user_profile_id: foyer.userId }])
})

test('un refus de la fonction se dit, et la question revient dans le champ', async ({ page }) => {
  foyer = await amorce({ budget: false })
  await simule(page, [{ statut: 429, erreur: 'Quota atteint : 300 questions par mois. Il repart le 1er.' }])
  await connecte(page, foyer.email)
  await bouton(page).click()
  await page.getByLabel('Ta question').fill('Comment clôturer un mois ?')
  await page.getByRole('button', { name: 'Envoyer' }).click()
  await expect(page.getByRole('alert')).toContainText('Quota atteint')
  await expect(page.getByLabel('Ta question')).toHaveValue('Comment clôturer un mois ?')
  await page.screenshot({ path: '.shots/aide/05-refus.png' })
})

test('partout ailleurs le « ? » flotte dans la marge du haut, sans recouvrir rien', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)

  for (const route of ['/charges', '/budget-reglages', '/epargne', '/reglages', '/profil', '/semaine', '/stock', '/bilan', '/choisir']) {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    await expect(bouton(page), `un seul « ? » sur ${route}`).toHaveCount(1)
    const b = (await bouton(page).boundingBox())!
    expect(b.y + b.height, `${route} : le « ? » déborde dans le contenu`).toBeLessThanOrEqual(60)
    /* Aucun autre élément cliquable ne le recouvre. */
    const autres = await page.locator('button, a[href], input, select, textarea').evaluateAll((els, ref) =>
      els.filter(e => {
        const r = (e as HTMLElement).getBoundingClientRect()
        const visible = r.width > 0 && r.height > 0
        const labelOk = (e.getAttribute('aria-label') ?? '') !== 'Poser une question à l’aide'
        const croise = r.left < ref.x + ref.w && r.right > ref.x && r.top < ref.y + ref.h && r.bottom > ref.y
        return visible && labelOk && croise
      }).map(e => `${e.tagName} ${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 30)}`),
      { x: b.x, y: b.y, w: b.width, h: b.height })
    expect(autres, `${route} : le « ? » recouvre ${autres.join(', ')}`).toEqual([])
    await page.screenshot({ path: `.shots/aide/06${route.replace(/\//g, '-')}.png` })
  }

  for (const route of ['/', '/budget', '/cuisine-accueil']) {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
    await expect(bouton(page), `un seul « ? » sur ${route} (celui de l’en-tête)`).toHaveCount(1)
    const aide = (await bouton(page).boundingBox())!
    expect(aide.y, `${route} : dans l’en-tête, pas dans la marge`).toBeGreaterThan(8)
  }
})

test('sur les charges, la feuille propose les questions de l’écran et envoie l’écran à la fonction', async ({ page }) => {
  foyer = await amorce()
  const corps = await simule(page, [INVITER])
  await connecte(page, foyer.email)
  await page.goto('/charges')
  await bouton(page).click()
  await expect(page.getByText('Sur cet écran')).toBeVisible()
  await page.getByRole('button', { name: 'À quoi sert « en commun » ?' }).click()
  await expect(page.getByText('Aucun mail ne part', { exact: false })).toBeVisible()
  expect(corps[0]).toMatchObject({ ecran: '/charges' })
  await page.screenshot({ path: '.shots/aide/07-charges.png' })
})

test('l’aide n’existe pas avant la connexion', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Ton e-mail')).toBeVisible()
  await expect(bouton(page)).toHaveCount(0)
  await page.goto('/invite/00000000-0000-0000-0000-000000000000')
  await page.waitForLoadState('networkidle')
  await expect(bouton(page)).toHaveCount(0)
})
