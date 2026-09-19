/**
 * Choisir les recettes (D52, lot 4).
 *
 * On choisit le mercredi ce qu'on cuisinera le dimanche : c'est ce décalage qui
 * permet de faire les courses samedi. L'écran ne demande donc pas « qu'est-ce
 * qui te fait envie » mais « combien de repas faut-il couvrir », et il compte
 * les parts à mesure.
 *
 * L'ordre du parcours est une exigence (§10.1) : **le gratuit d'abord**. On
 * filtre le catalogue — déterministe, instantané — et « Envie spéciale » reste
 * à côté, sur un bouton explicite, jamais à la place.
 *
 * Deux règles de lecture qui ne se négocient pas :
 *
 *  · le temps affiché est le temps ACTIF (D30). « 50 min » sur une recette qui
 *    demande 10 min de gestes et 40 de four est un mensonge utile à personne.
 *  · les macros s'affichent en FOURCHETTE (D18), et les filtres portent sur la
 *    borne défavorable.
 */
import { useMemo, useState } from 'react'
import {
  Attente, BarreAction, Chiffre, Erreur, Passage, Surface, Vide, duree,
} from '../ui/coque.tsx'
import {
  useChangeEtat, useChoisitRecette, useCycle, useMajCycle, useRecettesDuCycle, useRetireRecette,
} from '../lib/donnees/cycle.ts'
import { useAppareils, useFoyer } from '../lib/donnees/foyer.ts'
import { useGenereListe } from '../lib/donnees/courses.ts'
import {
  FILTRES_VIDES, bornes, nombreDeFiltres, useCatalogue, useTailleCatalogue,
} from '../lib/donnees/catalogue.ts'
import type { Candidate, Filtres } from '../lib/donnees/catalogue.ts'
import { useStock } from '../lib/donnees/barquettes.ts'

export function Choisir({ retour, va }: { retour: () => void; va: (v: string) => void }) {
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES)
  const [affine, setAffine] = useState(false)

  const { data: cycle } = useCycle()
  const { data: foyer } = useFoyer()
  const { data: catalogueAppareils = [] } = useAppareils()
  const { data: stock = [] } = useStock()
  const { data: total = 0 } = useTailleCatalogue()
  const { data: candidates = [], isPending } = useCatalogue(filtres)
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
  const modifie = (p: Partial<Filtres>) => setFiltres(f => ({ ...f, ...p }))
  const actifs = nombreDeFiltres(filtres)

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
    <Passage retour={retour} barre={
      /*
       * Le compteur de parts et la validation, TOUJOURS sous les yeux.
       *
       * Ils étaient au-dessus et en dessous d'une liste de quatre-vingts
       * recettes : il fallait remonter pour savoir où l'on en était, et
       * descendre tout en bas pour valider. C'est la liste qui est longue, pas
       * la décision.
       */
      <BarreAction>
        <div className="flex items-center gap-4">
          <span className="grow">
            <Chiffre valeur={`${partsPrises} / ${cible}`} taille={22} unite="parts" />
            <span className="block text-[13px] text-doux mt-0.5">
              {choisies.length === 0
                ? 'Aucune recette choisie'
                : `${choisies.length} recette${choisies.length > 1 ? 's' : ''}`}
              {partsPrises > 0 && partsPrises < cible
                && ` · il en manque ${cible - partsPrises}`}
            </span>
          </span>
          <button onClick={versLesCourses}
                  disabled={choisies.length === 0 || genere.isPending || change.isPending}
                  className="h-[52px] px-5 rounded-[16px] bg-herbe text-fond text-[16px]
                             font-medium shrink-0 disabled:bg-brume disabled:text-doux
                             transition-colors">
            {genere.isPending ? 'Je prépare…' : 'Faire la liste'}
          </button>
        </div>
        <Erreur de={genere.error ?? change.error} />
      </BarreAction>
    }>
      <h1 className="titre text-[40px]">Ce qu’on<br />cuisine dimanche</h1>
      <p className="mt-3.5 text-[15px] text-doux max-w-[34ch]">
        {membres > 1 ? `À ${membres}, ` : ''}il faut couvrir {cible} parts.
        On les cuisine dimanche, on les mange la semaine d’après.
      </p>

      {/* Le compteur vit maintenant dans la barre du bas, où il reste visible.
          Ici on ne garde que ce qui se règle une fois : combien de parts viser. */}
      <Surface className="mt-6 flex items-center gap-4">
        <p className="grow text-[14px] text-doux">
          Combien de parts cette semaine ?
        </p>
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

      {/* ── Le catalogue, d'abord. L'IA est à côté, jamais à la place. ────── */}
      <section className="mt-9" aria-label="Catalogue">
        <input type="search" value={filtres.texte}
               onChange={e => modifie({ texte: e.target.value })}
               placeholder={`Chercher parmi ${total} recettes`}
               className="w-full rounded-xl border border-brume bg-surface px-4 py-3
                          placeholder:text-doux/60 outline-none focus:border-herbe" />

        <div className="mt-3 flex items-center gap-3">
          <button onClick={() => setAffine(a => !a)}
                  className="text-[14px] text-herbe">
            {affine ? 'Masquer les filtres' : 'Affiner'}
            {actifs > 0 && !affine && ` · ${actifs}`}
          </button>
          {actifs > 0 && (
            <button onClick={() => setFiltres({ ...FILTRES_VIDES, texte: filtres.texte })}
                    className="text-[14px] text-doux">Tout effacer</button>
          )}
          <span className="ml-auto text-[14px] text-doux">
            {isPending ? '…' : `${candidates.length} résultat${candidates.length > 1 ? 's' : ''}`}
          </span>
        </div>

        {affine && (
          <PanneauFiltres filtres={filtres} modifie={modifie}
                          appareils={catalogueAppareils} stock={stock.length} />
        )}

        {isPending ? <Attente /> : candidates.length === 0 ? (
          <Vide titre="Rien ne correspond"
                texte={actifs > 0
                  ? 'Desserre un filtre, ou invente une recette depuis l’accueil.'
                  : 'Le catalogue se remplit par l’ingestion.'} />
        ) : (
          <ul className="mt-5 divide-y divide-brume">
            {candidates.map(r => (
              <Ligne key={r.id} recette={r} prise={prises.has(r.id)}
                     surAjoute={() => choisit.mutate({
                       cycleId: cycle.id, recipeId: r.id,
                       parts: Math.max(1, Math.min(cible - partsPrises || 2, r.yield_servings ?? 2)),
                     })} />
            ))}
          </ul>
        )}

        <button onClick={() => va('/inventer')}
                className="mt-6 w-full h-[46px] rounded-[16px] bg-brume/50 text-[15px]
                           hover:bg-brume transition-colors">
          Rien ne va ? Invente-moi une recette
        </button>
      </section>

    </Passage>
  )
}

function PanneauFiltres({ filtres, modifie, appareils, stock }: {
  filtres: Filtres
  modifie: (p: Partial<Filtres>) => void
  appareils: { code: string; label: string }[]
  stock: number
}) {
  return (
    <Surface className="mt-4 space-y-5">
      {/* Le filtre le plus utile, et personne ne l'a. */}
      <div>
        <p className="text-[13px] text-doux">Temps les mains prises</p>
        <div className="mt-2 flex gap-2 flex-wrap">
          {[15, 25, 40, null].map(v => (
            <Puce key={String(v)} actif={filtres.tempsActifMax === v}
                  surClic={() => modifie({ tempsActifMax: v })}>
              {v === null ? 'Peu importe' : `≤ ${v} min`}
            </Puce>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-doux leading-relaxed">
          Le temps de gestes, pas le temps total : une cuisson au four n’occupe
          personne.
        </p>
      </div>

      <div className="flex gap-4">
        <label className="flex-1">
          <span className="block text-[13px] text-doux">Protéines au moins</span>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="number" min={0} max={90} step={5}
                   value={filtres.proteinesMin ?? ''}
                   placeholder="—"
                   onChange={e => modifie({
                     proteinesMin: e.target.value === '' ? null : Number(e.target.value),
                   })}
                   className="w-20 rounded-lg border border-brume bg-fond px-2.5 py-1.5
                              text-right outline-none focus:border-herbe" />
            <span className="text-[13px] text-doux">g</span>
          </div>
        </label>
        <label className="flex-1">
          <span className="block text-[13px] text-doux">Calories au plus</span>
          <div className="flex items-center gap-2 mt-1.5">
            <input type="number" min={100} max={1500} step={50}
                   value={filtres.kcalMax ?? ''}
                   placeholder="—"
                   onChange={e => modifie({
                     kcalMax: e.target.value === '' ? null : Number(e.target.value),
                   })}
                   className="w-20 rounded-lg border border-brume bg-fond px-2.5 py-1.5
                              text-right outline-none focus:border-herbe" />
            <span className="text-[13px] text-doux">kcal</span>
          </div>
        </label>
      </div>
      <p className="text-[12px] text-doux leading-relaxed -mt-3">
        Sur la borne défavorable : « au moins 30 g » écarte une recette annoncée
        entre 28 et 34.
      </p>

      <div>
        <p className="text-[13px] text-doux">Avec seulement</p>
        <div className="mt-2 flex gap-2 flex-wrap">
          {appareils.map(a => (
            <Puce key={a.code} actif={filtres.appareils.includes(a.code)}
                  surClic={() => modifie({
                    appareils: filtres.appareils.includes(a.code)
                      ? filtres.appareils.filter(x => x !== a.code)
                      : [...filtres.appareils, a.code],
                  })}>
              {a.label}
            </Puce>
          ))}
        </div>
        {filtres.appareils.length > 0 && (
          <p className="mt-2 text-[12px] text-doux">
            Écarte toute recette qui exige autre chose — utile le jour où le four
            est déjà pris.
          </p>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Puce actif={filtres.congelable === true}
              surClic={() => modifie({ congelable: filtres.congelable === true ? null : true })}>
          Se congèle
        </Puce>
        <Puce actif={filtres.jamaisFaites}
              surClic={() => modifie({ jamaisFaites: !filtres.jamaisFaites })}>
          Jamais essayée
        </Puce>
        <Puce actif={filtres.avecCeQuOnA}
              surClic={() => modifie({ avecCeQuOnA: !filtres.avecCeQuOnA })}>
          Avec ce qu’on a
        </Puce>
      </div>
      {filtres.avecCeQuOnA && (
        <p className="text-[12px] text-doux leading-relaxed -mt-3">
          {stock === 0
            ? 'Tes placards sont vides dans l’app : ce filtre ne rendra rien.'
            : 'Sinon, chaque recette affiche ce qui lui manque — sans rien écarter.'}
        </p>
      )}
    </Surface>
  )
}

function Ligne({ recette: r, prise, surAjoute }: {
  recette: Candidate; prise: boolean; surAjoute: () => void
}) {
  const b = bornes(r)
  return (
    <li className="py-3.5 flex items-start gap-3">
      <span className="grow">
        <span className="block text-[15px]">{r.title}</span>

        <span className="block text-[13px] text-doux mt-1">
          {/* Le temps ACTIF d'abord : c'est celui qui décide. */}
          {r.active_time_min !== null && (
            <strong className="text-encre font-medium">
              {duree(Number(r.active_time_min))} actives
            </strong>
          )}
          {r.yield_servings && ` · ${r.yield_servings} parts`}
          {r.freezable === true && ' · se congèle'}
        </span>

        {b && (
          <span className="block text-[13px] text-doux mt-0.5">
            {b.proteinesMin === b.proteinesMax
              ? `${b.proteinesMin} g`
              : `${b.proteinesMin}–${b.proteinesMax} g`} de protéines ·{' '}
            {b.kcalMin === b.kcalMax
              ? `${b.kcalMin}`
              : `${b.kcalMin}–${b.kcalMax}`} kcal la part
            {b.sur < 0.9 && (
              <span style={{ color: '#8F5A0D' }}>
                {' · '}{Math.round(b.sur * 100)} % des ingrédients connus
              </span>
            )}
          </span>
        )}

        {r.manques.length > 0 && (
          <span className="block text-[13px] mt-0.5" style={{ color: '#8F5A0D' }}>
            il manque {r.manques.length === 1
              ? r.manques[0]
              : `${r.manques.length} ingrédients`}
          </span>
        )}

        {r.appliances.length > 0 && (
          <span className="block text-[12px] text-doux mt-0.5">
            {r.appliances.join(' · ')}
          </span>
        )}
      </span>

      {prise ? (
        <span className="text-[14px] text-herbe shrink-0 pt-1">Retenue</span>
      ) : (
        <button onClick={surAjoute}
                className="shrink-0 rounded-full border border-brume px-3.5 py-1.5 text-[14px]
                           hover:bg-brume/40 transition-colors">
          Ajouter
        </button>
      )}
    </li>
  )
}

function Puce({ actif, surClic, children }:
  { actif: boolean; surClic: () => void; children: React.ReactNode }) {
  return (
    <button onClick={surClic} aria-pressed={actif}
            className={`px-3.5 py-1.5 rounded-full text-[13px] transition-colors
              ${actif ? 'bg-encre text-fond' : 'bg-brume/50 hover:bg-brume'}`}>
      {children}
    </button>
  )
}
