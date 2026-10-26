/**
 * Les courses de la période : ce qui est SORTI du compte en très gros, la jauge du budget, et le reste en clair.
 *
 * Le payé ne se mélange pas à l'estimé : la jauge ne se remplit qu'avec les tickets, et ce qui reste estimé se
 * dit à part, jamais additionné (lot 5).
 */
import type { Budget } from '../../lib/suivi.ts'
import { Appareil } from '../frigo/PlatImage.tsx'
import { fmt } from './format.ts'

export function Courses({ b }: { b: Budget }) {
  const paye = fmt(b.paye)
  /* « 1234,56 € » ne tient plus à 56 px sur 320 px : le chiffre rétrécit avant de déborder. */
  const taille = paye.length > 6 ? 44 : 56
  return (
    <section className="rounded-[26px] bg-surface p-5 shadow-carte" aria-label="Budget">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <p className="chiffre font-semibold leading-[0.95]" style={{ fontSize: taille }}>
            {paye} <span style={{ fontSize: taille * 0.57 }}>€</span>
          </p>
          <p className="mt-1.5 text-[13px] text-doux">payés</p>
        </div>
        {b.plafond !== null && (
          <div className="text-right">
            <p className="chiffre text-[26px] font-semibold leading-none text-doux">{fmt(b.plafond)} €</p>
            <p className="mt-1.5 text-[13px] text-doux">de budget sur la période</p>
          </div>
        )}
      </div>

      {b.part !== null && (
        <>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-piste">
            <div className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none
                             ${b.part > 1 ? 'bg-ocre' : 'bg-herbe'}`}
                 style={{ width: `${Math.min(100, b.part * 100)}%` }} />
          </div>
          {b.part > 1 && (
            <p className="mt-2 text-[14px] font-semibold text-ocre">
              {fmt(b.paye - b.plafond!)} € au-dessus du budget.
            </p>
          )}
        </>
      )}

      {(b.parPortion !== null || b.estimeRestant > 0) && (
        <p className="mt-3 font-semibold">
          {b.parPortion !== null && <>{fmt(b.parPortion)} € la part</>}
          {b.parPortion !== null && b.estimeRestant > 0 && ' · '}
          {/* On ne l'additionne PAS au payé : la moitié du chiffre serait
              une supposition, et « dépensé » cesserait d'être vrai. */}
          {b.estimeRestant > 0 && <>{fmt(b.estimeRestant)} € encore estimés</>}
        </p>
      )}

      {b.paye === 0 && (
        <div className="mt-3.5 flex items-start gap-3 rounded-[18px] bg-sable px-3.5 py-3">
          <span className="mt-px shrink-0 text-ocre"><Appareil taille={22} /></span>
          <p className="text-[14px] leading-snug">
            Aucun ticket enregistré sur la période. Photographie-le en sortant
            de caisse et l’app saura ce que coûte vraiment une part.
          </p>
        </div>
      )}
    </section>
  )
}
