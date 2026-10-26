/**
 * « Aujourd'hui », tenu à jour : une page ouverte hier soir ne reste pas sur hier.
 *
 * Le jour se relit quand la page redevient visible (le téléphone qu'on rallume le lendemain matin) et à minuit, heure
 * locale (la page qui reste ouverte sur la table de la cuisine). `maintenant()` est l'horloge du banc en mode
 * développement : un jour joué avance de la même façon.
 */
import { useEffect, useState } from 'react'
import { aujourdhui, maintenant } from './horloge.ts'

/** Le plus long délai qu'un `setTimeout` accepte (2³¹ − 1 ms) ; au-delà il se déclenche tout de suite. */
const DELAI_MAX = 2_147_483_647

/** Le délai jusqu'au prochain minuit local, une seconde de marge (le changement d'heure ne fait pas dormir plus d'un jour). */
export function delaiJusquAMinuit(d: Date): number {
  const minuit = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 1)
  return Math.min(Math.max(minuit.getTime() - d.getTime(), 1_000), DELAI_MAX)
}

export function useJourLocal(): string {
  const [j, setJ] = useState(() => aujourdhui())
  useEffect(() => {
    const relit = () => setJ(aujourdhui())
    const surVisible = () => { if (document.visibilityState === 'visible') relit() }
    document.addEventListener('visibilitychange', surVisible)
    let minuteur: ReturnType<typeof setTimeout>
    const arme = () => {
      minuteur = setTimeout(() => { relit(); arme() }, delaiJusquAMinuit(maintenant()))
    }
    arme()
    return () => { document.removeEventListener('visibilitychange', surVisible); clearTimeout(minuteur) }
  }, [])
  return j
}
