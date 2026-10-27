/** Ce que dit l'écran d'entrée selon son mode : textes, actions, chemins, et quand les portes s'ouvrent. */

export type Mode = 'mdp' | 'premiere' | 'oubli'

export const PHRASE = 'On cuisine le dimanche, on mange toute la semaine, et on sait ce que ça coûte.'

/** Ce que dit la feuille hors du mode « mot de passe » : ce que fait le lien qu'on va recevoir. */
export const CHAPEAU: Record<Mode, string> = {
  mdp: PHRASE,
  premiere: 'On t’envoie un lien. Il sert une fois, à prouver que l’adresse est '
    + 'la tienne — ensuite tu choisis ton mot de passe.',
  oubli: 'On t’envoie un lien de réinitialisation. Il te mènera droit à l’écran '
    + 'du nouveau mot de passe.',
}

export const ACTION: Record<Mode, string> = {
  mdp: 'Entrer',
  premiere: 'Recevoir le lien',
  oubli: 'Réinitialiser mon mot de passe',
}

/**
 * Les portes ne s'ouvrent que pour une connexion par mot de passe, et que le temps de l'envoi :
 * l'erreur remet `envoi` à faux, et elles se referment. Les deux autres chemins n'ouvrent rien,
 * ils envoient un lien.
 */
export const portesOuvertes = (mode: Mode, envoi: boolean) => mode === 'mdp' && envoi

/** Les deux chemins qu'on ne prend PAS, nommés pour ce qu'ils font. */
export const CHEMINS: Record<Mode, { vers: Mode; texte: string }[]> = {
  mdp: [{ vers: 'premiere', texte: 'Première connexion' }, { vers: 'oubli', texte: 'Mot de passe oublié' }],
  premiere: [{ vers: 'mdp', texte: 'J’ai déjà un mot de passe' }, { vers: 'oubli', texte: 'Mot de passe oublié' }],
  oubli: [{ vers: 'mdp', texte: 'J’ai déjà un mot de passe' }, { vers: 'premiere', texte: 'Première connexion' }],
}

