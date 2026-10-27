/**
 * Ce que l'écran de l'épargne dit d'une poche : le pourcentage, la date, la photo, la couleur de qui a versé.
 * Rien n'est calculé ici qui ne le soit déjà ailleurs (le solde, l'effort mensuel, le refus d'un retrait) :
 * ce sont les mots, au même endroit pour la carte et pour ses tests.
 */
import { nomDuMois } from './mois.ts'

/**
 * Le pourcentage atteint, arrondi vers le bas : 99,5 % n'est pas « 100 % », l'objectif n'est pas atteint. Tant qu'il ne
 * l'est pas, 99 au plus ; dès qu'il y a de l'argent, 1 au moins (0,4 % n'est pas « 0 % »). `null` sans objectif ni solde lu.
 */
export function pourcentage(total: number | null, objectif: number | null): number | null {
  if (total === null || !objectif || objectif <= 0) return null
  if (total <= 0) return 0
  if (total >= objectif) return Math.floor((total / objectif) * 100)
  return Math.min(99, Math.max(1, Math.floor((total / objectif) * 100)))
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
/** Un rang inconnu (quelqu'un qui n'est plus du foyer) prend la pastille neutre, pas celle du premier membre. */
export const pastilleDe = (rang: number): string =>
  PASTILLES[rang < 0 ? PASTILLES.length - 1 : Math.min(rang, PASTILLES.length - 1)]

/** La taille du gros total selon sa longueur : « 12 345,67 € » ne tient pas en 52 px dans une carte de 326 px. */
export function tailleDuTotal(texte: string): 'grand' | 'moyen' | 'petit' {
  return texte.length <= 8 ? 'grand' : texte.length <= 10 ? 'moyen' : 'petit'
}

/**
 * Le voile sous le titre. Le titre est blanc, posé sur une photo qui peut être claire (le bois blanc de
 * l'épargne) : à 62 % d'opacité en bas, la maquette ne tenait pas l'AA sous le titre. Le voile monte à 66 % dès
 * 30 % de la hauteur, et un titre de trois lignes (à 320 px, il commence vers 40 %) y garde plus de 4,5:1 même sur
 * la photo la plus blanche possible (voir le test).
 */
export const VOILE_RVB = [20, 32, 26] as const
export const VOILE_ARRETS = [
  { place: 0, alpha: 0 }, { place: 30, alpha: 0.66 }, { place: 100, alpha: 0.85 },
] as const
/** L'opacité du voile à `place` % de la hauteur de la photo (interpolation entre deux arrêts). */
export function alphaDuVoile(place: number): number {
  const arrets = VOILE_ARRETS
  for (let i = 1; i < arrets.length; i++) {
    const [d, f] = [arrets[i - 1], arrets[i]]
    if (place <= f.place) return d.alpha + (f.alpha - d.alpha) * ((place - d.place) / (f.place - d.place))
  }
  return arrets[arrets.length - 1].alpha
}
/** Le titre est limité à 3 lignes ; il se pose à 12 px du bas du bandeau. */
export const TITRE_LIGNES_MAX = 3
export const VOILE = `linear-gradient(180deg, ${VOILE_ARRETS.map(a =>
  `rgba(${VOILE_RVB.join(',')},${a.alpha}) ${a.place}%`).join(', ')})`
