/**
 * Les corrections de la revue finale des écrans, jouées au clic sur le build servi.
 *
 *  · M1  le plan : l'équipement s'ouvre sous la carte du goulot ; au premier plan il passe AVANT la frise ;
 *  · M2  la liste de courses à 320 px : « Supprimer » reste entier sur une ligne ouverte ;
 *  · M3  le plan à 320 px : les trois chiffres ne se coupent pas ;
 *  · M4  la liste de courses à 320 px : le total ne chevauche pas « N sur M dans le panier » ;
 *  · M5  Choisir : deux appuis rapides sur « + » donnent deux parts de plus, un échec rend le chiffre à la base ;
 *  · L4  Choisir à 320 px : « 8 / 10 parts » tient sur une ligne ;
 *  · L6  « Rentrer sans les N articles » demande une seconde confirmation ;
 *  · L9  `/frigo?sortir=…` ouvert déconnecté : la requête survit à la connexion.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'

async function connecte(page: Page, foyer: Foyer, ouvre = '/') {
  await page.goto(ouvre)
  await page.getByLabel(/e-?mail/i).fill(foyer.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
}
async function connecteEtAttend(page: Page, foyer: Foyer) {
  await connecte(page, foyer)
  await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
}

const haut = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!.y

test.describe('le plan : où s’ouvre l’équipement', () => {
  let foyer: Foyer
  test.beforeAll(async () => { foyer = await amorce({ budget: false, cycleEtat: 'pret' }) })
  test.afterAll(async () => { if (foyer) await efface(foyer) })
  test.use({ actionTimeout: 15_000 })

  test('premier plan, aucun appareil : la carte passe au-dessus de la frise', async ({ page }) => {
    await connecteEtAttend(page, foyer)
    await page.goto('/plan')
    const carte = page.getByText('Ce dont tu disposes aujourd’hui')
    await expect(carte).toBeVisible({ timeout: 20_000 })
    const frise = page.getByRole('heading', { name: 'Dans l’ordre' })
    await expect(frise).toBeVisible()
    expect(await haut(carte), 'la carte est avant la frise').toBeLessThan(await haut(frise))
    // Pas de ligne de résumé « N appareils » : rien n'est enregistré.
    await expect(page.getByRole('heading', { name: 'Ce dont tu disposes', exact: true })).toHaveCount(0)
  })

  test('« Modifier l’équipement » ouvre la carte juste sous celle du goulot, à l’écran', async ({ page }) => {
    // Un seul feu pour deux plats qui mijotent : l'appareil retarde tout, et le gain est chiffré.
    await db.from('session_appliance').insert({
      cycle_id: foyer.cycleId, household_id: foyer.householdId, appliance_code: 'plaques', capacity: 1,
    })
    await connecteEtAttend(page, foyer)
    await page.goto('/plan')
    const modifier = page.getByRole('button', { name: 'Modifier l’équipement' })
    await expect(modifier).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Ce dont tu disposes aujourd’hui')).toHaveCount(0)
    await modifier.click()
    const carte = page.getByText('Ce dont tu disposes aujourd’hui')
    await expect(carte).toBeVisible()
    await expect(carte).toBeInViewport({ ratio: 1 })
    const goulot = page.getByText('est le goulot')
    const menu = page.getByRole('heading', { name: 'Au menu' })
    expect(await haut(carte)).toBeGreaterThan(await haut(goulot))
    expect(await haut(carte), 'sous la carte du goulot, avant « Au menu »').toBeLessThan(await haut(menu))
    // « Recalculer » la referme.
    await page.getByRole('button', { name: 'Recalculer le plan' }).click()
    await expect(carte).toBeHidden()
  })
})

test.describe('à 320 px', () => {
  test.use({ viewport: { width: 320, height: 640 }, actionTimeout: 15_000 })

  test.describe('le plan', () => {
    let foyer: Foyer
    test.beforeAll(async () => {
      foyer = await amorce({ budget: false, cycleEtat: 'pret' })
      // Un repos de plus d'une heure : « 1 h 13 » est le chiffre le plus large que les tuiles verront.
      const { data } = await db.from('cycle_recipe').select('recipe_id').eq('cycle_id', foyer.cycleId)
      await db.from('recipe_step').update({ duration_min: 65 })
        .in('recipe_id', data!.map(c => c.recipe_id)).eq('ordinal', 2)
    })
    test.afterAll(async () => { if (foyer) await efface(foyer) })

    test('les trois chiffres tiennent chacun sur une ligne', async ({ page }) => {
      await connecteEtAttend(page, foyer)
      await page.goto('/plan')
      const tuiles = page.getByRole('region', { name: 'La durée de la session' }).locator('.grid > div > p.chiffre')
      await expect(tuiles).toHaveCount(3, { timeout: 20_000 })
      const mesures = await tuiles.evaluateAll(ps => ps.map(p => {
        const r = p.getBoundingClientRect()
        const t = p.parentElement!.getBoundingClientRect()
        return { texte: p.textContent, h: r.height, taille: parseFloat(getComputedStyle(p).fontSize),
                 deborde: p.scrollWidth > p.clientWidth + 1 || r.right > t.right + 1 }
      }))
      for (const m of mesures) {
        expect(m.h, `« ${m.texte} » sur une ligne`).toBeLessThanOrEqual(m.taille * 1.25)
        expect(m.deborde, `« ${m.texte} » ne sort pas de sa tuile`).toBe(false)
      }
      await page.screenshot({ path: `${process.env.CAPTURES_CORRECTIONS ?? '.shots/corrections'}/plan-tuiles-320.png` })
    })
  })

  test.describe('la liste de courses', () => {
    let foyer: Foyer
    test.beforeAll(async () => { foyer = await amorce({ budget: false, cycleEtat: 'courses' }) })
    test.afterAll(async () => { if (foyer) await efface(foyer) })

    test('le total ne chevauche pas le panier ; « Supprimer » reste entier ; « Rentrer » se confirme', async ({ page }) => {
      await connecteEtAttend(page, foyer)
      await page.goto('/magasin')
      await expect(page.getByRole('heading', { name: 'La liste' })).toBeVisible({ timeout: 20_000 })

      // M4 : les deux blocs du total ne se recouvrent pas.
      const total = page.getByRole('region', { name: 'Le total estimé' })
      const grand = total.locator('p.chiffre').first()
      const panier = total.getByText('dans le panier')
      const g = (await grand.boundingBox())!
      const p = (await panier.boundingBox())!
      const seRecouvrent = g.x < p.x + p.width && p.x < g.x + g.width && g.y < p.y + p.height && p.y < g.y + g.height
      expect(seRecouvrent, 'le total et « dans le panier » se chevauchent').toBe(false)
      await total.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${process.env.CAPTURES_CORRECTIONS ?? '.shots/corrections'}/courses-total-320.png` })

      // M2 : une ligne ouverte, le bouton « Supprimer » entier.
      await page.getByRole('button', { name: /^poulet/ }).click()
      const supprimer = page.getByRole('button', { name: 'Supprimer' })
      await expect(supprimer).toBeVisible()
      const s = (await supprimer.boundingBox())!
      expect(s.x, 'à gauche de l’écran').toBeGreaterThanOrEqual(0)
      expect(s.x + s.width, 'à droite de l’écran').toBeLessThanOrEqual(320)
      expect(s.height).toBeGreaterThanOrEqual(44)
      expect(await supprimer.evaluate(b => b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().height < 80)).toBe(true)
      await supprimer.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${process.env.CAPTURES_CORRECTIONS ?? '.shots/corrections'}/courses-ligne-ouverte-320.png` })

      // L6 : le premier appui arme, le second rentre.
      const rentrer = page.getByRole('button', { name: 'Rentrer sans les 3 articles' })
      await rentrer.click()
      const arme = page.getByRole('button', { name: 'Oui, rentrer sans les 3' })
      await expect(arme).toBeVisible()
      await expect(page.getByRole('status').filter({ hasText: 'Appuie encore pour rentrer sans les 3 articles' })).toHaveCount(1)
      await expect(page).toHaveURL(/\/magasin$/)
      // Laissé seul, il se désarme.
      await expect(rentrer).toBeVisible({ timeout: 9_000 })
      await rentrer.click()
      await expect(arme).toBeVisible()
      await arme.click()
      await expect(page).toHaveURL(/\/plan$/, { timeout: 20_000 })
    })
  })

  test.describe('Choisir', () => {
    let foyer: Foyer
    test.beforeAll(async () => {
      foyer = await amorce({ budget: false, cycleEtat: 'selection' })
      await db.from('cycle').update({ servings_target: 10 }).eq('id', foyer.cycleId)
    })
    test.afterAll(async () => { if (foyer) await efface(foyer) })

    const plus = (page: Page) => page.getByRole('button', { name: 'Une part de plus, Dahl de lentilles corail' })
    const champ = (page: Page) => page.getByLabel('Parts de Dahl de lentilles corail')
    const enBase = async () => {
      const { data } = await db.from('cycle_recipe').select('servings, recipe:recipe_id(title)').eq('cycle_id', foyer.cycleId)
      return data!.find(c => (c.recipe as unknown as { title: string }).title.startsWith('Dahl'))!.servings
    }

    test('« 8 / 10 parts » tient sur une ligne, sans toucher « Faire la liste »', async ({ page }) => {
      await connecteEtAttend(page, foyer)
      await page.goto('/choisir')
      await expect(champ(page)).toBeVisible({ timeout: 20_000 })
      const valeur = page.getByText(/^8\s\/\s10$/)
      await expect(valeur).toBeVisible()
      const v = (await valeur.boundingBox())!
      expect(v.height, 'une seule ligne').toBeLessThanOrEqual(30 * 1.8)
      const bouton = (await page.getByRole('button', { name: 'Faire la liste' }).boundingBox())!
      expect(v.x + v.width, 'avant le bouton').toBeLessThanOrEqual(bouton.x + 1)
      await page.getByRole('region', { name: 'Ce qu’on cuisine' }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${process.env.CAPTURES_CORRECTIONS ?? '.shots/corrections'}/choisir-retenues-320.png` })
    })

    test('deux appuis rapides sur « + » à 4 parts donnent 6, en base aussi', async ({ page }) => {
      await connecteEtAttend(page, foyer)
      await page.goto('/choisir')
      await expect(champ(page)).toHaveValue('4', { timeout: 20_000 })
      await plus(page).dblclick()
      await expect(champ(page)).toHaveValue('6')
      await expect.poll(enBase, { timeout: 10_000 }).toBe(6)
      // Et le chiffre ne repart pas en arrière quand la base répond.
      await page.waitForTimeout(800)
      await expect(champ(page)).toHaveValue('6')
    })

    test('une écriture refusée : le chiffre revient à la base, et l’erreur se lit', async ({ page }) => {
      await connecteEtAttend(page, foyer)
      await page.goto('/choisir')
      await expect(champ(page)).toHaveValue('6', { timeout: 20_000 })
      await page.route('**/rest/v1/cycle_recipe*', route =>
        (route.request().method() === 'POST' ? route.fulfill({ status: 500, body: '{"message":"boum"}',
          contentType: 'application/json' }) : route.continue()))
      await plus(page).click()
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 })
      await expect(champ(page)).toHaveValue('6')
      expect(await enBase()).toBe(6)
    })
  })
})

test.describe('un lien de mail ouvert déconnecté', () => {
  let foyer: Foyer
  let ids: string[]
  test.beforeAll(async () => {
    foyer = await amorce({ budget: false })
    ids = []
    for (let i = 0; i < 2; i++) {
      const r = await db.from('portion').insert({
        household_id: foyer.householdId, label: 'Wrap', grams: 400, kcal: 600, protein_g: 40, fiber_g: 5,
        carb_g: 60, fat_g: 20, location: 'congelateur', state: 'au_frais', frozen_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60 * 24 * 3_600_000).toISOString(),
      }).select().single()
      if (r.error) throw new Error(r.error.message)
      ids.push(r.data.id)
    }
  })
  test.afterAll(async () => { if (foyer) await efface(foyer) })
  test.use({ actionTimeout: 15_000 })

  test('la connexion ramène sur /frigo?sortir=… : la confirmation s’ouvre', async ({ page }) => {
    await connecte(page, foyer, `/frigo?sortir=${ids.join(',')}`)
    await expect(page.getByRole('dialog', { name: 'Sortir 2 wraps du congélateur ?' })).toBeVisible({ timeout: 20_000 })
  })

  test('un lien de connexion par mail renvoie sur le chemin seul : la requête gardée est rejouée', async ({ page }) => {
    // Ouvert déconnecté…
    await page.goto(`/frigo?sortir=${ids.join(',')}`)
    await expect(page.getByLabel(/e-?mail/i)).toBeVisible({ timeout: 20_000 })
    // …le mail renvoie sur `/frigo`, sans requête (c'est ce que `redirectTo` portait avant la correction).
    await page.goto('/frigo')
    await connecte(page, foyer, '/frigo')
    await expect(page.getByRole('dialog', { name: 'Sortir 2 wraps du congélateur ?' })).toBeVisible({ timeout: 20_000 })
  })

  test('une requête d’un autre site, ou un chemin externe, n’est jamais rejoué', async ({ page }) => {
    await page.goto(`/frigo?sortir=${ids.join(',')}`)
    await expect(page.getByLabel(/e-?mail/i)).toBeVisible({ timeout: 20_000 })
    // Le stockage est empoisonné : il ne doit rien rouvrir, ni quitter l'application.
    await page.evaluate(() => localStorage.setItem('popote:retour',
      JSON.stringify({ vers: '//example.com/frigo?sortir=a', a: Date.now() })))
    await page.goto('/')
    await connecte(page, foyer, '/')
    await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 20_000 })
    expect(new URL(page.url()).hostname).toBe('127.0.0.1')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
