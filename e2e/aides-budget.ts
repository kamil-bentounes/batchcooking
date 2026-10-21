/**
 * Ce que plusieurs parcours font sur l'écran du mois.
 *
 * Un fichier à part, pas un export d'un `*.spec.ts` : importer un spec y
 * enregistrerait ses tests une seconde fois.
 */
import { expect, type Page } from '@playwright/test'

/** Ouvre une catégorie repliée. Une catégorie sans montant à dire l'est d'office, et
    l'état se retient par appareil : on regarde avant de toucher. */
export async function ouvreLaCategorie(page: Page, nom: string) {
  const entete = page.getByRole('region', { name: `Catégorie ${nom}` })
    .locator('button[aria-expanded]').first()
  await expect(entete).toBeVisible({ timeout: 15_000 })
  if (await entete.getAttribute('aria-expanded') === 'false') await entete.click()
}
