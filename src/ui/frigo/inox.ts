/**
 * L'inox du frigo américain : les dégradés des portes, des poignées et de l'afficheur, tels que la maquette
 * (`FrigoUS.dc.html`) les fixe. Du CSS en ligne exprès : un `repeating-linear-gradient` posé sur trois
 * `linear-gradient` ne s'écrit pas en classes, et chaque valeur ici a été regardée à l'œil.
 */
import type { CSSProperties } from 'react'

/** Les stries du métal brossé, posées sur le dégradé de la porte. */
const BROSSE = 'repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.07) 0 1px, rgba(0, 0, 0, 0.03) 1px 3px)'
/** Le reflet qui descend du haut de la porte, et son ombre en bas. */
const REFLET = 'linear-gradient(180deg, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0) 30%, rgba(255, 255, 255, 0) 70%, rgba(0, 0, 0, 0.06) 100%)'

/** La face de la porte gauche (le congélateur) : le clair est côté poignée, à droite. */
export const INOX_GAUCHE: CSSProperties = {
  background: `${REFLET}, ${BROSSE}, linear-gradient(90deg, #AEB4B8 0%, #D9DDE0 16%, #C4C9CD 36%, #ECEFF1 58%, #CDD2D5 78%, #B9BEC2 100%)`,
  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.35), inset -2px 0 0 rgba(0, 0, 0, 0.14)',
}
/** La face de la porte droite (le frigo) : l'inverse, clair côté poignée, à gauche. */
export const INOX_DROITE: CSSProperties = {
  background: `${REFLET}, ${BROSSE}, linear-gradient(90deg, #B9BEC2 0%, #CDD2D5 22%, #ECEFF1 42%, #C4C9CD 64%, #D9DDE0 84%, #AEB4B8 100%)`,
  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.35), inset 2px 0 0 rgba(0, 0, 0, 0.14)',
}

/** Les poignées chromées : un cylindre, la lumière au tiers côté porte. */
export const POIGNEE_GAUCHE: CSSProperties = {
  background: 'linear-gradient(90deg, #7A8086 0%, #F7F8F9 38%, #C8CDD0 58%, #868C91 100%)',
  boxShadow: '-1px 0 0 rgba(0, 0, 0, 0.1), 3px 2px 6px rgba(0, 0, 0, 0.28)',
}
export const POIGNEE_DROITE: CSSProperties = {
  background: 'linear-gradient(90deg, #868C91 0%, #C8CDD0 42%, #F7F8F9 62%, #7A8086 100%)',
  boxShadow: '1px 0 0 rgba(0, 0, 0, 0.1), -3px 2px 6px rgba(0, 0, 0, 0.28)',
}

/** Le haut du meuble et la plinthe (grille d'aération). */
export const DESSUS: CSSProperties = {
  background: 'linear-gradient(180deg, #E9ECEE, #BFC4C8)',
  boxShadow: 'inset 0 -1px 0 rgba(0, 0, 0, 0.18)',
}
export const PLINTHE: CSSProperties = {
  background: 'repeating-linear-gradient(90deg, #2E3337 0 3px, #474D52 3px 5px)',
  boxShadow: 'inset 0 2px 0 rgba(0, 0, 0, 0.35)',
}

/** L'ombre au sol. */
export const OMBRE_AU_SOL = 'radial-gradient(ellipse at center, rgba(28, 43, 35, 0.32) 0%, rgba(28, 43, 35, 0) 70%)'

/** Le dedans de la porte (ce qu'on voit une fois ouverte) : les bacs. */
export const DEDANS_GAUCHE: CSSProperties = {
  background: 'linear-gradient(180deg, #EEF3F5, #DDE6EA)', boxShadow: 'inset 0 0 0 6px #CBD5DA',
}
export const DEDANS_DROITE: CSSProperties = {
  background: 'linear-gradient(180deg, #FFFFFF, #EEF2EF)', boxShadow: 'inset 0 0 0 6px #D8DFDA',
}
export const BAC_GAUCHE: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.55)', border: '2px solid rgba(160, 185, 195, 0.9)',
}
export const BAC_DROITE: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.6)', border: '2px solid rgba(170, 195, 185, 0.9)',
}

/** La tablette de verre qui sépare deux étagères du frigo. */
export const VERRE: CSSProperties = {
  height: 8, margin: '0 -18px',
  background: 'linear-gradient(180deg, rgba(190, 215, 220, 0.8), rgba(255, 255, 255, 0.2))',
  borderTop: '1px solid #FFFFFF', boxShadow: '0 4px 8px rgba(28, 43, 35, 0.06)',
}
