/** « 1 part », « 4 parts » : le mot que l'écran écrit partout où il compte des parts. */
export function parts(n: number): string {
  return `${n} part${n >= 2 ? 's' : ''}`
}

/** Les plafonds que les champs annonçaient (`max=`) sans jamais les faire respecter. */
export const PARTS_MAX_RECETTE = 20
export const PARTS_MAX_CYCLE = 40

export type LectureParts =
  | { etat: 'ok'; valeur: number }
  /** Rien de tapé : la personne est en train de réécrire, on ne dit rien et on ne change rien. */
  | { etat: 'vide' }
  | { etat: 'refus'; message: string }

/**
 * Ce qu'un champ de parts contient, lu comme une personne l'a tapé. Des entiers
 * seulement : la colonne est un `int`, et « 2,5 parts » n'a pas de sens pour une
 * liste de courses. On lit le TEXTE — un `<input type="number">` rendrait « 2.5 »
 * ou rien du tout, sans qu'on sache lequel des deux on a reçu.
 */
export function lireParts(texte: string, max: number): LectureParts {
  const t = texte.trim()
  if (t === '') return { etat: 'vide' }
  if (!/^\d+$/.test(t)) {
    return { etat: 'refus', message: 'Les parts se comptent en nombres entiers.' }
  }
  const n = Number(t)
  if (n < 1) return { etat: 'refus', message: 'Il faut au moins 1 part.' }
  if (n > max) return { etat: 'refus', message: `Pas plus de ${max} parts.` }
  return { etat: 'ok', valeur: n }
}

/**
 * Ce qu'une frappe doit faire : écrire (`commit`), refuser (`refus`), ou rien du
 * tout. Un champ vide ne fait RIEN : la personne efface pour réécrire, et le
 * ramener à « 1 » sous ses doigts donnait « 112 » quand elle tapait « 12 ».
 */
export function lireSaisie(
  texte: string, max: number, courant: number,
): { commit: number | null; refus: string | null } {
  const l = lireParts(texte, max)
  if (l.etat === 'refus') return { commit: null, refus: l.message }
  if (l.etat === 'vide' || l.valeur === courant) return { commit: null, refus: null }
  return { commit: l.valeur, refus: null }
}
