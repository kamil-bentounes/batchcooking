/**
 * Le frigo américain en miniature, celui de la tuile du hub au bureau (92 × 132) : deux portes d'inox, leurs
 * poignées, l'afficheur du congélateur, la grille de la plinthe. Le magnet safran n'y est que si le frigo en porte un
 * (`magnet()` : une part à sortir ou à prévoir) — ce qu'il dit se lit ailleurs, ici c'est une tache de couleur.
 * Même inox que `FrigoFerme` et `PetitFrigo` (`inox.ts`).
 */
import { DESSUS, INOX_DROITE, INOX_GAUCHE, PLINTHE } from '../frigo/inox.ts'

export function MiniFrigo({ magnet }: { magnet: boolean }) {
  return (
    <span aria-hidden="true" data-frigo="mini" className="relative block h-[132px] w-[92px] shrink-0">
      <span className="absolute inset-x-0 top-0 h-[4px] rounded-t-[4px]" style={DESSUS} />
      <span className="absolute bottom-[8px] left-0 top-[4px] w-[45px] rounded-[4px]" style={INOX_GAUCHE} />
      <span className="absolute bottom-[8px] right-0 top-[4px] w-[45px] rounded-[4px]" style={INOX_DROITE} />
      <span className="absolute left-[8px] top-[18px] h-[30px] w-[22px] rounded-[4px] bg-[#1F2A2E]" />
      {magnet && <span className="absolute right-[8px] top-[20px] size-[18px] rotate-6 rounded-[3px] bg-safran" />}
      <span className="absolute left-[41px] top-[40px] h-[42px] w-[3px] rounded-[2px]"
            style={{ background: 'linear-gradient(90deg, #868C91, #F7F8F9, #868C91)' }} />
      <span className="absolute left-[48px] top-[40px] h-[42px] w-[3px] rounded-[2px]"
            style={{ background: 'linear-gradient(90deg, #868C91, #F7F8F9, #868C91)' }} />
      <span className="absolute inset-x-0 bottom-0 h-[8px] rounded-b-[4px]" style={{ ...PLINTHE, boxShadow: 'none' }} />
    </span>
  )
}

/** La petite icône du titre sur téléphone (16 × 22) : une silhouette de frigo, deux portes. */
export function IconeFrigo() {
  return (
    <span aria-hidden="true" className="inline-block h-[22px] w-4 shrink-0 rounded-[3px] max-[360px]:hidden min-[900px]:hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(0,0,0,.06)), linear-gradient(90deg, #AEB4B8, #ECEFF1 45%, #C4C9CD 55%, #B9BEC2)',
            boxShadow: 'inset 0 -3px 0 #3A4045, inset 7.5px 0 0 -7px #868C91',
          }} />
  )
}
