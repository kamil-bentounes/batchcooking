/**
 * Étape 3 de la clôture (§ 3.5) : ce qui reste, et où il va. X + Y fait le
 * chiffre, soldes d'année compris.
 *
 * « Tout ce qui reste » part tel quel (`combien` à null) : la base met de côté
 * son propre reste, au centime. À deux, la projection de l'écran peut différer
 * d'un centime de la sienne, et c'est la sienne qui compte (`envoiDuReste`).
 *
 * ⚠️ Rien n'est dit tant que tout n'est pas lu. Le chiffre dépend du récap (donc
 *    des lignes, des saisies et du revenu), des soldes d'année et des poches ;
 *    calculé sur un morceau, il ment — « 0 € » de soldes pendant leur lecture,
 *    « 0 € » sur une poche qui en porte 800. On dit « Un instant… », ou la panne.
 *
 * `VueReste` est le dessin, sans état ni réseau : c'est elle que le banc rend en chaîne.
 * `EtapeReste` (EtapeReste.tsx) y ajoute la lecture du solde de la poche.
 */
import type { KeyboardEvent } from 'react'
import type { Poche, Solde } from '../../lib/donnees/budget.ts'
import {
  leReste, phraseDeLaPoche, phraseDesPrevus, phraseDuSolde, voisinDuChoix,
  type ChoixDuReste,
} from '../../lib/budget/etapes.ts'
import { saisiDe } from '../../lib/budget/feuilles.ts'
import { montant, moisVoisin, nomDuMois, type RecapCloture } from '../../lib/budget/mois.ts'
import { LectureDeLEtape } from './LectureDeLEtape.tsx'
import { Photo } from './Photo.tsx'

/** Ce que la poche porte déjà : un cumul, ou pourquoi on ne le dit pas. */
export type CumulDeLaPoche = number | 'chargement' | 'illisible'

const INTRO = <p className="mt-1 text-[15px] text-doux">Tu décides où va l’argent qui n’a pas servi.</p>

const option = (actif: boolean) =>
  `w-full min-h-11 rounded-[20px] border-2 bg-surface p-4 text-left flex items-center gap-3
   disabled:opacity-50 ${actif ? 'border-herbe' : 'border-brume'}`

function Pastille({ actif }: { actif: boolean }) {
  return (
    <span aria-hidden="true"
          className={`w-[22px] h-[22px] shrink-0 rounded-full border-2 grid place-items-center
                      ${actif ? 'border-herbe' : 'border-doux'}`}>
      {actif && <span className="w-2.5 h-2.5 rounded-full bg-herbe" />}
    </span>
  )
}

/** Les flèches d'un `radiogroup` : déplacent le choix ET le focus, comme `FiltreDuMois`. */
function flechesDe(index: number, permis: boolean[], choisir: (i: number) => void) {
  return (e: KeyboardEvent<HTMLButtonElement>) => {
    const voisin = voisinDuChoix(index, e.key, permis)
    if (voisin === null) return
    e.preventDefault()
    choisir(voisin)
    ;(e.currentTarget.parentElement?.children[voisin] as HTMLElement | undefined)?.focus()
  }
}

export function VueReste({ recap, soldes, mois, poches, choix, changer, panne, dessus }: {
  /** `null` : le récap n'est pas calculable, une de ses lectures manque. */
  recap: RecapCloture | null
  soldes: Solde[] | undefined
  poches: Poche[] | undefined
  mois: string
  choix: ChoixDuReste; changer: (c: ChoixDuReste) => void
  /** L'erreur d'une des lectures, si l'une a échoué. */
  panne?: unknown
  dessus: CumulDeLaPoche
}) {
  if (recap === null || soldes === undefined || poches === undefined) {
    return <>{INTRO}<LectureDeLEtape etat={panne ? 'erreur' : 'chargement'} panne={panne} /></>
  }
  const reste = recap.reste
  const incertain = recap.incertain === true
  const r = leReste({ reste, poches, choix, incertain })
  const { mettre, poche } = r
  /* Un solde à 0 ne dit rien : « 0 € reviennent » serait du bruit. */
  const lignesDeSolde = soldes.flatMap(s => {
    const texte = phraseDuSolde(s)
    return texte === null ? [] : [{ cle: `${s.charge}-${s.annee}`, texte }]
  })

  return (
    <>
      {INTRO}
      <div className="mt-3 rounded-[24px] bg-encre text-fond px-[18px] pt-[18px] pb-4">
        {lignesDeSolde.map(l => (
          <p key={l.cle} className="mb-2 text-[15px] leading-snug opacity-80">{l.texte}</p>
        ))}
        <div aria-live="polite">
          <p className="text-[15px] opacity-80">
            {reste < 0 ? 'Il te manque' : 'Il te reste'}{incertain ? ', avant les soldes d’année' : ' ce mois-ci'}
          </p>
          <p className="chiffre mt-0.5 text-[54px] leading-[1.05] text-safran tabular-nums">
            {montant(Math.abs(reste))}
          </p>
          <p className="mt-1.5 text-[14px] opacity-80">{phraseDesPrevus(recap)}</p>
          {incertain && (
            <p className="mt-1.5 text-[14px] opacity-80">
              Les soldes d’année s’y ajoutent, selon ce que chacun a mis de côté : ta part exacte se lira une fois le mois clôturé.
            </p>
          )}
        </div>
      </div>

      <div role="radiogroup" aria-label="Ce que tu en fais" className="mt-3 flex flex-col gap-2">
        <button role="radio" aria-checked={mettre} disabled={!r.possible}
                tabIndex={mettre ? 0 : -1}
                onClick={() => changer({ ...choix, garder: false })}
                onKeyDown={flechesDe(0, [r.possible, true], i => changer({ ...choix, garder: i === 1 }))}
                className={option(mettre)}>
          <Pastille actif={mettre} />
          <span className="grow min-w-0">
            <span className="block text-[16px] font-semibold">Le mettre de côté</span>
            {mettre && poche && (
              <span className="block mt-0.5 text-[14px] text-doux">
                {dessus === 'chargement' ? `${poche.libelle} : solde en cours de lecture…`
                  : dessus === 'illisible' ? `${poche.libelle} : solde illisible.`
                  : r.mis !== null ? phraseDeLaPoche(poche, dessus, r.mis) : null}
              </span>
            )}
          </span>
          <Photo epargne taille={46} />
        </button>
        <button role="radio" aria-checked={!mettre} tabIndex={!mettre ? 0 : -1}
                onClick={() => changer({ ...choix, garder: true })}
                onKeyDown={flechesDe(1, [r.possible, true], i => changer({ ...choix, garder: i === 1 }))}
                className={option(!mettre)}>
          <Pastille actif={!mettre} />
          <span className="grow min-w-0">
            <span className="block text-[16px] font-semibold">Le garder sur le compte</span>
            {!mettre && reste > 0 && !incertain && (
              <span className="block mt-0.5 text-[14px] text-doux">
                Il reste disponible pour {nomDuMois(moisVoisin(mois, 1))}.
              </span>
            )}
          </span>
        </button>
      </div>
      {r.raison && <p className="mt-2 text-[14px] text-doux">{r.raison}</p>}

      {mettre && poches.length > 1 && (
        <div role="radiogroup" aria-label="Sur quelle poche" className="mt-3 flex flex-wrap gap-2">
          {poches.map((p, i) => (
            <button key={p.id} role="radio" aria-checked={poche?.id === p.id}
                    tabIndex={poche?.id === p.id ? 0 : -1}
                    onClick={() => changer({ ...choix, poche: p.id })}
                    onKeyDown={flechesDe(i, poches.map(() => true), k => changer({ ...choix, poche: poches[k].id }))}
                    className={`min-h-11 px-4 rounded-full text-[15px]
                                ${poche?.id === p.id ? 'bg-encre text-fond' : 'bg-piste'}`}>
              {p.libelle}
            </button>
          ))}
        </div>
      )}

      {mettre && (
        <>
          <label className="mt-4 block">
            <span className="text-[14px] text-doux">Combien mettre de côté</span>
            <span className="mt-1.5 flex items-center rounded-[16px] border-2 border-herbe bg-surface px-4">
              <input value={choix.combien ?? (incertain ? '' : saisiDe(reste))}
                     placeholder={incertain ? (choix.tout ? 'Tout ce qui reste' : 'Un montant') : undefined}
                     onChange={e => changer({ ...choix, combien: e.target.value, tout: false })}
                     inputMode="decimal" aria-label="Combien mettre de côté"
                     className="champ-montant chiffre grow min-w-0 bg-transparent py-3 text-[28px] outline-none" />
              <span aria-hidden="true" className="chiffre text-[24px] text-doux">€</span>
            </span>
          </label>
          {(choix.combien !== null || r.aChoisir) && (
            <button onClick={() => changer({ ...choix, combien: null, tout: true })}
                    className="mt-1 min-h-11 text-[14px] font-semibold text-herbe">
              Tout ce qui reste
            </button>
          )}
          {r.tape?.refus && (
            <p role="alert" className="mt-1 text-[14px]" style={{ color: 'var(--color-ocre)' }}>
              {r.tape.refus}
            </p>
          )}
          {r.aChoisir && (
            /* Le reste n'est pas chiffrable avant les soldes : rien ne part tant que la personne n'a
               ni tapé un montant ni choisi « Tout ce qui reste ». */
            <p role="status" className="mt-1 text-[14px] text-doux">
              Écris un montant, ou touche « Tout ce qui reste ».
            </p>
          )}
          {r.vide && (
            /* Un champ vidé éteignait « Clôturer » sans un mot. Pas d'alerte : vider un champ pour
               retaper n'est pas une faute, mais le bouton éteint se dit. */
            <p role="status" className="mt-1 text-[14px] text-doux">
              Écris un montant, ou 0 pour ne rien mettre de côté.
            </p>
          )}
          {r.rogne && (
            <p className="mt-1 text-[14px] text-doux">
              Au plus {montant(reste)} : c’est tout ce qui reste.
            </p>
          )}
        </>
      )}
    </>
  )
}
