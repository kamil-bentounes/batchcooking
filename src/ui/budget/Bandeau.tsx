/**
 * Le bandeau du mois (§ 3.1, point 9). Il n'est pas un reproche : celui qui
 * propose de clôturer MÈNE à la clôture.
 */
import { capitale, moisVoisin, nomDuMois, type Bandeau as LeBandeau } from '../../lib/budget/mois.ts'

export function Bandeau({ bandeau, va }: { bandeau: LeBandeau; va: (v: string) => void }) {
  if (!bandeau) return null
  const nom = nomDuMois(bandeau.mois)
  if (bandeau.genre === 'rappel') {
    return (
      <p className="mt-4 rounded-[18px] bg-sable p-4 text-[15px] leading-snug">
        Le mois fini, on le clôture : tu confirmes les factures, et tu choisis quoi faire de ce
        qui reste.
      </p>
    )
  }
  if (bandeau.genre === 'bientot') {
    return (
      <p className="mt-4 rounded-[18px] bg-sable p-4 text-[15px] leading-snug">
        {capitale(nom)} se termine. Le 1er {nomDuMois(moisVoisin(bandeau.mois, 1))}, on le clôture.
      </p>
    )
  }
  return (
    <div className="mt-4 rounded-[18px] bg-sable p-4">
      <p className="text-[15px] leading-snug">{capitale(nom)} est fini : on le clôture ?</p>
      <button onClick={() => va(`/cloture/${bandeau.mois.slice(0, 7)}`)}
              className="mt-3 min-h-11 px-5 rounded-full bg-herbe text-fond text-[15px] font-semibold">
        Clôturer {nom}
      </button>
    </div>
  )
}
