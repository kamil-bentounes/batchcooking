/**
 * Les deux raccourcis du hub : « Noter une dépense » et « Envie spéciale ». Ils mènent aux écrans qui existent
 * déjà pour ça — le budget, d'où se déclare une dépense ; l'écran d'invention de recette — et ne font rien d'autre.
 */
import type { ReactNode } from 'react'

const Icone = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true" className="size-[22px] shrink-0 text-herbe min-[900px]:size-[26px]">
    {children}
  </svg>
)

export function Raccourcis({ va }: { va: (v: string) => void }) {
  const portes: { texte: string; vers: string; icone: ReactNode }[] = [
    { texte: 'Noter une dépense', vers: '/budget',
      icone: <Icone><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></Icone> },
    { texte: 'Envie spéciale', vers: '/inventer',
      icone: <Icone><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
                    <path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></Icone> },
  ]
  return (
    <nav aria-label="Raccourcis"
         className="grid grid-cols-2 gap-2.5 max-[899px]:order-5 max-[899px]:col-span-2">
      {portes.map(p => (
        <button key={p.texte} type="button" onClick={() => va(p.vers)}
                className="flex min-h-[52px] items-center gap-2 rounded-2xl bg-surface px-3 text-left text-[14px] font-semibold shadow-carte
                           min-[900px]:min-h-[88px] min-[900px]:flex-col min-[900px]:items-start min-[900px]:justify-center min-[900px]:gap-2 min-[900px]:rounded-[20px] min-[900px]:p-3.5 min-[900px]:text-[15px]">
          {p.icone}{p.texte}
        </button>
      ))}
    </nav>
  )
}
