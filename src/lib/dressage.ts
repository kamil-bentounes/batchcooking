/**
 * Ce que l'écran du dressage écrit sans calculer : l'étiquette courte d'une recette (la rangée de
 * compteurs du haut) et la phrase des objectifs manquants, avec les prénoms mis en gras.
 *
 * Pur : aucune requête. Les parts, les grammes et les compléments viennent de `nutrition/portions.ts`.
 */

const MOTS = (titre: string) => titre.trim().split(/\s+/).filter(Boolean)

/**
 * « Lasagnes au saumon-poireaux ww » → « Lasagnes » : le premier mot suffit pour reconnaître une recette
 * dans une rangée de compteurs. Deux recettes qui commencent pareil (« Poulet rôti », « Poulet au citron »)
 * prennent chacune deux mots ; si cela ne suffit pas, le titre entier.
 */
export function etiquettesCourtes(titres: string[]): string[] {
  const mots = titres.map(MOTS)
  const debut = (i: number, n: number) => mots[i].slice(0, n).join(' ')
  return titres.map((titre, i) => {
    if (mots[i].length === 0) return titre
    for (const n of [1, 2]) {
      const e = debut(i, n)
      if (!mots.some((_, j) => j !== i && debut(j, n) === e)) return e
    }
    return titre.trim()
  })
}

export type Segment = { texte: string; gras: boolean }

/**
 * Coupe une phrase en morceaux, les prénoms (là où ils apparaissent) en gras. Un prénom absent de la
 * phrase ne change rien : la phrase revient telle quelle, d'un seul morceau.
 */
export function enGrasLesPrenoms(phrase: string, prenoms: string[]): Segment[] {
  const utiles = prenoms.filter(p => p !== '').sort((a, b) => b.length - a.length)
  if (utiles.length === 0) return [{ texte: phrase, gras: false }]
  const motif = new RegExp(`(${utiles.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  return phrase.split(motif).filter(t => t !== '').map(t => ({ texte: t, gras: utiles.includes(t) }))
}

/** Le pluriel de « barquette » devant un nombre : 0 et 1 au singulier. */
export const barquettes = (n: number): string => `${n} barquette${n > 1 ? 's' : ''}`
