/**
 * 22/10 — deux demandes de Kamil, jouées au clic :
 *
 *   1. « Je ne vois pas Réglages » : l'invitation vivait dans les réglages de la cuisine, que
 *      le hub ne montre nulle part (l'avatar mène au profil). Seul dans le foyer, le hub porte
 *      maintenant la porte « Inviter quelqu'un », qui arrive sur la section, pas en haut de page.
 *   2. « Que le budget commence en novembre » : qui n'entre dans le foyer qu'au mois prochain n'a
 *      pas de budget avant. Le hub et l'écran du mois le disent (sans porte « Commencer »), et son
 *      revenu, posé aujourd'hui, prend effet à son arrivée — pas aujourd'hui.
 *
 * ⚠️ LOCAL, ET RIEN D'AUTRE.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
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

async function connecte(page: Page, email: string) {
  await page.goto('/')
  await page.getByLabel('Ton e-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

async function seul(f: Foyer) {
  await db.from('user_profile').delete().eq('id', f.elleId)
  await db.auth.admin.deleteUser(f.elleId)
}

/** Le 1er du mois prochain, en AAAA-MM-01, et son nom (« novembre »). */
function moisProchain() {
  const d = new Date()
  const p = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  const iso = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-01`
  return { iso, nom: p.toLocaleDateString('fr-FR', { month: 'long' }) }
}

test('seul dans le foyer, le hub offre « Inviter quelqu’un » et mène à la section', async ({ page }) => {
  foyer = await amorce({ budget: false })
  await seul(foyer)
  await connecte(page, foyer.email)

  const porte = page.getByRole('button', { name: /Inviter quelqu’un/ })
  await expect(porte, 'seul, rien sur le hub ne mène à l’invitation').toBeVisible()
  await page.screenshot({ path: '.shots/inviter/01-hub-seul.png', fullPage: true })

  await porte.click()
  await expect(page.getByRole('heading', { name: 'Inviter', exact: true })).toBeInViewport({ timeout: 5_000 })
  await expect(page.getByLabel('Son e-mail'), 'on arrive en haut de page, la section est plus bas').toBeInViewport()
  await page.screenshot({ path: '.shots/inviter/02-section-inviter.png' })
})

test('à deux, la porte « Inviter » n’est plus sur le hub', async ({ page }) => {
  foyer = await amorce({ budget: false })
  await connecte(page, foyer.email)
  await expect(page.getByRole('button', { name: /Budget/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Inviter quelqu’un/ })).toHaveCount(0)
})

test('une arrivée au mois prochain : « Commence en … », pas de porte, et le revenu prend effet à l’arrivée', async ({ page }) => {
  foyer = await amorce({ budget: false })
  await seul(foyer)
  const { iso, nom } = moisProchain()
  await db.from('user_profile').update({ entre_le: iso }).eq('id', foyer.userId)
  await connecte(page, foyer.email)

  /* Le hub. */
  await expect(page.getByText(`Commence en ${nom}`)).toBeVisible()
  await expect(page.getByText(/Il te reste|Ajoute ton revenu|Rien de posé/)).toHaveCount(0)
  await page.screenshot({ path: '.shots/inviter/03-hub-avant-arrivee.png', fullPage: true })

  /* L'écran du mois : une phrase, aucune porte qui daterait le mois courant. */
  await page.getByRole('button', { name: /^Budget/ }).click()
  await expect(page.getByText('Pas encore', { exact: true })).toBeVisible()
  await expect(page.getByText(`Tu entres dans le foyer en ${nom}`)).toBeVisible()
  await expect(page.getByRole('button', { name: /Commencer par les revenus/ })).toHaveCount(0)
  await page.screenshot({ path: '.shots/inviter/04-budget-avant-arrivee.png', fullPage: true })

  /* Il pose son revenu aujourd'hui, depuis les réglages du budget : il prend effet à son arrivée. */
  await page.goto('/budget-reglages')
  await page.getByLabel('Mon net mensuel (€)').fill('2400')
  await page.getByRole('button', { name: 'Enregistrer mon revenu' }).click()
  await expect(page.getByRole('button', { name: 'Mettre à jour mon revenu' }),
    'le revenu posé pour le mois prochain se lit « pas encore renseigné »').toBeVisible({ timeout: 10_000 })
  const { data } = await db.from('revenu').select('valid_from, net_mensuel_cents').eq('user_profile_id', foyer.userId)
  expect(data, 'le revenu doit prendre effet à l’arrivée, pas aujourd’hui').toEqual([
    { valid_from: iso, net_mensuel_cents: 240_000 }])
  await page.screenshot({ path: '.shots/inviter/05-revenu-pose.png', fullPage: true })

  /* Une charge posée aujourd'hui court depuis son arrivée : le mois courant reste vide. */
  await page.goto('/charges')
  await page.getByRole('button', { name: 'Autre chose' }).click()
  await page.getByLabel('Quoi').fill('Loyer')
  await page.getByLabel('Combien (€)').fill('700')
  await expect(page.locator('#debut-charge'), 'la charge propose de courir depuis aujourd’hui')
    .toHaveValue(iso.slice(0, 7))
  await page.getByRole('button', { name: /Ajouter cette charge/ }).click()
  await expect(page.getByText('Loyer').first()).toBeVisible({ timeout: 10_000 })
  const { data: charges } = await db.from('charge').select('debut').eq('household_id', foyer.householdId)
  expect(charges).toEqual([{ debut: iso }])
  const { data: lignes } = await db.from('depense').select('mois').eq('household_id', foyer.householdId)
  expect(lignes?.filter(l => l.mois < iso), 'le mois courant a reçu des lignes').toEqual([])
  await page.screenshot({ path: '.shots/inviter/06-charge-posee.png', fullPage: true })

  /* Et le hub dit toujours la même chose : aucun reste plein, aucun « à clôturer ». */
  await page.goto('/')
  await expect(page.getByText(`Commence en ${nom}`)).toBeVisible()
  await expect(page.getByText(/Il te reste|à clôturer/)).toHaveCount(0)
})

/* Relecture adverse du 23/10 : la date tapée à la main (ou celle de la dictée) ne devait pas ouvrir un mois
   avant l'arrivée — le loyer d'octobre naissait avec 100 % des parts sur la seconde, arrivée avant novembre. */
test('une charge dont le début précède l’arrivée court depuis l’arrivée', async ({ page }) => {
  foyer = await amorce({ budget: false })
  await seul(foyer)
  const { iso } = moisProchain()
  await db.from('user_profile').update({ entre_le: iso }).eq('id', foyer.userId)
  await connecte(page, foyer.email)

  await page.goto('/charges')
  await page.getByRole('button', { name: 'Autre chose' }).click()
  await page.getByLabel('Quoi').fill('Assurance')
  await page.getByLabel('Combien (€)').fill('30')
  await page.locator('#debut-charge').fill(new Date().toISOString().slice(0, 7))
  await page.getByRole('button', { name: /Ajouter cette charge/ }).click()
  await expect(page.getByText('Assurance').first()).toBeVisible({ timeout: 10_000 })
  const { data: charges } = await db.from('charge').select('debut').eq('household_id', foyer.householdId)
  expect(charges, 'la charge ne doit pas courir avant l’arrivée').toEqual([{ debut: iso }])
})
