/**
 * Peser (lot 0c, §5.2.1).
 *
 * C'est l'écran qui rend la promesse « strict » vraie. « 2 oignons » ne se
 * convertit pas en grammes tout seul : une table de référence donne 110 g,
 * d'après l'USDA — mais un oignon d'ici n'est pas un oignon médian américain,
 * et c'est cet écart-là qui fait mentir une promesse de macros.
 *
 * Trois partis pris, tous destinés à ce que la boucle TIENNE dans la durée :
 *
 *  · **la friction décroît.** On ne pèse un aliment que jusqu'à le connaître —
 *    trois fois — puis plus jamais. L'écran le dit à chaque ligne.
 *  · **on commence par ce qui sert le plus.** Trente lignes à peser, personne
 *    ne les fait ; les trois qui reviennent dans quatre recettes, si.
 *  · **une aberrante se dit avant d'enregistrer.** « 1,2 kg pour un oignon »
 *    est une faute de frappe : l'annoncer au moment du geste vaut mieux que de
 *    la laisser disparaître en silence dans un filtre.
 */
import { useRef, useState } from 'react'
import { Attente, Erreur, Principal } from '../ui/coque.tsx'
import { useCycle } from '../lib/donnees/cycle.ts'
import { useAPeser, useOubliePesee, usePese, usePesees } from '../lib/donnees/pesee.ts'
import type { APeser } from '../lib/pesee.ts'
import { seraRetenue } from '../lib/pesee.ts'
import {
  Astuce, BalanceDessinee, BoutonContour, Carte, Colonne, Deux, EnteteDeCarte, IcoAlerte, IcoBalance, PassageLarge,
} from '../ui/saisies/Cadre.tsx'
import { phraseDesSeuils, recettesDit, restantesApres, seuilDe } from '../ui/saisies/pesee.ts'

export function Peser({ retour }: { retour: () => void }) {
  const { data: cycle, isPending: cycleEnCours, error: panneCycle } = useCycle()
  const { data: aPeser = [], isPending, fetchStatus, error: panneListe } = useAPeser(cycle?.id)
  /* Sans semaine ouverte la requête est DÉSACTIVÉE : `isPending` y reste vrai pour toujours. On n'attend que ce qui se charge. */
  const attend = cycleEnCours || (isPending && fetchStatus !== 'idle')
  const panne = panneCycle ?? panneListe
  const [ouvert, setOuvert] = useState<string | null>(null)
  const rien = !attend && !panne && aPeser.length === 0

  // 3 pesées avec un poids de référence, 5 sans (migration 0025) : l'en-tête dit les deux quand les deux existent.
  const phraseSeuils = phraseDesSeuils(aPeser.map(seuilDe))

  return (
    <PassageLarge retour={retour}>
      <Deux rapport="5-7">
        <Colonne className="max-[899px]:contents">
          <section aria-labelledby="titre-peser"
                   className="sur-encre min-w-0 rounded-[26px] bg-encre p-[18px] text-surface max-[899px]:order-1 min-[900px]:rounded-[28px] min-[900px]:p-6">
            <span className="text-[14px] text-surface/75">Ce que la semaine demande</span>
            <h1 id="titre-peser" className="titre-fort mt-2 text-[34px] leading-[1.05] max-[360px]:text-[30px] min-[900px]:text-[46px]">
              Peser
            </h1>
            <p className="mt-2.5 max-w-[46ch] text-[15px] leading-[1.45] text-surface/80">
              « 2 oignons » ne fait pas des grammes tout seul. Pèse-les une fois, puis deux, puis trois, et l’app ne te le
              redemandera plus jamais.
            </p>
            {!attend && !panne && aPeser.length > 0 && (
              <div className="mt-3.5 flex items-end gap-3.5">
                <span className="chiffre text-[64px] font-semibold leading-[.95] tracking-[-.03em] text-safran">{aPeser.length}</span>
                <span className="pb-1.5 text-[14.5px] leading-[1.3] text-surface/75">
                  {aPeser.length > 1 ? 'aliments à connaître,' : 'aliment à connaître'}
                  {aPeser.length > 1 && <><br />les plus utiles d’abord</>}
                </span>
              </div>
            )}
            <BalanceDessinee />
          </section>

          <Astuce className="max-[899px]:order-4">
            <b>Pèse ce que tu vas vraiment mettre dedans :</b> l’oignon épluché, le poivron épépiné. C’est ce poids-là qui
            compte dans l’assiette, et c’est celui que la recette suppose.
          </Astuce>

          {rien && (
            <Carte className="grid gap-2.5 max-[899px]:order-2">
              <span className="grid size-12 place-items-center rounded-2xl bg-piste text-doux"><IcoBalance /></span>
              <h2 className="titre text-[19px] font-semibold">Rien à peser</h2>
              <p className="text-[13.5px] leading-[1.4] text-doux">
                {cycle
                  ? 'Toutes les recettes de ce cycle se convertissent déjà en grammes.'
                  : 'Choisis des recettes : ce sont elles qui disent quoi peser.'}
              </p>
            </Carte>
          )}
        </Colonne>

        <Colonne className="max-[899px]:contents">
          {!rien && (
            <Carte className="max-[899px]:order-2">
              <EnteteDeCarte titre="À peser"
                             droite={phraseSeuils && <span className="text-[13.5px] text-doux">{phraseSeuils}</span>} />
              {attend ? <Attente /> : panne ? <Erreur de={panne} /> : (
                <ul className="grid">
                  {aPeser.map(a => (
                    <Aliment key={a.food_id} a={a} cycleId={cycle?.id ?? null}
                             ouvert={ouvert === a.food_id}
                             surOuvre={() => setOuvert(ouvert === a.food_id ? null : a.food_id)} />
                  ))}
                </ul>
              )}
            </Carte>
          )}

          <div className="max-[899px]:order-3"><BoutonContour onClick={retour}>Revenir</BoutonContour></div>
        </Colonne>
      </Deux>
    </PassageLarge>
  )
}

/** Trois points qui se remplissent : on voit d'un coup d'œil combien de pesées restent. */
function Points({ faites, seuil }: { faites: number; seuil: number }) {
  return (
    <span className="flex shrink-0 items-center gap-[5px]">
      <span aria-hidden="true" className="flex items-center gap-[5px]">
        {Array.from({ length: seuil }, (_, i) => (
          <i key={i} className={`size-3 rounded-full ${i < faites ? 'bg-herbe' : 'bg-piste shadow-[inset_0_0_0_1.5px_var(--color-doux)]'}`} />
        ))}
      </span>
      <small className="ml-1.5 whitespace-nowrap text-[12.5px] font-semibold text-doux">{faites} sur {seuil}</small>
    </span>
  )
}

function Aliment({ a, cycleId, ouvert, surOuvre }: {
  a: APeser; cycleId: string | null; ouvert: boolean; surOuvre: () => void
}) {
  const [quantite, setQuantite] = useState('1')
  const [grammes, setGrammes] = useState('')
  const pese = usePese()
  const oublie = useOubliePesee()
  const { data: pesees = [] } = usePesees(ouvert ? a.food_id : '')

  const q = Number(quantite.replace(',', '.'))
  const g = Number(grammes.replace(',', '.'))
  const saisi = grammes.trim() !== '' && Number.isFinite(g) && g > 0
                && Number.isFinite(q) && q > 0
  // On le dit AVANT d'enregistrer : une aberrante disparaîtrait sinon en
  // silence dans un filtre, et personne ne comprendrait pourquoi le compteur
  // n'avance pas.
  const aberrante = saisi && !seraRetenue(g, q, a.reference)

  const seuil = seuilDe(a)
  const faites = Math.min(a.progres?.faites ?? 0, seuil)
  const restantes = restantesApres(a)
  const idNote = `aberrante-${a.food_id}`

  /* `isPending` ne se met à jour qu'au rendu suivant : un double appui rapide passait entre les deux. Le verrou est
     une référence, lue à l'instant du second appui. */
  const enCours = useRef(false)
  async function enregistre() {
    if (enCours.current || pese.isPending) return
    enCours.current = true
    try {
      await pese.mutateAsync({
        foodId: a.food_id, quantite: q, grammes: g, cycleId,
      })
      setGrammes('')
      setQuantite('1')
    } catch {
      // L'erreur s'affiche sous le bouton, la saisie reste : on peut réessayer.
    } finally {
      enCours.current = false
    }
  }

  return (
    <li data-ouvert={ouvert}
        className={ouvert
          ? '-mx-3.5 my-1.5 rounded-[20px] bg-fond p-3.5'
          : 'border-t border-brume first:border-t-0 [[data-ouvert=true]+&]:border-t-0'}>
      <button type="button" onClick={surOuvre} aria-expanded={ouvert}
              className={`grid w-full min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-left max-[360px]:grid-cols-[minmax(0,1fr)]
                          ${ouvert ? '' : 'py-3.5'}`}>
        <span className="min-w-0">
          <b className="block text-[17px] font-semibold">{a.nom}</b>
          <span className="mt-0.5 block text-[13px] leading-[1.35] text-doux">
            {a.exemple}
            {recettesDit(a) && ` · ${recettesDit(a)}`}
            {a.reference !== null
              ? ` · on compte ${a.reference} g en attendant`
              : ' · aucun poids de référence'}
          </span>
        </span>
        <Points faites={faites} seuil={seuil} />
      </button>

      {ouvert && (
        <div>
          <div className="mt-3.5 grid grid-cols-[92px_minmax(0,1fr)] items-end gap-3 max-[360px]:grid-cols-[80px_minmax(0,1fr)]">
            <label className="grid gap-1.5">
              <span className="text-[14px] font-semibold">Combien</span>
              <input inputMode="decimal" value={quantite}
                     onChange={e => setQuantite(e.target.value)}
                     className="chiffre min-h-[54px] w-full min-w-0 rounded-[14px] border-[1.5px] border-brume bg-surface px-3.5
                                text-center text-[22px] font-semibold" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[14px] font-semibold">Pèsent, en grammes</span>
              <input inputMode="decimal" value={grammes} autoFocus
                     onChange={e => setGrammes(e.target.value)}
                     placeholder={a.reference !== null ? String(a.reference) : '—'}
                     aria-invalid={aberrante || undefined}
                     aria-describedby={aberrante ? idNote : undefined}
                     className={`chiffre min-h-[54px] w-full min-w-0 rounded-[14px] border-[1.5px] bg-surface px-3.5 text-[22px]
                                 font-semibold ${aberrante ? 'border-groseille' : 'border-brume'}`} />
            </label>
          </div>

          <div aria-live="polite">
            {aberrante && (
              <p id={idNote} className="mt-3 flex items-start gap-2.5 rounded-2xl bg-sable px-3.5 py-3 text-[14.5px] leading-[1.4]">
                <span className="mt-px text-ocre"><IcoAlerte taille={20} /></span>
                <span>
                  {Math.round(g / q)} g l’unité, contre {a.reference} g attendus. C’est peut-être juste, mais si c’est une
                  faute de frappe, corrige maintenant : cette pesée ne sera pas retenue.
                </span>
              </p>
            )}
          </div>

          <div className="mt-3.5">
            <Principal onClick={enregistre} disabled={!saisi || pese.isPending}>
              {pese.isPending
                ? 'J’enregistre…'
                : restantes > 1
                  ? `Enregistrer · encore ${restantes} après`
                  : 'Enregistrer · la dernière'}
            </Principal>
            <Erreur de={pese.error} />
          </div>

          {pesees.length > 0 && (
            <ul className="mt-3 text-[13.5px] text-doux">
              {pesees.map(p => (
                <li key={p.id} className="flex min-h-11 items-center justify-between gap-2">
                  <span>
                    {Number(p.qty_observed)} pour {Number(p.grams)} g
                    <span className="opacity-80">
                      {' '}({Math.round(Number(p.grams) / Number(p.qty_observed))} g l’unité)
                    </span>
                  </span>
                  {/* Une faute de frappe se corrige en effaçant, pas en pesant
                      trois fois de plus pour la noyer dans la médiane. */}
                  <button type="button" onClick={() => oublie.mutate(p.id)}
                          className="min-h-11 px-2.5 underline underline-offset-2">
                    effacer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}
