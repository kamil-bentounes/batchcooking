/**
 * Non-régression des corrections du grand test « cuisine » (0117 et écrans) : ce qu'on voit et ce
 * qu'on touche, joué par des clics sur le build servi.
 *
 *  · l'équipement du jour part de la dernière session du foyer ;
 *  · la liste de courses porte des noms courts, regroupés, aux bons rayons ;
 *  · une session interrompue se retrouve, et sa semaine dit de la reprendre ;
 *  · un revenu de 0,50 € par mois se confirme avant d'être écrit (réglages du budget, profil).
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'

async function connecte(page: Page, foyer: Foyer) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(foyer.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

/** Le lundi (AAAA-MM-JJ) de la semaine qui contient `d`, à Paris. */
function lundiDeParis(d: Date): string {
  const [a, m, j] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d)
    .split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, j))
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7))
  return t.toISOString().slice(0, 10)
}
const dansSeptJours = () => new Date(Date.now() + 7 * 24 * 3600 * 1000)

/** Du plus récent au plus ancien : le premier revenu d'une personne remonte aussi à son mois d'arrivée (0103). */
const revenuEnBase = async (foyer: Foyer) => (await db.from('revenu')
  .select('net_mensuel_cents').eq('user_profile_id', foyer.userId)
  .order('valid_from', { ascending: false })).data ?? []
const dernierRevenu = async (foyer: Foyer) => (await revenuEnBase(foyer))[0]?.net_mensuel_cents

test.describe('équipement du jour', () => {
  let foyer: Foyer
  test.beforeAll(async () => {
    foyer = await amorce({ budget: false, cycleEtat: 'pret' })
    // Une session close d'il y a deux semaines : un four qui prend deux plats, et des plaques.
    const vieux = (await db.from('cycle').insert({
      household_id: foyer.householdId, week_of: '2026-01-05', state: 'cloture',
    }).select().single()).data!
    await db.from('session_appliance').insert([
      { cycle_id: vieux.id, household_id: foyer.householdId, appliance_code: 'four', capacity: 2 },
      { cycle_id: vieux.id, household_id: foyer.householdId, appliance_code: 'plaques', capacity: 3 },
    ])
  })
  test.afterAll(async () => { if (foyer) await efface(foyer) })
  test.use({ actionTimeout: 15_000 })

  test('arrive avec les appareils de la dernière session, pas les huit du catalogue', async ({ page }) => {
    await connecte(page, foyer)
    await page.goto('/plan')
    const carte = page.getByText('Ce dont tu disposes aujourd’hui')
    await expect(carte).toBeVisible({ timeout: 20_000 })
    const cases = page.getByRole('checkbox')
    await expect(cases).toHaveCount(8)
    await expect(page.locator('[role=checkbox][aria-checked=true]'),
      'les huit appareils arrivent cochés').toHaveCount(2)
    await expect(page.getByLabel('Capacité de Four')).toHaveValue('2')
    await expect(page.getByLabel('Capacité de Plaques')).toHaveValue('3')
  })
})

test.describe('la liste de courses', () => {
  let foyer: Foyer
  test.beforeAll(async () => {
    foyer = await amorce({ budget: false, cycleEtat: 'selection' })
    const aliment = async (nom: string) => (await db.from('food').select('id').eq('name', nom).single()).data!.id as string
    const r = (await db.from('recipe').insert({
      title: 'Plateau de noms CIQUAL', yield_servings: 4, plannable: true,
    }).select().single()).data!
    await db.from('recipe_ingredient').insert([
      { recipe_id: r.id, ordinal: 1, raw_text: '200 g de tomates', food_id: await aliment('Tomate, crue'), qty: 200, unit: 'g', grams_reference: 200 },
      { recipe_id: r.id, ordinal: 2, raw_text: '100 g de carottes', food_id: await aliment('Carotte, crue'), qty: 100, unit: 'g', grams_reference: 100 },
      { recipe_id: r.id, ordinal: 5, raw_text: '300 g de carottes surgelées', food_id: await aliment('Carotte, surgelée, crue'), qty: 300, unit: 'g', grams_reference: 300 },
      { recipe_id: r.id, ordinal: 3, raw_text: '300 g de lentilles', food_id: await aliment('Lentille corail, sèche'), qty: 300, unit: 'g', grams_reference: 300 },
      { recipe_id: r.id, ordinal: 4, raw_text: '4 œufs', food_id: await aliment('Oeuf, cru'), qty: 4, unit: 'u', grams_reference: 240 },
    ])
    await db.from('cycle_recipe').insert({ cycle_id: foyer.cycleId, recipe_id: r.id, servings: 4 })
  })
  test.afterAll(async () => { if (foyer) await efface(foyer) })
  test.use({ actionTimeout: 15_000 })

  test('noms courts, frais et surgelé distincts, lentilles à l’épicerie, œufs au frais', async ({ page }) => {
    await connecte(page, foyer)
    await page.goto('/choisir')
    await expect(page.getByRole('article').first()).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Faire la liste' }).click()
    await expect(page.getByRole('heading', { name: 'La liste' })).toBeVisible({ timeout: 20_000 })

    const ligne = (nom: RegExp) => page.getByRole('checkbox', { name: nom })
    await expect(ligne(/^Tomate\b/)).toHaveCount(1)
    await expect(page.locator('li', { has: ligne(/^Tomate\b/) })).toContainText('200 g')
    await expect(page.getByText('Tomate, crue')).toHaveCount(0)
    // Deux carottes au même nom court ne se fusionnent pas (frais, surgelé) : leur nom entier les distingue.
    await expect(ligne(/^Carotte, crue/)).toHaveCount(1)
    await expect(ligne(/^Carotte, surgelée, crue/)).toHaveCount(1)
    await expect(ligne(/^Lentille corail/)).toHaveCount(1)
    await expect(page.getByText('Lentille corail, sèche')).toHaveCount(0)

    const rayonDe = async (nom: RegExp) => page.locator('section[aria-label^="Courses chez"] > div', { has: ligne(nom) })
      .locator('h3').first().innerText()
    expect((await rayonDe(/^Carotte, crue/)).toLowerCase()).toBe('fruits et légumes')
    expect((await rayonDe(/^Carotte, surgelée, crue/)).toLowerCase()).toBe('surgelés')
    expect((await rayonDe(/^Lentille corail/)).toLowerCase()).toBe('épicerie salée')
    expect((await rayonDe(/^Oeuf/)).toLowerCase()).toBe('frais')
  })
})

test.describe('la session interrompue', () => {
  let foyer: Foyer
  test.beforeAll(async () => { foyer = await amorce({ budget: false, cycleEtat: 'interrompue' }) })
  test.afterAll(async () => { if (foyer) await efface(foyer) })
  test.use({ actionTimeout: 15_000 })

  test('la base la propose ; sa semaine, rouverte, dit de la reprendre', async ({ page }) => {
    // La semaine PROCHAINE est celle qu'ouvre « Choisir les recettes » : on y met la session.
    await db.from('cycle').update({ week_of: lundiDeParis(dansSeptJours()) }).eq('id', foyer.cycleId)
    await connecte(page, foyer)
    await page.goto('/cuisine-accueil')
    await expect(page.getByRole('button', { name: 'Reprendre la session interrompue' }))
      .toBeVisible({ timeout: 10_000 })
    /* Depuis le 25/10, la reprise est le geste principal ; repartir de zéro est le second. */
    await page.getByRole('button', { name: 'Choisir de nouvelles recettes' }).click()
    await expect(page.getByRole('alert')).toContainText('Cette semaine a une session interrompue : reprends-la.')
    expect((await db.from('cycle').select('id').eq('household_id', foyer.householdId)).data).toHaveLength(1)
  })

  test('une session d’il y a un mois n’est plus proposée', async ({ page }) => {
    await db.from('cycle').update({ week_of: lundiDeParis(new Date(Date.now() - 35 * 24 * 3600 * 1000)) })
      .eq('id', foyer.cycleId)
    await connecte(page, foyer)
    await page.goto('/cuisine-accueil')
    await expect(page.getByText('Rien de prévu')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Reprendre la session interrompue' })).toHaveCount(0)
  })
})

test.describe('un revenu de 0,50 € se confirme', () => {
  let foyer: Foyer
  test.beforeAll(async () => { foyer = await amorce({ budget: false, cycleEtat: 'selection' }) })
  test.afterAll(async () => { if (foyer) await efface(foyer) })
  test.use({ actionTimeout: 15_000 })

  const question = (page: Page) =>
    page.getByRole('alertdialog', { name: 'Tu déclares 0,50 € par mois. C’est bien ça ?' })

  test('réglages du budget : Échap et « Non » n’écrivent rien, « Oui » écrit, 2 400 passe sans question', async ({ page }) => {
    await connecte(page, foyer)
    await page.goto('/budget-reglages')
    const champ = page.getByLabel('Mon net mensuel (€)')
    const bouton = page.getByRole('button', { name: 'Enregistrer mon revenu' })
    await expect(bouton).toBeDisabled()
    await champ.fill('0,50')
    await bouton.click()

    // La question est posée, le focus est dessus, ses cibles se touchent.
    await expect(question(page)).toBeVisible()
    const non = page.getByRole('button', { name: 'Non, je corrige' })
    const oui = page.getByRole('button', { name: 'Oui, c’est ça' })
    await expect(non).toBeFocused()
    for (const b of [non, oui]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    expect(await revenuEnBase(foyer), 'écrit avant la réponse').toHaveLength(0)

    // Échap répond « Non », et le focus revient au bouton qui avait posé la question.
    await page.keyboard.press('Escape')
    await expect(question(page)).toHaveCount(0)
    await expect(bouton).toBeFocused()
    expect(await revenuEnBase(foyer)).toHaveLength(0)

    // « Non, je corrige » : rien non plus.
    await bouton.click()
    await non.click()
    await expect(question(page)).toHaveCount(0)
    expect(await revenuEnBase(foyer)).toHaveLength(0)
    await expect(champ).toHaveValue('0,50')

    // « Oui, c'est ça » : c'est écrit.
    await bouton.click()
    await oui.click()
    await expect.poll(() => dernierRevenu(foyer)).toBe(50)

    // Une re-saisie à 2 400 s'enregistre sans question.
    await champ.fill('2 400')
    await page.getByRole('button', { name: 'Mettre à jour mon revenu' }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect.poll(() => dernierRevenu(foyer)).toBe(240_000)
  })

  test('profil : la même question, avant tout enregistrement', async ({ page }) => {
    await db.from('revenu').delete().eq('user_profile_id', foyer.userId)
    await connecte(page, foyer)
    await page.goto('/profil')
    const champ = page.getByLabel('Ton revenu net mensuel (€)')
    await expect(page.getByLabel('Ton prénom')).toHaveValue('Kamil', { timeout: 15_000 })
    await champ.fill('0,5')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(question(page)).toBeVisible()
    await page.getByRole('button', { name: 'Non, je corrige' }).click()
    expect(await revenuEnBase(foyer), 'le « Non » a écrit').toHaveLength(0)

    await champ.fill('2 400')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect.poll(() => dernierRevenu(foyer)).toBe(240_000)
  })
})
