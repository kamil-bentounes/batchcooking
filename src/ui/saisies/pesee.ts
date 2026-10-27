/**
 * Les nombres que Peser affiche : combien de pesées font connaître un aliment, et comment on le dit.
 * La règle est celle de la migration 0025 : 3 pesées retenues quand l'aliment a un poids de référence, 5 sinon.
 */
import type { APeser } from '../../lib/pesee.ts'

export const SEUIL_AVEC_REFERENCE = 3
export const SEUIL_SANS_REFERENCE = 5

const EN_TOUTES_LETTRES: Record<number, string> = { 1: 'une', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq' }
const enLettres = (n: number) => EN_TOUTES_LETTRES[n] ?? String(n)

/** Le seuil d'un aliment : celui que la base a rendu, sinon celui que la règle donnera à sa première pesée. */
export const seuilDe = (a: Pick<APeser, 'progres' | 'reference'>): number =>
  a.progres?.seuil ?? (a.reference === null ? SEUIL_SANS_REFERENCE : SEUIL_AVEC_REFERENCE)

/** Combien de pesées il reste après celle qu'on va enregistrer. */
export const restantesApres = (a: Pick<APeser, 'progres' | 'reference'>): number =>
  a.progres ? a.progres.seuil - a.progres.faites : seuilDe(a)

/** L'en-tête de la liste : un seuil commun se dit tel quel, deux seuils se disent tous les deux. */
export function phraseDesSeuils(seuils: number[]): string | null {
  const distincts = [...new Set(seuils)].sort((x, y) => x - y)
  if (distincts.length === 0) return null
  if (distincts.length === 1) return `${enLettres(distincts[0])} pesées par aliment`
  const [petit, ...autres] = distincts
  return `${enLettres(petit)} pesées par aliment, ${autres.map(enLettres).join(' ou ')} sans poids de référence`
}

/** « 2 recettes » : ce qui fait passer un aliment avant un autre. Tu le vois tant qu'il n'est pas commencé. */
export const recettesDit = (a: Pick<APeser, 'recettes' | 'progres'>): string | null =>
  a.progres || !(a.recettes > 0) ? null : `${a.recettes} recette${a.recettes > 1 ? 's' : ''}`
