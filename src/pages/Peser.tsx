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
import { useState } from 'react'
import { Attente, Erreur, Passage, Principal, Secondaire, Surface, Vide } from '../ui/coque.tsx'
import { useCycle } from '../lib/donnees/cycle.ts'
import { useAPeser, useOubliePesee, usePese, usePesees } from '../lib/donnees/pesee.ts'
import type { APeser } from '../lib/pesee.ts'
import { seraRetenue } from '../lib/pesee.ts'

export function Peser({ retour }: { retour: () => void }) {
  const { data: cycle } = useCycle()
  const { data: aPeser = [], isPending } = useAPeser(cycle?.id)
  const [ouvert, setOuvert] = useState<string | null>(null)

  return (
    <Passage retour={retour}>
      <h1 className="titre text-[40px]">Peser</h1>
      <p className="mt-3.5 text-[15px] text-doux max-w-[36ch]">
        « 2 oignons » ne fait pas des grammes tout seul. Pèse-les une fois, puis
        deux, puis trois — et l’app ne te le redemandera plus jamais.
      </p>

      {isPending ? <Attente /> : aPeser.length === 0 ? (
        <Vide titre="Rien à peser"
              texte={cycle
                ? 'Toutes les recettes de ce cycle se convertissent déjà en grammes.'
                : 'Choisis des recettes : c’est elles qui disent quoi peser.'} />
      ) : (
        <>
          <p className="mt-7 text-[15px] text-doux">
            {aPeser.length} aliment{aPeser.length > 1 ? 's' : ''} à connaître,
            {' '}les plus utiles d’abord.
          </p>
          <ul className="mt-4 divide-y divide-brume/70">
            {aPeser.map(a => (
              <Aliment key={a.food_id} a={a} cycleId={cycle?.id ?? null}
                       ouvert={ouvert === a.food_id}
                       surOuvre={() => setOuvert(ouvert === a.food_id ? null : a.food_id)} />
            ))}
          </ul>
        </>
      )}

      <Surface className="mt-9">
        <p className="text-[13px] text-doux leading-relaxed">
          Pèse ce que tu vas vraiment mettre dedans : l’oignon épluché, le
          poivron épépiné. C’est ce poids-là qui compte dans l’assiette, et
          c’est celui que la recette suppose.
        </p>
      </Surface>

      <div className="mt-8">
        <Secondaire onClick={retour}>Revenir</Secondaire>
      </div>
    </Passage>
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

  const restantes = a.progres ? a.progres.seuil - a.progres.faites : 3

  async function enregistre() {
    await pese.mutateAsync({
      foodId: a.food_id, quantite: q, grammes: g, cycleId,
    })
    setGrammes('')
    setQuantite('1')
  }

  return (
    <li>
      <button onClick={surOuvre} className="w-full py-3.5 text-left">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[16px]">{a.nom}</span>
          <span className="text-[13px] text-doux shrink-0">
            {a.progres
              ? `${a.progres.faites} sur ${a.progres.seuil}`
              : `${a.recettes} recette${a.recettes > 1 ? 's' : ''}`}
          </span>
        </span>
        <span className="block text-[13px] text-doux mt-0.5">
          {a.exemple}
          {a.reference !== null
            ? ` · on compte ${a.reference} g en attendant`
            : ' · aucun poids de référence'}
        </span>
      </button>

      {ouvert && (
        <div className="pb-5">
          <div className="flex items-end gap-3">
            <label className="w-[86px]">
              <span className="block text-[13px] text-doux">Combien</span>
              <input inputMode="decimal" value={quantite}
                     onChange={e => setQuantite(e.target.value)}
                     className="mt-1 w-full h-[52px] px-3 rounded-[14px] bg-brume/40
                                text-[17px] text-center" />
            </label>
            <label className="grow">
              <span className="block text-[13px] text-doux">Pèsent, en grammes</span>
              <input inputMode="decimal" value={grammes} autoFocus
                     onChange={e => setGrammes(e.target.value)}
                     placeholder={a.reference !== null ? String(a.reference) : '—'}
                     className="mt-1 w-full h-[52px] px-3 rounded-[14px] bg-brume/40
                                text-[17px]" />
            </label>
          </div>

          {aberrante && (
            <p className="mt-3 text-[13px]" style={{ color: 'var(--color-ocre)' }}>
              {Math.round(g / q)} g l’unité, contre {a.reference} g attendus.
              C’est peut-être juste — mais si c’est une faute de frappe, corrige
              maintenant : cette pesée ne sera pas retenue.
            </p>
          )}

          <div className="mt-4">
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
            <ul className="mt-4 text-[13px] text-doux">
              {pesees.map(p => (
                <li key={p.id} className="flex items-center justify-between py-1">
                  <span>
                    {Number(p.qty_observed)} → {Number(p.grams)} g
                    <span className="opacity-70">
                      {' '}({Math.round(Number(p.grams) / Number(p.qty_observed))} g l’unité)
                    </span>
                  </span>
                  {/* Une faute de frappe se corrige en effaçant, pas en pesant
                      trois fois de plus pour la noyer dans la médiane. */}
                  <button onClick={() => oublie.mutate(p.id)}
                          className="h-11 px-3 text-[13px] underline underline-offset-2">
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
