/**
 * Lire une quantité tapée dans un champ (stock à la main).
 *
 * Le champ était un `<input type="number" min="0">` au pas par défaut de 1 : « 0,5 » n'entrait
 * pas (bulle native, en anglais sur un poste en anglais, aucune ligne ajoutée), « 0 » partait à
 * la base qui répondait `violates check constraint "stock_item_quantity_check"`, et 10^20 g
 * passait. Ici : une phrase française par refus, et une borne.
 */
export const QUANTITE_MAX = 1_000_000

export type Quantite =
  | { etat: 'vide' }
  | { etat: 'ok'; valeur: number }
  | { etat: 'refus'; message: string }

export function lireQuantite(saisie: string): Quantite {
  const t = saisie.trim().replace(',', '.')
  if (t === '') return { etat: 'vide' }
  const n = Number(t)
  if (!Number.isFinite(n)) return { etat: 'refus', message: 'Je ne lis pas cette quantité.' }
  if (n <= 0) return { etat: 'refus', message: 'Une quantité est plus grande que zéro.' }
  if (n > QUANTITE_MAX) {
    return { etat: 'refus', message: `Pas plus de ${QUANTITE_MAX.toLocaleString('fr-FR')}.` }
  }
  return { etat: 'ok', valeur: n }
}

/**
 * Une quantité à l'écran : « 183 g », « 0,5 u », « 1 200 g ».
 *
 * `Math.round` seul rendait « 0 u » pour 0,4 et « 1 u » pour 0,5 : le stock affirmait zéro
 * d'une chose qu'on avait. Dix et plus s'arrondissent à l'unité (« 182,99999999999997 g »
 * n'a aucun sens), dessous on garde deux décimales.
 */
export function ecritQuantite(n: number): string {
  if (n > 0 && n < 0.01) return 'moins de 0,01'
  const v = n >= 10 ? Math.round(n) : Math.round(n * 100) / 100
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}

/** Les unités qu'on n'accorde pas : des symboles (g, ml, l…) et « u », qui ne s'écrit jamais « us ». */
const INVARIABLES = new Set([
  'g', 'kg', 'mg', 'ml', 'cl', 'dl', 'l', 'u', 'cs', 'cc', 'càs', 'càc', 'cm', 'mm', 'm', 'kcal',
])

/**
 * L'unité d'une quantité, accordée comme on la lit : « 3 pots », « 1 pot », « 1,5 pot » (en français,
 * le pluriel commence à deux). Les symboles (« g », « ml », « u ») ne bougent pas ; un mot qui finit
 * par s, x ou z non plus ; « -al » fait « -aux » (« bocal » → « bocaux ») ; seul le premier mot d'une
 * unité composée s'accorde (« cuillère à soupe » → « cuillères à soupe »).
 */
export function uniteAccordee(unite: string | null | undefined, n: number): string {
  const u = (unite ?? '').trim()
  if (u === '' || n < 2 || INVARIABLES.has(u.toLowerCase())) return u
  const [mot, ...suite] = u.split(/\s+/)
  let pluriel = mot
  if (/[sxz]$/i.test(mot)) pluriel = mot
  else if (/al$/i.test(mot)) pluriel = `${mot.slice(0, -2)}aux`
  else pluriel = `${mot}s`
  return [pluriel, ...suite].join(' ')
}

/** « 3 pots », « 183 g », « 0,5 u » : la quantité et son unité accordée, ou rien sans quantité. */
export function ecritQuantiteEtUnite(n: number, unite: string | null | undefined): string {
  return `${ecritQuantite(n)} ${uniteAccordee(unite, n)}`.trim()
}
