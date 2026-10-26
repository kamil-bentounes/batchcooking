/**
 * Le frigo américain, fermé — et ses deux portes, qui sont de vrais boutons.
 *
 * Dessiné en CSS d'après la maquette `FrigoUS.dc.html` : deux portes d'inox brossé, des poignées chromées, un
 * dessus, une plinthe à grille, l'ombre au sol. À gauche le congélateur, avec le distributeur dont
 * l'afficheur dit le dîner de ce soir ; à droite le frigo, avec le magnet safran du plus pressé et, s'il y a
 * une photo, celle du plat de demain.
 *
 * Une porte s'ouvre en pivotant autour de sa charnière extérieure (CSS 3D, `perspective`) ; sa face
 * intérieure porte ses bacs. Le mouvement n'est qu'un décor : c'est `ouverte` qui dit l'état, aussi pour les
 * lecteurs d'écran (`aria-expanded`).
 */

import { useId } from 'react'
import type { Ref } from 'react'
import type { Afficheur, Magnet } from '../../lib/frigo.ts'
import {
  BAC_DROITE, BAC_GAUCHE, DEDANS_DROITE, DEDANS_GAUCHE, DESSUS, INOX_DROITE, INOX_GAUCHE, OMBRE_AU_SOL,
  PLINTHE, POIGNEE_DROITE, POIGNEE_GAUCHE,
} from './inox.ts'

export type Porte = 'congelo' | 'frigo'

/** La taille du dessin, en px, avant réduction. */
export const LARGEUR = 302
export const HAUTEUR = 600

const PORTE: React.CSSProperties = {
  position: 'absolute', top: 20, width: 149, height: 560, padding: 0, border: 0, background: 'transparent',
  transformStyle: 'preserve-3d', transition: 'transform 0.8s cubic-bezier(0.25, 0.8, 0.25, 1)',
}
const FACE: React.CSSProperties = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden' }

export type PropsFrigoFerme = {
  /** La porte ouverte (le décor), ou aucune. */
  ouverte: Porte | null
  surOuvre: (p: Porte) => void
  afficheur: Afficheur
  magnet: Magnet | null
  /** La photo du plat de demain, aimantée sur le frigo. */
  demain: string | null
  refCongelo?: Ref<HTMLButtonElement>
  refFrigo?: Ref<HTMLButtonElement>
  /** Le dessin est réduit à cette échelle (≤ 1) quand l'écran est plus étroit que lui. */
  echelle?: number
}

export function FrigoFerme({ ouverte, surOuvre, afficheur, magnet, demain, refCongelo, refFrigo, echelle = 1 }: PropsFrigoFerme) {
  const idAfficheur = useId()
  const idMagnet = useId()
  return (
    <div style={{ width: LARGEUR * echelle, height: HAUTEUR * echelle, margin: '0 auto' }}>
    <div data-frigo="ferme"
         style={{
           position: 'relative', width: LARGEUR, height: HAUTEUR, perspective: 1700,
           transform: echelle < 1 ? `scale(${echelle})` : undefined, transformOrigin: 'top left',
         }}>
      <div aria-hidden="true"
           style={{ position: 'absolute', left: 6, right: 6, bottom: -22, height: 34, borderRadius: '50%', background: OMBRE_AU_SOL }} />

      {/* La caisse, et ce qu'on voit quand une porte s'ouvre. */}
      <div aria-hidden="true"
           style={{ position: 'absolute', inset: 0, borderRadius: '16px 16px 10px 10px', background: '#23282C' }}>
        <div style={{
          position: 'absolute', left: 7, top: 24, width: 138, height: 548, borderRadius: 6,
          background: 'radial-gradient(circle at 8px 8px, rgba(255, 255, 255, 0.8) 0 1px, transparent 1.6px) 0 0 / 16px 16px, linear-gradient(180deg, #F3F8FA, #DCE8EE)',
          boxShadow: 'inset 0 0 18px rgba(120, 160, 180, 0.35)',
        }}>
          {[60, 230].map(top => (
            <div key={top} style={{
              position: 'absolute', left: 8, right: 8, top, height: 120, borderRadius: 6, border: '2px solid #B9CBD3',
              background: 'repeating-linear-gradient(90deg, rgba(150, 175, 186, 0.35) 0 1px, transparent 1px 9px)',
            }} />
          ))}
        </div>
        <div style={{
          position: 'absolute', left: 157, top: 24, width: 138, height: 548, borderRadius: 6,
          background: 'linear-gradient(180deg, #FFFFFF, #F2F6F4)', boxShadow: 'inset 0 0 22px rgba(255, 238, 200, 0.7)',
        }}>
          {[150, 290].map(top => (
            <div key={top} style={{
              position: 'absolute', left: 0, right: 0, top, height: 6,
              background: 'linear-gradient(180deg, rgba(190, 215, 220, 0.8), rgba(255, 255, 255, 0.3))',
            }} />
          ))}
          <div style={{ position: 'absolute', left: 6, right: 6, bottom: 8, height: 110, borderRadius: 6, background: 'rgba(214, 228, 221, 0.7)' }} />
        </div>
      </div>

      {/* Le haut du meuble. */}
      <div aria-hidden="true"
           style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 20, borderRadius: '16px 16px 0 0', ...DESSUS }} />

      {/* Porte gauche : le congélateur. */}
      <button ref={refCongelo} type="button" onClick={() => surOuvre('congelo')}
              aria-label="Ouvrir le congélateur" aria-describedby={idAfficheur} aria-expanded={ouverte === 'congelo'}
              style={{
                ...PORTE, left: 0, transformOrigin: 'left center',
                transform: ouverte === 'congelo' ? 'rotateY(-108deg)' : 'rotateY(0deg)',
              }}>
        <div style={{ ...FACE, borderRadius: '0 0 0 6px', ...INOX_GAUCHE }}>
          {/* Le distributeur, et son afficheur : le repas de ce soir. */}
          <div style={{
            position: 'absolute', left: 22, top: 92, width: 92, height: 176, borderRadius: 12,
            background: 'linear-gradient(180deg, #33393D, #15191C)',
            boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.6), 0 1px 0 rgba(255, 255, 255, 0.5)',
          }}>
            <div data-afficheur="" id={idAfficheur} style={{
              position: 'absolute', left: 8, right: 8, top: 8, padding: '7px 8px', borderRadius: 6,
              background: '#0C1012', boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.06)', textAlign: 'left',
            }}>
              <div style={{ fontSize: 12, lineHeight: 1.25, color: '#8FB7A1' }}>{afficheur.titre}</div>
              {afficheur.plat && (
                <div style={{
                  marginTop: 1, fontSize: 12.5, fontWeight: 700, color: '#E3F1E8', lineHeight: 1.2,
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  overflowWrap: 'anywhere',
                }}>{afficheur.plat}</div>
              )}
            </div>
            <div style={{
              position: 'absolute', left: 14, right: 14, top: 94, bottom: 24, borderRadius: 8,
              background: 'linear-gradient(180deg, #0A0D0F, #1C2125)', boxShadow: 'inset 0 4px 10px rgba(0, 0, 0, 0.8)',
            }}>
              <div style={{
                position: 'absolute', left: '50%', top: 8, marginLeft: -14, width: 28, height: 38,
                borderRadius: '8px 8px 12px 12px', background: 'linear-gradient(90deg, #3E454A, #6B7378, #3E454A)',
              }} />
            </div>
            <div style={{
              position: 'absolute', left: 14, right: 14, bottom: 10, height: 10, borderRadius: 3,
              background: 'repeating-linear-gradient(90deg, #4A5156 0 2px, #1A1E21 2px 5px)',
            }} />
          </div>
          {/* Poignée. */}
          <div style={{ position: 'absolute', right: 9, top: 150, width: 11, height: 290, borderRadius: 6, ...POIGNEE_GAUCHE }} />
        </div>
        <div style={{ ...FACE, transform: 'rotateY(180deg)', borderRadius: '0 0 6px 0', ...DEDANS_GAUCHE }}>
          {[90, 250].map(top => (
            <div key={top} style={{ position: 'absolute', left: 14, right: 14, top, height: 54, borderRadius: '4px 4px 10px 10px', ...BAC_GAUCHE }} />
          ))}
        </div>
      </button>

      {/* Porte droite : le frigo. */}
      <button ref={refFrigo} type="button" onClick={() => surOuvre('frigo')}
              aria-label="Ouvrir le frigo" aria-describedby={magnet ? idMagnet : undefined} aria-expanded={ouverte === 'frigo'}
              style={{
                ...PORTE, left: 153, transformOrigin: 'right center',
                transform: ouverte === 'frigo' ? 'rotateY(108deg)' : 'rotateY(0deg)',
              }}>
        <div style={{ ...FACE, borderRadius: '0 0 6px 0', ...INOX_DROITE }}>
          {/* Poignée. */}
          <div style={{ position: 'absolute', left: 9, top: 150, width: 11, height: 290, borderRadius: 6, ...POIGNEE_DROITE }} />
          {/* Le magnet : ce qui presse. */}
          {magnet && (
            <div data-magnet="" id={idMagnet} style={{
              position: 'absolute', left: 34, top: 84, width: 98, padding: '16px 10px 10px', boxSizing: 'border-box',
              background: '#E8A33D', color: '#1C2B23', borderRadius: 3, transform: 'rotate(2.5deg)',
              boxShadow: '0 6px 12px rgba(28, 43, 35, 0.22)', textAlign: 'left',
            }}>
              <div aria-hidden="true" style={{
                position: 'absolute', left: 41, top: -6, width: 15, height: 15, borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 35%, #4E8A68, #1F4A33)', boxShadow: '0 2px 3px rgba(0, 0, 0, 0.3)',
              }} />
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{magnet.texte}</div>
            </div>
          )}
          {/* Une photo aimantée : le plat de demain. */}
          {demain && (
            <div data-polaroid="" style={{
              position: 'absolute', left: 44, top: 214, width: 84, padding: '5px 5px 16px', boxSizing: 'border-box',
              background: '#FFFFFF', transform: 'rotate(-3deg)', boxShadow: '0 5px 12px rgba(28, 43, 35, 0.2)',
            }}>
              <img src={demain} alt="" referrerPolicy="no-referrer"
                   style={{ display: 'block', width: 74, height: 56, objectFit: 'cover' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 2, textAlign: 'center', fontSize: 12, color: '#1C2B23' }}>demain</div>
            </div>
          )}
        </div>
        <div style={{ ...FACE, transform: 'rotateY(180deg)', borderRadius: '0 0 0 6px', ...DEDANS_DROITE }}>
          {[80, 230, 380].map(top => (
            <div key={top} style={{ position: 'absolute', left: 14, right: 14, top, height: 56, borderRadius: '4px 4px 10px 10px', ...BAC_DROITE }} />
          ))}
        </div>
      </button>

      {/* La plinthe. */}
      <div aria-hidden="true"
           style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 20, borderRadius: '0 0 10px 10px', ...PLINTHE }} />
    </div>
    </div>
  )
}

