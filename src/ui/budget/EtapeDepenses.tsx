/**
 * Étape 2 de la clôture (§ 3.5) : ce que tu as déclaré, ligne par ligne au fil
 * du mois. « + » ouvre la feuille Déclarer sur le mois qu'on clôture. Sans
 * saisie, la ligne propose « Rien dépensé » ; laissée sans réponse, elle garde
 * son prévu — la clôture ne bloque jamais.
 *
 * `rien` porte des CHARGES, comme `cloture_le_mois` les attend.
 *
 * `lignes` ou `saisies` à `undefined` : pas encore lues. Sans les saisies, chaque
 * ligne dirait « Rien de déclaré » et l'écart « ce qui était prévu » : on dit
 * « Un instant… », jamais un faux constat. `ecart` à `null` : pas encore calculable.
 */
import type { Depense } from '../../lib/donnees/budget.ts'
import { phraseDeLEcart } from '../../lib/budget/etapes.ts'
import { aDesSaisies, declare, montant, prevu, type Saisie } from '../../lib/budget/mois.ts'
import { Jauge } from './Jauge.tsx'
import { LectureDeLEtape } from './LectureDeLEtape.tsx'

export function EtapeDepenses({ lignes, saisies, rien, basculer, declarer, ecart, panne }: {
  lignes: Depense[] | undefined; saisies: Saisie[] | undefined; rien: Set<string>
  basculer: (chargeId: string) => void; declarer: (l: Depense) => void
  /** Prévu moins réel, en mes parts : le même Y que l'étape 3. */
  ecart: number | null
  panne?: unknown
}) {
  if (lignes === undefined || saisies === undefined) {
    return <LectureDeLEtape etat={panne ? 'erreur' : 'chargement'} panne={panne} />
  }
  const auFil = lignes.filter(l => l.facon === 'au_fil' && l.charge_id)
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
  if (auFil.length === 0) {
    return <p className="mt-3 text-[15px] text-doux">Aucune dépense au fil du mois.</p>
  }
  return (
    <>
      <p className="mt-1 text-[15px] text-doux">Ce que tu as déclaré. Ajoute ce qui manque.</p>
      <ul className="mt-3 rounded-[22px] bg-surface shadow-carte px-4 divide-y divide-brume">
        {auFil.map(l => {
          const dit = declare(l, saisies)
          const p = prevu(l)
          const sans = !aDesSaisies(l, saisies)
          const bascule = rien.has(l.charge_id!)
          return (
            <li key={l.id} className="py-3">
              <div className="flex items-center gap-3">
                <span className="grow min-w-0">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[16px] font-semibold truncate">{l.libelle}</span>
                    {sans
                      ? <span className="text-[14px] font-semibold" style={{ color: 'var(--color-ocre)' }}>Rien de déclaré</span>
                      : <span className="text-[14px] text-doux tabular-nums whitespace-nowrap">{montant(dit)} sur {montant(p)}</span>}
                  </span>
                  {!sans && (
                    <span className="mt-2 block">
                      <Jauge valeur={dit} plafond={p} nom={`${l.libelle} : ${montant(dit)} sur ${montant(p)}`} />
                    </span>
                  )}
                </span>
                <button onClick={() => declarer(l)} aria-label={`Déclarer pour ${l.libelle}`}
                        className="w-11 h-11 shrink-0 rounded-full border border-brume text-herbe text-[22px]
                                   leading-none grid place-items-center">
                  <span aria-hidden="true">+</span>
                </button>
              </div>
              {sans && (
                <button role="switch" aria-checked={bascule} aria-label={`Rien dépensé : ${l.libelle}`}
                        onClick={() => basculer(l.charge_id!)}
                        className="mt-2 min-h-11 flex items-center gap-3 text-[15px]">
                  {/* Le rail éteint porte un trait `doux` : le `brume` seul fait 1,3:1 sur la carte. */}
                  <span aria-hidden="true"
                        className={`w-10 h-6 rounded-full border-2 p-px transition-colors
                                    ${bascule ? 'bg-herbe border-herbe' : 'bg-surface border-doux'}`}>
                    <span className={`block w-4 h-4 rounded-full transition-transform
                                      ${bascule ? 'bg-surface translate-x-4' : 'bg-doux'}`} />
                  </span>
                  Rien dépensé
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {ecart !== null && (
        <p className="mt-3 text-[15px] font-semibold"
           style={{ color: ecart < 0 ? 'var(--color-ocre)' : 'var(--color-herbe)' }}>
          {phraseDeLEcart(ecart)}
        </p>
      )}
    </>
  )
}
