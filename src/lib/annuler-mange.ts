/**
 * Annuler « Je l'ai mangé » (migration 0129) : ce que l'écran sait, hors de tout composant.
 */
import { useCallback, useState } from 'react'
import type { Case } from './donnees/barquettes.ts'

/** Le bandeau « Noté : mangé. » reste 6 secondes. */
export const DELAI_DU_BANDEAU = 6000

/** « 12 h 40 » : l'heure à laquelle le repas a été noté mangé, dite comme le reste de l'appli (`ranger.ts`). */
export function heureDite(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * La case qu'on vient de noter mangé : le bandeau d'annulation est pour elle, et pour elle seule. La page la pose au
 * succès de « Je l'ai mangé » ; le bandeau la lâche au bout de 6 secondes, ou quand on l'a annulé.
 */
export function useNoteRecente() {
  const [notee, setNotee] = useState<string | null>(null)
  const note = useCallback((idDeLaCase: string) => setNotee(idDeLaCase), [])
  const clos = useCallback(() => setNotee(null), [])
  return { notee, note, clos }
}

const ORDRE_DES_REPAS = ['petit_dejeuner', 'dejeuner', 'collation', 'diner']

/**
 * Mes cases d'un jour qui sont « mangé » et qu'on peut nommer (un plat, ou « autre chose »), dans l'ordre de la journée.
 * C'est ce que le hub et l'accueil montrent sous la carte du repas : la carte sombre, elle, passe au repas suivant.
 */
export function mesRepasManges(cases: Case[], moi: string, jourDit: string): Case[] {
  return cases
    .filter(c => c.user_profile_id === moi && c.day === jourDit && c.state === 'mange'
      && (c.portion !== null || c.extras.length > 0))
    .sort((a, b) => ORDRE_DES_REPAS.indexOf(a.meal) - ORDRE_DES_REPAS.indexOf(b.meal) || a.id.localeCompare(b.id))
}
