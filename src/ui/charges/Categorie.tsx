/**
 * Une catégorie des charges : sa photo, sa pastille, son nom, le nombre de lignes, son total par mois.
 * Ouverte d'office ; ce qu'on a replié se retient par appareil (comme l'écran du mois, sous d'autres clés).
 */
import { useState, type ReactNode } from 'react'
import { eurosRonds } from '../../lib/donnees/budget.ts'
import { bascule, lisOuvertes } from '../../lib/budget/ouvertes.ts'
import { Photo } from '../budget/Photo.tsx'
import { Chevron } from './icones.tsx'

export function CategorieDeCharges({ cle, nom, clair, total, nLignes, children }: {
  cle: string; nom: string; clair: string; total: number; nLignes: number; children: ReactNode
}) {
  const [ouverte, setOuverte] = useState(() => lisOuvertes()[`charges:${cle}`] ?? true)
  /* On retient hors de la mise à jour : un effet de bord dans `setOuverte(o => …)` tournerait deux fois en mode strict. */
  const change = () => setOuverte(bascule(`charges:${cle}`, ouverte))
  return (
    <section aria-label={`Catégorie ${nom}`} data-total={total} className="rounded-[22px] bg-surface shadow-carte">
      <button type="button" onClick={change} aria-expanded={ouverte}
              className="w-full min-h-[76px] px-3.5 py-3 flex items-center gap-3 max-[380px]:gap-2.5 text-left rounded-[22px]">
        <Photo categorie={cle} taille={54} />
        <span className="grow min-w-0">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: clair }} />
            <span className="text-[17px] font-semibold leading-tight">{nom}</span>
          </span>
          <span className="block text-[13.5px] text-doux">{nLignes} ligne{nLignes > 1 ? 's' : ''}</span>
        </span>
        <span className="chiffre text-[22px] max-[380px]:text-[19px] font-semibold whitespace-nowrap">{eurosRonds(total)}</span>
        <span className="text-doux"><Chevron ouvert={ouverte} /></span>
      </button>
      {ouverte && (
        <ul className="mx-3.5 pb-1 border-t border-brume divide-y divide-brume">{children}</ul>
      )}
    </section>
  )
}
