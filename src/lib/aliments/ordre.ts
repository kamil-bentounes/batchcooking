/**
 * Nos aliments passent AVANT les repères.
 *
 * Les repères génériques restent (« Restaurant », « Pizza » : on n'a pas fait de chacun un aliment). Mais quand le
 * foyer a SON yaourt, le repère « Yaourt » (60 kcal, 4 g) ne doit plus se glisser à côté : c'est exactement ce que
 * Kamil a vu — « les calories et le protéine ne vont pas du tout ». Un repère est donc remplacé par l'aliment qui
 * porte son nom, ou qui le prolonge d'un mot : « Yaourt dessert protéiné » remplace « Yaourt ».
 *
 * Ni « Yaourt » ne remplace « Yaourt dessert protéiné » (le générique ne prolonge pas le nôtre), ni « Skyr » ne
 * remplace « Skyr ou fromage blanc » : « ou fromage blanc » est un autre aliment.
 */

/** Un nom comparable : sans accents, sans casse, apostrophes et espaces unifiés. */
export function nomComparable(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[’‘`]/g, '\'').replace(/\s+/g, ' ').trim()
}

/** L'aliment `aliment` prend-il la place du repère `repere` ? */
export function remplace(aliment: string, repere: string): boolean {
  const a = nomComparable(aliment)
  const r = nomComparable(repere)
  return r !== '' && (a === r || a.startsWith(`${r} `))
}

/** Ce qui reste d'une liste (repères, habitudes) une fois ôtés ceux que nos aliments remplacent. L'ordre est gardé. */
export function sansLesRemplaces<T extends { label: string }>(liste: T[], aliments: { label: string }[]): T[] {
  return liste.filter(x => !aliments.some(a => remplace(a.label, x.label)))
}

/** Le repère que cet aliment remplace, s'il en est un : l'écran le dit (« Il passe avant le repère « Yaourt » »). */
export function repereRemplace<T extends { label: string }>(aliment: string, reperes: T[]): T | undefined {
  return reperes.find(r => remplace(aliment, r.label))
}

/** Nos aliments dans l'ordre où on les lit : par nom, à la française (accents et casse ne comptent pas). */
export function parNom<T extends { label: string }>(aliments: T[]): T[] {
  return [...aliments].sort((x, y) => x.label.localeCompare(y.label, 'fr', { sensitivity: 'base' }))
}
