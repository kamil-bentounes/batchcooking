/** Les petits formats du bilan : une date courte, un montant à la française. */

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

/** « lun. » : le jour de la semaine d'une date `AAAA-MM-JJ`, sans passer par un fuseau. */
export function jourCourtDe(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number)
  return JOURS_COURTS[new Date(a, m - 1, j).getDay()]
}

/** « 3 oct. » */
export function dateCourteDe(iso: string): string {
  const [, m, j] = iso.split('-').map(Number)
  return `${j} ${MOIS_COURTS[m - 1]}`
}

export function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',')
}
