/**
 * Le graphe d'une grandeur (calories ou protéines) pour une personne : la moyenne en très gros, la cible
 * tracée si elle existe, une barre par jour, et ce que la période dit de la cible.
 *
 * Trois règles, héritées de l'écran d'avant :
 *  · jamais deux axes : une grandeur, un dessin ;
 *  · un jour non renseigné est un TROU (un trait), pas un zéro (D33) ;
 *  · la cible est un TRAIT, pas une barre : un repère, pas une valeur mesurée (D32).
 * Et une règle de plus : `max` vient de l'extérieur. Deux personnes se comparent d'un coup d'œil seulement si
 * leurs barres se mesurent à la même règle.
 */
import type { Jour } from '../../lib/suivi.ts'
import { dateCourteDe, jourCourtDe } from './format.ts'

const nombre = (n: number) => n.toLocaleString('fr-FR')

export function Graphe({ titre, unite, mot, jours, valeur, moyenne, cible, tenus, sens, max, aplat }: {
  /** « Calories » : le nom accessible du dessin. */
  titre: string
  /** « kcal », « g ». */
  unite: string
  /** Ce que dit la moyenne après l'unité : « en moyenne », « de protéines en moyenne ». */
  mot: string
  jours: Jour[]
  valeur: (j: Jour) => number | null
  moyenne: number | null
  cible: number | null
  tenus: number | null
  sens: 'plafond' | 'plancher'
  /** La borne haute de l'axe, commune à tout le monde. */
  max: number
  /** La teinte des barres : `bg-herbe` (calories) ou `bg-safran` (protéines). */
  aplat: string
}) {
  const valeurs = jours.map(valeur)
  const renseignes = valeurs.filter(v => v !== null).length
  /* Au-delà de deux semaines, les jours ne tiennent plus côte à côte : on resserre, et l'axe ne nomme plus que
     les deux bouts. Sur sept jours, chaque barre porte son jour. */
  const court = jours.length <= 7
  const ecart = court ? 'gap-2' : jours.length <= 31 ? 'gap-[3px]' : 'gap-px'
  const arrondi = court ? 'rounded-t-[8px] rounded-b-[3px]' : jours.length <= 31 ? 'rounded-t-[3px]' : 'rounded-t-[1px]'

  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="chiffre text-[44px] font-semibold leading-[0.95]">
          {moyenne !== null ? nombre(moyenne) : '–'}
        </span>
        <span className="text-[15px] font-semibold">{unite} {mot}</span>
      </p>
      {cible !== null && <p className="mt-1 text-[13px] text-doux">cible {nombre(cible)} {unite}</p>}

      <div className={`relative mt-3.5 flex h-28 items-end ${ecart}`} data-graphe={titre}
           role="img" aria-label={`${titre} par jour${cible !== null ? `, cible ${cible} ${unite}` : ''}`}>
        {cible !== null && (
          <span aria-hidden="true" data-cible=""
                className="absolute inset-x-0 border-t-2 border-dashed border-doux/60"
                style={{ bottom: `${Math.min(100, (cible / max) * 100)}%` }} />
        )}
        {jours.map((j, i) => {
          const v = valeurs[i]
          if (v === null) {
            // Un trou se VOIT. Une barre à zéro ferait croire à un jeûne.
            return (
              <span key={j.jour} className="flex h-full min-w-0 flex-1 items-end" aria-hidden="true">
                <span className="h-[5px] w-full rounded-full bg-piste" />
              </span>
            )
          }
          return (
            <span key={j.jour} className="flex h-full min-w-0 flex-1 items-end">
              <span data-barre="" className={`w-full min-h-[5px] ${arrondi} ${aplat}`}
                    style={{ height: `${Math.min(100, (v / max) * 100)}%` }} />
            </span>
          )
        })}
      </div>

      {jours.length > 0 && (court ? (
        <div aria-hidden="true" className={`mt-1.5 flex text-[11.5px] text-doux ${ecart}`}>
          {jours.map((j, i) => (
            <span key={j.jour}
                  className={`min-w-0 flex-1 text-center ${i === jours.length - 1 ? 'font-bold text-encre' : ''}`}>
              {jourCourtDe(j.jour)}
            </span>
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="mt-1.5 flex justify-between text-[11.5px] text-doux">
          <span>{dateCourteDe(jours[0].jour)}</span>
          <span className="font-bold text-encre">{dateCourteDe(jours[jours.length - 1].jour)}</span>
        </div>
      ))}

      {tenus !== null && (
        <p className="mt-2.5 text-[13px] text-doux">
          {sens === 'plancher'
            ? `${tenus} jour${tenus > 1 ? 's' : ''} au-dessus de la cible`
            : `${tenus} jour${tenus > 1 ? 's' : ''} sous la cible`}
          {' '}sur les {renseignes} renseignés.
        </p>
      )}
    </div>
  )
}
