/**
 * Nos aliments passent AVANT les repères.
 *
 * Les repères génériques restent (« Restaurant », « Pizza » : on n'a pas fait de chacun un aliment). Mais quand le
 * foyer a SON yaourt, le repère « Yaourt » (60 kcal, 4 g) ne doit plus se glisser à côté : c'est exactement ce que
 * Kamil a vu — « les calories et le protéine ne vont pas du tout ».
 *
 * Quel repère un aliment remplace est un CHOIX, pas une devinette : l'aliment porte `remplace_repere` (le nom d'un
 * repère de `reperes.ts`), que le formulaire propose d'après le premier mot du nom et que la personne peut retirer.
 * Plus aucune règle de préfixe : « Yaourt dessert protéiné » ne cache « Yaourt » que si on le lui a dit, et « Yaourt
 * grec » ne cache rien tant qu'on ne l'a pas dit non plus. Un repère n'est donc caché que :
 *  · s'il est NOMMÉ par un aliment (`remplace_repere`), ou
 *  · s'il porte exactement le même nom qu'un aliment (accents, casse et pluriel ne comptent pas).
 */

/** Un nom comparable : sans accents, sans casse, apostrophes et espaces unifiés. */
export function nomComparable(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’‘`]/g, '\'').replace(/\s+/g, ' ').trim()
}

/** Un mot au singulier, à peu près : « yaourts » → « yaourt ». Les mots courts (« pois », « riz ») ne bougent pas. */
const sansPluriel = (mot: string) => (mot.length > 4 && /[sx]$/.test(mot) ? mot.slice(0, -1) : mot)

/** Le nom tel qu'on le compare à un autre : accents, casse et pluriel ne comptent pas. */
export function nomDeComparaison(s: string): string {
  return nomComparable(s).split(' ').map(sansPluriel).join(' ')
}

/** Le premier mot du nom, dans la même forme comparable (« Yaourt dessert protéiné » → « yaourt »). */
export function premierMot(s: string): string {
  return nomDeComparaison(s).split(' ')[0] ?? ''
}

/** Ce qu'un aliment dit de ses repères : son nom, et le repère qu'on a choisi pour lui. */
export type Remplacant = { label: string; remplace_repere?: string | null }

/** L'aliment `aliment` prend-il la place du repère (ou de l'habitude) `nom` ? */
export function remplace(aliment: Remplacant, nom: string): boolean {
  const n = nomDeComparaison(nom)
  if (n === '') return false
  if (nomDeComparaison(aliment.label) === n) return true
  return !!aliment.remplace_repere && nomDeComparaison(aliment.remplace_repere) === n
}

/** Ce qui reste d'une liste (repères, habitudes) une fois ôtés ceux que nos aliments remplacent. L'ordre est gardé. */
export function sansLesRemplaces<T extends { label: string }>(liste: T[], aliments: Remplacant[]): T[] {
  return liste.filter(x => !aliments.some(a => remplace(a, x.label)))
}

/** Le repère que cet aliment remplace, s'il en est un : l'écran le dit (« Il remplace le repère « Yaourt » »). */
export function repereRemplace<T extends { label: string }>(aliment: Remplacant, reperes: T[]): T | undefined {
  return reperes.find(r => remplace(aliment, r.label))
}

/**
 * Le repère à PROPOSER pour un nom : celui dont le premier mot est le même (« Yaourt dessert protéiné » propose
 * « Yaourt »). Rien quand deux repères commencent pareil (« Petit-déjeuner léger », « Petit-déjeuner complet ») : on
 * ne devine pas entre deux, la personne choisit. Ce n'est qu'une proposition, qu'elle peut retirer.
 */
export function repereProposePour<T extends { label: string }>(nom: string, reperes: T[]): T | undefined {
  const mot = premierMot(nom)
  if (mot === '') return undefined
  const memes = reperes.filter(r => premierMot(r.label) === mot)
  return memes.length === 1 ? memes[0] : undefined
}

/** Nos aliments dans l'ordre où on les lit : par nom, à la française (accents et casse ne comptent pas). */
export function parNom<T extends { label: string }>(aliments: T[]): T[] {
  return [...aliments].sort((x, y) => x.label.localeCompare(y.label, 'fr', { sensitivity: 'base' }))
}
