/**
 * Le frigo américain en petit : celui de l'accueil, qu'on touche pour l'ouvrir. Même inox que
 * `FrigoFerme`, deux fois plus petit (maquette `Accueil.dc.html`) ; l'afficheur et les magnets n'y sont
 * que des taches de couleur — ce qu'ils disent se lit à côté.
 */
import { DESSUS, INOX_DROITE, INOX_GAUCHE, OMBRE_AU_SOL, PLINTHE } from './inox.ts'

export function PetitFrigo({ photo, magnet }: { photo: string | null; magnet: boolean }) {
  return (
    <span aria-hidden="true" data-frigo="petit"
          style={{ position: 'relative', display: 'block', width: 150, height: 258, flexShrink: 0, marginBottom: 20 }}>
      <span style={{
        position: 'absolute', left: 4, right: 4, bottom: -12, height: 20, borderRadius: '50%',
        background: OMBRE_AU_SOL,
      }} />
      <span style={{ position: 'absolute', inset: 0, borderRadius: '9px 9px 6px 6px', background: '#23282C' }} />
      <span style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 10, borderRadius: '9px 9px 0 0', ...DESSUS }} />
      {/* La porte du congélateur, son afficheur, sa poignée. */}
      <span style={{ position: 'absolute', left: 0, top: 10, width: 74, height: 238, ...INOX_GAUCHE, boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.35)' }}>
        <span style={{
          position: 'absolute', left: 11, top: 40, width: 44, height: 78, borderRadius: 6,
          background: 'linear-gradient(180deg, #33393D, #15191C)',
        }}>
          <span style={{ position: 'absolute', left: 4, right: 4, top: 4, height: 18, borderRadius: 3, background: '#0C1012' }} />
        </span>
        <span style={{
          position: 'absolute', right: 5, top: 66, width: 6, height: 124, borderRadius: 3,
          background: 'linear-gradient(90deg, #7A8086, #F7F8F9 40%, #868C91)',
        }} />
      </span>
      {/* La porte du frigo, sa poignée, son magnet et sa photo. */}
      <span style={{ position: 'absolute', left: 76, top: 10, width: 74, height: 238, ...INOX_DROITE, boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.35)' }}>
        <span style={{
          position: 'absolute', left: 5, top: 66, width: 6, height: 124, borderRadius: 3,
          background: 'linear-gradient(90deg, #868C91, #F7F8F9 60%, #7A8086)',
        }} />
        {magnet && (
          <span style={{
            position: 'absolute', left: 20, top: 34, width: 44, height: 40, background: '#E8A33D', borderRadius: 2,
            transform: 'rotate(3deg)', boxShadow: '0 3px 6px rgba(0, 0, 0, 0.2)',
          }} />
        )}
        {photo && (
          <img src={photo} alt="" referrerPolicy="no-referrer"
               style={{
                 position: 'absolute', left: 22, top: 92, width: 40, height: 30, objectFit: 'cover',
                 border: '3px solid #FFFFFF', transform: 'rotate(-4deg)', boxShadow: '0 3px 6px rgba(0, 0, 0, 0.2)',
               }} />
        )}
      </span>
      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, borderRadius: '0 0 6px 6px', ...PLINTHE, boxShadow: 'none',
        background: 'repeating-linear-gradient(90deg, #2E3337 0 2px, #474D52 2px 4px)' }} />
    </span>
  )
}
