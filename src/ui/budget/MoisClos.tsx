/** Sur un mois clôturé, une feuille se lit seulement (§ 3.2, § 3.3). Une facture mise
    de côté, elle, se saisit toujours au présent : sa feuille ne change pas (§ 3.4).

    « Revenir dessus » est le seul geste d'écriture qui reste (§ 3.5). `misDeCote` : ce que
    la base retirera de l'épargne en rouvrant — le total du foyer, pas ma part seule. */
import { capitale, nomDuMois } from '../../lib/budget/mois.ts'
import { RevenirDessus } from './RevenirDessus.tsx'

export function MoisClos({ mois, misDeCote }: { mois: string; misDeCote: number | null }) {
  return (
    <div className="mt-5 rounded-[18px] bg-sable p-4">
      <p className="text-[15px]">{capitale(nomDuMois(mois))} est clôturé.</p>
      <RevenirDessus mois={mois} misDeCote={misDeCote} />
    </div>
  )
}
