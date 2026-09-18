/**
 * Choisir les recettes (D52).
 *
 * On choisit le mercredi ce qu'on cuisinera le dimanche : c'est ce décalage qui
 * permet de faire les courses samedi. L'écran ne demande donc pas « qu'est-ce
 * qui te fait envie » mais « combien de repas faut-il couvrir », et il compte
 * les parts à mesure.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Attente, Chiffre, Erreur, Passage, Principal, Surface, Vide, duree,
} from '../ui/coque.tsx'
import { ou, supabase } from '../lib/supabase.ts'
import {
  useChangeEtat, useChoisitRecette, useCycle, useMajCycle, useRecettesDuCycle, useRetireRecette,
} from '../lib/donnees/cycle.ts'
import { useFoyer } from '../lib/donnees/foyer.ts'
import { useGenereListe } from '../lib/donnees/courses.ts'

type Candidate = {
  id: string
  title: string | null
  yield_servings: number | null
  total_time_min: number | null
  source_name: string | null
  origin: string
}

function useCatalogue(recherche: string) {
  return useQuery({
    queryKey: ['catalogue', recherche],
    queryFn: async (): Promise<Candidate[]> => {
      let q = supabase.from('recipe')
        .select('id, title, yield_servings, total_time_min, source_name, origin')
        .not('title', 'is', null)
        .order('plannable', { ascending: false })
        .limit(60)
      if (recherche.trim()) q = q.ilike('title', `%${recherche.trim()}%`)
      return ou(await q)
    },
    staleTime: 30_000,
  })
}

export function Choisir({ retour, va }: { retour: () => void; va: (v: string) => void }) {
  const [recherche, setRecherche] = useState('')
  const { data: cycle } = useCycle()
  const { data: foyer } = useFoyer()
  const { data: catalogue = [], isPending } = useCatalogue(recherche)
  const { data: choisies = [] } = useRecettesDuCycle(cycle?.id)
  const choisit = useChoisitRecette()
  const retire = useRetireRecette()
  const majCycle = useMajCycle()
  const genere = useGenereListe()
  const change = useChangeEtat()

  const prises = useMemo(() => new Set(choisies.map(c => c.recipe_id)), [choisies])
  const partsPrises = choisies.reduce((s, c) => s + c.servings, 0)
  const cible = cycle?.servings_target ?? 10
  const membres = foyer?.membres.length ?? 1

  /**
   * Passer à la liste de courses : on fige le choix, on génère, on avance d'un
   * état. Les trois vont ensemble — une liste sans état « courses » laisserait
   * l'accueil muet.
   */
  async function versLesCourses() {
    if (!cycle) return
    await genere.mutateAsync(cycle.id)
    if (cycle.state === 'vide') await change.mutateAsync({ id: cycle.id, vers: 'selection' })
    await change.mutateAsync({ id: cycle.id, vers: 'courses' })
    va('/magasin')
  }

  if (!cycle) {
    return (
      <Passage retour={retour}>
        <Vide titre="Aucun cycle ouvert"
              texte="Repasse par l’accueil : c’est lui qui ouvre la semaine." />
      </Passage>
    )
  }

  return (
    <Passage retour={retour}>
      <h1 className="titre text-[40px]">Ce qu’on<br />cuisine dimanche</h1>
      <p className="mt-3.5 text-[15px] text-doux max-w-[34ch]">
        {membres > 1 ? `À ${membres}, ` : ''}il faut couvrir {cible} parts.
        On les cuisine dimanche, on les mange la semaine d’après.
      </p>

      {/* Le compteur : la seule chose qui doit rester sous les yeux. */}
      <Surface className="mt-6 flex items-center gap-4">
        <div className="grow">
          <Chiffre valeur={`${partsPrises} / ${cible}`} taille={28} unite="parts" />
          <p className="text-[13px] text-doux mt-1">
            {choisies.length} recette{choisies.length > 1 ? 's' : ''} choisie
            {choisies.length > 1 ? 's' : ''}
          </p>
        </div>
        <label className="text-right">
          <span className="block text-[13px] text-doux">Parts visées</span>
          <input type="number" min={1} max={40} value={cible}
                 onChange={e => majCycle.mutate({
                   id: cycle.id, servings_target: Math.max(1, Number(e.target.value) || 1),
                 })}
                 className="mt-1 w-20 rounded-xl border border-brume bg-fond px-3 py-1.5
                            text-right text-encre outline-none focus:border-herbe" />
        </label>
      </Surface>

      {choisies.length > 0 && (
        <section className="mt-8" aria-label="Recettes choisies">
          <h2 className="text-[13px] text-doux uppercase tracking-[0.04em]">Retenues</h2>
          <ul className="mt-3.5 space-y-3">
            {choisies.map(c => (
              <li key={c.id} className="flex items-center gap-3">
                <span className="grow text-[15px]">{c.recipe?.title ?? 'Recette'}</span>
                <label className="flex items-center gap-1.5">
                  <input type="number" min={1} max={20} value={c.servings}
                         aria-label={`Parts de ${c.recipe?.title ?? 'la recette'}`}
                         onChange={e => choisit.mutate({
                           cycleId: cycle.id, recipeId: c.recipe_id,
                           parts: Math.max(1, Number(e.target.value) || 1),
                         })}
                         className="w-14 rounded-lg border border-brume bg-fond px-2 py-1
                                    text-right outline-none focus:border-herbe" />
                  <span className="text-[13px] text-doux">parts</span>
                </label>
                <button onClick={() => retire.mutate(c.id)} aria-label="Retirer"
                        className="text-groseille text-[14px] px-2 py-1">Retirer</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-9" aria-label="Catalogue">
        <input type="search" value={recherche} onChange={e => setRecherche(e.target.value)}
               placeholder="Chercher une recette"
               className="w-full rounded-xl border border-brume bg-surface px-4 py-3
                          placeholder:text-doux/60 outline-none focus:border-herbe" />

        {isPending ? <Attente /> : catalogue.length === 0 ? (
          <Vide titre="Aucune recette"
                texte="Le catalogue se remplit par l’ingestion. En attendant, invente-en une depuis l’accueil." />
        ) : (
          <ul className="mt-5 divide-y divide-brume">
            {catalogue.map(r => (
              <li key={r.id} className="py-3.5 flex items-center gap-3">
                <span className="grow">
                  <span className="block text-[15px]">{r.title}</span>
                  <span className="block text-[13px] text-doux mt-0.5">
                    {[r.yield_servings && `${r.yield_servings} parts`,
                      r.total_time_min && duree(Number(r.total_time_min)),
                      r.origin === 'generee' ? 'inventée' : r.source_name]
                      .filter(Boolean).join(' · ')}
                  </span>
                </span>
                {prises.has(r.id) ? (
                  <span className="text-[14px] text-herbe">Retenue</span>
                ) : (
                  <button
                    onClick={() => choisit.mutate({
                      cycleId: cycle.id, recipeId: r.id,
                      parts: Math.max(1, Math.min(cible - partsPrises || 2, r.yield_servings ?? 2)),
                    })}
                    className="rounded-full border border-brume px-3.5 py-1.5 text-[14px]
                               hover:bg-brume/40 transition-colors">
                    Ajouter
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10">
        <Principal onClick={versLesCourses}
                   disabled={choisies.length === 0 || genere.isPending || change.isPending}>
          {genere.isPending ? 'Je prépare la liste…' : 'Faire la liste de courses'}
        </Principal>
        <Erreur de={genere.error ?? change.error} />
        {partsPrises < cible && choisies.length > 0 && (
          <p className="mt-3 text-[14px] text-doux text-center">
            Il manque {cible - partsPrises} parts. Tu peux y aller quand même.
          </p>
        )}
      </div>
    </Passage>
  )
}
