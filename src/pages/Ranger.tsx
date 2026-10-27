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
 *
 * Refaite le 27/10/2026 d'après la maquette `dressage.html` : carte encre avec les deux compteurs en valeur
 * (« 8 au frigo », « 22 au congélateur »), une carte par recette avec sa photo, « La session a pris » en pastilles.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { enFrancais } from '../lib/reseau.ts'
import type { Cycle } from '../lib/donnees/cycle.ts'
import type { Membre } from '../lib/donnees/foyer.ts'
import type { RecetteMesuree } from '../lib/donnees/recettes.ts'
import { useCeQueLaSessionPrend, usePortionsDuCycle, useRangeLaSession, useStock } from '../lib/donnees/barquettes.ts'
import type { ADresser } from '../lib/donnees/barquettes.ts'
import type { Repartition } from '../lib/nutrition/portions.ts'
import { maintenant } from '../lib/horloge.ts'
import { barquettes } from '../lib/dressage.ts'
import {
  Action, Avis, BoutonAction, BoutonDiscret, Carte, Chargement, Colonnes, EnPanne, Page, Picto, Resume, Vignette,
} from '../ui/dressage/Habillage.tsx'
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

/** Une recette rangée : sa photo, la barre frigo/congélateur, les deux nombres, et — à régler — « − » et « + ». */
function CartePlat({ titre, photo, frigo, congelo, rangeLe, regle }: {
  titre: string; photo: string | null | undefined; frigo: number; congelo: number; rangeLe: Date
  /** Absent : le rangement a déjà eu lieu, la carte se lit seulement. */
  regle?: (delta: number) => void
}) {
  const n = frigo + congelo
  const pas = 'grid size-11 place-items-center rounded-[14px] bg-piste disabled:opacity-40'
  return (
    <Carte label={titre}>
      <div className="grid grid-cols-[56px_1fr] items-center gap-3.5">
        <Vignette photo={photo} taille={56} />
        <div className="min-w-0">
          <h2 className="titre text-[19px] font-semibold leading-[1.15] [overflow-wrap:anywhere] min-[900px]:text-[21px]">{titre}</h2>
          <span className="mt-0.5 block text-[13.5px] text-doux">{n} barquette{n > 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="my-3.5 flex h-3 overflow-hidden rounded-[7px] bg-congel-clair" aria-hidden="true">
        <div className="h-full bg-herbe transition-[width] duration-300 ease-out motion-reduce:transition-none"
             style={{ width: `${n > 0 ? Math.round((frigo / n) * 100) : 0}%` }} />
      </div>

      <div className="flex min-h-11 items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[15px] font-bold text-frais-encre">
            <Picto nom="frigo" taille={18} />Frigo · {frigo}
          </div>
          <div className="mt-px text-[12.5px] text-doux">{phraseDuFrigo(frigo, rangeLe)}</div>
        </div>
        {regle && (
          <div role="group" aria-label={`Barquettes de ${titre} au frigo`} className="flex gap-2">
            <button onClick={() => regle(-1)} disabled={frigo <= 0} aria-label="Une de moins au frigo" className={pas}>
              <Picto nom="moins" />
            </button>
            <button onClick={() => regle(1)} disabled={frigo >= n} aria-label="Une de plus au frigo" className={pas}>
              <Picto nom="plus" />
            </button>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex min-h-11 items-center border-t border-brume pt-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[15px] font-bold text-congel-encre">
            <Picto nom="flocon" taille={18} />Congélateur · {congelo}
          </div>
          <div className="mt-px text-[12.5px] text-doux">{phraseDuCongelo(congelo, rangeLe)}</div>
        </div>
      </div>
    </Carte>
  )
}

export function Ranger({ cycle, decoupes, membres, userId, retour, va }: {
  cycle: Cycle
  decoupes: Decoupe[]
  membres: Membre[]
  userId?: string
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
  const { data: rangees, isPending: rangeesEnLecture, isError: rangeesEnPanne, refetch: relireLesRangees } = usePortionsDuCycle(cycle.id)
  /* On arrive du bas de la page précédente : l'écran repart du haut, et le titre annonce l'étape. */
  const titre = useRef<HTMLHeadingElement>(null)
  useEffect(() => { window.scrollTo?.(0, 0) }, [])
  useEffect(() => { if (!rangeesEnLecture && !rangeesEnPanne) titre.current?.focus() }, [rangeesEnLecture, rangeesEnPanne])
  const photoDe = useMemo(() => new Map(decoupes.map(d => [d.recette.recipeId, d.recette.photo])), [decoupes])
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

  const sortie = { retour, retourTexte: 'Dressage', va, userId }
  if (rangeesEnLecture) return <Page {...sortie}><Chargement /></Page>
  /* Sans cette lecture, on ne sait pas si le rangement a déjà eu lieu : on ne propose pas de réglages par défaut. */
  if (rangeesEnPanne) return <Page {...sortie}><EnPanne reessayer={() => void relireLesRangees()} /></Page>

  const pour = pourLeFoyer(nbMembres)
  const pluriel = total > 1 ? 's' : ''
  const rienARanger = !lectureSeule && total === 0
  const auFroid = total - auFrais
  const dejaRange = lectureSeule && !fini
  const taille = (n: number) => `minmax(124px, ${Math.max(n, 1)}fr)`

  /* Le reste du frigo : dans la carte de la session ; seul quand elle n'a aucune pastille à montrer. */
  const reste = restantAuFrigo.length > 0 && (
    <Avis ton="frais" picto="info">
      <strong className="font-semibold">Reste au frigo :</strong>{' '}
      {restantAuFrigo.slice(0, 6).join(', ')}{restantAuFrigo.length > 6 ? '…' : '.'}
    </Avis>
  )

  /* ── Ce que la session a pris : la carte des pastilles, ou la phrase qui dit pourquoi il n'y en a pas ─── */
  const phraseSeule = (texte: string, statut?: 'status') => (
    <Carte><p role={statut} className="text-[13.5px] leading-[1.45] text-doux">{texte}</p></Carte>
  )
  const session = dejaRetire
    ? phraseSeule('Les ingrédients de la session sont déjà retirés du stock.')
    : fini ? null : prisesEnLecture
      ? phraseSeule('Je regarde ce que la session prend dans le stock…', 'status')
      : prisesEnPanne
        ? phraseSeule('Je n’ai pas pu lire ce que la session prend dans le stock : il ne sera pas retiré.')
        : chips.length > 0 && (
          <Carte>
            <h2 className="titre text-[20px] font-semibold">La session a pris</h2>
            <p className="mt-1.5 text-[13.5px] leading-[1.4] text-doux">
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
                            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[14px]
                                        ${ouverte === l.stock_item_id
                                          ? 'shadow-[inset_0_0_0_2px_var(--color-herbe)]'
                                          : 'shadow-[inset_0_0_0_1.5px_var(--color-brume)]'}`}>
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
                     className="mt-3 rounded-[18px] bg-fond p-3.5">
                  <label className="block text-[13.5px] text-doux" htmlFor="reste-session">
                    {lignes.libelle} : il en reste
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-2.5">
                    <input id="reste-session" inputMode="decimal" value={saisie} autoFocus
                           onChange={e => setSaisie(e.target.value)}
                           onKeyDown={e => { if (e.key === 'Enter') valideLeReste() }}
                           aria-invalid={probleme !== null}
                           aria-describedby={probleme ? 'reste-probleme' : undefined}
                           className="chiffre h-12 w-28 rounded-[14px] bg-surface px-3.5 text-[20px] font-semibold
                                      shadow-[inset_0_0_0_1.5px_var(--color-brume)]" />
                    <span className="text-[13.5px] text-doux">
                      {lignes.unite && lignes.unite !== 'u' ? lignes.unite : ''}
                      {` (il y en avait ${ecritLaPrise(lignes.quantite ?? 0, lignes.unite)})`}
                    </span>
                  </div>
                  {probleme && (
                    <p id="reste-probleme" role="alert" className="mt-2 text-[13.5px] font-semibold leading-[1.4] text-groseille">
                      {probleme}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <button onClick={valideLeReste} disabled={probleme !== null}
                            className="min-h-12 rounded-2xl bg-herbe px-[18px] text-[16px] font-semibold text-fond
                                       disabled:bg-brume disabled:text-encre">
                      Corriger
                    </button>
                    <button onClick={commeprevu}
                            className="min-h-11 px-2 text-[15px] font-semibold text-herbe underline underline-offset-[3px]">
                      Comme prévu
                    </button>
                  </div>
                </div>
              )
            })()}

            {reste && <div className="mt-3">{reste}</div>}
          </Carte>
        )

  return (
    <Page {...sortie}>
      <Colonnes
        resume={
          <Resume etape="ranger">
            <h1 ref={titre} tabIndex={-1} className="titre mt-4 text-[30px] font-semibold"
                style={{ fontVariationSettings: '"opsz" 120, "SOFT" 50, "WONK" 0' }}>
              On range
            </h1>
            {!dejaRange && (
              <p className="mt-3 text-[15px] leading-[1.45] text-surface/80 min-[900px]:text-base">
                {fini
                  ? `C’est rangé : ${total} barquette${pluriel} pour ${pour}.`
                  : `${total} barquette${pluriel} pour ${pour}. Choisis ce qui reste au frigo : le reste part au congélateur.`}
              </p>
            )}
            {!rienARanger && (
              <div className="mt-4 grid gap-1.5 min-[900px]:mb-0"
                   style={{ gridTemplateColumns: `${taille(auFrais)} ${taille(auFroid)}` }}>
                <div className="min-w-0 rounded-2xl bg-frais-fond/15 px-3 py-2.5">
                  <b className="chiffre block text-[34px] font-semibold leading-none">{auFrais}</b>
                  <span className="mt-[3px] block text-[12.5px] leading-[1.2] text-surface/75">au frigo</span>
                </div>
                <div className="min-w-0 rounded-2xl bg-congel/35 px-3 py-2.5">
                  <b className="chiffre block text-[34px] font-semibold leading-none">{auFroid}</b>
                  <span className="mt-[3px] block text-[12.5px] leading-[1.2] text-surface/75">au congélateur</span>
                </div>
              </div>
            )}
          </Resume>
        }
        avis={
          <>
            {dejaRange && (
              <Avis ton="frais" picto="coche" role="status">
                {`${barquettes(total)} déjà rangée${pluriel} pour ${pour} : voilà ce qui est écrit. Il ne reste qu’à finir.`}
              </Avis>
            )}
            {/* Rangé le ───────────────────────────────────────────────────────── */}
            <Carte>
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-frais-fond text-herbe">
                  <Picto nom="horloge" taille={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-doux">Rangé le</div>
                  <div className="text-[16px] font-semibold">
                    {messageDate ? 'Date à corriger' : jourEtHeure(dateDuBilan)}
                  </div>
                </div>
                {!lectureSeule && (
                  <button onClick={() => setModifie(m => !m)} aria-expanded={modifie}
                          className="min-h-11 px-1 text-[15px] font-semibold text-herbe underline underline-offset-[3px]">
                    {modifie ? 'Terminé' : 'Modifier'}
                  </button>
                )}
              </div>
              {modifie && !lectureSeule && (
                <input type="datetime-local" aria-label="Date et heure du rangement"
                       value={champ} min={pourLeChamp(plusAncienRangement(maintenant()))} max={pourLeChamp(maintenant())}
                       onChange={e => changeLaDate(e.target.value)}
                       aria-invalid={messageDate !== null} aria-describedby={messageDate ? 'erreur-date' : undefined}
                       className="mt-3 h-12 w-full rounded-[14px] bg-fond px-3.5 text-[16px]
                                  shadow-[inset_0_0_0_1.5px_var(--color-brume)]" />
              )}
              {messageDate && (
                <p id="erreur-date" role="alert" className="mt-2 text-[13.5px] font-semibold leading-[1.4] text-groseille">
                  {messageDate}
                </p>
              )}
            </Carte>

            {/* Le bilan du frigo ───────────────────────────────────────────────── */}
            {!rienARanger && (
              <Avis ton={bilan.trop ? 'sable' : 'frais'} picto="frigo" role="status">
                <b className="font-semibold">{bilan.titre}.</b> {bilan.texte}
              </Avis>
            )}
          </>
        }
        recettes={
          <div className="flex flex-col gap-3 min-[900px]:gap-5">
            {/* Une carte par recette ─────────────────────────────────────────── */}
            <div className="grid gap-3 min-[900px]:grid-cols-2 min-[900px]:items-start min-[900px]:gap-5">
              {lectureSeule
                ? plusRanges.map(p => (
                    <CartePlat key={p.recipeId ?? p.titre} titre={p.titre} photo={p.recipeId ? photoDe.get(p.recipeId) : null}
                               frigo={p.frigo} congelo={p.congelo} rangeLe={p.rangeLe} />
                  ))
                : aRanger.map(d => {
                    const { recipeId, titre } = d.recette
                    const n = nombreDe(d)
                    const frigo = auFrigo(recipeId)
                    return (
                      <CartePlat key={recipeId} titre={titre} photo={d.recette.photo} frigo={frigo} congelo={n - frigo}
                                 rangeLe={rangeLe}
                                 regle={delta => setChoix(c => ({ ...c, [recipeId]: Math.max(0, Math.min(n, frigo + delta)) }))} />
                    )
                  })}
            </div>
            {session}
            {chips.length === 0 && reste}
          </div>
        }
        action={
          <Action note={!fini && !rienARanger
            ? `Le frigo garde ${JOURS_AU_FRAIS} jours. Ensuite, tu choisis ce que tu manges chaque jour : la semaine t’attend. Tout reste modifiable depuis le frigo.`
            : undefined}>
            {rienARanger ? (
              <Avis ton="erreur" picto="alerte" role="alert">
                Il n’y a aucune barquette à ranger : le dressage n’en a produit aucune. Reviens au dressage pour
                vérifier les parts.
              </Avis>
            ) : (
              <BoutonAction onClick={ranger} disabled={enCours || messageDate !== null || prisesEnLecture}>
                {enCours ? 'Je range…'
                  : fini ? 'Choisir les repas de la semaine'
                  : lectureSeule ? 'Terminer le rangement'
                  : `Ranger ${total === 1 ? 'la barquette' : `les ${total} barquettes`}`}
              </BoutonAction>
            )}
            {erreur != null && (
              <Avis ton="erreur" picto="alerte" role="alert" className="mt-3">
                {enFrancais(erreur instanceof Error ? erreur.message : String(erreur))}
              </Avis>
            )}
            {fini && <BoutonDiscret onClick={() => va('/frigo')}>Voir le frigo</BoutonDiscret>}
          </Action>
        } />
    </Page>
  )
}
