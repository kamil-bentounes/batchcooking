/**
 * « Retirées, encore à régler » (§ 3.7) : une charge mise de côté retirée garde sa feuille jusqu'au 31 décembre
 * de l'année qui suit son retrait. La facture d'une maison vendue arrive souvent après — la régularisation de
 * copropriété votée en avril. Sans ce chemin, la feuille ne s'ouvrirait plus.
 */
import { useEtatDeLAnnee, type Charge } from '../../lib/donnees/budget.ts'
import { texteDeLaRetiree } from '../../lib/budget/charges.ts'
import { Document } from './icones.tsx'

function Retiree({ charge, ouvrir }: { charge: Charge; ouvrir: () => void }) {
  const annee = Number(charge.archive_le!.slice(0, 4))
  const etat = useEtatDeLAnnee(charge.id, annee)
  return (
    <li className="py-3 flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[16px] font-semibold leading-tight">{charge.libelle}</span>
        <span className="block mt-0.5 text-[13.5px] text-doux">{texteDeLaRetiree(etat.data?.soldee, annee)}</span>
      </span>
      <button type="button" onClick={ouvrir}
              className="shrink-0 min-h-11 px-3.5 rounded-[14px] bg-piste text-herbe text-[14.5px] font-semibold
                         inline-flex items-center gap-2">
        <Document />Ajouter une facture
      </button>
    </li>
  )
}

export function Retirees({ charges, ouvrir }: { charges: Charge[]; ouvrir: (c: Charge) => void }) {
  if (charges.length === 0) return null
  return (
    <section aria-labelledby="retirees" className="rounded-[24px] bg-surface p-4 shadow-carte">
      <h2 id="retirees" className="titre text-[20px] font-semibold">Retirées, encore à régler</h2>
      <p className="mt-1 text-[13.5px] leading-snug text-doux">
        Une charge mise de côté retirée garde sa feuille jusqu’au 31 décembre de l’année qui suit son retrait.
      </p>
      <ul className="mt-1 divide-y divide-brume">
        {charges.map(c => <Retiree key={c.id} charge={c} ouvrir={() => ouvrir(c)} />)}
      </ul>
    </section>
  )
}
