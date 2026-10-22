/**
 * Une catégorie du mois (§ 3.1, point 10) : sa photo, sa pastille, son nom, son
 * total, ses lignes. Ouverte d'office si elle a des montants à dire, repliée
 * sinon ; l'état choisi se retient par appareil (`src/lib/budget/ouvertes.ts`).
 */
import { useState } from 'react'
import type { Charge, Depense, Saisie } from '../../lib/donnees/budget.ts'
import { infoCategorie } from '../../lib/budget/categories.ts'
import { montant, type CategorieDuMois } from '../../lib/budget/mois.ts'
import { bascule, lisOuvertes } from '../../lib/budget/ouvertes.ts'
import { Chevron } from './icones.tsx'
import { LigneDuMois, type Geste } from './Ligne.tsx'
import { Photo } from './Photo.tsx'

export function Categorie({ categorie, saisies, charges, clos, ouvrir }: {
  categorie: CategorieDuMois<Depense>; saisies: Saisie[]; charges: Map<string, Charge>
  clos: boolean; ouvrir: (geste: Geste, ligne: Depense) => void
}) {
  const info = infoCategorie(categorie.cle)
  const [ouverte, setOuverte] = useState(() => lisOuvertes()[categorie.cle] ?? categorie.aDire > 0)
  /* On retient hors de la mise à jour : un effet de bord dans `setOuverte(o => …)` tournerait
     deux fois en mode strict. */
  const change = () => setOuverte(bascule(categorie.cle, ouverte))
  const n = categorie.lignes.length
  return (
    <section aria-label={`Catégorie ${info.nom}`} data-total={categorie.total}
             className="rounded-[22px] bg-surface shadow-carte">
      <button onClick={change}aria-expanded={ouverte}
              className="w-full p-3.5 flex items-center gap-3.5 max-[380px]:gap-2.5 text-left">
        <Photo categorie={categorie.cle} taille={54} />
        <span className="grow min-w-0">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: info.clair }} />
            {/* Ni coupé ni « Vie coura… » : à 360 px le nom passe à la ligne plutôt que de se tronquer. */}
            <span className="text-[17px] font-semibold leading-tight">{info.nom}</span>
          </span>
          <span className="block text-[14px]"
                style={{ color: categorie.aDire > 0 ? 'var(--color-ocre)' : 'var(--color-doux)' }}>
            {categorie.aDire > 0
              ? `${categorie.aDire} montant${categorie.aDire > 1 ? 's' : ''} à dire`
              : `${n} ligne${n > 1 ? 's' : ''}`}
          </span>
        </span>
        <span className="chiffre text-[23px] max-[380px]:text-[20px] whitespace-nowrap">{montant(categorie.total)}</span>
        <span className="text-doux"><Chevron ouvert={ouverte} /></span>
      </button>
      {ouverte && (
        <ul className="mx-3.5 pb-1 border-t border-brume divide-y divide-brume">
          {categorie.lignes.map(l => (
            <LigneDuMois key={l.id} ligne={l} saisies={saisies} clos={clos} ouvrir={ouvrir}
                         charge={l.charge_id ? charges.get(l.charge_id) : undefined} />
          ))}
        </ul>
      )}
    </section>
  )
}
