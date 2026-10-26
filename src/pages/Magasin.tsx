/**
 * La liste de courses, tenue dans le magasin (D43 à D46, D49, D55 à D59).
 *
 * Aucune API de drive n'existe pour un particulier : cet écran est fait pour une
 * main sur le chariot. D'où les cibles larges, l'ordre des rayons appris du
 * geste, et une sortie par enseigne — on ne fait pas trois magasins d'un trait.
 */
import { useMemo, useState } from 'react'
import {
  Attente, BarreAction, Erreur, Passage, Principal, Surface, Vide,
} from '../ui/coque.tsx'
import { useChangeEtat, useCycle } from '../lib/donnees/cycle.ts'
import { useCreeMagasin, useMagasins } from '../lib/donnees/foyer.ts'
import {
  budget, organise, useAjouteArticle, useCoche, useListe, useMajArticle,
  useHabitudes, useOrdreDesRayons, useSortie, useSuggestions, useSupprimeArticle,
} from '../lib/donnees/courses.ts'
import { useEstimeListe } from '../lib/donnees/prix.ts'
import type { Article } from '../lib/donnees/courses.ts'
import { RAYONS, rayonDe } from '../lib/rayons.ts'
import { messageEchec } from '../lib/recettes/echecs.ts'
import { ecritQuantiteEtUnite } from '../lib/quantite.ts'
import type { Geste } from '../lib/recettes/echecs.ts'
import { DESSINS, PictoRayon, TuileIcone } from '../ui/rayons.tsx'

/** Le prix payé d'un article : au-delà, c'est une faute de frappe, pas un ticket. */
const PRIX_MAX = 10_000

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
  const estime = useEstimeListe()
  const [ouvert, setOuvert] = useState<'ajout' | 'completer' | null>(null)
  const [detaille, setDetaille] = useState<string | null>(null)
  /* Ce qui a raté, dit près des gestes : cocher, supprimer, noter un prix, ajouter échouaient
     sans un mot (réseau coupé, base qui refuse) et la ligne restait comme elle était. */
  const [echec, setEchec] = useState<string | null>(null)
  const issue = (geste: Geste) => ({
    onSuccess: () => setEchec(null),
    onError: (e: unknown) => setEchec(messageEchec(geste, e)),
  })

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

  const enBoutique = articles.length
  const dansLePanier = enBoutique - restants
  /* Un segment par article, jusqu'à 24 : au-delà, des segments de 3 px ne se liraient plus, la
     piste garde 24 segments et se remplit au prorata. */
  const segments = Math.min(enBoutique, 24)
  const remplis = enBoutique === 0 ? 0 : Math.round(dansLePanier / enBoutique * segments)
  const prix = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    /* ⚠️ La barre du bas porte « Rentrer » ET l'alerte d'un geste raté, pas un message sous le
       titre : cocher un article en bas d'une longue liste qui échoue faisait tomber l'alerte hors
       de l'écran, tout en haut (le même défaut que `Retenues` dans `Choisir`). La barre reste
       sous les yeux. */
    <Passage retour={retour} barre={
      <BarreAction>
        {echec && (
          <div className="flex items-start gap-2 -mt-1 mb-2">
            <div className="grow -mt-3"><Erreur de={echec} /></div>
            <button onClick={() => setEchec(null)}
                    className="min-h-11 px-2 text-[14px] text-doux shrink-0">Fermer</button>
          </div>
        )}
        <Principal onClick={termine} disabled={change.isPending || articles.length === 0}>
          {restants === 0 ? 'J’ai tout, rentrons'
            : restants === 1 ? 'Rentrer sans cet article'
              : `Rentrer sans les ${restants} articles`}
        </Principal>
        <Erreur de={change.error ?? sortie.error} />
      </BarreAction>
    }>
      <h1 className="titre-fort text-[40px] font-[560]">La liste</h1>

      {/* Le total d'abord : c'est ce qu'on regarde en entrant dans le magasin. */}
      {articles.length > 0 && (
        <section aria-label="Le total estimé"
                 className="mt-4 rounded-[28px] bg-encre text-fond p-5 shadow-carte">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="chiffre text-[56px] font-semibold leading-[.95] text-safran">
                {sous.paye !== null ? prix(sous.paye)
                  : sous.estime > 0 ? prix(sous.estime) : restants}
                {(sous.paye !== null || sous.estime > 0) && (
                  <span className="ml-2 text-[34px]">€</span>
                )}
              </p>
              <p className="mt-2 text-[14px] text-fond/70">
                {sous.paye !== null
                  ? `payés${restants === 0 ? ' · tout est coché' : ` · ${restants} article${restants > 1 ? 's' : ''} à prendre`}`
                  : sous.estime > 0
                    ? (restants === 0
                      ? 'estimés · tout est coché'
                      : `estimés pour ${restants} article${restants > 1 ? 's' : ''} à prendre`)
                    : (restants === 0 ? 'Tout est coché.'
                      : `article${restants > 1 ? 's' : ''} à prendre`)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="chiffre text-[30px] font-semibold leading-none">
                {dansLePanier}
                <span className="ml-1.5 text-[20px] font-normal text-fond/70">sur {enBoutique}</span>
              </p>
              <p className="mt-1 text-[13px] text-fond/70">dans le panier</p>
            </div>
          </div>
          <div role="img" aria-label={`${dansLePanier} article${dansLePanier > 1 ? 's' : ''} sur ${enBoutique} dans le panier`}
               className="mt-[18px] flex gap-1">
            {Array.from({ length: segments }, (_, i) => (
              <span key={i} className={`h-2 flex-1 rounded-full ${i < remplis ? 'bg-safran' : 'bg-fond/15'}`} />
            ))}
          </div>
        </section>
      )}

      {magasins.length === 0 && <PremierMagasin />}

      {isPending ? <Attente /> : articles.length === 0 ? (
        <Vide titre="Liste vide"
              texte="Elle se remplit depuis les recettes choisies, ou à la main ci-dessous." />
      ) : (
        sorties.map(s => (
          <section key={s.storeId ?? 'sans'} className="mt-7"
                   aria-label={`Courses chez ${nomDe(s.storeId)}`}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="titre-fort text-[26px] font-[560] flex items-center gap-2.5 min-w-0">
                <TuileIcone className="size-9 rounded-xl bg-congel-fond text-congel-encre">
                  {DESSINS.magasin}
                </TuileIcone>
                <span className="[overflow-wrap:anywhere]">{nomDe(s.storeId)}</span>
              </h2>
              <span className="text-[14px] text-doux shrink-0">
                {s.total - s.restants} sur {s.total}
              </span>
            </div>

            {s.groupes.map(g => (
              <div key={g.rayon} className="mb-4 rounded-[26px] bg-surface shadow-carte overflow-hidden">
                <div className="flex items-center gap-3 px-[18px] pt-3.5 pb-1.5">
                  <PictoRayon rayon={g.rayon} />
                  <h3 className="text-[15px] font-semibold text-doux">{g.rayon}</h3>
                </div>
                <ul>
                  {g.articles.map(a => (
                    <Ligne key={a.id} article={a}
                           ouvert={detaille === a.id}
                           magasins={magasins}
                           surOuvre={() => setDetaille(detaille === a.id ? null : a.id)}
                           surCoche={v => coche.mutate({ article: a, coche: v }, issue('cocher'))}
                           surMaj={c => maj.mutate({ id: a.id, ...c }, issue('prix'))}
                           surRefus={setEchec}
                           surSupprime={() => supprime.mutate(a.id, issue('supprimer'))} />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}

      {/* Quatre gestes, pas un de plus en avant : « Rentrer » est le seul bouton plein. */}
      <div className="mt-6 grid grid-cols-2 gap-2.5">
        <Outil icone={DESSINS.plus} ouvert={ouvert === 'ajout'}
               onClick={() => setOuvert(ouvert === 'ajout' ? null : 'ajout')}>
          Ajouter un article
        </Outil>
        <Outil icone={DESSINS.liste} ouvert={ouvert === 'completer'}
               onClick={() => setOuvert(ouvert === 'completer' ? null : 'completer')}>
          Compléter ma liste
        </Outil>
        {/* Une liste faite AVANT qu'on connaisse les prix n'a pas d'estimation,
            et la régénérer effacerait ce qui a été ajouté à la main. D'où ce
            bouton, qui ne remplit que les lignes encore vides. */}
        {articles.some(a => a.est_price_eur === null && a.paid_price_eur === null) && (
          <Outil icone={DESSINS.etiquette} onClick={() => estime.mutate(cycle.id)}
                 disabled={estime.isPending}>
            {estime.isPending
              ? 'J’estime…'
              : estime.data
                ? `${estime.data.remplis} prix estimés sur ${estime.data.sur}`
                : 'Estimer les prix d’après mes tickets'}
          </Outil>
        )}
        {/* Le ticket (lot 5). Sa place est ici : on le photographie en sortant
            de caisse, pas depuis un écran de réglages où personne n'irait. */}
        <Outil icone={DESSINS.appareil} onClick={() => va('/ticket')}>
          J’ai payé — photographier le ticket
        </Outil>
      </div>
      <Erreur de={estime.error} />

      {ouvert === 'ajout' && (
        <FormulaireAjout magasins={magasins} surAjoute={a => {
          ajoute.mutate({ cycleId: cycle.id, ...a }, issue('article'))
          setOuvert(null)
        }} />
      )}
      {ouvert === 'completer' && (
        <Completer dejaLa={new Set(articles.map(a => a.label.toLowerCase()))}
                   surAjoute={(label, rayon) => ajoute.mutate({
                     cycleId: cycle.id, label, rayon, source: 'suggestion',
                     storeId: magasins.find(m => m.is_default)?.id ?? null,
                   }, issue('article'))} />
      )}

      <p className="mt-5 text-center">
        <button onClick={retour}
                className="inline-flex items-center min-h-11 px-3 text-[15.5px] font-semibold
                           text-herbe underline underline-offset-4">
          Continuer plus tard
        </button>
      </p>
    </Passage>
  )
}

/** Une action secondaire, en carte : le picto, puis ce qu'elle fait. */
function Outil({ icone, ouvert, children, ...rest }:
  { icone: React.ReactNode; ouvert?: boolean } & React.ComponentProps<'button'>) {
  return (
    <button type="button" {...rest} aria-expanded={ouvert}
            className={`flex flex-col items-start gap-2.5 min-h-[92px] p-3.5 rounded-[22px] bg-surface
                        text-left text-[14.5px] font-semibold leading-[1.25] disabled:opacity-60
                        ${ouvert ? 'shadow-[inset_0_0_0_2px_var(--color-herbe)]'
                                 : 'shadow-[inset_0_0_0_1.5px_var(--color-brume)]'}`}>
      <TuileIcone>{icone}</TuileIcone>
      {children}
    </button>
  )
}

function Ligne({ article, ouvert, magasins, surOuvre, surCoche, surMaj, surRefus, surSupprime }: {
  article: Article
  ouvert: boolean
  magasins: { id: string; name: string }[]
  surOuvre: () => void
  surCoche: (v: boolean) => void
  surMaj: (c: Partial<Article>) => void
  /** Le motif d'un prix refusé avant d'écrire, ou `null`. */
  surRefus: (message: string | null) => void
  surSupprime: () => void
}) {
  const pris = !!article.checked_at
  const quantite = article.quantity !== null
    ? ecritQuantiteEtUnite(Number(article.quantity), article.unit)
    : null
  // Ce que la génération n'a pas su convertir. Dans la note, pas dans le
  // libellé : celui-ci sert de clé au rapprochement des tickets.
  const note = article.note

  return (
    <li className="border-t border-brume first:border-0">
      <div className="flex items-center gap-3.5 min-h-[72px] py-1.5 pl-3.5 pr-[18px]">
        {/* Cible de 44 px, dessin de 44 : on coche avec le pouce, debout, sans regarder. */}
        <button onClick={() => surCoche(!pris)} role="checkbox" aria-checked={pris}
                aria-label={`${article.label}${pris ? ', pris' : ''}`}
                className={`size-11 rounded-[14px] grid place-items-center shrink-0 border-2
                            ${pris ? 'bg-herbe border-herbe text-fond' : 'bg-surface border-doux/40'}`}>
          {pris && (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </button>

        <button onClick={surOuvre} aria-expanded={ouvert}
                className="grow min-w-0 text-left py-2 [overflow-wrap:anywhere]">
          <span className={`block text-[18px] font-semibold leading-tight
                            ${pris ? 'text-doux line-through' : ''}`}>
            {article.label}
          </span>
          {quantite && <span className="block text-[14px] text-doux mt-0.5">{quantite}</span>}
          {note && (
            <span className="block text-[13px] mt-0.5 text-ocre">
              {note}
            </span>
          )}
        </button>

        {article.est_price_eur !== null && (
          <span className="chiffre text-[20px] font-semibold tabular-nums shrink-0">
            {Number(article.est_price_eur).toLocaleString('fr-FR',
              { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </span>
        )}
      </div>

      {ouvert && (
        <div className="pb-4 pl-[72px] pr-[18px] space-y-3">
          <div className="flex gap-2 flex-wrap">
            {magasins.map(m => (
              <button key={m.id} onClick={() => surMaj({ store_id: m.id })}
                      className={`px-3 min-h-11 inline-flex items-center rounded-full text-[13px] transition-colors
                        ${article.store_id === m.id
                          ? 'bg-herbe text-fond' : 'bg-brume/50 hover:bg-brume'}`}>
                {m.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <label htmlFor={`prix-${article.id}`} className="text-[13px] text-doux">Prix payé</label>
            <input type="number" step="0.01" min="0" max={PRIX_MAX} id={`prix-${article.id}`}
                   aria-label="Prix payé"
                   defaultValue={article.paid_price_eur ?? ''}
                   onBlur={e => {
                     const v = e.target.value
                     const n = Number(v)
                     // Refusé avant la base : « -3 » faisait un 400 muet, « 99999999999 » passait.
                     if (v !== '' && (!Number.isFinite(n) || n < 0 || n > PRIX_MAX)) {
                       surRefus(`Un prix payé va de 0 à ${PRIX_MAX.toLocaleString('fr-FR')} €.`)
                       e.target.value = article.paid_price_eur === null ? '' : String(article.paid_price_eur)
                       return
                     }
                     surRefus(null)
                     surMaj({ paid_price_eur: v === '' ? null : n })
                   }}
                   className="w-24 min-h-11 rounded-lg border border-brume bg-fond px-2.5 py-1.5
                              text-right outline-none focus:border-herbe" />
            <span className="text-[13px] text-doux">€</span>
            {/* La base refuse d'effacer une ligne cochée ou payée (0031) : « Supprimer » ne
                faisait alors rien, sans un mot. On ne l'offre pas, et on dit pourquoi. */}
            {pris || article.paid_price_eur !== null ? (
              <span className="ml-auto text-[13px] text-doux text-right">
                {pris ? 'Décoche-le pour le supprimer.' : 'Efface le prix pour le supprimer.'}
              </span>
            ) : (
              <button onClick={surSupprime}
                      className="ml-auto text-groseille text-[14px] px-2 min-h-11">
                Supprimer
              </button>
            )}
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
  /* Le rayon se déduit du libellé tant qu'on n'a pas choisi : « Sel » ou « Papier toilette »
     tombaient sous « Fruits et légumes », premier de la liste, parce qu'il était pré-sélectionné. */
  const [rayonChoisi, setRayon] = useState<string | null>(null)
  const rayon = rayonChoisi ?? rayonDe({ libelle: label })
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
        <input value={label} onChange={e => setLabel(e.target.value)} autoFocus maxLength={80}
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
          <input type="number" step="0.01" min="0" max={PRIX_MAX} value={prix} aria-label="Prix estimé"
                 onChange={e => setPrix(e.target.value)} placeholder="€"
                 className="w-24 rounded-xl border border-brume bg-fond px-3 py-2.5
                            text-right outline-none focus:border-herbe" />
        </div>
        {magasins.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {magasins.map(m => (
              <button type="button" key={m.id} onClick={() => setStoreId(m.id)}
                      className={`px-3 min-h-11 inline-flex items-center rounded-full text-[13px] transition-colors
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

/**
 * Le rayon d'une suggestion, d'après SA catégorie. Tout partait en « Épicerie salée » hors Entretien et Hygiène : l'eau et
 * le skyr, une fois cochés, finissaient au placard au lieu du frigo.
 */
const RAYON_DE_LA_SUGGESTION: Record<string, string> = {
  'Boissons': 'Boissons',
  'Entretien': 'Entretien',
  'Maison': 'Entretien',
  'Hygiène': 'Hygiène',
  'Épicerie': 'Épicerie salée',
  'Frais du quotidien': 'Frais',
}

/** Le bouton « Compléter ma liste » (D43) : l'entretien, l'hygiène, le café. */
function Completer({ dejaLa, surAjoute }: {
  dejaLa: Set<string>
  surAjoute: (label: string, rayon: string) => void
}) {
  const { data: suggestions = [] } = useSuggestions()
  const { data: habitudes = [] } = useHabitudes()
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
                  className={`px-3.5 min-h-11 inline-flex items-center rounded-full text-[13px] transition-colors
                    ${(categorie ?? categories[0]) === c
                      ? 'bg-encre text-fond' : 'bg-brume/50 hover:bg-brume'}`}>
            {c}
          </button>
        ))}
      </div>
      {/* D45 : ce que le foyer reprend à chaque fois finit par se proposer
          seul. Le trigger alimente `shopping_habit` à chaque cochage — mais
          aucun écran ne la lisait, si bien que la promesse ne se voyait nulle
          part. Les habitudes passent devant : ce sont elles qu'on reprend. */}
      {habitudes.length > 0 && (
        <>
          <p className="mt-4 text-[14px] text-doux">
            Ce que vous reprenez souvent
          </p>
          <div className="mt-2 flex gap-2 flex-wrap">
            {habitudes
              .filter(h => !dejaLa.has(h.label.toLowerCase()))
              .slice(0, 10)
              .map(h => (
                <button key={h.id} onClick={() => surAjoute(h.label, rayonDe({ libelle: h.label }))}
                        className="px-3.5 py-2 rounded-full bg-surface text-[14px]
                                   hover:bg-brume/60 transition-colors">
                  {h.label}
                  <span className="text-doux"> ×{h.times_added}</span>
                </button>
              ))}
          </div>
        </>
      )}

      <div className="mt-4 flex gap-2 flex-wrap">
        {affichees.map(s => {
          const pris = dejaLa.has(s.label.toLowerCase())
          return (
            <button key={s.id} disabled={pris}
                    onClick={() => surAjoute(s.label, RAYON_DE_LA_SUGGESTION[s.category] ?? 'Épicerie salée')}
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
