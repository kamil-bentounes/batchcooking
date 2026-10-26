/**
 * Les adresses de photo qui n'ont pas chargé, et depuis quand.
 *
 * Une carte dont la photo échoue montre l'appareil photo ; on s'en souvient pour que les autres cartes du
 * même plat ne la redemandent pas à la file — mais seulement `DELAI_ECHEC` : un échec passager (réseau
 * coupé une seconde, serveur qui redémarre) ne doit pas condamner la photo tant que la page n'est pas
 * rechargée. Passé le délai, la prochaine carte qui se dessine retente.
 */
export const DELAI_ECHEC = 30_000

const echecs = new Map<string, number>()

/** Cette adresse a-t-elle échoué il n'y a pas longtemps ? */
export function echecRecent(url: string, maintenant = Date.now()): boolean {
  const quand = echecs.get(url)
  if (quand === undefined) return false
  if (maintenant - quand >= DELAI_ECHEC) { echecs.delete(url); return false }
  return true
}

export function noteUnEchec(url: string, maintenant = Date.now()) {
  echecs.set(url, maintenant)
}

/** Pour les essais. */
export function oublieLesEchecs() { echecs.clear() }
