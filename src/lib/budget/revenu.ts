/**
 * Le revenu qu'on demande de confirmer.
 *
 * Un net mensuel de 0,50 € s'enregistrait sans un mot : « 2 400 » tapé « 2,40 » ou « 0,5 » fait
 * un partage au prorata faux pour tous les mois suivants, et personne ne regarde ce chiffre. Au
 * dessous de 100 € par mois (et au-dessus de zéro, que le bouton refuse déjà), on repose la
 * question avant d'écrire.
 */
import { euros } from '../donnees/budget.ts'

/** 100 € par mois, en centimes. */
export const REVENU_SANS_QUESTION_CENTS = 10_000

export function revenuAConfirmer(cents: number | null): boolean {
  return cents !== null && cents > 0 && cents < REVENU_SANS_QUESTION_CENTS
}

export const questionRevenu = (cents: number): string =>
  `Tu déclares ${euros(cents)} par mois. C’est bien ça ?`
