/**
 * Étape 3 de la clôture (§ 3.5) : ce qui reste, et où il va — le dessin est dans
 * `VueReste.tsx`. Ici, seulement la lecture du solde de la poche visée.
 */
import { useSolde, type Poche, type Solde } from '../../lib/donnees/budget.ts'
import { leReste, type ChoixDuReste } from '../../lib/budget/etapes.ts'
import type { RecapCloture } from '../../lib/budget/mois.ts'
import { VueReste, type CumulDeLaPoche } from './VueReste.tsx'

export type { ChoixDuReste }

export function EtapeReste({ recap, soldes, mois, poches, choix, changer, panne }: {
  recap: RecapCloture | null; soldes: Solde[] | undefined; mois: string
  poches: Poche[] | undefined
  choix: ChoixDuReste; changer: (c: ChoixDuReste) => void
  panne?: unknown
}) {
  /* Le cumul se lit pour la poche que la clôture VISERA, pas pour l'identifiant du
     choix, qui peut désigner une poche retirée. Hors « Le mettre de côté », on ne lit rien. */
  const r = recap && poches ? leReste({ reste: recap.reste, poches, choix, incertain: recap.incertain }) : null
  const solde = useSolde(r?.mettre ? r.poche?.id : undefined)
  /* ⚠️ Un solde pas encore lu n'est pas un solde nul : `?? []` disait « passe à 793 € » à
     qui a 800 € de côté, le temps du chargement ou pour toujours après une panne. */
  const dessus: CumulDeLaPoche = solde.data !== undefined
    ? solde.data.reduce((t, s) => t + s.cents, 0)
    : solde.error ? 'illisible' : 'chargement'
  return <VueReste recap={recap} soldes={soldes} mois={mois} poches={poches} choix={choix}
                   changer={changer} panne={panne} dessus={dessus} />
}
