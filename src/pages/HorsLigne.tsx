/**
 * L'appli s'ouvre sans réseau : on le dit, on ne conclut rien sur le foyer.
 *
 * Elle reste installée (le service worker sert la coque), mais toutes les données sont
 * en base. Sans cet écran, la panne se lisait « Il te faut une invitation ».
 */
import { useEffect } from 'react'
import { PAS_DE_RESEAU } from '../lib/reseau.ts'

export function HorsLigne({ reessayer }: { reessayer: () => void }) {
  // Le réseau revient : on relit tout seul, sans rien demander.
  useEffect(() => {
    window.addEventListener('online', reessayer)
    return () => window.removeEventListener('online', reessayer)
  }, [reessayer])

  return (
    <main className="min-h-dvh grid place-items-center px-6 text-center">
      <div className="max-w-sm">
        <h1 className="titre text-[34px]">Pas de réseau</h1>
        <p role="alert" className="mt-3.5 text-[15px] text-doux">{PAS_DE_RESEAU}</p>
        <button onClick={reessayer}
                className="mt-8 w-full h-[52px] rounded-[16px] bg-herbe text-fond text-[16px] font-medium">
          Réessayer
        </button>
      </div>
    </main>
  )
}
