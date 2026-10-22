/**
 * L'équipement par défaut d'une session : ce que le foyer avait la dernière fois.
 *
 * « Équipement du jour » arrivait avec les huit appareils du catalogue cochés — un micro-ondes et
 * un batteur compris — et il fallait tout décocher à chaque dimanche. Un foyer cuisine presque
 * toujours avec les mêmes : on part de sa dernière session, et du catalogue seulement s'il n'en a
 * jamais choisi.
 */

export type Capacites = Record<string, number>

export function equipementInitial({ propres, derniere, catalogue }: {
  /** Ce que CETTE session a déjà enregistré : il passe avant tout. */
  propres: Capacites
  /** L'équipement de la dernière session du foyer qui en avait un. */
  derniere: Capacites
  catalogue: { code: string; default_capacity: number }[]
}): Capacites {
  if (Object.keys(propres).length > 0) return propres
  const connus = new Set(catalogue.map(a => a.code))
  const repris = Object.fromEntries(Object.entries(derniere).filter(([code]) => connus.has(code)))
  if (Object.keys(repris).length > 0) return repris
  return Object.fromEntries(catalogue.map(a => [a.code, a.default_capacity]))
}
