/**
 * La liste par dix (R1).
 *
 * On ne fait que descendre : « Les 10 suivantes » est le geste qu'on fait neuf
 * fois sur dix. Les numéros servent à revenir — le premier, le dernier, la page
 * et ses voisines, des « … » entre. Sept boutons au plus : ils tiennent sur un
 * téléphone, à 44 px chacun.
 */
export const PAR_PAGE = 10

export const nombreDePages = (total: number) => Math.max(1, Math.ceil(total / PAR_PAGE))

/**
 * Une page qu'on peut montrer : entière, entre la première et la dernière. Elle
 * viendra d'un état, jamais de confiance — NaN, 0, 1,5 ou 99 ne cassent rien.
 */
function pageValide(page: number, total: number): number {
  const entiere = Number.isNaN(page) ? 1 : Math.trunc(page)
  return Math.min(Math.max(1, entiere), nombreDePages(total))
}

/** Les recettes de la page. Une page au-delà de la fin rend la dernière. */
export function tranche<T>(liste: T[], page: number): T[] {
  const p = pageValide(page, liste.length)
  return liste.slice((p - 1) * PAR_PAGE, p * PAR_PAGE)
}

/** « Recettes 11 à 20 sur 1 390 ». Liste vide : de 0 à 0. */
export function bornesDeLaPage(page: number, total: number): { de: number; a: number } {
  if (total === 0) return { de: 0, a: 0 }
  const p = pageValide(page, total)
  return { de: (p - 1) * PAR_PAGE + 1, a: Math.min(p * PAR_PAGE, total) }
}

/**
 * Le bouton du bas : « Les 10 suivantes », et « La suivante » quand il n'en
 * reste qu'une (« Les 1 suivantes » ne se dit pas).
 */
export function libelleSuivantes(restantes: number): string {
  return restantes === 1 ? 'La suivante' : `Les ${Math.min(PAR_PAGE, restantes)} suivantes`
}

export function numeros(courante: number, total: number): (number | '…')[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
  const gardees = new Set([1, total, courante - 1, courante, courante + 1])
  // Aux deux bouts, on montre trois pages d'affilée : « 1 2 3 … 139 ».
  if (courante <= 2) { gardees.add(2); gardees.add(3) }
  if (courante >= total - 1) { gardees.add(total - 1); gardees.add(total - 2) }
  const triees = [...gardees].filter(n => n >= 1 && n <= total).sort((a, b) => a - b)
  const sortie: (number | '…')[] = []
  triees.forEach((n, i) => {
    if (i > 0) {
      const ecart = n - triees[i - 1]
      // Une seule page manquante : la montrer coûte autant qu'un « … ».
      if (ecart === 2) sortie.push(n - 1)
      else if (ecart > 2) sortie.push('…')
    }
    sortie.push(n)
  })
  return sortie
}
