/**
 * Ce que l'écran dit quand un geste sur le cycle échoue (hors ligne, RLS, 4xx).
 *
 * Ces gestes — « + », « Retirer », les parts — s'écrivaient sans un mot en cas
 * d'échec : la ligne restait comme elle était, et la personne croyait avoir
 * retenu, ou retiré. Le message de la base (« new row violates… ») ne lui dit
 * rien : on dit le geste, et si c'est le réseau, on le dit.
 */
export type Geste = 'retenir' | 'retirer' | 'parts' | 'cible'

const CE_QUI_A_RATE: Record<Geste, string> = {
  retenir: 'Je n’ai pas pu retenir cette recette.',
  retirer: 'Je n’ai pas pu retirer cette recette.',
  parts: 'Je n’ai pas pu changer les parts.',
  cible: 'Je n’ai pas pu changer les parts visées.',
}

/** Le `fetch` du navigateur rate avec un texte qui dépend du navigateur. */
const COUPURE = /failed to fetch|networkerror|load failed|network request failed/i

export function messageEchec(
  geste: Geste,
  erreur: unknown,
  enLigne: boolean = typeof navigator === 'undefined' || navigator.onLine !== false,
): string {
  const texte = erreur instanceof Error ? erreur.message : ''
  const coupure = !enLigne || COUPURE.test(texte)
  return `${CE_QUI_A_RATE[geste]} ${coupure ? 'Tu n’as plus de connexion.' : 'Réessaie dans un instant.'}`
}
