/**
 * Le suivi mensuel (lot 6).
 *
 * Ce fichier ne calcule qu'une chose, mais c'est celle qui décide si le tableau
 * de bord est honnête : **un jour non renseigné n'est pas un jour à zéro**
 * (D33). Compter les blancs comme des zéros fait mentir les moyennes vers le
 * bas — le pire sens possible, celui qui fait croire qu'on manque de protéines
 * alors qu'on a simplement oublié de cocher un dimanche.
 *
 * D'où `null` partout où l'on ne sait pas, et une moyenne divisée par les jours
 * RENSEIGNÉS, jamais par la durée de la période.
 *
 * L'autre règle tient à la lecture : **deux graphiques, jamais deux axes**. Des
 * kilocalories et des grammes de protéines sur un même dessin obligent à une
 * double échelle, et une double échelle se lit de travers — on peut lui faire
 * dire n'importe quoi en choisissant les bornes.
 */

export type Repas = {
  day: string
  user_profile_id: string
  state: 'prevu' | 'mange' | 'saute'
  /** Les macros de la barquette mangée, quand il y en a une. */
  kcal: number
  protein_g: number
}

export type Jour = {
  jour: string
  /** `null` = rien n'a été renseigné ce jour-là. Jamais 0. */
  kcal: number | null
  protein: number | null
}

export type Serie = {
  jours: Jour[]
  /** Moyenne sur les seuls jours renseignés. `null` s'il n'y en a aucun. */
  kcalMoyen: number | null
  proteinMoyen: number | null
  renseignes: number
  total: number
  /**
   * Jours où la cible est tenue. Les deux cibles ne se lisent pas dans le même
   * sens : les protéines sont un PLANCHER, les calories un PLAFOND.
   */
  joursProteineTenue: number | null
  joursKcalTenue: number | null
}

/** Les jours d'une période, bornes comprises. */
export function joursEntre(a: Date, b: Date): string[] {
  const liste: string[] = []
  const d = new Date(a.getFullYear(), a.getMonth(), a.getDate())
  const fin = new Date(b.getFullYear(), b.getMonth(), b.getDate())
  while (d <= fin) {
    liste.push(iso(d))
    d.setDate(d.getDate() + 1)
  }
  return liste
}

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    + `-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * La série d'une personne sur une période.
 *
 * Un jour compte comme renseigné dès qu'une case y porte autre chose que
 * « prévu » : manger est une information, sauter un repas aussi. Seule
 * l'absence totale de trace est une absence de savoir.
 */
export function serie(
  jours: string[],
  repas: Repas[],
  userId: string,
  cible: { kcal: number | null; protein: number | null } = { kcal: null, protein: null },
): Serie {
  const siens = repas.filter(r => r.user_profile_id === userId)
  const parJour = new Map<string, Repas[]>()
  for (const r of siens) {
    if (!parJour.has(r.day)) parJour.set(r.day, [])
    parJour.get(r.day)!.push(r)
  }

  const lignes: Jour[] = jours.map(j => {
    const duJour = parJour.get(j) ?? []
    // Rien du tout : on ne sait pas. Ce n'est pas un jour à jeun.
    if (!duJour.some(r => r.state !== 'prevu')) return { jour: j, kcal: null, protein: null }
    const manges = duJour.filter(r => r.state === 'mange')
    return {
      jour: j,
      kcal: Math.round(manges.reduce((s, r) => s + r.kcal, 0)),
      protein: Math.round(manges.reduce((s, r) => s + r.protein_g, 0)),
    }
  })

  const connus = lignes.filter(l => l.kcal !== null)
  const moyenne = (prendre: (l: Jour) => number | null) => connus.length === 0
    ? null
    : Math.round(connus.reduce((s, l) => s + (prendre(l) ?? 0), 0) / connus.length)

  return {
    jours: lignes,
    kcalMoyen: moyenne(l => l.kcal),
    proteinMoyen: moyenne(l => l.protein),
    renseignes: connus.length,
    total: jours.length,
    // Les protéines sont un plancher : on les ATTEINT. Les calories un
    // plafond : on reste EN DESSOUS. Inverser les deux rendrait l'écran
    // encourageant au mauvais moment.
    joursProteineTenue: cible.protein === null ? null
      : connus.filter(l => (l.protein ?? 0) >= cible.protein!).length,
    joursKcalTenue: cible.kcal === null ? null
      : connus.filter(l => (l.kcal ?? 0) <= cible.kcal!).length,
  }
}

export type Budget = {
  /** Ce qui est RÉELLEMENT sorti du compte, d'après les tickets (lot 5). */
  paye: number
  /** Ce qu'on prévoyait, pour les articles dont on n'a pas le prix payé. */
  estimeRestant: number
  /** Le budget mensuel du foyer. `null` = aucun budget fixé. */
  plafond: number | null
  /** Part du plafond consommée, entre 0 et 1. `null` sans plafond. */
  part: number | null
  /** Ce que coûte une part cuisinée. `null` tant qu'on n'a rien payé. */
  parPortion: number | null
}

/**
 * Le budget de la période.
 *
 * On ne MÉLANGE PAS le payé et l'estimé dans un seul total : additionner les
 * deux et appeler cela « dépensé » serait un mensonge, puisque la moitié du
 * chiffre serait une supposition. Les deux vivent côte à côte, et la jauge ne
 * mesure que le payé.
 *
 * Et le payé vient des TICKETS, pas de la somme des articles rapprochés. Un
 * ticket à 87,40 € dont 7 lignes sur 12 sont rattachées à la liste ne
 * remplissait la jauge que des 7 : les sacs poubelle, que le rapprochement
 * laisse volontairement libres, disparaissaient du budget.
 */
export function budget(
  articles: { est_price_eur: number | string | null; paid_price_eur: number | string | null }[],
  payeTickets: number,
  portionsDressees: number,
  plafond: number | null,
): Budget {
  const paye = arrondi(payeTickets)
  const estimeRestant = arrondi(articles
    .filter(a => a.paid_price_eur === null)
    .reduce((s, a) => s + Number(a.est_price_eur ?? 0), 0))

  return {
    paye,
    estimeRestant,
    plafond,
    part: plafond === null || plafond <= 0 ? null : paye / plafond,
    // Diviser par zéro portion donnerait l'infini ; ne rien avoir payé donnerait
    // zéro euro la part, ce qui est faux plutôt que vide.
    parPortion: portionsDressees > 0 && paye > 0
      ? arrondi(paye / portionsDressees)
      : null,
  }
}

/** Le premier jour du mois, `n` mois en arrière. */
export function moisEnArriere(n: number, depuis = new Date()): Date {
  return new Date(depuis.getFullYear(), depuis.getMonth() - n, 1)
}

function arrondi(n: number): number {
  return Math.round(n * 100) / 100
}
