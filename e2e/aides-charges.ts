/**
 * Les gestes de l'écran des Charges refait, pour les bancs : une ligne s'ouvre quand on la touche (ses gestes
 * n'existent pas dans la page avant), et le catalogue range ses pastilles par rubrique, la première ouverte.
 */
import type { Locator, Page } from '@playwright/test'

/** La ligne d'une charge, par son nom EXACT. */
export const ligneDeCharge = (page: Page, libelle: string): Locator =>
  page.locator('[data-charge]').filter({ has: page.getByText(libelle, { exact: true }) })

/** Touche la ligne si elle est fermée : ses gestes (Corriger, Retirer…) apparaissent. Rend la ligne. */
export async function ouvreLaLigne(page: Page, libelle: string): Promise<Locator> {
  const l = ligneDeCharge(page, libelle)
  const touche = l.locator('[data-ligne]')
  if ((await touche.getAttribute('aria-expanded')) !== 'true') await touche.click()
  return l
}

/** Ouvre une rubrique du catalogue (« Logement », « Vie courante »…) si elle est repliée. */
export async function ouvreLeCatalogue(page: Page, rubrique: string): Promise<void> {
  const tete = page.getByRole('button', { name: new RegExp(`^${rubrique}\\s*\\d+$`) })
  if ((await tete.getAttribute('aria-expanded')) === 'false') await tete.click()
}
