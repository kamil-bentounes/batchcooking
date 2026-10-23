/**
 * Les écrans que l'aide peut proposer d'ouvrir (« Ouvrir l'écran »).
 *
 * Une LISTE FERMÉE : le modèle ne rend jamais une adresse, il rend l'identifiant d'une porte d'ici. Rendre une adresse
 * libre ferait de la réponse d'un modèle un lien cliquable — c'est exactement ce qu'on s'interdit.
 *
 * Doublée dans `src/lib/aide/portes.ts` (le front ne peut pas importer d'ici : le bundle de la fonction ne contient
 * que son dossier). `tests/aide.test.ts` vérifie que les deux listes sont identiques.
 */
export const PORTES = {
  hub:             { chemin: '/',                  bouton: 'Ouvrir l’accueil' },
  budget:          { chemin: '/budget',            bouton: 'Ouvrir le budget' },
  charges:         { chemin: '/charges',           bouton: 'Ouvrir les charges' },
  'budget-reglages': { chemin: '/budget-reglages', bouton: 'Ouvrir les réglages du budget' },
  epargne:         { chemin: '/epargne',           bouton: 'Ouvrir l’épargne' },
  inviter:         { chemin: '/reglages#inviter',  bouton: 'Ouvrir « Inviter quelqu’un »' },
  profil:          { chemin: '/profil',            bouton: 'Ouvrir mon profil' },
  motdepasse:      { chemin: '/motdepasse',        bouton: 'Ouvrir le mot de passe' },
  reglages:        { chemin: '/reglages',          bouton: 'Ouvrir les réglages' },
  objectifs:       { chemin: '/objectifs',         bouton: 'Ouvrir mes objectifs' },
  cuisine:         { chemin: '/cuisine-accueil',   bouton: 'Ouvrir la cuisine' },
  semaine:         { chemin: '/semaine',           bouton: 'Ouvrir la semaine' },
  stock:           { chemin: '/stock',             bouton: 'Ouvrir « Ce que j’ai »' },
  bilan:           { chemin: '/bilan',             bouton: 'Ouvrir le bilan' },
  choisir:         { chemin: '/choisir',           bouton: 'Ouvrir le choix des recettes' },
  magasin:         { chemin: '/magasin',           bouton: 'Ouvrir le magasin' },
  plan:            { chemin: '/plan',              bouton: 'Ouvrir le plan' },
  importer:        { chemin: '/importer',          bouton: 'Ouvrir l’import d’une recette' },
  inventer:        { chemin: '/inventer',          bouton: 'Ouvrir « Inventer »' },
  photo:           { chemin: '/photo',             bouton: 'Ouvrir la photo du frigo' },
  ticket:          { chemin: '/ticket',            bouton: 'Ouvrir le ticket de caisse' },
} as const

export type PorteId = keyof typeof PORTES

export const IDS_DES_PORTES = Object.keys(PORTES) as PorteId[]
