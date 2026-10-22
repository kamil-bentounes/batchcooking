/**
 * « Revenir dessus » (§ 3.5) : rouvrir un mois clôturé. La base retire de
 * l'épargne le versement de la clôture — celui de TOUS les membres du foyer — ;
 * on le dit avant, avec le montant, par la même question que `Charges`, `Epargne`
 * et `Settings` posent (`confirm`) : c'est aussi ce que l'e2e de la clôture attend.
 *
 * C'est le seul geste d'écriture d'un mois clôturé. Un second clic, avant que la
 * base ait répondu, ne repose pas la question : rouvrir deux fois ferait refuser
 * le second (« n'est pas clôturé ») sous un message d'erreur pour une réussite.
 */
import { useRef } from 'react'
import { useRouvreLeMois } from '../../lib/donnees/budget.ts'
import { questionPourRevenir, revenirSiConfirme, unSeulEnvoi } from '../../lib/budget/cloture.ts'
import { Erreur } from '../coque.tsx'

export function RevenirDessus({ mois, misDeCote, apres, clair = false }: {
  mois: string
  /** Ce que la base retirera de l'épargne : le total du foyer (`misDeCoteDuFoyer`). */
  misDeCote: number
  apres?: () => void
  /** Sur la carte encre, le bouton s'éclaircit. */
  clair?: boolean
}) {
  const rouvre = useRouvreLeMois()
  const garde = useRef(unSeulEnvoi()).current
  /* `mutateAsync`, pas `mutate(…, { onSuccess })` : les rappels de `mutate` ne partent plus
     si le bouton a disparu entre-temps — et, sur la page de clôture, il disparaît dès que
     la relecture des clôtures revient, avant la fin de la mutation. On ne reviendrait pas au mois. */
  const revenir = () => revenirSiConfirme({
    garde, question: questionPourRevenir(mois, misDeCote), confirmer: q => confirm(q),
    rouvrir: () => rouvre.mutateAsync(mois), apres,
  })
  return (
    <>
      <button disabled={rouvre.isPending} onClick={revenir}
              className={`mt-4 min-h-11 px-5 rounded-full text-[15px] font-semibold disabled:opacity-50
                          ${clair ? 'bg-fond text-encre' : 'bg-piste text-encre'}`}>
        Revenir dessus
      </button>
      <Erreur de={rouvre.error} />
    </>
  )
}
