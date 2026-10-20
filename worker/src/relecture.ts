/**
 * Ce qu'une page relue nous dit, et quand laisser un site tranquille (R3).
 *
 * La relecture des pages déjà ingérées ne cherche qu'une chose : la photo. Elle
 * ne force rien. Un site qui refuse — par un statut, ou par une page de défi
 * sans recette, qui répond souvent 200 — est laissé après trois refus DE SUITE.
 * Un site en panne (5xx autres que 503, réseau, délai dépassé) l'est après cinq
 * erreurs de suite : on ne le martèle pas. Une page disparue n'est pas un refus :
 * le site répond, la recette n'y est plus.
 */
export type Issue = 'photo' | 'sans-photo' | 'sans-recette' | 'disparue' | 'refusee' | 'erreur'

export const REFUS_AVANT_ABANDON = 3
export const ERREURS_AVANT_ABANDON = 5

export function issueDe(statut: number, aUneRecette: boolean, photo: string | null): Issue {
  if (statut === 404 || statut === 410) return 'disparue'
  if (statut === 401 || statut === 403 || statut === 429 || statut === 503) return 'refusee'
  // 0 : le réseau, ou le délai de 30 s.
  if (statut < 200 || statut >= 300) return 'erreur'
  if (!aUneRecette) return 'sans-recette'
  return photo ? 'photo' : 'sans-photo'
}

const estUnRefus = (i: Issue) => i === 'refusee' || i === 'sans-recette'
const estUneErreur = (i: Issue) => i === 'erreur'

/** Les `n` dernières issues sont-elles toutes du même genre ? */
const finDe = (dernieres: Issue[], n: number, genre: (i: Issue) => boolean) => {
  const fin = dernieres.slice(-n)
  return fin.length === n && fin.every(genre)
}

/**
 * Trois refus de suite, ou cinq erreurs de suite, et on laisse le site pour cette
 * fois. Les deux séries ne se mélangent pas.
 */
export function abandonne(dernieres: Issue[]): boolean {
  return (
    finDe(dernieres, REFUS_AVANT_ABANDON, estUnRefus) ||
    finDe(dernieres, ERREURS_AVANT_ABANDON, estUneErreur)
  )
}

export type VoieRobots = 'lire' | 'tout-permis' | 'laisser'

/**
 * Que dire d'un domaine d'après la réponse de son `robots.txt` (RFC 9309) :
 * 2xx, on le lit ; 4xx, rien n'est interdit ; 5xx ou injoignable (0), le domaine
 * est laissé pour ce passage.
 */
export function robotsDe(statut: number): VoieRobots {
  if (statut >= 200 && statut < 300) return 'lire'
  if (statut >= 400 && statut < 500) return 'tout-permis'
  return 'laisser'
}
