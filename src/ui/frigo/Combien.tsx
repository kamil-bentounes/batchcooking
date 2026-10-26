/**
 * « Combien ? » : le geste porte sur une part ou sur plusieurs, et c'est la personne qui le dit.
 * Un compteur − / + de 1 à `max`, un bouton qui fait, un bouton qui renonce ; le focus entre sur le compteur
 * et revient à ce qui avait ouvert la question.
 */
import { useEffect, useRef, useState } from 'react'

export function Combien({ titre, max, defaut, oui, surOui, surNon, enCours = false }: {
  titre: string
  max: number
  defaut: number
  /** Le verbe du bouton : « Congeler », « Jeter », « Sortir ». Le nombre s'y ajoute. */
  oui: string
  surOui: (n: number) => void
  surNon: () => void
  enCours?: boolean
}) {
  const [n, setN] = useState(Math.min(Math.max(1, defaut), max))
  const reglage = useRef<HTMLDivElement>(null)
  const avant = useRef<Element | null>(null)
  useEffect(() => {
    avant.current = document.activeElement
    reglage.current?.querySelector('button')?.focus()
    return () => {
      const a = avant.current
      if (a instanceof HTMLElement && a.isConnected) a.focus()
    }
  }, [])
  return (
    <div role="group" aria-label={titre}
         onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); surNon() } }}
         className="mt-4 rounded-[18px] bg-sable p-4">
      <p className="text-[16px] leading-snug">{titre}</p>
      <div ref={reglage} className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => setN(v => Math.max(1, v - 1))} disabled={n <= 1}
                aria-label="Une de moins"
                className="size-11 rounded-[14px] bg-surface text-[22px] leading-none disabled:opacity-40">−</button>
        <output aria-live="polite" className="chiffre min-w-10 text-center text-[28px]">{n}</output>
        <button type="button" onClick={() => setN(v => Math.min(max, v + 1))} disabled={n >= max}
                aria-label="Une de plus"
                className="size-11 rounded-[14px] bg-surface text-[22px] leading-none disabled:opacity-40">+</button>
        <span className="text-[14px] text-doux">sur {max}</span>
      </div>
      <div className="mt-3.5 flex gap-2.5">
        <button type="button" onClick={() => surOui(n)} disabled={enCours}
                className="grow min-h-12 rounded-[14px] bg-herbe text-[15px] font-medium text-fond disabled:opacity-60">
          {oui} {n}
        </button>
        <button type="button" onClick={surNon}
                className="grow min-h-12 rounded-[14px] border border-herbe text-[15px] text-herbe">
          Annuler
        </button>
      </div>
    </div>
  )
}
