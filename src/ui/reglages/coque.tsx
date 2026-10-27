/**
 * La coque de « Réglages » et de « Mes objectifs » : un retour en haut à gauche, le titre, et le sélecteur
 * « Objectifs | Réglages » (il remplace l'ancienne barre « Accueil · Objectifs · Réglages »).
 *
 * ⚠️ Des BOUTONS, pas des `<a href>` : un lien rechargeait la page, et c'est ce rechargement qui avait cassé le
 *    correctif de `PASSWORD_RECOVERY` (l'histoire est dans `src/App.tsx`). Le routage reste en client.
 */
import type { ReactNode } from 'react'
import { useRoute } from '../../lib/route.ts'

function Selecteur({ actif }: { actif: 'objectifs' | 'reglages' }) {
  const { va } = useRoute()
  const onglet = (cle: 'objectifs' | 'reglages', vers: string, texte: string) => (
    <button type="button" onClick={() => va(vers)} aria-current={actif === cle ? 'page' : undefined}
            className={`h-11 flex-1 rounded-[17px] text-[15px] transition-colors
                        ${actif === cle ? 'bg-surface font-semibold text-encre shadow-[0_1px_3px_rgba(28,43,35,.12)]'
                                        : 'font-medium text-encre/80 hover:text-encre'}`}>
      {texte}
    </button>
  )
  return (
    <nav aria-label="Objectifs ou réglages" className="mt-6 flex gap-1.5 rounded-[22px] bg-piste p-[5px]">
      {onglet('objectifs', '/objectifs', 'Objectifs')}
      {onglet('reglages', '/reglages', 'Réglages')}
    </nav>
  )
}

export function PageReglages({ titre, chapeau, actif, children }:
  { titre: string; chapeau?: string; actif: 'objectifs' | 'reglages'; children: ReactNode }) {
  const { va } = useRoute()
  return (
    <main className="min-h-dvh px-5 pt-14 pb-16">
      <div className="mx-auto w-full max-w-lg">
        {/* L'accueil de la CUISINE : on arrive ici depuis elle, pas depuis le choix entre univers. */}
        <button type="button" onClick={() => va('/cuisine-accueil')}
                className="-mt-3 -ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-[15px] text-doux hover:text-encre">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 5l-7 7 7 7" />
          </svg>
          Accueil
        </button>
        <h1 className="titre mt-3 text-[38px] font-semibold">{titre}</h1>
        {chapeau && <p className="mt-2 max-w-[46ch] text-[15px] text-doux">{chapeau}</p>}
        <Selecteur actif={actif} />
        <div className="mt-6">{children}</div>
      </div>
    </main>
  )
}
