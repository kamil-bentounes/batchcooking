/**
 * La relecture du foyer a échoué PENDANT l'usage : l'écran reste, la panne se dit à côté.
 *
 * Elle remplaçait l'appli entière par « Hors ligne » : le formulaire à moitié rempli, la feuille
 * ouverte, tout s'en allait pour un jeton rafraîchi pendant une coupure de dix secondes. Le
 * bandeau se pose par-dessus, sans rien démonter ; le réseau qui revient relit tout seul.
 */
import { useEffect } from 'react'

export function BandeauDePanne({ message, reessayer }: { message: string; reessayer: () => void }) {
  useEffect(() => {
    window.addEventListener('online', reessayer)
    return () => window.removeEventListener('online', reessayer)
  }, [reessayer])
  return (
    <div role="alert"
         className="fixed inset-x-0 top-0 z-50 bg-encre text-fond px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
      <div className="mx-auto w-full max-w-lg flex items-center gap-3">
        <p className="grow text-[14px] leading-snug">{message} Ce que tu as saisi est gardé.</p>
        <button onClick={reessayer}
                className="min-h-11 px-3 rounded-full bg-fond/15 text-[14px] font-medium shrink-0">
          Réessayer
        </button>
      </div>
    </div>
  )
}
