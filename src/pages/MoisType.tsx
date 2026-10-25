/**
 * `/mois-type` : le tableau de bord du mois type, hors de l'écran du mois. Avant le premier mois suivi,
 * l'écran du budget le montre lui-même ; ensuite on y vient par « Le mois type ».
 */
import { Passage } from '../ui/coque.tsx'
import { TableauDeBord } from '../ui/budget/MoisType.tsx'
import { moisDeDepart } from '../lib/budget/mois.ts'
import { moisDe } from '../lib/donnees/budget.ts'
import { useFoyer } from '../lib/donnees/foyer.ts'

export function MoisType({ userId, va, retour }: { userId: string; va: (v: string) => void; retour: () => void }) {
  const { data: foyer } = useFoyer()
  const moi = foyer?.membres.find(m => m.id === userId)
  const courant = moisDe()
  /* Le mois où il entre, s'il n'y est pas encore : avant, ses charges ne lui comptent aucune part. */
  const mois = moisDeDepart(moi?.entre_le, courant)
  return (
    <Passage retour={retour} retourTexte="Budget">
      <h1 className="titre text-[36px] leading-tight">Le mois type</h1>
      <TableauDeBord mois={mois} va={va} avant={mois > courant} />
    </Passage>
  )
}
