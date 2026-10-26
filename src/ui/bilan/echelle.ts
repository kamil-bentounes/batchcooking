/**
 * L'échelle COMMUNE des graphes du bilan.
 *
 * Chaque personne avait la sienne : le plus haut de ses jours, ou sa cible. Deux barres de 840 kcal ne faisaient
 * donc pas la même hauteur chez Kamil (cible à 2 200) et chez Thauba (pas de cible), et on ne les comparait pas.
 * Une seule borne par grandeur, prise sur TOUTES les personnes (leurs jours et leurs cibles), et un peu de
 * marge pour que la cible tracée ne colle pas au bord.
 */
import type { Personne } from '../../lib/donnees/bilan.ts'

export type Echelle = { kcal: number; protein: number }

const MARGE = 1.05

export function echelleCommune(personnes: Personne[]): Echelle {
  let kcal = 1
  let protein = 1
  for (const p of personnes) {
    kcal = Math.max(kcal, p.cibleKcal ?? 0)
    protein = Math.max(protein, p.cibleProtein ?? 0)
    for (const j of p.serie.jours) {
      kcal = Math.max(kcal, j.kcal ?? 0)
      protein = Math.max(protein, j.protein ?? 0)
    }
  }
  return { kcal: kcal * MARGE, protein: protein * MARGE }
}
