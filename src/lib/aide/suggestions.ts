/**
 * Les questions proposées dans la feuille : celles de l'écran où l'on est, puis les plus fréquentes.
 *
 * Chacune doit avoir une réponse DANS le manuel : `scripts/banc-aide.mjs` les pose au vrai modèle et signale celle
 * qui ne reçoit pas un « oui ». Une suggestion sans réponse est pire qu'une absence de suggestion.
 */

/**
 * Les écrans de l'appli (cases du `switch` de `App.tsx`) qui n'ont PAS de « ? » dans leur en-tête : le bouton y flotte.
 * Tout le reste — `/`, `/budget`, un mois du budget, `/cuisine-accueil`, ET toute adresse inconnue, que l'appli
 * traite comme `/` — porte le sien, et le bouton flottant s'y efface : deux « ? » se superposeraient. Un test lit
 * `App.tsx` pour qu'un écran ajouté ne soit pas oublié ici.
 */
export const SANS_BOUTON_D_ENTETE = [
  '/charges', '/budget-reglages', '/epargne', '/profil', '/semaine', '/frigo', '/bilan', '/choisir', '/magasin',
  '/plan', '/cuisine', '/dressage', '/inventer', '/photo', '/ticket', '/peser', '/importer', '/objectifs',
  '/reglages', '/motdepasse', '/mois-type', '/rappels',
]

export function aLeBoutonDansSonEntete(ici: string): boolean {
  if (SANS_BOUTON_D_ENTETE.includes(ici)) return false
  if (/^\/cloture\/\d{4}-(0[1-9]|1[0-2])$/.test(ici)) return false
  if (/^\/cuisine\/./.test(ici)) return false
  if (/^\/toutes-les-charges(\/|$)/.test(ici)) return false
  return true
}

export const SUR_CET_ECRAN: Record<string, string[]> = {
  '/': ['À quoi servent la cuisine et le budget ?'],
  '/budget': ['Comment est calculé ce qu’il me reste ?', 'Comment clôturer un mois ?'],
  '/charges': ['À quoi sert « en commun » ?', 'Pourquoi une charge annuelle se met de côté chaque mois ?'],
  '/budget-reglages': ['Comment le partage entre nous est-il calculé ?'],
  '/epargne': ['C’est quoi une poche d’épargne ?'],
  '/mois-type': ['Comment est calculé le mois type ?', 'Combien chacun paie par mois ?'],
  '/toutes-les-charges': ['Comment filtrer les charges par personne ?'],
  '/reglages': ['Comment inviter quelqu’un ?'],
  '/rappels': ['Comment activer un rappel par mail ?', 'Thauba voit-elle mes rappels ?'],
  '/profil': ['À quoi sert ma date d’arrivée ?'],
  '/cuisine-accueil': ['Comment se déroule une session de cuisine ?'],
  '/semaine': ['Comment choisir ce que je mange ce soir ?', 'Comment changer un repas le jour même ?'],
  '/frigo': ['Comment congeler ou sortir une barquette du congélateur ?', 'Que dit l’aimant sur la porte du frigo ?'],
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
    .replace(/^\/toutes-les-charges\/.+$/, '/toutes-les-charges')
}
