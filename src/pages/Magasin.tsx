/**
 * La liste de courses, tenue dans le magasin (D43 à D46, D49, D55 à D59).
 *
 * Aucune API de drive n'existe pour un particulier : cet écran est fait pour une
 * main sur le chariot. D'où les cibles larges, l'ordre des rayons appris du
 * geste, et une sortie par enseigne — on ne fait pas trois magasins d'un trait.
 */
import { useMemo, useState } from 'react'
import {
  Attente, Erreur, Passage, Principal, Secondaire, Surface, Vide,
} from '../ui/coque.tsx'
import { useChangeEtat, useCycle } from '../lib/donnees/cycle.ts'
import { useCreeMagasin, useMagasins } from '../lib/donnees/foyer.ts'
import {
  budget, organise, useAjouteArticle, useCoche, useListe, useMajArticle,
  useOrdreDesRayons, useSortie, useSuggestions, useSupprimeArticle,
} from '../lib/donnees/courses.ts'
import type { Article } from '../lib/donnees/courses.ts'
import { RAYONS } from '../lib/rayons.ts'

export function Magasin({ retour, va }: { retour: () => void; va: (v: string) => void }) {
  const { data: cycle } = useCycle()
  const { data: articles = [], isPending } = useListe(cycle?.id)
  const { data: ordres = [] } = useOrdreDesRayons()
  const { data: magasins = [] } = useMagasins()
  const coche = useCoche()
  const supprime = useSupprimeArticle()
  const maj = useMajArticle()
  const ajoute = useAjouteArticle()
  const sortie = useSortie()
  const change = useChangeEtat()
  const [ouvert, setOuvert] = useState<'ajout' | 'completer' | null>(null)
  const [detaille, setDetaille] = useState<string | null>(null)

  const sorties = useMemo(
    () => organise(articles, ordres, magasins), [articles, ordres, magasins])
  const nomDe = (id: string | null) =>
    magasins.find(m => m.id === id)?.name ?? 'Sans magasin'
  const restants = articles.filter(a => !a.checked_at).length
  const sous = budget(articles)

  async function termine() {
    if (!cycle) return
    for (const s of sorties) {
      if (s.storeId) await sortie.mutateAsync({ cycleId: cycle.id, storeId: s.storeId })
    }
    await change.mutateAsync({ id: cycle.id, vers: 'pret' })
    va('/plan')
  }

  if (!cycle) {
    return <Passage retour={retour}><Vide titre="Aucun cycle ouvert" /></Passage>
  }

  return (
    <Passage retour={retour}>
      <h1 className="titre text-[40px]">La liste</h1>
      <p className="mt-3 text-[15px] text-doux">
        {restants === 0
          ? 'Tout est coché.'
          : `${restants} article${restants > 1 ? 's' : ''} à prendre`}
        {sous.estime > 0 && ` · ${sous.estime.toFixed(2).replace('.', ',')} € estimés`}
      </p>

      {magasins.length === 0 && <PremierMagasin />}

      {isPending ? <Attente /> : articles.length === 0 ? (
        <Vide titre="Liste vide"
              texte="Elle se remplit depuis les recettes choisies, ou à la main ci-dessous." />
      ) : (
        sorties.map(s => (
          <section key={s.storeId ?? 'sans'} className="mt-9"
                   aria-label={`Courses chez ${nomDe(s.storeId)}`}>
            <div className="flex items-baseline justify-between">
              <h2 className="titre text-[24px]">{nomDe(s.storeId)}</h2>
              <span className="text-[14px] text-doux">
                {s.total - s.restants} sur {s.total}
              </span>
            </div>

            {s.groupes.map(g => (
              <div key={g.rayon} className="mt-6">
                <h3 className="text-[13px] text-doux uppercase tracking-[0.04em]">{g.rayon}</h3>
                <ul className="mt-2">
                  {g.articles.map(a => (
                    <Ligne key={a.id} article={a}
                           ouvert={detaille === a.id}
                           magasins={magasins}
                           surOuvre={() => setDetaille(detaille === a.id ? null : a.id)}
                           surCoche={v => coche.mutate({ article: a, coche: v })}
                           surMaj={c => maj.mutate({ id: a.id, ...c })}
                           surSupprime={() => supprime.mutate(a.id)} />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}

      <div className="mt-9 flex gap-3">
        <button onClick={() => setOuvert(ouvert === 'ajout' ? null : 'ajout')}
                className="flex-1 h-[46px] rounded-[16px] bg-brume/50 text-[15px]
                           hover:bg-brume transition-colors">
          + Ajouter
        </button>
        <button onClick={() => setOuvert(ouvert === 'completer' ? null : 'completer')}
                className="flex-1 h-[46px] rounded-[16px] bg-brume/50 text-[15px]
                           hover:bg-brume transition-colors">
          Compléter ma liste
        </button>
      </div>

      {ouvert === 'ajout' && (
        <FormulaireAjout magasins={magasins} surAjoute={a => {
          ajoute.mutate({ cycleId: cycle.id, ...a })
          setOuvert(null)
        }} />
      )}
      {ouvert === 'completer' && (
        <Completer dejaLa={new Set(articles.map(a => a.label.toLowerCase()))}
                   surAjoute={(label, rayon) => ajoute.mutate({
                     cycleId: cycle.id, label, rayon, source: 'suggestion',
                     storeId: magasins.find(m => m.is_default)?.id ?? null,
                   })} />
      )}

      <div className="mt-11">
        <Principal onClick={termine} disabled={change.isPending || articles.length === 0}>
          {restants === 0 ? 'J’ai tout, rentrons' : `Rentrer sans ${restants} article${restants > 1 ? 's' : ''}`}
        </Principal>
        <Erreur de={change.error ?? sortie.error} />
        <Secondaire onClick={retour}>Continuer plus tard</Secondaire>
      </div>
    </Passage>
  )
}

function Ligne({ article, ouvert, magasins, surOuvre, surCoche, surMaj, surSupprime }: {
  article: Article
  ouvert: boolean
  magasins: { id: string; name: string }[]
  surOuvre: () => void
  surCoche: (v: boolean) => void
  surMaj: (c: Partial<Article>) => void
  surSupprime: () => void
}) {
  const pris = !!article.checked_at
  const quantite = article.quantity !== null
    ? `${Math.round(Number(article.quantity))} ${article.unit ?? ''}`.trim()
    : null

  return (
    <li className="border-b border-brume/70 last:border-0">
      <div className="flex items-center gap-3 py-1">
        {/* Cible de 44 px : on coche avec le pouce, debout, sans regarder. */}
        <button onClick={() => surCoche(!pris)} role="checkbox" aria-checked={pris}
                aria-label={`${article.label}${pris ? ', pris' : ''}`}
                className="w-11 h-11 grid place-items-center shrink-0">
          <span className={`w-[22px] h-[22px] rounded-[7px] border-2 grid place-items-center
                            ${pris ? 'bg-herbe border-herbe' : 'border-brume'}`}>
            {pris && (
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#F2F4EF"
                   strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2.5 7.5 5.5 10.5 11.5 3.5" />
              </svg>
            )}
          </span>
        </button>

        <button onClick={surOuvre} className="grow text-left py-2.5">
          <span className={`text-[15px] ${pris ? 'text-doux line-through' : ''}`}>
            {article.label}
          </span>
          {quantite && <span className="text-[13px] text-doux ml-2">{quantite}</span>}
        </button>

        {article.est_price_eur !== null && (
          <span className="text-[14px] text-doux tabular-nums">
            {Number(article.est_price_eur).toFixed(2).replace('.', ',')} €
          </span>
        )}
      </div>

      {ouvert && (
        <div className="pb-4 pl-11 pr-1 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {magasins.map(m => (
              <button key={m.id} onClick={() => surMaj({ store_id: m.id })}
                      className={`px-3 py-1.5 rounded-full text-[13px] transition-colors
                        ${article.store_id === m.id
                          ? 'bg-herbe text-fond' : 'bg-brume/50 hover:bg-brume'}`}>
                {m.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <label className="text-[13px] text-doux">Prix payé</label>
            <input type="number" step="0.01" min="0"
                   defaultValue={article.paid_price_eur ?? ''}
                   onBlur={e => surMaj({
                     paid_price_eur: e.target.value === '' ? null : Number(e.target.value),
                   })}
                   className="w-24 rounded-lg border border-brume bg-fond px-2.5 py-1.5
                              text-right outline-none focus:border-herbe" />
            <span className="text-[13px] text-doux">€</span>
            <button onClick={surSupprime}
                    className="ml-auto text-groseille text-[14px] px-2 py-1.5">
              Supprimer
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function PremierMagasin() {
  const cree = useCreeMagasin()
  const [nom, setNom] = useState('')
  return (
    <Surface className="mt-7">
      <p className="text-[15px]">Où fais-tu tes courses ?</p>
      <p className="text-[13px] text-doux mt-1.5">
        Le premier devient le magasin par défaut. Tu pourras en ajouter d’autres,
        et changer l’enseigne article par article.
      </p>
      <form className="mt-4 flex gap-2" onSubmit={e => {
        e.preventDefault()
        if (nom.trim()) cree.mutate({ nom, parDefaut: true }, { onSuccess: () => setNom('') })
      }}>
        <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Lidl"
               className="grow rounded-xl border border-brume bg-fond px-4 py-2.5
                          outline-none focus:border-herbe" />
        <button className="px-5 rounded-xl bg-herbe text-fond text-[15px]">Ajouter</button>
      </form>
      <Erreur de={cree.error} />
    </Surface>
  )
}

function FormulaireAjout({ magasins, surAjoute }: {
  magasins: { id: string; name: string; is_default: boolean }[]
  surAjoute: (a: { label: string; rayon: string; storeId: string | null; prix: number | null }) => void
}) {
  const [label, setLabel] = useState('')
  const [rayon, setRayon] = useState<string>(RAYONS[0])
  const [storeId, setStoreId] = useState<string | null>(
    magasins.find(m => m.is_default)?.id ?? null)
  const [prix, setPrix] = useState('')

  return (
    <Surface className="mt-4">
      <form className="space-y-3" onSubmit={e => {
        e.preventDefault()
        if (!label.trim()) return
        surAjoute({ label, rayon, storeId, prix: prix === '' ? null : Number(prix) })
      }}>
        <input value={label} onChange={e => setLabel(e.target.value)} autoFocus
               placeholder="Ce qu’il faut prendre"
               className="w-full rounded-xl border border-brume bg-fond px-4 py-2.5
                          outline-none focus:border-herbe" />
        <div className="flex gap-2">
          <select value={rayon} onChange={e => setRayon(e.target.value)}
                  aria-label="Rayon"
                  className="grow rounded-xl border border-brume bg-fond px-3 py-2.5
                             outline-none focus:border-herbe">
            {RAYONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input type="number" step="0.01" min="0" value={prix} aria-label="Prix estimé"
                 onChange={e => setPrix(e.target.value)} placeholder="€"
                 className="w-24 rounded-xl border border-brume bg-fond px-3 py-2.5
                            text-right outline-none focus:border-herbe" />
        </div>
        {magasins.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {magasins.map(m => (
              <button type="button" key={m.id} onClick={() => setStoreId(m.id)}
                      className={`px-3 py-1.5 rounded-full text-[13px] transition-colors
                        ${storeId === m.id ? 'bg-herbe text-fond' : 'bg-brume/50'}`}>
                {m.name}
              </button>
            ))}
          </div>
        )}
        <button className="w-full h-[46px] rounded-[16px] bg-herbe text-fond text-[15px]">
          Ajouter à la liste
        </button>
      </form>
    </Surface>
  )
}

/** Le bouton « Compléter ma liste » (D43) : l'entretien, l'hygiène, le café. */
function Completer({ dejaLa, surAjoute }: {
  dejaLa: Set<string>
  surAjoute: (label: string, rayon: string) => void
}) {
  const { data: suggestions = [] } = useSuggestions()
  const [categorie, setCategorie] = useState<string | null>(null)

  const categories = useMemo(
    () => [...new Set(suggestions.map(s => s.category))], [suggestions])
  const affichees = suggestions.filter(s => s.category === (categorie ?? categories[0]))

  return (
    <Surface className="mt-4">
      <p className="text-[13px] text-doux">
        Ces articles comptent au budget, jamais aux calories.
      </p>
      <div className="mt-3 flex gap-2 flex-wrap">
        {categories.map(c => (
          <button key={c} onClick={() => setCategorie(c)}
                  className={`px-3.5 py-1.5 rounded-full text-[13px] transition-colors
                    ${(categorie ?? categories[0]) === c
                      ? 'bg-encre text-fond' : 'bg-brume/50 hover:bg-brume'}`}>
            {c}
          </button>
        ))}
      </div>
      <div className="mt-4 flex gap-2 flex-wrap">
        {affichees.map(s => {
          const pris = dejaLa.has(s.label.toLowerCase())
          return (
            <button key={s.id} disabled={pris}
                    onClick={() => surAjoute(s.label, s.category === 'Entretien' ? 'Entretien'
                      : s.category === 'Hygiène' ? 'Hygiène' : 'Épicerie salée')}
                    className={`px-3.5 py-2 rounded-full text-[14px] transition-colors
                      ${pris ? 'bg-herbe/15 text-herbe' : 'bg-fond hover:bg-brume/60'}`}>
              {pris ? '✓ ' : '+ '}{s.label}
            </button>
          )
        })}
      </div>
    </Surface>
  )
}
