/**
 * Les deux portes du frigo d'entrée, et ce qu'on voit derrière : des étagères de barquettes.
 *
 * ⚠️ Tout ce qui est écrit ici est INVENTÉ, et en dur. C'est l'écran d'avant la connexion : il n'a
 *    aucune donnée de personne, et il n'en aura jamais. Pas de photo non plus, le polaroïd est dessiné.
 */
import { INOX_DROITE, INOX_GAUCHE, POIGNEE_DROITE, POIGNEE_GAUCHE } from '../frigo/inox.ts'

/** Les barquettes d'une étagère : un motif de contenu, une étiquette. */
const ETAGERES: { nom: string; fond: string }[][] = [
  [
    { nom: 'Curry', fond: 'linear-gradient(180deg,#E8B54A 0 55%,#C9853E 55%)' },
    { nom: 'Soupe', fond: 'radial-gradient(circle at 50% 50%,#F0A04B 9px,#E9C27A 10px)' },
    { nom: 'Gratin', fond: 'repeating-linear-gradient(90deg,#E8C48E 0 10px,#D9A55B 10px 14px)' },
  ],
  [
    { nom: 'Lasagnes', fond: 'repeating-linear-gradient(180deg,#D9792F 0 9px,#F0C27A 9px 12px)' },
    { nom: 'Dahl', fond: 'radial-gradient(circle at 30% 35%,#7A9A4A 3px,transparent 4px),radial-gradient(circle at 70% 65%,#7A9A4A 3px,transparent 4px),#E9B949' },
    { nom: 'Wraps', fond: 'linear-gradient(90deg,#E8C48E 0 48%,transparent 48% 52%,#E8C48E 52%)' },
  ],
  [
    { nom: 'Chili', fond: 'linear-gradient(180deg,#B5653A 0 50%,#6E9A55 50%)' },
    { nom: 'Poulet rôti', fond: 'radial-gradient(circle at 50% 50%,#F3E3B5 10px,#C9853E 11px)' },
    { nom: 'Pizza', fond: 'repeating-linear-gradient(45deg,#E07A3A 0 6px,#F2D06B 6px 12px)' },
  ],
]

export function PorteDuFrigo() {
  return (
    <section className="pf-frigo" aria-label="Popote">
      <div className="pf-dedans" aria-hidden="true">
        {ETAGERES.map((rangee, i) => (
          <div key={i} className={i === 0 ? 'pf-rangee pf-rangee-haute' : 'pf-rangee'}>
            {rangee.map(b => (
              <div key={b.nom}>
                <div className="pf-barquette"><i style={{ background: b.fond }} /></div>
                <span className="pf-etiquette">{b.nom}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="pf-porte pf-porte-g" style={INOX_GAUCHE} aria-hidden="true">
        <span className="pf-poignee" style={POIGNEE_GAUCHE} />
        <div className="pf-aimant pf-polaroid">
          <svg viewBox="0 0 120 84">
            <rect width="120" height="84" fill="#E3ECE6" />
            <g transform="translate(6 12)">
              <rect width="34" height="58" rx="6" fill="#fff" stroke="#C9D6CE" strokeWidth="2" />
              <rect x="4" y="4" width="26" height="50" rx="4" fill="#D9792F" />
              <path d="M4 18h26M4 31h26M4 44h26" stroke="#F0C27A" strokeWidth="3" />
            </g>
            <g transform="translate(43 12)">
              <rect width="34" height="58" rx="6" fill="#fff" stroke="#C9D6CE" strokeWidth="2" />
              <rect x="4" y="4" width="26" height="50" rx="4" fill="#E9B949" />
              <circle cx="12" cy="16" r="3" fill="#7A9A4A" /><circle cx="22" cy="28" r="3" fill="#7A9A4A" />
              <circle cx="13" cy="41" r="3" fill="#7A9A4A" />
            </g>
            <g transform="translate(80 12)">
              <rect width="34" height="58" rx="6" fill="#fff" stroke="#C9D6CE" strokeWidth="2" />
              <rect x="4" y="4" width="26" height="24" rx="4" fill="#B5653A" />
              <rect x="4" y="30" width="26" height="24" rx="4" fill="#6E9A55" />
            </g>
          </svg>
          <p><b>Dimanche</b>2&nbsp;h&nbsp;10 en cuisine</p>
        </div>
      </div>

      <div className="pf-porte pf-porte-d" style={INOX_DROITE} aria-hidden="true">
        <span className="pf-poignee" style={POIGNEE_DROITE} />
        <div className="pf-aimant pf-rond"><b>14</b><span>parts</span></div>
        <div className="pf-aimant pf-ticket">
          <p>Courses de la semaine</p><b>84,20&nbsp;€</b><i /><i />
        </div>
      </div>
    </section>
  )
}
