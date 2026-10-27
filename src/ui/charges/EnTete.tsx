/** L'en-tête d'un passage des charges : la sortie à gauche, l'aide et soi à droite (comme le hub et le budget). */
import { BoutonAide } from '../Aide.tsx'
import { initialeDe, useFoyer } from '../../lib/donnees/foyer.ts'
import { useRoute } from '../../lib/route.ts'

export function EnTete({ userId, retour, retourTexte }: { userId: string; retour: () => void; retourTexte: string }) {
  const { va } = useRoute()
  const { data: foyer } = useFoyer()
  const moi = foyer?.membres.find(m => m.id === userId)
  return (
    <header className="h-[54px] flex items-center justify-between gap-2.5 min-[900px]:h-[62px]">
      <button type="button" onClick={retour}
              className="-ml-2 pl-2 pr-3.5 inline-flex items-center gap-1.5 min-h-11 rounded-full text-[15px]
                         font-semibold text-doux hover:text-encre">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" /></svg>
        {retourTexte}
      </button>
      <span className="flex items-center">
        <BoutonAide />
        <button type="button" onClick={() => va('/profil')} aria-label="Mon profil"
                className="w-11 h-11 -mr-2 grid place-items-center">
          <span className="w-[34px] h-[34px] rounded-full bg-herbe text-fond text-[13px] font-bold
                           grid place-items-center">
            {initialeDe(moi?.display_name)}
          </span>
        </button>
      </span>
    </header>
  )
}
