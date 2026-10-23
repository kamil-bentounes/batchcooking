/**
 * Les questions proposées dans la feuille : celles de l'écran où l'on est, puis les plus fréquentes.
 *
 * Chacune doit avoir une réponse DANS le manuel : `scripts/banc-aide.mjs` les pose au vrai modèle et signale celle
 * qui ne reçoit pas un « oui ». Une suggestion sans réponse est pire qu'une absence de suggestion.
 */

/** Les écrans qui portent le « ? » dans leur en-tête : le bouton flottant s'y efface. */
export function aLeBoutonDansSonEntete(ici: string): boolean {
  return ici === '/' || ici === '/budget' || ici === '/cuisine-accueil' || /^\/budget\/\d{4}-\d{2}$/.test(ici)
}

export const SUR_CET_ECRAN: Record<string, string[]> = {
  '/': ['À quoi servent la cuisine et le budget ?'],
  '/budget': ['Comment est calculé ce qu’il me reste ?', 'Comment clôturer un mois ?'],
  '/charges': ['À quoi sert « en commun » ?', 'Pourquoi une charge annuelle se met de côté chaque mois ?'],
  '/budget-reglages': ['Comment le partage entre nous est-il calculé ?'],
  '/epargne': ['C’est quoi une poche d’épargne ?'],
  '/reglages': ['Comment inviter quelqu’un ?'],
  '/profil': ['À quoi sert ma date d’arrivée ?'],
  '/cuisine-accueil': ['Comment se déroule une session de cuisine ?'],
}

export const SOUVENT: string[] = ['Comment inviter Thauba ?', 'C’est quoi le prorata ?']

/** Les suggestions d'un écran : celles de la route (`/budget/2026-10` compte pour `/budget`). */
export function surCetEcran(ici: string): string[] {
  const route = /^\/budget\/\d{4}-\d{2}$/.test(ici) ? '/budget' : ici
  return SUR_CET_ECRAN[route] ?? []
}

/** L'écran tel que la fonction le connaît pour départager les pages : un mois précis vaut sa famille d'écrans
 *  (`/budget/2026-10` → `/budget`, `/cloture/2026-09` → `/cloture`). */
export function ecranPourLAide(ici: string): string {
  return ici.replace(/^(\/(?:budget|cloture))\/\d{4}-\d{2}$/, '$1')
}
