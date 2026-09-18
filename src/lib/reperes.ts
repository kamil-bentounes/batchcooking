/**
 * Les repères d'un repas pris hors barquette (D34).
 *
 * Le batch cooking couvre les dîners. Sans le petit-déjeuner ni le midi, le
 * tableau de bord ment de **~900 kcal par jour** (D26) — il vaudrait mieux ne
 * rien afficher du tout.
 *
 * Mais personne ne tape des calories deux semaines de suite. D'où des repères
 * en UN GESTE : « resto ~900 », « sandwich midi ~550 ». Approximatif et tenu
 * vaut mieux que précis et abandonné — c'est le même raisonnement que pour les
 * barquettes (D24).
 *
 * Les valeurs viennent des tables de composition pour les aliments simples, et
 * d'ordres de grandeur assumés pour les repas composés. Elles sont marquées
 * « estimé » dans le suivi (D33) : un repère n'est pas une pesée, et l'écran ne
 * fait pas semblant du contraire.
 */

export type Repere = {
  label: string
  kcal: number
  proteinG: number
  /** Pour quel moment de la journée ce repère a du sens. */
  moments: ('petit_dejeuner' | 'dejeuner' | 'diner' | 'collation')[]
}

export const REPERES: Repere[] = [
  // ── Le matin ──────────────────────────────────────────────────────────
  { label: 'Petit-déjeuner léger', kcal: 250, proteinG: 10, moments: ['petit_dejeuner'] },
  { label: 'Petit-déjeuner complet', kcal: 500, proteinG: 22, moments: ['petit_dejeuner'] },
  { label: 'Café et rien', kcal: 5, proteinG: 0, moments: ['petit_dejeuner'] },

  // ── Le midi, hors barquette ───────────────────────────────────────────
  { label: 'Sandwich', kcal: 550, proteinG: 22, moments: ['dejeuner'] },
  { label: 'Salade composée', kcal: 400, proteinG: 20, moments: ['dejeuner', 'diner'] },
  { label: 'Cantine', kcal: 750, proteinG: 30, moments: ['dejeuner'] },
  { label: 'Restaurant', kcal: 900, proteinG: 35, moments: ['dejeuner', 'diner'] },
  { label: 'Fast-food', kcal: 1000, proteinG: 35, moments: ['dejeuner', 'diner'] },

  // ── Le soir et l'entre-deux ───────────────────────────────────────────
  { label: 'Pizza', kcal: 850, proteinG: 34, moments: ['diner'] },
  { label: 'Apéro dînatoire', kcal: 700, proteinG: 20, moments: ['diner'] },
  { label: 'Yaourt', kcal: 60, proteinG: 4, moments: ['collation', 'petit_dejeuner'] },
  { label: 'Fruit', kcal: 80, proteinG: 1, moments: ['collation', 'petit_dejeuner'] },
  { label: 'Poignée d’amandes', kcal: 180, proteinG: 6, moments: ['collation'] },
  { label: 'Skyr ou fromage blanc', kcal: 110, proteinG: 18, moments: ['collation', 'petit_dejeuner'] },
  { label: 'Part de gâteau', kcal: 350, proteinG: 5, moments: ['collation'] },
]

/** Les repères qui ont du sens pour ce moment, les plus légers d'abord. */
export function reperesDe(moment: string): Repere[] {
  return REPERES
    .filter(r => (r.moments as string[]).includes(moment))
    // Le plus léger d'abord : c'est le cas le plus fréquent, et l'ordre doit
    // être le même à chaque ouverture (D50).
    .sort((a, b) => a.kcal - b.kcal || a.label.localeCompare(b.label, 'fr'))
}
