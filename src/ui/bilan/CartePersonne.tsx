/**
 * Le bilan d'une personne : son avatar, ses deux graphes (calories, protéines) à l'échelle commune.
 *
 * Les deux personnes ont les mêmes teintes (herbe pour les calories, safran pour les protéines), la même hauteur
 * et la même borne : seule la cible tracée change, et elle n'est tracée que pour qui en a une.
 */
import type { Personne } from '../../lib/donnees/bilan.ts'
import { initialeDe } from '../../lib/donnees/foyer.ts'
import { Graphe } from './Graphe.tsx'
import type { Echelle } from './echelle.ts'

/** La couleur de l'avatar suit l'ORDRE DU FOYER, pas l'ordre de lecture : Thauba reste ocre quand elle ouvre l'écran. */
const AVATARS = ['bg-herbe', 'bg-ocre', 'bg-congel-encre', 'bg-encre']

export function CartePersonne({ p, rang, echelle }: { p: Personne; rang: number; echelle: Echelle }) {
  const s = p.serie
  return (
    <section className="rounded-[26px] bg-surface p-5 shadow-carte" aria-label={`Suivi de ${p.nom}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true"
              className={`grid size-11 shrink-0 place-items-center rounded-full text-[17px] font-bold text-white
                          ${AVATARS[rang % AVATARS.length]}`}>
          {initialeDe(p.nom)}
        </span>
        <div className="min-w-0">
          <h2 className="titre text-[24px] font-semibold">{p.nom}</h2>
          {/* D33 : toujours dire sur combien de jours on parle. */}
          {s.renseignes > 0 && (
            <p className="text-[13px] text-doux">
              {s.renseignes} jour{s.renseignes > 1 ? 's' : ''} renseigné{s.renseignes > 1 ? 's' : ''} sur {s.total}
            </p>
          )}
        </div>
      </div>

      {s.renseignes === 0 ? (
        <p className="mt-4 text-[14px] text-doux">
          Aucun repas renseigné sur la période. Rien n’est affiché plutôt qu’une
          moyenne construite sur des trous.
        </p>
      ) : (
        <>
          <div className="mt-5">
            <Graphe titre="Calories" unite="kcal" mot="en moyenne" aplat="bg-herbe"
                    jours={s.jours} valeur={j => j.kcal} max={echelle.kcal}
                    moyenne={s.kcalMoyen} cible={p.cibleKcal} tenus={s.joursKcalTenue} sens="plafond" />
          </div>
          <div className="mt-6 border-t border-brume pt-5">
            <Graphe titre="Protéines" unite="g" mot="de protéines en moyenne" aplat="bg-safran"
                    jours={s.jours} valeur={j => j.protein} max={echelle.protein}
                    moyenne={s.proteinMoyen} cible={p.cibleProtein} tenus={s.joursProteineTenue} sens="plancher" />
          </div>
        </>
      )}
    </section>
  )
}
