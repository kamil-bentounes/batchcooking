/**
 * Ce que l'écran du mois décide AVANT de montrer un chiffre (§ 3.1).
 *
 * Le mois se lit en plusieurs requêtes (lignes, saisies, charges, revenus,
 * clôtures, foyer). Calculé sur un morceau, « Il te reste » ment : sans les
 * revenus il dit « Ajoute ton revenu » à qui l'a posé ; sans les saisies il
 * compte le prévu ; sans les clôtures il recompte « max(prévu, déclaré) » sur
 * un mois clos. Un faux chiffre, même une demi-seconde, est pire qu'un
 * « Un instant… ».
 */
export type Lecture = { data: unknown; error: unknown }
export type EtatDeLEcran = 'chargement' | 'erreur' | 'pret'

/**
 * Une lecture « manque » tant qu'elle n'a rien rendu : `data === undefined`
 * (`null` est une réponse — pas de foyer). Une lecture qui rate AU
 * RAFRAÎCHISSEMENT garde ses données : on les montre, l'erreur se dit à côté.
 * Et l'échec passe devant l'attente : inutile d'attendre les autres.
 */
export function etatDeLEcran(lectures: Lecture[]): EtatDeLEcran {
  const manque = lectures.filter(l => l.data === undefined)
  if (manque.some(l => l.error)) return 'erreur'
  return manque.length > 0 ? 'chargement' : 'pret'
}

/** Le `fetch` du navigateur rate avec un texte qui dépend du navigateur. */
const COUPURE = /failed to fetch|networkerror|load failed|network request failed/i

/** Ce que l'écran dit d'une lecture ratée : la coupure se nomme, la base parle telle quelle. */
export function messageDeLecture(
  erreur: unknown,
  enLigne: boolean = typeof navigator === 'undefined' || navigator.onLine !== false,
): string {
  const texte = erreur instanceof Error ? erreur.message.trim() : ''
  if (!enLigne || COUPURE.test(texte)) {
    return 'Je n’ai pas pu lire le budget : tu n’as plus de connexion.'
  }
  return texte ? `Je n’ai pas pu lire le budget : ${texte}` : 'Je n’ai pas pu lire le budget.'
}

export type Vide = { titre: string; texte: string; porte: 'revenus' | 'charges' | null }

/**
 * Un mois sans aucune ligne. Seul le mois COURANT propose de poser les charges :
 * un mois passé n'a pas à « commencer par là » (janvier à août 2026 n'ont jamais
 * rien eu), et un mois futur n'est pas ouvert — `useMois` ne l'ouvre jamais.
 * `nComptes` nul : les comptes ne sont pas lus, on ne propose aucune porte plutôt
 * que la mauvaise. UN SEUL geste, celui qui vient en premier : sans compte, une
 * charge posée ne dit pas d'où elle part.
 */
export function videDuMois(o: { mois: string; courant: string; nComptes: number | null }): Vide {
  if (o.mois > o.courant) {
    return { titre: 'Pas encore ouvert', texte: 'Ce mois s’ouvrira avec le mois.', porte: null }
  }
  if (o.mois < o.courant) {
    return { titre: 'Rien de posé', texte: 'Aucune charge n’était posée ce mois-là.', porte: null }
  }
  return {
    titre: 'Rien de posé', texte: 'Aucune charge ce mois-ci. On commence par là.',
    porte: o.nComptes === null ? null : o.nComptes === 0 ? 'revenus' : 'charges',
  }
}
