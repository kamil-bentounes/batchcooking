/**
 * Une question à deux boutons, posée AVANT un geste qu'on ne défait pas d'un toucher.
 *
 * Même forme que la confirmation d'« Interrompre la session » (Cuisine) : le focus entre sur le
 * bouton qui NE fait rien (« Non »), Échap répond « Non », et le focus revient à ce qui avait
 * ouvert la question. Deux cibles de 48 px, côte à côte, sous le pouce.
 */
import { useEffect, useRef, type ReactNode } from 'react'

export function Confirmation({ titre, texte, oui, non, surOui, surNon, enCours = false }: {
  /** La question, lue par les lecteurs d'écran comme le nom de la boîte. */
  titre: string
  texte?: ReactNode
  oui: string
  non: string
  surOui: () => void
  surNon: () => void
  enCours?: boolean
}) {
  const boutonNon = useRef<HTMLButtonElement>(null)
  /* Le focus à rendre : ce qui l'avait AVANT que la question s'ouvre. */
  const avant = useRef<Element | null>(null)
  useEffect(() => {
    avant.current = document.activeElement
    boutonNon.current?.focus()
    return () => {
      const a = avant.current
      if (a instanceof HTMLElement && a.isConnected) a.focus()
    }
  }, [])
  return (
    <div role="alertdialog" aria-label={titre}
         onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); surNon() } }}
         className="mt-4 rounded-[18px] bg-sable p-4">
      <p className="text-[16px] leading-snug">{titre}</p>
      {texte && <p className="mt-1.5 text-[14px] leading-[21px] text-doux">{texte}</p>}
      <div className="mt-3.5 flex gap-2.5">
        <button ref={boutonNon} type="button" onClick={surNon}
                className="grow min-h-12 rounded-[14px] bg-herbe text-fond text-[15px] font-medium">
          {non}
        </button>
        <button type="button" onClick={surOui} disabled={enCours}
                className="grow min-h-12 rounded-[14px] border border-herbe text-herbe text-[15px]
                           disabled:opacity-60">
          {oui}
        </button>
      </div>
    </div>
  )
}
