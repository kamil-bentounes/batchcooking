/**
 * Une panne de réseau se dit en français, et ne se confond jamais avec un refus.
 *
 * Grand test, parcours « nouveau venu » (22/10), réseau coupé pendant un geste :
 *   · « Se connecter » répondait « E-mail ou mot de passe incorrect. » — la panne prise pour
 *     une erreur de saisie, à quelqu'un qui avait le bon ;
 *   · « Mot de passe oublié » répondait « le lien vient de partir » ;
 *   · inviter, accepter une invitation, enregistrer son profil affichaient « Failed to fetch »
 *     ou « TypeError: Failed to fetch ».
 */
export const PAS_DE_RESEAU = 'Pas de réseau : vérifie ta connexion, puis réessaie.'

const PANNE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|internet disconnected/i

/** Cette erreur est une panne de `fetch` (réseau coupé, serveur injoignable), pas un refus. */
export function estUnePanneDeReseau(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const { name = '', message = '' } = e as { name?: string; message?: string }
  return name === 'AuthRetryableFetchError' || PANNE.test(String(message))
}

/** Ce qu'on affiche : la phrase française pour une panne, le message tel quel sinon. */
export function enFrancais(message: string): string {
  return PANNE.test(message) ? PAS_DE_RESEAU : message
}
