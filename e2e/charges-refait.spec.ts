/**
 * L'écran des Charges refait (27/10) : la liste rangée par catégorie, les gestes qui s'ouvrent au toucher,
 * l'erreur d'un geste sur SA ligne, et l'écran d'avant l'arrivée — calé sur le mois d'arrivée, pas à 0 €.
 *
 * ⚠️ LOCAL, ET RIEN D'AUTRE.
 */
import { expect, test, type Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, db, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'
import { ouvreLaLigne } from './aides-charges.ts'

let foyer: Foyer
test.beforeAll(() => {
  const url = process.env.VITE_SUPABASE_URL ?? ''
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(`Ce banc ne se joue qu'en local. Base visée : ${url || '(non renseignée)'}.`)
  }
})
test.afterEach(async () => { if (foyer) await efface(foyer) })
test.use({ viewport: { width: 390, height: 844 } })

async function connecte(page: Page, email: string) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

/** La ligne d'une charge, par son nom. */
const ligne = (page: Page, nom: string) => page.locator('[data-charge]').filter({ has: page.getByText(nom, { exact: true }) })

test('la liste est rangée par catégorie, avec ses comptes, ses totaux et ses lignes', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/charges')

  /* Les catégories du budget, la plus lourde d'abord (par mois). */
  const cartes = page.locator('section[aria-label^="Catégorie "]')
  await expect(cartes.first()).toBeVisible({ timeout: 15_000 })
  expect(await cartes.evaluateAll(els => els.map(e => e.getAttribute('aria-label')))).toEqual([
    'Catégorie Crédits', 'Catégorie Impôts', 'Catégorie Vie courante', 'Catégorie Maison',
    'Catégorie Auto', 'Catégorie Santé', 'Catégorie Abonnements'])
  const totaux = await cartes.evaluateAll(els => els.map(e => Number(e.getAttribute('data-total'))))
  expect([...totaux].sort((a, b) => b - a)).toEqual(totaux)

  /* En-tête de catégorie : le nombre de lignes et le total par mois. */
  const maison = page.getByRole('region', { name: 'Catégorie Maison' })
  await expect(maison.getByRole('button', { name: /Maison\s*3 lignes\s*187 €/ })).toBeVisible()

  /* Une ligne : son nom, « 37 € par mois · Kamil et Thauba », le montant, les initiales. */
  const internet = ligne(page, 'Internet')
  await expect(internet).toContainText('37 € par mois · Kamil et Thauba')
  await expect(internet.locator('.chiffre')).toHaveText('37 €')
  /* Une charge qui ne se paie pas chaque mois : son montant, et « 100 € par mois » dessous ; sans compte. */
  const copro = ligne(page, 'Charges de copropriété du bâtiment B')
  await expect(copro).toContainText('300 € par trimestre · Kamil et Thauba · mise de côté')
  await expect(copro.locator('.chiffre')).toHaveText('300 €')
  await expect(copro).toContainText('100 € par mois')
  await expect(copro).toContainText('sans compte')
  await expect(internet).not.toContainText('sans compte')

  /* Le total du foyer, en grand, et la phrase. */
  await expect(page.getByText(/par mois pour le foyer, une fois tout ramené au mois/)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Répartition par catégorie' })).toContainText('Crédits')

  /* Les filtres, avec leurs comptes. */
  const filtres = page.getByRole('group', { name: 'Filtrer' })
  await expect(filtres.getByRole('button', { name: /^Tout\s*10$/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(filtres.getByRole('button', { name: /^En commun\s*7$/ })).toBeVisible()
  await expect(filtres.getByRole('button', { name: /^À moi\s*2$/ })).toBeVisible()
  await filtres.getByRole('button', { name: /^À moi/ }).click()
  await expect(page.getByText(/par mois pour toi, une fois tout ramené au mois/)).toBeVisible()
  await expect(page.locator('[data-charge]')).toHaveCount(2)
  await expect(ligne(page, 'Forfait mobile')).toBeVisible()
  await expect(ligne(page, 'Internet')).toHaveCount(0)
})

test('les gestes d’une ligne s’ouvrent quand on la touche, un seul panneau à la fois', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/charges')
  const internet = ligne(page, 'Internet')
  await expect(internet).toBeVisible({ timeout: 15_000 })

  /* Fermés : aucun geste dans la page. */
  await expect(page.getByRole('button', { name: 'Corriger Internet' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retirer Internet' })).toHaveCount(0)

  const toucheInternet = internet.getByRole('button', { expanded: false }).first()
  await toucheInternet.click()
  await expect(internet.getByRole('button', { name: 'Corriger Internet' })).toBeVisible()
  await expect(internet.getByRole('button', { name: 'Changer qui participe' })).toBeVisible()
  await expect(internet.getByRole('button', { name: 'Retirer Internet' })).toBeVisible()
  /* Rattacher n'est proposé qu'à une charge sans compte. */
  await expect(internet.getByRole('button', { name: 'Rattacher' })).toHaveCount(0)

  /* Une autre ligne : la première se referme. Sans compte, elle propose « Rattacher ». */
  const copro = ligne(page, 'Charges de copropriété du bâtiment B')
  await copro.getByRole('button', { expanded: false }).first().click()
  await expect(copro.getByRole('button', { name: 'Rattacher' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Corriger Internet' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Corriger / })).toHaveCount(1)

  /* « Corriger » se déplie DANS la ligne ; les règles d'avant sont là. */
  await copro.getByRole('button', { name: /^Corriger / }).click()
  await expect(copro.getByLabel('Son nom')).toHaveValue('Charges de copropriété du bâtiment B')
  await expect(copro.getByText('Les mois déjà confirmés gardent leur montant. Les autres se refont.')).toBeVisible()
  await expect(copro.getByRole('radiogroup', { name: /^Catégorie de / })).toBeVisible()
  /* Annuler : retour aux gestes de la ligne. */
  await copro.getByRole('button', { name: 'Annuler' }).click()
  await expect(copro.getByRole('button', { name: /^Corriger / })).toBeVisible()
  await expect(copro.getByLabel('Son nom')).toHaveCount(0)

  /* La ligne se referme d'un second toucher. */
  await copro.getByRole('button', { expanded: true }).first().click()
  await expect(page.getByRole('button', { name: /^Corriger / })).toHaveCount(0)
})

test('« Changer qui participe » se règle dans la ligne, et se referme sur elle', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/charges')
  const internet = ligne(page, 'Internet')
  await internet.getByRole('button', { expanded: false }).first().click()
  await internet.getByRole('button', { name: 'Changer qui participe' }).click()
  const kamil = internet.getByRole('checkbox', { name: 'Kamil' })
  const thauba = internet.getByRole('checkbox', { name: 'Thauba' })
  await expect(kamil).toHaveAttribute('aria-checked', 'true')
  await thauba.click()
  await expect(thauba).toHaveAttribute('aria-checked', 'false', { timeout: 10_000 })
  await expect(internet).toContainText('Kamil seul')
  await thauba.click()
  await expect(thauba).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 })
  await internet.getByRole('button', { name: 'Fermer' }).click()
  await expect(internet.getByRole('button', { name: 'Corriger Internet' })).toBeVisible()
})

test('l’erreur d’un geste s’affiche sur la ligne qui l’a produite, jamais en tête de page', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/charges')
  const copro = ligne(page, 'Charges de copropriété du bâtiment B')
  await copro.getByRole('button', { expanded: false }).first().click()

  /* La base refuse l'écriture : « Rattacher » échoue. */
  await page.route('**/rest/v1/charge?*', route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 500, contentType: 'application/json',
                      body: JSON.stringify({ message: 'Refus de test sur la ligne' }) })
    : route.continue())
  await copro.getByRole('button', { name: 'Rattacher' }).click()

  const alerte = page.getByRole('alert').filter({ hasText: 'Refus de test sur la ligne' })
  await expect(alerte).toHaveCount(1)
  await expect(copro.getByRole('alert')).toContainText('Refus de test sur la ligne')
  /* Ni sur les autres lignes, ni au-dessus de la liste (avant la première catégorie). */
  await expect(ligne(page, 'Internet').getByRole('alert')).toHaveCount(0)
  const avantLaListe = await alerte.evaluate(el => {
    const premiere = document.querySelector('section[aria-label^="Catégorie "]')!
    return !!(el.compareDocumentPosition(premiere) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(avantLaListe, 'l’erreur est montée en tête de page').toBe(false)
  /* Et la charge n'a pas bougé : toujours sans compte. */
  await expect(copro).toContainText('sans compte')
})

test('avant son arrivée, l’écran se cale sur le mois d’arrivée : les montants de novembre, pas 0 €', async ({ page }) => {
  foyer = await amorce()
  const d = new Date()
  const p = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  const iso = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`
  const nom = p.toLocaleDateString('fr-FR', { month: 'long' })
  /* Il entre dans le foyer le mois prochain, et tout est posé pour ce mois-là — comme Kamil. */
  await db.from('user_profile').update({ entre_le: iso }).eq('id', foyer.userId)
  await db.from('user_profile').update({ entre_le: iso }).eq('id', foyer.elleId)
  await db.from('charge').update({ debut: iso }).eq('household_id', foyer.householdId)
  await connecte(page, foyer.email)
  await page.goto('/charges')

  /* Une ligne en tête le dit. */
  await expect(page.getByText(`Tu entres dans le foyer en ${nom}`)).toBeVisible({ timeout: 15_000 })

  /* Chaque ligne montre son montant d'arrivée, et plus « commence en … ». */
  const internet = ligne(page, 'Internet')
  await expect(internet.locator('.chiffre')).toHaveText('37 €')
  await expect(internet).toContainText('37 € par mois · Kamil et Thauba')
  await expect(page.getByText(/commence en /)).toHaveCount(0)

  /* Le total est celui du mois d'arrivée, pas 0,00 €. */
  const total = page.getByText(/par mois pour le foyer, une fois tout ramené au mois/)
  await expect(total).toBeVisible()
  expect(await total.innerText()).not.toMatch(/^0,00 €/)
  const maison = page.getByRole('region', { name: 'Catégorie Maison' })
  await expect(maison.getByRole('button', { name: /Maison\s*3 lignes\s*187 €/ })).toBeVisible()

  /* Une charge qui commence APRÈS l'arrivée reste « à venir », grisée et hors du total. */
  await db.from('charge').update({ debut: `${p.getFullYear() + 1}-${String(p.getMonth() + 1).padStart(2, '0')}-01` })
    .eq('household_id', foyer.householdId).eq('libelle', 'Internet')
  await page.reload()
  const plusTard = ligne(page, 'Internet')
  await expect(plusTard).toContainText(`commence en ${nom} ${p.getFullYear() + 1}`)
  await expect(page.getByRole('region', { name: 'Catégorie Maison' })
    .getByRole('button', { name: /Maison\s*3 lignes\s*150 €/ })).toBeVisible()
})

test('à 320 px, ni défilement de côté, ni cible de moins de 44 px dans la liste, un geste ouvert', async ({ page }) => {
  foyer = await amorce()
  await page.setViewportSize({ width: 320, height: 700 })
  await connecte(page, foyer.email)
  const debordement = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  await page.goto('/charges')
  const copro = ligne(page, 'Charges de copropriété du bâtiment B')
  await expect(copro).toBeVisible({ timeout: 15_000 })
  expect(await debordement(), 'la liste déborde à 320 px').toBeLessThanOrEqual(0)

  await copro.getByRole('button', { expanded: false }).first().click()
  expect(await debordement(), 'les gestes débordent à 320 px').toBeLessThanOrEqual(0)
  await copro.getByRole('button', { name: /^Corriger / }).click()
  expect(await debordement(), 'le formulaire « Corriger » déborde à 320 px').toBeLessThanOrEqual(0)

  /* Les cibles : chaque bouton visible de la ligne ouverte fait 44 px au moins. */
  const petits = await copro.getByRole('button').evaluateAll(bs => bs
    .map(b => ({ nom: (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 30), h: b.getBoundingClientRect().height }))
    .filter(b => b.h > 0 && b.h < 43.5))
  expect(petits, 'des cibles de moins de 44 px').toEqual([])

  await page.getByRole('button', { name: 'Autre chose' }).click()
  expect(await debordement(), 'le formulaire d’ajout déborde à 320 px').toBeLessThanOrEqual(0)

  await page.goto('/toutes-les-charges')
  await expect(page.getByRole('region', { name: 'Les charges' })).toBeVisible({ timeout: 15_000 })
  expect(await debordement(), 'le tableau déborde à 320 px').toBeLessThanOrEqual(0)
})

/* ── Ce que la revue adverse du 27/10 a trouvé ──────────────────────────────────────────────────────── */

/** Le premier du mois prochain (AAAA-MM-01), son nom (« novembre ») et le mois courant (AAAA-MM). */
function mois() {
  const d = new Date()
  const p = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  const deux = (n: number) => String(n).padStart(2, '0')
  return {
    prochain: `${p.getFullYear()}-${deux(p.getMonth() + 1)}-01`,
    nom: p.toLocaleDateString('fr-FR', { month: 'long' }), annee: p.getFullYear(),
    courant: `${d.getFullYear()}-${deux(d.getMonth() + 1)}`,
  }
}

test('une correction lente ne referme pas le panneau d’une autre ligne, ni ne lui prend son focus ni sa saisie', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/charges')
  let libere!: () => void
  const porte = new Promise<void>(r => { libere = r })
  await page.route('**/rest/v1/rpc/corrige_la_charge', async route => { await porte; await route.continue() })

  /* A : « Internet » est corrigée — la base répond lentement. */
  await ouvreLaLigne(page, 'Internet')
  const a = ligne(page, 'Internet')
  await a.getByRole('button', { name: 'Corriger Internet' }).click()
  await a.getByLabel('Montant de Internet').fill('40')
  await a.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(a.getByRole('button', { name: 'Je corrige…' })).toBeDisabled()

  /* B : pendant ce temps, on ouvre « Électricité » et on y tape. */
  await ouvreLaLigne(page, 'Électricité')
  const b = ligne(page, 'Électricité')
  await b.getByRole('button', { name: 'Corriger Électricité' }).click()
  const nomDeB = b.getByLabel('Son nom')
  await nomDeB.fill('Électricité du soir')
  await expect(nomDeB).toBeFocused()

  libere()
  await expect(a.getByRole('status')).toContainText('« Internet » corrigée', { timeout: 15_000 })
  /* Le panneau de B est resté ouvert, avec sa saisie, et le focus n'a pas bougé. */
  await expect(nomDeB).toHaveValue('Électricité du soir')
  await expect(nomDeB).toBeFocused()
  await expect(a.getByLabel('Montant de Internet'), 'le panneau de A est resté ouvert').toHaveCount(0)
})

test('l’échec d’une correction lente se lit sur SA ligne, même quand on a ouvert une autre', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/charges')
  let libere!: () => void
  const porte = new Promise<void>(r => { libere = r })
  await page.route('**/rest/v1/rpc/corrige_la_charge', async route => {
    await porte
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Refus lent de test' }) })
  })

  await ouvreLaLigne(page, 'Internet')
  const a = ligne(page, 'Internet')
  await a.getByRole('button', { name: 'Corriger Internet' }).click()
  await a.getByLabel('Montant de Internet').fill('40')
  await a.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await ouvreLaLigne(page, 'Électricité')          // le panneau de A se referme
  await expect(a.getByLabel('Montant de Internet')).toHaveCount(0)

  libere()
  await expect(a.getByRole('alert')).toContainText('Refus lent de test', { timeout: 15_000 })
  await expect(ligne(page, 'Électricité').getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(1)
  /* La ligne B est restée ouverte. */
  await expect(ligne(page, 'Électricité').getByRole('button', { name: 'Corriger Électricité' })).toBeVisible()
})

test('le grand total est celui du mois type : Thauba, présente, ne compte pas ce que Kamil paie seul avant d’arriver', async ({ page }) => {
  foyer = await amorce()
  const { prochain } = mois()
  /* Kamil n'arrive que le mois prochain ; Thauba est là depuis janvier. */
  await db.from('user_profile').update({ entre_le: prochain }).eq('id', foyer.userId)
  await connecte(page, foyer.elleEmail)
  await page.goto('/charges')

  /* 3 917 € : tout ce que Thauba partage ou paie seule (Internet 37, Électricité 50, Courses 800, Restaurant 260,
     Pharmacie 20, copropriété 100, crédit 1 580, impôt 1 070) ; sans le forfait de Kamil (19,90) ni son entretien auto. */
  const phrase = page.getByText(/par mois pour le foyer, une fois tout ramené au mois/)
  await expect(phrase).toBeVisible({ timeout: 15_000 })
  await expect(phrase).toHaveText(/^3\s917,00 €/)
  /* La ligne de Kamil seul est grisée, et dit pourquoi. */
  await expect(ligne(page, 'Forfait mobile')).toContainText('pas encore dans le foyer')
  await expect(ligne(page, 'Entretien auto')).toContainText('pas encore dans le foyer')
  await expect(ligne(page, 'Internet')).not.toContainText('pas encore dans le foyer')
  await expect(page.getByRole('region', { name: 'Catégorie Abonnements' }).getByRole('button', { name: /Abonnements.*0 €/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Catégorie Auto' }).getByRole('button', { name: /Auto.*0 €/ })).toBeVisible()

  /* Et c'est le total du mois type : le tableau de toutes les charges, pour le même mois. */
  await page.goto('/toutes-les-charges')
  const total = page.getByRole('row').filter({ hasText: 'Total par mois' })
  await expect(total).toBeVisible({ timeout: 15_000 })
  await expect(total.getByRole('cell').last()).toHaveText(/^3\s917 €$/)
})

test('le focus suit les gestes : le nom à l’ouverture de « Corriger », la première pastille, la ligne d’après « Retirer »', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/charges')
  page.on('dialog', d => { void d.accept() })

  const internet = await ouvreLaLigne(page, 'Internet')
  await internet.getByRole('button', { name: 'Corriger Internet' }).click()
  await expect(internet.getByLabel('Son nom')).toBeFocused()
  await internet.getByRole('button', { name: 'Annuler' }).click()
  await expect(internet.getByRole('button', { name: 'Corriger Internet' })).toBeFocused()

  await internet.getByRole('button', { name: 'Changer qui participe' }).click()
  await expect(internet.getByRole('checkbox', { name: 'Kamil' })).toBeFocused()
  await internet.getByRole('button', { name: 'Fermer' }).click()
  await expect(internet.getByRole('button', { name: 'Changer qui participe' })).toBeFocused()

  /* « Rattacher » : le bouton disparaît, le focus revient à la ligne. */
  const copro = await ouvreLaLigne(page, 'Charges de copropriété du bâtiment B')
  await copro.getByRole('button', { name: 'Rattacher' }).click()
  await expect(copro.getByRole('button', { name: 'Rattacher' })).toHaveCount(0, { timeout: 15_000 })
  await expect(copro.locator('[data-ligne]')).toBeFocused()

  /* « Retirer » : la ligne s'en va, le focus passe à la suivante (Électricité est avant Internet, par mois). */
  const elec = await ouvreLaLigne(page, 'Électricité')
  await elec.getByRole('button', { name: 'Retirer Électricité' }).click()
  await expect(ligne(page, 'Électricité')).toHaveCount(0, { timeout: 15_000 })
  await expect(ligne(page, 'Internet').locator('[data-ligne]')).toBeFocused()
  /* La dernière de sa catégorie : le focus va à l'en-tête de la catégorie. */
  const forfait = await ouvreLaLigne(page, 'Forfait mobile')
  await forfait.getByRole('button', { name: 'Retirer Forfait mobile' }).click()
  await expect(ligne(page, 'Forfait mobile')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole('group', { name: 'Filtrer' }).getByRole('button').first()).toBeFocused()
})

test('une correction qui range la ligne dans une catégorie repliée la rouvre, et le dit sur la ligne', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/charges')
  const sante = page.getByRole('region', { name: 'Catégorie Santé' })
  const entete = sante.locator('button[aria-expanded]').first()
  await expect(entete).toBeVisible({ timeout: 15_000 })
  await entete.click()
  await expect(entete).toHaveAttribute('aria-expanded', 'false')

  const internet = await ouvreLaLigne(page, 'Internet')
  await internet.getByRole('button', { name: 'Corriger Internet' }).click()
  await internet.getByRole('radiogroup', { name: 'Catégorie de Internet' }).getByRole('radio', { name: 'Santé' }).click()
  await internet.getByRole('button', { name: 'Enregistrer', exact: true }).click()

  await expect(entete, 'la catégorie d’arrivée est restée repliée').toHaveAttribute('aria-expanded', 'true', { timeout: 15_000 })
  await expect(sante.locator('[data-charge]').filter({ hasText: 'Internet' }).getByRole('status'))
    .toContainText('« Internet » rangée dans Santé.')
})

test('des charges illisibles ne montrent aucun chiffre : l’erreur, et pas « 0,00 € »', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.route('**/rest/v1/charge?*', route => route.request().method() === 'GET'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Lecture refusée de test' }) })
    : route.continue())
  await page.goto('/charges')
  await expect(page.getByRole('alert').first()).toContainText('Lecture refusée de test', { timeout: 30_000 })
  await expect(page.getByText(/par mois pour le foyer/)).toHaveCount(0)
  await expect(page.getByText(/0,00 €/)).toHaveCount(0)
  await expect(page.getByText('Un instant…')).toHaveCount(0)
})

test('la dictée garde un « ? » : le flottant est masqué sur les charges', async ({ page }) => {
  foyer = await amorce()
  await connecte(page, foyer.email)
  await page.goto('/charges')
  await page.getByRole('button', { name: /dicter mes charges/i }).click()
  await expect(page.getByRole('button', { name: 'Poser une question à l’aide' })).toHaveCount(1, { timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Poser une question à l’aide' })).toBeVisible()
})

test('corriger ne fait pas démarrer une charge avant l’arrivée : le départ est refusé, avec sa phrase', async ({ page }) => {
  foyer = await amorce()
  const { prochain, nom, annee, courant } = mois()
  await db.from('user_profile').update({ entre_le: prochain }).eq('id', foyer.userId)
  await db.from('charge').update({ debut: prochain }).eq('household_id', foyer.householdId)
  await connecte(page, foyer.email)
  await page.goto('/charges')

  const entretien = await ouvreLaLigne(page, 'Entretien auto')
  await entretien.getByRole('button', { name: 'Corriger Entretien auto' }).click()
  const depuis = entretien.getByLabel('Depuis quand court Entretien auto')
  await expect(depuis).toHaveValue(prochain.slice(0, 7))
  await depuis.fill(courant)
  await expect(entretien.getByRole('alert')).toContainText(`Pas avant ton arrivée, en ${nom} ${annee}.`)
  await expect(entretien.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled()
  /* À l'arrivée, ou après : accepté. */
  await depuis.fill(prochain.slice(0, 7))
  await expect(entretien.getByRole('alert')).toHaveCount(0)
  await expect(entretien.getByRole('button', { name: 'Enregistrer', exact: true })).toBeEnabled()
})

test('« Toutes nos charges » : une ligne qui ne compte pas a aussi ses montants grisés', async ({ page }) => {
  foyer = await amorce()
  const { data: c } = await db.from('charge').insert({
    household_id: foyer.householdId, libelle: 'Piscine du jardin', montant_cents: 10_000, periodicite: 'mensuel',
    mode: 'fixe', categorie: 'autre', debut: '2031-01-01', commun: true }).select().single()
  await db.from('charge_participant').insert([foyer.userId, foyer.elleId].map(p => ({
    charge_id: c!.id, user_profile_id: p, household_id: foyer.householdId })))
  await connecte(page, foyer.email)
  await page.goto('/toutes-les-charges')
  const piscine = page.getByRole('row').filter({ hasText: 'Piscine du jardin' })
  await expect(piscine).toContainText('commence plus tard', { timeout: 15_000 })
  const normale = page.getByRole('row').filter({ hasText: 'Internet' }).first()
  const couleur = (l: typeof piscine) => l.getByRole('cell').evaluateAll(cs => cs.map(c => getComputedStyle(c).color))
  const doux = 'rgb(93, 110, 98)'
  expect(await couleur(piscine)).toEqual([doux, doux, doux])
  /* Une ligne qui compte garde l'encre pour ce que chacun paie. */
  expect((await couleur(normale))[0]).not.toBe(doux)
})
