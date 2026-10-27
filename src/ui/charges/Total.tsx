/** Le total par mois du foyer, en grand, et sa répartition par catégorie (les couleurs du budget). */
import { eurosRonds, euros } from '../../lib/donnees/budget.ts'
import type { GroupeDeCharges } from '../../lib/budget/charges-liste.ts'

export function Total({ total, phrase, groupes, pourToi }: {
  total: number; phrase: string | null; groupes: Pick<GroupeDeCharges<unknown>, 'cle' | 'nom' | 'clair' | 'total'>[]
  pourToi: boolean
}) {
  const pleins = groupes.filter(g => g.total > 0)
  return (
    <section aria-label="Le total par mois" className="rounded-[24px] bg-surface p-4 shadow-carte min-[900px]:rounded-[26px] min-[900px]:p-[22px]">
      <p className="text-[13.5px] font-medium text-doux">{pourToi ? 'Par mois, pour toi' : 'Par mois, pour le foyer'}</p>
      <p aria-hidden="true"
         className="chiffre mt-1 text-[46px] leading-none font-semibold text-herbe max-[360px]:text-[40px] min-[900px]:text-[60px]">
        {euros(total)}
      </p>
      {phrase && <p className="mt-2 text-[14.5px] leading-snug text-doux">{phrase}</p>}
      {pleins.length > 0 && total > 0 && (
        <>
          <div aria-hidden="true" className="mt-4 mb-3 h-3.5 rounded-lg bg-piste flex gap-[2px] overflow-hidden">
            {pleins.map(g => <i key={g.cle} className="block h-full" style={{ flex: g.total, background: g.clair }} />)}
          </div>
          <ul aria-label="Répartition par catégorie" className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13px] text-doux">
            {pleins.map(g => (
              <li key={g.cle} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-[3px]" style={{ background: g.clair }} />
                {g.nom} <b className="font-semibold text-encre">{eurosRonds(g.total)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
