/**
 * La feuille qui monte du bas (§ 3.2) : un `<dialog>` modal, à la poignée.
 *
 * Un vrai `<dialog>` : le focus y entre, Échap la ferme, le reste de l'écran
 * devient inerte — sans bibliothèque. Le fond assombri est son `::backdrop`
 * (`src/index.css`, `dialog.feuille`). Toucher le fond ferme la feuille.
 */
import { useEffect, useRef, type ReactNode } from 'react'

export function Feuille({ ouverte = true, fermer, titre, children }: {
  ouverte?: boolean; fermer: () => void; titre: string; children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (ouverte && !d.open) d.showModal()
    if (!ouverte && d.open) d.close()
  }, [ouverte])
  return (
    <dialog ref={ref} aria-label={titre} onClose={fermer}
            onClick={e => { if (e.target === ref.current) fermer() }}
            className="feuille bg-fond text-encre rounded-t-[28px] overflow-y-auto">
      <div className="px-4 pt-2.5 pb-8">
        <div aria-hidden="true" className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-brume" />
        {ouverte && children}
      </div>
    </dialog>
  )
}
