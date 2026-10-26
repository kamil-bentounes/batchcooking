/**
 * « On range » : la seconde étape du dressage (écran `/dressage`, après « C'est dressé »).
 *
 * Les barquettes sont dressées ; reste à décider où elles vont. L'hôte choisit, recette par recette
 * et pour le foyer entier, combien restent au frigo — le reste part au congélateur —, et à quelle
 * heure c'est rangé. La proposition de départ remplit le frigo jusqu'à quatre jours de dîners.
 *
 * C'est aussi ici que la session retire du stock ce que les recettes ont pris (migration 0120) : la
 * liste est calculée, l'hôte corrige ce qui n'est pas juste (« il en reste la moitié »).
 *
 * « Ranger » est UN appel à la base (`range_la_session`) : barquettes, stock, passage à la semaine, dans
 * une transaction verrouillée. Si le rangement a déjà eu lieu, l'écran montre ce qui est écrit, en
 * lecture seule, et se contente de finir.
 */
import { useMemo, useRef, useState } from 'react'
import { Attente, Erreur, Passage, Principal, Secondaire } from '../ui/coque.tsx'
import type { Cycle } from '../lib/donnees/cycle.ts'
import type { Membre } from '../lib/donnees/foyer.ts'
import type { RecetteMesuree } from '../lib/donnees/recettes.ts'
import { useCeQueLaSessionPrend, usePortionsDuCycle, useRangeLaSession, useStock } from '../lib/donnees/barquettes.ts'
import type { ADresser } from '../lib/donnees/barquettes.ts'
import type { Repartition } from '../lib/nutrition/portions.ts'
import { maintenant } from '../lib/horloge.ts'
import type { LignePrise } from '../lib/ranger.ts'
import {
  JOURS_AU_FRAIS, bilanDuFrigo, corrections, ecritLaPrise, jourEtHeure, lisLeReste, messageDuReste,
  ordreDeRangement, phraseDuCongelo, phraseDuFrigo, platsRanges, plusAncienRangement, pourLeChamp,
  pourLeFoyer, propositionAuFrigo, puces, rangeLeDe, resteApres, resteAuFrigo, verifieLeRangement,
} from '../lib/ranger.ts'

export type Decoupe = { recette: RecetteMesuree; repartition: Repartition }

const nombreDe = (d: Decoupe) => d.repartition.parts.reduce((n, p) => n + p.nombre, 0)

/** La marge du plat entier ramenée à une part. Nulle quand tout était pesé. */
function partDeLaMarge(r: RecetteMesuree, grammes: number, cle: 'kcal' | 'proteinG'): number | null {
  if (r.plat.grammes <= 0) return null
  const m = r.agregat.marge[cle] * (grammes / r.plat.grammes)
  return m < 1 ? null : Math.round(m * 10) / 10
}

/**
 * Les lots à créer, une barquette par lot, avec le lieu choisi pour sa recette : les premières
 * (chacun à son tour) au frigo, les dernières au congélateur.
 */
function lotsARanger(decoupes: Decoupe[], auFrigo: (recipeId: string) => number): ADresser[] {
  const lots: ADresser[] = []
  /* Le frigo déjà donné : la recette suivante commence par la personne suivante, de sorte qu'une seule
     barquette au frais par recette n'aille pas toujours à la même. */
  let auFraisDeja = 0
  for (const { recette, repartition } of decoupes) {
    const frigo = auFrigo(recette.recipeId)
    const partDe = new Map(repartition.parts.map(p => [p.userId, p]))
    ordreDeRangement(repartition.parts, auFraisDeja).forEach((userId, rang) => {
      const p = partDe.get(userId)!
      lots.push({
        recipeId: recette.recipeId,
        label: recette.titre,
        nombre: 1,
        grammes: p.grammes,
        kcal: p.kcal,
        proteinG: p.proteinG,
        fiberG: p.fiberG,
        carbG: p.carbG,
        fatG: p.fatG,
        margeKcal: partDeLaMarge(recette, p.grammes, 'kcal'),
        margeProteinG: partDeLaMarge(recette, p.grammes, 'proteinG'),
        forUserId: p.userId,
        location: rang < frigo ? 'frigo' : 'congelateur',
      })
    })
    auFraisDeja += frigo
  }
  return lots
}

const AUCUNE_PRISE: LignePrise[] = []

/** Une recette rangée : la barre frigo/congélateur, les deux nombres, et — à régler — « − » et « + ». */
function CartePlat({ titre, frigo, congelo, rangeLe, regle }: {
  titre: string; frigo: number; congelo: number; rangeLe: Date
  /** Absent : le rangement a déjà eu lieu, la carte se lit seulement. */
  regle?: (delta: number) => void
}) {
  const n = frigo + congelo
  return (
    <section aria-label={titre}
             className="rounded-[20px] bg-surface p-4 shadow-[inset_0_0_0_1px_var(--color-brume)]">
      <div className="flex items-baseline justify-between gap-2.5">
        <h2 className="titre text-[20px] font-semibold leading-[1.15]">{titre}</h2>
        <span className="whitespace-nowrap text-[13px] text-doux">
          {n} barquette{n > 1 ? 's' : ''}
        </span>
      </div>

      <div className="mt-3 flex h-2.5 overflow-hidden rounded-md bg-congel-clair" aria-hidden="true">
        <div className="h-full bg-herbe transition-[width] duration-300 ease-out motion-reduce:transition-none"
             style={{ width: `${n > 0 ? Math.round((frigo / n) * 100) : 0}%` }} />
      </div>

      <div className="mt-3 flex items-center gap-2.5">
        <div className="flex-1">
          <div className="text-[14px] font-bold text-frais-encre">Frigo · {frigo}</div>
          <div className="mt-0.5 text-[12px] text-doux">{phraseDuFrigo(frigo, rangeLe)}</div>
        </div>
        {regle && (
          <div role="group" aria-label={`Barquettes de ${titre} au frigo`}
               className="flex items-center gap-1.5">
            <button onClick={() => regle(-1)} disabled={frigo <= 0}
                    aria-label="Une de moins au frigo"
                    className="size-11 rounded-[14px] bg-piste text-[22px] leading-none
                               disabled:opacity-40">−</button>
            <button onClick={() => regle(1)} disabled={frigo >= n}
                    aria-label="Une de plus au frigo"
                    className="size-11 rounded-[14px] bg-piste text-[22px] leading-none
                               disabled:opacity-40">+</button>
          </div>
        )}
      </div>
      <div className="mt-2">
        <div className="text-[14px] font-bold text-congel-encre">Congélateur · {congelo}</div>
        <div className="mt-0.5 text-[12px] text-doux">{phraseDuCongelo(congelo, rangeLe)}</div>
      </div>
    </section>
  )
}

export function Ranger({ cycle, decoupes, membres, retour, va }: {
  cycle: Cycle
  decoupes: Decoupe[]
  membres: Membre[]
  /** Revenir au dressage. */
  retour: () => void
  va: (v: string) => void
}) {
  const range = useRangeLaSession()
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<unknown>(null)

  /* Ce que la base a DÉJÀ : si le rangement a eu lieu (un autre téléphone, un premier appui dont la réponse
     s'est perdue), l'écran montre ce qui est écrit, en lecture seule — pas des réglages par défaut qui
     mentiraient sur le lieu et la date des barquettes. */
  const { data: rangees, isPending: rangeesEnLecture } = usePortionsDuCycle(cycle.id)
  const lectureSeule = (rangees?.length ?? 0) > 0
  /* Le cycle a quitté le dressage : tout est fait, il ne reste qu'à aller voir le frigo. */
  const fini = cycle.state !== 'dressage'

  /* Rangé maintenant, sauf si l'hôte dit autrement. Posé au montage : un champ qui avancerait
     tout seul changerait la date sous ses doigts. */
  const [rangeLe, setRangeLe] = useState(() => {
    const d = maintenant()
    d.setSeconds(0, 0)
    return d
  })
  const [champ, setChamp] = useState(() => pourLeChamp(rangeLe))
  const [messageDate, setMessageDate] = useState<string | null>(null)
  const [modifie, setModifie] = useState(false)

  const aRanger = useMemo(() => decoupes.filter(d => nombreDe(d) > 0), [decoupes])
  const nbMembres = membres.length
  const proposition = useMemo(() => propositionAuFrigo(
    aRanger.map(d => ({ recipeId: d.recette.recipeId, total: nombreDe(d) })), nbMembres,
  ), [aRanger, nbMembres])
  const [choix, setChoix] = useState<Record<string, number>>({})
  const auFrigo = (id: string) => choix[id] ?? proposition[id] ?? 0

  const plusRanges = useMemo(() => platsRanges(rangees ?? []), [rangees])
  const total = lectureSeule ? rangees!.length : aRanger.reduce((s, d) => s + nombreDe(d), 0)
  const auFrais = lectureSeule
    ? plusRanges.reduce((s, p) => s + p.frigo, 0)
    : aRanger.reduce((s, d) => s + auFrigo(d.recette.recipeId), 0)
  const dateDuBilan = lectureSeule ? (rangeLeDe(rangees!) ?? rangeLe) : rangeLe
  const bilan = bilanDuFrigo(auFrais, nbMembres, dateDuBilan)

  /* ── Ce que la session prend dans le stock ─────────────────────────────── */
  const dejaRetire = cycle.stock_retire_le !== null
  const aLire = !dejaRetire && !fini
  const prisesQ = useCeQueLaSessionPrend(cycle.id, aLire)
  /* « Ranger » attend que la lecture soit réglée (réussie ou en panne) : sinon le serveur retirerait du
     stock des lignes que l'hôte n'a jamais vues, ni pu corriger. */
  const prisesEnLecture = aLire && prisesQ.isPending
  const prisesLues = aLire && prisesQ.isSuccess
  const prisesEnPanne = aLire && prisesQ.isError
  const prises = prisesQ.data ?? AUCUNE_PRISE
  const { data: stock = [], isSuccess: stockLu } = useStock()
  const [restes, setRestes] = useState<Record<string, number>>({})
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [saisie, setSaisie] = useState('')
  const puceRef = useRef(new Map<string, HTMLButtonElement>())
  const chips = puces(prises)
  const lignes = ouverte ? chips.find(l => l.stock_item_id === ouverte) : undefined
  /* Le reste du frigo ne se dit qu'une fois la lecture faite : « le frigo moins ce que la session prend »
     n'a de sens qu'avec ce que la session prend. Pendant le chargement, ce serait TOUT le frigo. */
  const restantAuFrigo = prisesLues && stockLu ? resteAuFrigo(stock, prises) : []

  /** Referme la correction et rend le focus à la puce qu'elle corrigeait. */
  function ferme(id: string) {
    setOuverte(null)
    puceRef.current.get(id)?.focus()
  }

  function touche(id: string) {
    if (ouverte === id) { ferme(id); return }
    const l = chips.find(x => x.stock_item_id === id)!
    setOuverte(id)
    setSaisie(String(resteApres(l, restes)).replace('.', ','))
  }

  function valideLeReste() {
    if (!lignes) return
    const n = lisLeReste(saisie)
    if (n === null) return
    setRestes(r => ({ ...r, [lignes.stock_item_id]: Math.min(lignes.quantite ?? 0, n) }))
    ferme(lignes.stock_item_id)
  }

  function commeprevu() {
    if (!lignes) return
    setRestes(r => Object.fromEntries(Object.entries(r).filter(([id]) => id !== lignes.stock_item_id)))
    ferme(lignes.stock_item_id)
  }

  function changeLaDate(valeur: string) {
    setChamp(valeur)
    const v = verifieLeRangement(valeur, maintenant())
    if ('date' in v) { setRangeLe(v.date); setMessageDate(null) } else setMessageDate(v.message)
  }

  async function ranger() {
    if (enCours) return
    if (fini) { va('/semaine'); return }
    setEnCours(true)
    setErreur(null)
    try {
      const lots = lectureSeule ? [] : lotsARanger(aRanger, auFrigo)
      if (!lectureSeule && lots.length === 0) throw new Error('Rien à dresser.')
      /*
       * UN appel : les barquettes, le retrait du stock et le passage à « semaine » se font dans la même
       * transaction de la base (`range_la_session`, 0120). Elle verrouille le cycle : deux téléphones qui
       * appuient en même temps ne créent pas les barquettes deux fois — le second reçoit « déjà rangé » —,
       * et un appel rejoué ne retire pas deux fois du stock. Si les barquettes existent déjà, elle les
       * garde telles quelles et finit le travail.
       *
       * `retirer` : seulement si l'écran a LU ce que la session prend. Sinon (lecture en panne) on range
       * sans toucher au stock, ce que le message de l'écran dit.
       */
      const retirer = dejaRetire || prisesLues
      await range.mutateAsync({
        cycleId: cycle.id, lots, retirer,
        rangeLe: (lectureSeule ? maintenant() : rangeLe).toISOString(),
        restes: retirer ? corrections(prises, restes) : {},
      })
      /* Le geste suivant : choisir ce qu'on mange chaque jour. Rien n'est distribué tout seul. */
      va('/semaine')
    } catch (e) {
      setErreur(e)
    } finally {
      setEnCours(false)
    }
  }

  if (rangeesEnLecture) {
    return <Passage retour={retour} retourTexte="Dressage"><Attente /></Passage>
  }

  const pour = pourLeFoyer(nbMembres)
  const pluriel = total > 1 ? 's' : ''
  const rienARanger = !lectureSeule && total === 0

  return (
    <Passage retour={retour} retourTexte="Dressage">
      <h1 className="titre text-[36px] font-semibold leading-[1.05]">On range</h1>
      <p className="mt-2.5 text-[15px] leading-[1.45] text-doux">
        {fini
          ? `C’est rangé : ${total} barquette${pluriel} pour ${pour}.`
          : lectureSeule
            ? `${total} barquette${pluriel} déjà rangée${pluriel} pour ${pour} : voilà ce qui est écrit. Il ne reste qu’à finir.`
            : `${total} barquette${pluriel} pour ${pour}. Choisis ce qui reste au frigo : le reste part au congélateur.`}
      </p>

      {/* Rangé le ───────────────────────────────────────────────────────────── */}
      <div className="mt-5 rounded-[18px] bg-surface px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--color-brume)]">
        <div className="flex items-center gap-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-herbe)" strokeWidth="1.8"
               strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
          </svg>
          <div className="flex-1">
            <div className="text-[12px] text-doux">Rangé le</div>
            <div className="mt-0.5 text-[15px] font-semibold">
              {messageDate ? 'Date à corriger' : jourEtHeure(dateDuBilan)}
            </div>
          </div>
          {!lectureSeule && (
            <button onClick={() => setModifie(m => !m)} aria-expanded={modifie}
                    className="min-h-11 px-1 text-[14px] font-semibold text-herbe underline underline-offset-[3px]">
              {modifie ? 'Terminé' : 'Modifier'}
            </button>
          )}
        </div>
        {modifie && !lectureSeule && (
          <input type="datetime-local" aria-label="Date et heure du rangement"
                 value={champ} min={pourLeChamp(plusAncienRangement(maintenant()))} max={pourLeChamp(maintenant())}
                 onChange={e => changeLaDate(e.target.value)}
                 aria-invalid={messageDate !== null} aria-describedby={messageDate ? 'erreur-date' : undefined}
                 className="mt-3 h-11 w-full rounded-xl bg-fond px-3 text-[15px]
                            shadow-[inset_0_0_0_1px_var(--color-brume)]" />
        )}
        {messageDate && (
          <p id="erreur-date" role="alert" className="mt-2 text-[13px] leading-[1.45] text-groseille">
            {messageDate}
          </p>
        )}
      </div>

      {/* Une carte par recette ───────────────────────────────────────────────── */}
      <div className="mt-3.5 flex flex-col gap-3">
        {lectureSeule
          ? plusRanges.map(p => (
              <CartePlat key={p.recipeId ?? p.titre} titre={p.titre} frigo={p.frigo} congelo={p.congelo}
                         rangeLe={p.rangeLe} />
            ))
          : aRanger.map(d => {
              const { recipeId, titre } = d.recette
              const n = nombreDe(d)
              const frigo = auFrigo(recipeId)
              return (
                <CartePlat key={recipeId} titre={titre} frigo={frigo} congelo={n - frigo} rangeLe={rangeLe}
                           regle={delta => setChoix(c => ({ ...c, [recipeId]: Math.max(0, Math.min(n, frigo + delta)) }))} />
              )
            })}
      </div>

      {/* Le bilan du frigo ───────────────────────────────────────────────────── */}
      {!rienARanger && (
        <div role="status"
             className={`mt-3.5 rounded-[18px] px-4 py-3.5 ${bilan.trop ? 'bg-sable text-ocre' : 'bg-frais-fond text-frais-encre'}`}>
          <div className="text-[15px] font-bold">{bilan.titre}</div>
          <div className="mt-1 text-[13px] leading-[1.45]">{bilan.texte}</div>
        </div>
      )}

      {/* La session a pris ───────────────────────────────────────────────────── */}
      {dejaRetire ? (
        <p className="mt-[30px] text-[13px] leading-[1.45] text-doux">
          Les ingrédients de la session sont déjà retirés du stock.
        </p>
      ) : fini ? null : prisesEnLecture ? (
        <p className="mt-[30px] text-[13px] leading-[1.45] text-doux" role="status">
          Je regarde ce que la session prend dans le stock…
        </p>
      ) : prisesEnPanne ? (
        <p className="mt-[30px] text-[13px] leading-[1.45] text-doux">
          Je n’ai pas pu lire ce que la session prend dans le stock : il ne sera pas retiré.
        </p>
      ) : chips.length > 0 && (
        <>
          <h2 className="mt-[30px] text-[17px] font-bold">La session a pris</h2>
          <p className="mt-1.5 text-[13px] leading-[1.45] text-doux">
            Retiré du frigo, du congélateur et du placard d’après les recettes. Il en reste ? Touche-le pour corriger.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {chips.map(l => {
              const corrige = restes[l.stock_item_id] !== undefined
                && Math.abs(resteApres(l, restes) - (l.reste ?? 0)) > 1e-9
              const prise = (l.quantite ?? 0) - resteApres(l, restes)
              return (
                <li key={l.stock_item_id}>
                  <button onClick={() => touche(l.stock_item_id)}
                          ref={el => {
                            if (el) puceRef.current.set(l.stock_item_id, el)
                            else puceRef.current.delete(l.stock_item_id)
                          }}
                          aria-expanded={ouverte === l.stock_item_id}
                          className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-surface px-3 text-[13px]
                                      ${ouverte === l.stock_item_id
                                        ? 'shadow-[inset_0_0_0_2px_var(--color-herbe)]'
                                        : 'shadow-[inset_0_0_0_1px_var(--color-brume)]'}`}>
                    <span className="font-semibold">{l.libelle}</span>
                    <span className={corrige ? 'font-semibold text-ocre' : 'text-doux'}>
                      {prise > 0 ? ecritLaPrise(prise, l.unite) : 'rien'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {lignes && (() => {
            const probleme = messageDuReste(saisie)
            return (
              <div role="group" aria-label={`Corriger ${lignes.libelle}`}
                   onKeyDown={e => { if (e.key === 'Escape') ferme(lignes.stock_item_id) }}
                   className="mt-3 rounded-2xl bg-surface p-4 shadow-[inset_0_0_0_1px_var(--color-brume)]">
                <label className="block text-[13px] text-doux" htmlFor="reste-session">
                  {lignes.libelle} : il en reste
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input id="reste-session" inputMode="decimal" value={saisie} autoFocus
                         onChange={e => setSaisie(e.target.value)}
                         onKeyDown={e => { if (e.key === 'Enter') valideLeReste() }}
                         aria-invalid={probleme !== null}
                         aria-describedby={probleme ? 'reste-probleme' : undefined}
                         className="h-11 w-28 rounded-xl bg-fond px-3 text-[16px]
                                    shadow-[inset_0_0_0_1px_var(--color-brume)]" />
                  <span className="text-[14px] text-doux">
                    {lignes.unite && lignes.unite !== 'u' ? lignes.unite : ''}
                    {` (il y en avait ${ecritLaPrise(lignes.quantite ?? 0, lignes.unite)})`}
                  </span>
                </div>
                {probleme && (
                  <p id="reste-probleme" role="alert" className="mt-2 text-[13px] leading-[1.45] text-groseille">
                    {probleme}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <button onClick={valideLeReste} disabled={probleme !== null}
                          className="min-h-11 rounded-xl bg-herbe px-5 text-[15px] font-semibold text-fond
                                     disabled:bg-brume disabled:text-encre">
                    Corriger
                  </button>
                  <button onClick={commeprevu}
                          className="min-h-11 px-2 text-[14px] font-semibold text-herbe underline underline-offset-[3px]">
                    Comme prévu
                  </button>
                </div>
              </div>
            )
          })()}
        </>
      )}

      {restantAuFrigo.length > 0 && (
        <div className="mt-4 rounded-2xl bg-frais-fond px-3.5 py-3 text-[13px] leading-[1.45]">
          <strong>Reste au frigo :</strong>{' '}
          {restantAuFrigo.slice(0, 6).join(', ')}{restantAuFrigo.length > 6 ? '…' : '.'}
        </div>
      )}

      <div className="mt-[26px]">
        {rienARanger ? (
          <p role="status" className="rounded-[18px] bg-sable px-4 py-3.5 text-[15px] leading-[1.45] text-ocre">
            Il n’y a aucune barquette à ranger : le dressage n’en a produit aucune. Reviens au dressage pour
            vérifier les parts.
          </p>
        ) : (
          <Principal onClick={ranger} disabled={enCours || messageDate !== null || prisesEnLecture}>
            {enCours ? 'Je range…'
              : fini ? 'Choisir les repas de la semaine'
              : lectureSeule ? 'Terminer le rangement'
              : `Ranger ${total === 1 ? 'la barquette' : `les ${total} barquettes`}`}
          </Principal>
        )}
        <Erreur de={erreur} />
        {fini && <Secondaire onClick={() => va('/frigo')}>Voir le frigo</Secondaire>}
        {!fini && !rienARanger && (
          <p className="mt-3 text-center text-[13px] text-doux">
            Le frigo garde {JOURS_AU_FRAIS} jours. Ensuite, tu choisis ce que tu manges chaque jour : la semaine
            t’attend. Tout reste modifiable depuis le frigo.
          </p>
        )}
      </div>
    </Passage>
  )
}
