/**
 * Ce que l'écran du dressage écrit sans calculer : l'étiquette courte d'une recette (la rangée de
 * compteurs du haut) et la phrase des objectifs manquants, avec les prénoms mis en gras.
 *
 * Pur : aucune requête. Les parts, les grammes et les compléments viennent de `nutrition/portions.ts`.
 */

const MOTS = (titre: string) => titre.trim().split(/\s+/).filter(Boolean)

/** Les mots qui ne distinguent pas une recette d'une autre : « Poulet au citron », « Salade de riz ». */
const MOTS_VIDES = new Set(['a', 'à', 'au', 'aux', 'de', 'du', 'des', 'd’', 'la', 'le', 'les', 'l’', 'et', 'en', 'un', 'une', 'sur', 'sans', 'avec', 'pour'])
const estVide = (mot: string) => MOTS_VIDES.has(mot.toLowerCase())

/**
 * « Lasagnes au saumon-poireaux ww » → « Lasagnes » : le premier mot suffit pour reconnaître une recette
 * dans une rangée de compteurs. Deux recettes qui commencent pareil prennent un mot utile de plus, en
 * gardant les petits mots qui les relient : « Poulet rôti » / « Poulet au citron », « Salade de riz » /
 * « Salade de pâtes ». Les petits mots (au, de, la…) ne comptent jamais comme un mot utile. Si rien ne
 * distingue deux titres, le titre entier.
 */
export function etiquettesCourtes(titres: string[]): string[] {
  const mots = titres.map(MOTS)
  /* Les n premiers mots UTILES, avec ceux qui s'intercalent. Un titre qui n'a pas n mots utiles : null. */
  const debut = (i: number, n: number): string | null => {
    let vus = 0
    for (let k = 0; k < mots[i].length; k++) {
      if (!estVide(mots[i][k]) && ++vus === n) return mots[i].slice(0, k + 1).join(' ')
    }
    return null
  }
  const maxi = Math.max(0, ...mots.map(m => m.filter(x => !estVide(x)).length))
  return titres.map((titre, i) => {
    for (let n = 1; n <= maxi; n++) {
      const e = debut(i, n)
      if (e === null) break
      if (!mots.some((_, j) => j !== i && debut(j, n) === e)) return e
    }
    return titre.trim()
  })
}

export type Segment = { texte: string; gras: boolean }

/**
 * La phrase des objectifs manquants (`phraseSansObjectifs`) découpée pour mettre les prénoms en gras. Elle
 * s'écrit « Prénom n’a pas… » ou « Prénom et Prénom n’ont pas… » : les prénoms sont lus DANS L'ORDRE, au début
 * de la phrase, jamais cherchés dans le texte — un prénom court (« Al ») ou « Sans prénom » ne met pas en gras
 * un morceau d'un autre mot. Si la phrase ne commence pas ainsi, elle revient telle quelle, d'un seul morceau.
 */
export function enGrasLesPrenoms(phrase: string, prenoms: string[]): Segment[] {
  const segments: Segment[] = []
  let pos = 0
  for (let i = 0; i < prenoms.length; i++) {
    if (i > 0) {
      if (!phrase.startsWith(' et ', pos)) return [{ texte: phrase, gras: false }]
      segments.push({ texte: ' et ', gras: false })
      pos += ' et '.length
    }
    if (prenoms[i] === '' || !phrase.startsWith(prenoms[i], pos)) return [{ texte: phrase, gras: false }]
    segments.push({ texte: prenoms[i], gras: true })
    pos += prenoms[i].length
  }
  if (pos < phrase.length) segments.push({ texte: phrase.slice(pos), gras: false })
  return segments.length > 0 ? segments : [{ texte: phrase, gras: false }]
}

/** Le pluriel de « barquette » devant un nombre : 0 et 1 au singulier. */
export const barquettes = (n: number): string => `${n} barquette${n > 1 ? 's' : ''}`
