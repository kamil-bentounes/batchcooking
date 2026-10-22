/**
 * L'appli s'ouvre sans réseau — ou sans que la base réponde : on le dit, on ne conclut rien sur
 * le foyer.
 *
 * Elle reste installée (le service worker sert la coque), mais toutes les données sont
 * en base. Sans cet écran, la panne se lisait « Il te faut une invitation ».
 *
 * `panne` : le réseau manque (« Hors ligne »), ou il est là et la base ne répond pas — 502, 503,
 * délai dépassé, projet en pause : l'erreur d'une lecture n'est jamais « aucun foyer ».
 */
import { useEffect } from 'react'
import { LA_BASE_NE_REPOND_PAS, PAS_DE_RESEAU } from '../lib/reseau.ts'

export function HorsLigne({ reessayer, panne = 'reseau' }:
  { reessayer: () => void; panne?: 'reseau' | 'base' }) {
  // Le réseau revient : on relit tout seul, sans rien demander.
  useEffect(() => {
    window.addEventListener('online', reessayer)
    return () => window.removeEventListener('online', reessayer)
  }, [reessayer])

  return (
    <main className="min-h-dvh grid place-items-center px-6 text-center">
      <div className="max-w-sm">
        <h1 className="titre text-[34px]">{panne === 'base' ? 'Ça ne répond pas' : 'Hors ligne'}</h1>
        <p role="alert" className="mt-3.5 text-[15px] text-doux">
          {panne === 'base' ? LA_BASE_NE_REPOND_PAS : PAS_DE_RESEAU}
        </p>
        <button onClick={reessayer}
                className="mt-8 w-full h-[52px] rounded-[16px] bg-herbe text-fond text-[16px] font-medium">
          Réessayer
        </button>
      </div>
    </main>
  )
}
