/**
 * Ce que l'écran de l'épargne dit d'une poche : le pourcentage, la date, la photo, la couleur de qui a versé.
 * Rien n'est calculé ici qui ne le soit déjà ailleurs (le solde, l'effort mensuel, le refus d'un retrait) :
 * ce sont les mots, au même endroit pour la carte et pour ses tests.
 */
import { nomDuMois } from './mois.ts'

/** Le pourcentage atteint, arrondi ; `null` quand il n'y a pas d'objectif, ou pas de solde lu. */
export function pourcentage(total: number | null, objectif: number | null): number | null {
  if (total === null || !objectif || objectif <= 0) return null
  return Math.max(0, Math.round((total / objectif) * 100))
}

/** La part de la barre, de 0 à 1 : elle ne dépasse jamais la piste, même quand l'objectif est franchi. */
export function partDeLaBarre(total: number | null, objectif: number | null): number | null {
  if (total === null || !objectif || objectif <= 0) return null
  return Math.min(1, Math.max(0, total / objectif))
}

/** « pour août 2027 », ou « pas de date ». L'échéance est un jour `AAAA-MM-JJ` : on la lit en texte, pas en `Date`. */
export function repereDeLaDate(echeance: string | null): string {
  if (!echeance || !/^\d{4}-\d{2}-\d{2}$/.test(echeance)) return 'pas de date'
  return `pour ${nomDuMois(echeance)} ${echeance.slice(0, 4)}`
}

/** La photo du bandeau : celle de l'épargne pour le fonds d'urgence, celle des projets pour un projet. */
export function photoDeLaPoche(genre: 'urgence' | 'projet'): string {
  return genre === 'urgence' ? 'epargne' : 'auto'
}

/** La couleur de la pastille de chacun, selon sa place dans le foyer : le premier herbe, la deuxième safran. */
export const PASTILLES = [
  'bg-herbe text-fond', 'bg-safran text-encre', 'bg-brume text-encre',
] as const
export const pastilleDe = (rang: number): string => PASTILLES[Math.min(Math.max(rang, 0), PASTILLES.length - 1)]

/**
 * Le voile sous le titre. Le titre est blanc, posé sur une photo qui peut être claire (le bois blanc de
 * l'épargne) : à 62 % d'opacité en bas, la maquette ne tenait pas l'AA sous le titre. Le voile est déjà à
 * 65 % à mi-hauteur, là où le titre commence, et la photo la plus blanche possible y garde plus de 4,5:1
 * (voir le test).
 */
export const VOILE_RVB = [20, 32, 26] as const
export const VOILE_ARRETS = [
  { place: 20, alpha: 0 }, { place: 50, alpha: 0.65 }, { place: 100, alpha: 0.85 },
] as const
export const VOILE = `linear-gradient(180deg, ${VOILE_ARRETS.map(a =>
  `rgba(${VOILE_RVB.join(',')},${a.alpha}) ${a.place}%`).join(', ')})`
