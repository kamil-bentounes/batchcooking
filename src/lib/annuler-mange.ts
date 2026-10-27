/**
 * Annuler « Je l'ai mangé » (migration 0129) : ce que l'écran sait, hors de tout composant.
 */
import { useCallback, useState } from 'react'
import type { Case } from './donnees/barquettes.ts'
import { jourAbrege } from './ranger.ts'
import { jour } from './semaine.ts'

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
 * Ce que dit la puce d'un repas mangé. L'heure notée est celle de la SAISIE : le même jour que la case, c'est l'heure
 * du repas (« Mangé à 12 h 40 ») ; un autre jour (on a noté hier ce matin), dire « Mangé à 9 h 12 » serait faux, on dit
 * quand on l'a noté : « Noté mangé le mar. 27 oct. à 9 h 12 ». Sans heure lisible : « Mangé ».
 */
export function puceDuMange(eatenAt: string | null | undefined, jourDeLaCase: string): string {
  const heure = heureDite(eatenAt)
  if (!heure) return 'Mangé'
  const d = new Date(eatenAt!)
  return jour(d) === jourDeLaCase ? `Mangé à ${heure}` : `Noté mangé le ${jourAbrege(d)} à ${heure}`
}

/**
 * Un délai qu'on peut suspendre : `demarre`, `pause` (le reste est gardé), puis `demarre` reprend là où il en était ;
 * `arrete` (le démontage) l'éteint pour de bon. `surFin` n'est appelé qu'une fois, jamais après `arrete`.
 */
export class Minuteur {
  private reste: number
  private depuis = 0
  private t: ReturnType<typeof setTimeout> | null = null
  private fini = false
  private surFin: () => void
  constructor(delai: number, surFin: () => void) { this.reste = delai; this.surFin = surFin }
  demarre() {
    if (this.t !== null || this.fini) return
    this.depuis = Date.now()
    this.t = setTimeout(() => { this.t = null; this.fini = true; this.surFin() }, this.reste)
  }
  pause() {
    if (this.t === null) return
    clearTimeout(this.t)
    this.t = null
    this.reste = Math.max(0, this.reste - (Date.now() - this.depuis))
  }
  arrete() { this.pause(); this.fini = true }
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

/**
 * Après une annulation, la ligne sur laquelle on a appuyé disparaît (hub, accueil) et le focus avec elle : on le rend à
 * un élément stable, la carte du jour (ou, à défaut, la page). À appeler une fois les lectures rafraîchies.
 */
export function rendLeFocusALaCarteDuJour() {
  const cible = document.querySelector<HTMLElement>('[data-carte="repas"], [data-carte="geste"]')
    ?? document.querySelector<HTMLElement>('main')
  if (!cible) return
  if (!cible.hasAttribute('tabindex')) cible.tabIndex = -1
  cible.focus({ preventScroll: true })
}
