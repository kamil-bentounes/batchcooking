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
