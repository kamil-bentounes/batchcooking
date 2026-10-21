/**
 * Les quatre gestes du mois (§ 3.1, point 3) : des boutons ronds de 58 px, leur
 * libellé dessous. « Déclarer », en safran, est le geste de tous les jours.
 */
import type { ReactNode } from 'react'

const Icone = ({ children }: { children: ReactNode }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

export function Gestes({ va, declarer }: { va: (v: string) => void; declarer: () => void }) {
  const gestes: { texte: string; agir: () => void; safran?: boolean; icone: ReactNode }[] = [
    { texte: 'Mes charges', agir: () => va('/charges'),
      icone: <Icone><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></Icone> },
    { texte: 'Déclarer', agir: declarer, safran: true,
      icone: <Icone><circle cx="12" cy="12" r="8" /><path d="M12 8v8M8 12h8" /></Icone> },
    { texte: 'Revenus', agir: () => va('/budget-reglages'),
      icone: <Icone><rect x="3.5" y="6.5" width="17" height="12" rx="2.5" />
                    <path d="M3.5 10h17M15.5 14.5h2" /></Icone> },
    { texte: 'Épargne', agir: () => va('/epargne'),
      icone: <Icone><path d="M12 20v-7" /><path d="M12 13c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6z" />
                    <path d="M12 15c0-2.8-2-5-5-5 0 2.8 2 5 5 5z" /></Icone> },
  ]
  return (
    <nav aria-label="Les gestes du mois" className="mt-6 grid grid-cols-4 gap-2">
      {gestes.map(g => (
        <button key={g.texte} onClick={g.agir} className="flex flex-col items-center gap-2 min-h-11">
          <span className={`w-[58px] h-[58px] rounded-full grid place-items-center shadow-carte
                            ${g.safran ? 'bg-safran text-encre' : 'bg-surface text-herbe'}`}>
            {g.icone}
          </span>
          <span className="text-[14px] font-medium">{g.texte}</span>
        </button>
      ))}
    </nav>
  )
}
