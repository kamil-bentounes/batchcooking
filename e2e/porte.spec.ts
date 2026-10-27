/**
 * La porte du frigo : l'écran d'entrée, regardé comme on le voit.
 *
 * Ce banc ne se connecte pas — c'est tout l'intérêt, comme `etats.spec.ts` : l'écran d'avant la
 * connexion n'a pas de compte à amorcer. Il garde ce qui ne se voit pas sur une capture : les portes
 * s'ouvrent à l'envoi SANS retarder la requête, se referment à l'erreur, ne tournent pas sous
 * `prefers-reduced-motion`, et aucun écran ne défile en largeur (320 px, bureau).
 * Les CAPTURES vont dans `PORTE_CAPTURES` (défaut `.shots/porte`) : on les regarde.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const OU = process.env.PORTE_CAPTURES ?? '.shots/porte'
const prend = async (page: Page, nom: string) => {
  await page.waitForTimeout(1100) // les aimants se posent, les portes finissent de tourner
  await page.screenshot({ path: `${OU}/${nom}.png` })
}
const sansDefilement = (page: Page) => page.evaluate(
  () => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
const ouvert = (page: Page) => page.locator('main[data-ouvert]').getAttribute('data-ouvert')
/** Où est la porte gauche : sa matrice de transformation, ou `none` si elle n'a pas tourné. */
const poseDeLaPorte = (page: Page) => page.locator('.pf-porte-g')
  .evaluate(el => getComputedStyle(el).transform)

test.describe('la porte du frigo', () => {
  for (const [nom, largeur, hauteur] of [
    ['390', 390, 844], ['320', 320, 568], ['1440', 1440, 900], ['1920', 1920, 1080],
  ] as const) {
    test(`à ${largeur} px : tout est là, rien ne défile en largeur`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: hauteur })
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'Entrer', exact: true })).toBeVisible({ timeout: 20_000 })
      await expect(page.getByLabel('Ton e-mail')).toBeVisible()
      await expect(page.getByLabel('Mot de passe')).toBeVisible()
      await expect(page.getByText('Popote', { exact: true })).toBeVisible()
      await expect(page.getByText('On cuisine le dimanche, on mange toute la semaine, et on sait ce que ça coûte.'))
        .toBeVisible()
      expect(await sansDefilement(page), 'l’écran défile en largeur').toBe(true)
      // Les cibles de 44 px : « Afficher », « Entrer », les deux chemins.
      for (const nomDuBouton of ['Afficher', 'Entrer', 'Première connexion', 'Mot de passe oublié']) {
        const b = await page.getByRole('button', { name: nomDuBouton, exact: true }).boundingBox()
        expect(b!.height, `${nomDuBouton} : cible trop basse`).toBeGreaterThanOrEqual(43.5)
        expect(b!.width, `${nomDuBouton} : cible trop étroite`).toBeGreaterThanOrEqual(43.5)
      }
      await prend(page, nom)
    })
  }

  test('les trois modes gardent les portes, et chacun dit ce qu’il fait', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Première connexion' }).click()
    await expect(page.getByRole('button', { name: 'Recevoir le lien' })).toBeVisible()
    await expect(page.locator('.pf-porte-g')).toBeAttached()
    await prend(page, 'mode-premiere-390')
    await page.getByRole('button', { name: 'Mot de passe oublié' }).click()
    await expect(page.getByRole('button', { name: 'Réinitialiser mon mot de passe' })).toBeVisible()
    await prend(page, 'mode-oubli-390')
    await page.getByRole('button', { name: 'J’ai déjà un mot de passe' }).click()
    await expect(page.getByRole('button', { name: 'Entrer', exact: true })).toBeVisible()
  })

  test('« Afficher » montre le mot de passe, « Cacher » le remasque', async ({ page }) => {
    await page.goto('/')
    const champ = page.getByLabel('Mot de passe')
    await champ.fill('un-secret')
    await expect(champ).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Afficher', exact: true }).click()
    await expect(champ).toHaveAttribute('type', 'text')
    await page.getByRole('button', { name: 'Cacher', exact: true }).click()
    await expect(champ).toHaveAttribute('type', 'password')
  })

  test('l’envoi ouvre les portes sans retarder la requête ; l’erreur les referme et le dit', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.getByLabel('Ton e-mail').fill('personne@nulle-part.test')
    await page.getByLabel('Mot de passe').fill('faux-mot-de-passe')
    expect(await ouvert(page)).toBe('false')

    // La réponse est tenue 1,5 s : on regarde l'écran PENDANT l'envoi.
    let partie = 0
    await page.route('**/auth/v1/token**', async r => {
      partie = Date.now()
      await new Promise(ok => setTimeout(ok, 1500))
      await r.continue()
    })
    const debut = Date.now()
    await page.getByRole('button', { name: 'Entrer', exact: true }).click()
    await expect.poll(() => partie, { message: 'la requête n’est pas partie', timeout: 3000 }).toBeGreaterThan(0)
    expect(partie - debut, 'les portes retardent la connexion').toBeLessThan(600)
    expect(await ouvert(page)).toBe('true')
    await expect(page.getByRole('button', { name: 'Un instant…' })).toBeDisabled()
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${OU}/ouvert-390.png` })

    await expect(page.getByText('E-mail ou mot de passe incorrect.')).toBeVisible({ timeout: 20_000 })
    expect(await ouvert(page), 'les portes restent ouvertes après l’erreur').toBe('false')
    await expect(page.getByRole('button', { name: 'Entrer', exact: true })).toBeEnabled()
    await prend(page, 'erreur-390')
  })

  test('prefers-reduced-motion : les portes ne tournent pas', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.getByLabel('Ton e-mail').fill('personne@nulle-part.test')
    await page.getByLabel('Mot de passe').fill('faux-mot-de-passe')
    await page.route('**/auth/v1/token**', async r => {
      await new Promise(ok => setTimeout(ok, 1200))
      await r.continue()
    })
    await page.getByRole('button', { name: 'Entrer', exact: true }).click()
    await expect.poll(() => ouvert(page)).toBe('true')
    await page.waitForTimeout(300)
    expect(await poseDeLaPorte(page), 'une rotation sous reduced-motion').toBe('none')
    await expect(page.getByText('E-mail ou mot de passe incorrect.')).toBeVisible({ timeout: 20_000 })
  })
})
