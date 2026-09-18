/**
 * Ce qu'on fait des lignes APRÈS que le modèle les a lues.
 *
 * Mesuré le 18 septembre 2026, sur huit lectures d'un même ticket portant une
 * ligne « REMISE FIDELITE -0,50 » : la couverture est de 8/8 à chaque fois, le
 * total imprimé est lu juste à chaque fois, et **aucun** sous-total, point de
 * fidélité ou rendu monnaie n'est pris pour un achat. Un seul défaut revient,
 * une fois sur deux : le modèle REPÈRE la remise — il la pose bien dans
 * `remise_eur`, sur la bonne ligne — mais il ne la soustrait pas toujours du
 * montant.
 *
 * Insister dans le prompt aurait déstabilisé ce qui marche. Or le cas se
 * VÉRIFIE par l'arithmétique : si la somme des lignes dépasse le total imprimé
 * d'exactement la somme des remises annoncées, alors les remises ont été
 * listées sans être déduites. On les déduit.
 *
 * La règle échoue fermée : si l'égalité ne tombe pas au centime, on ne touche à
 * rien et l'écran affiche l'écart. Mieux vaut un écart visible qu'une
 * correction inventée — un prix corrigé de travers s'apprend et se propage.
 */

export type LigneLue = {
  label: string
  quantity: number | null
  unit: string | null
  unit_price_eur: number | null
  price_eur: number
  remise_eur: number | null
  confiance: number
}

const centimes = (n: number) => Math.round(n * 100) / 100

export type Reconciliation = {
  lignes: LigneLue[]
  somme: number
  /** Positif = on a lu plus cher que le total imprimé. `null` = pas de total. */
  ecart: number | null
  /** `true` quand des remises annoncées ont été déduites après coup. */
  remisesDeduites: boolean
}

export function reconcilie(brutes: LigneLue[], total: number | null): Reconciliation {
  // Une ligne à prix négatif est une remise que le modèle a listée malgré la
  // consigne. On l'écarte : elle ferait apprendre un prix négatif.
  const lignes = brutes
    .filter(l => Number(l.price_eur) > 0)
    .map(l => ({ ...l, price_eur: Number(l.price_eur) }))

  const somme = centimes(lignes.reduce((s, l) => s + l.price_eur, 0))
  if (total === null) {
    return { lignes, somme, ecart: null, remisesDeduites: false }
  }

  const ecart = centimes(somme - total)
  const remises = centimes(lignes.reduce((s, l) => s + Number(l.remise_eur ?? 0), 0))

  // L'égalité au centime, et rien d'autre. Un écart de 0,51 € pour 0,50 € de
  // remises annoncées veut dire qu'il manque aussi autre chose : on se tait.
  if (remises > 0 && Math.abs(ecart - remises) < 0.005) {
    const corrigees = lignes.map(l => (
      l.remise_eur ? { ...l, price_eur: centimes(l.price_eur - Number(l.remise_eur)) } : l
    ))
    return {
      lignes: corrigees,
      somme: centimes(corrigees.reduce((s, l) => s + l.price_eur, 0)),
      ecart: 0,
      remisesDeduites: true,
    }
  }

  return { lignes, somme, ecart, remisesDeduites: false }
}
