/** Sur un mois clôturé, une feuille se lit seulement (§ 3.2, § 3.3). Une facture mise
    de côté, elle, se saisit toujours au présent : sa feuille ne change pas (§ 3.4).

    ⚠️ « Revenir dessus » (`RevenirDessus`, tâche 3.5) se branche ICI, sous la phrase, avec
    `misDeCote` : la prop est déjà là pour lui, et elle ne sert encore à rien. */
import { capitale, nomDuMois } from '../../lib/budget/mois.ts'

export function MoisClos({ mois }: { mois: string; misDeCote: number }) {
  return (
    <div className="mt-5 rounded-[18px] bg-sable p-4">
      <p className="text-[15px]">{capitale(nomDuMois(mois))} est clôturé.</p>
    </div>
  )
}
