/**
 * Choisir les recettes (D52, lot 4) — refait le 19/10/2026
 * (`docs/superpowers/specs/2026-10-19-recettes-design.md`).
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
 *  · le temps affiché est le temps ACTIF (D30) ;
 *  · les macros s'affichent en FOURCHETTE (D18), et les filtres portent sur la
 *    borne défavorable.
 *
 * Et une forme nouvelle (R1) : le catalogue entier est chargé en léger, on le lit
 * dix recettes à la fois, la photo à gauche, et (i) ouvre la fiche.
 */
import { useMemo, useRef, useState } from 'react'
import {
  Attente, BarreAction, Chiffre, Erreur, Passage, Vide, dateLongue,
} from '../ui/coque.tsx'
import {
  dimancheDe, useChangeEtat, useChoisitRecette, useCycle, useMajCycle, useRecettesDuCycle,
  useRetireRecette,
} from '../lib/donnees/cycle.ts'
import { useGenereListe } from '../lib/donnees/courses.ts'
import { useStock } from '../lib/donnees/barquettes.ts'
import {
  FILTRES_VIDES, nombreDeFiltres, partsAProposer, retient, useCatalogue, useDejaFaites,
  useFaisables, useManques,
} from '../lib/donnees/catalogue.ts'
import type { Candidate, Filtres } from '../lib/donnees/catalogue.ts'
import { bornesDeLaPage, nombreDePages, tranche } from '../lib/recettes/pages.ts'
import { messageEchec } from '../lib/recettes/echecs.ts'
import type { Geste } from '../lib/recettes/echecs.ts'
import { Vignette } from '../ui/recettes/Vignette.tsx'
import { Pagination } from '../ui/recettes/Pagination.tsx'
import { FicheRecette } from '../ui/recettes/FicheRecette.tsx'
import { PanneauFiltres, Puces, Recherche } from '../ui/recettes/Filtres.tsx'
import { Retenues } from '../ui/recettes/Retenues.tsx'

const AUCUNE = new Set<string>()
const AUCUN_STOCK: never[] = []
const fr = (n: number) => n.toLocaleString('fr-FR')

export function Choisir({ retour, va }: { retour: () => void; va: (v: string) => void }) {
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES)
  const [page, setPage] = useState(1)
  const [affine, setAffine] = useState(false)
  const [ficheDe, setFicheDe] = useState<Candidate | null>(null)
  const hautDeListe = useRef<HTMLHeadingElement>(null)

  const cycleRequete = useCycle()
  const cycle = cycleRequete.data
  const { data: stock = AUCUN_STOCK, isPending: stockEnCours } = useStock()
  const { data: catalogue = [], isPending, error } = useCatalogue()
  const { data: choisies = [] } = useRecettesDuCycle(cycle?.id)

  /* Le placard, en aliments reconnus : c'est lui que les manques et « avec ce
     que j'ai » comparent aux ingrédients. */
  const placard = useMemo(
    () => new Set(stock.map(s => s.food_id).filter((x): x is string => !!x)), [stock])
  const { data: dejaFaites, error: erreurDejaFaites } = useDejaFaites(
    filtres.jamaisFaites, cycleRequete.isPending ? undefined : (cycle?.id ?? null))
  const { data: faisables, error: erreurFaisables } = useFaisables(filtres.avecCeQuOnA, placard)

  const filtrees = useMemo(() => catalogue.filter(c => retient(c, filtres, {
    dejaFaites: dejaFaites ?? AUCUNE,
    faisables: faisables ?? null,
  })), [catalogue, filtres, dejaFaites, faisables])

  // La liste a pu rétrécir sous la page courante : on s'en tient à la dernière.
  const pageSure = Math.min(page, nombreDePages(filtrees.length))
  const affichees = tranche(filtrees, pageSure)
  const { de, a } = bornesDeLaPage(pageSure, filtrees.length)
  const { data: manques } = useManques(affichees.map(r => r.id), placard)

  const choisit = useChoisitRecette()
  const retire = useRetireRecette()
  const majCycle = useMajCycle()
  const genere = useGenereListe()
  const change = useChangeEtat()
  /* Les parts d'une recette déjà retenue ont leur propre mutation : son erreur ne
     se confond pas avec celle du « + ». */
  const regle = useChoisitRecette()

  /* Ce qui a raté, dit en français près du geste : « + », « Retirer » et les parts
     échouaient sans un mot (hors ligne, RLS, 4xx). Un succès efface le message. */
  const [echecAjout, setEchecAjout] = useState<string | null>(null)
  const [echecCarte, setEchecCarte] = useState<string | null>(null)
  const [reprise, setReprise] = useState(0)
  const issue = (geste: Geste, dit: (m: string | null) => void, aussi?: () => void) => ({
    onSuccess: () => dit(null),
    onError: (e: unknown) => { dit(messageEchec(geste, e)); aussi?.() },
  })
  // Un réglage de parts raté : les champs reprennent la valeur de la base.
  const reprend = () => setReprise(n => n + 1)

  const prises = useMemo(() => new Map(choisies.map(c => [c.recipe_id, c.servings])), [choisies])
  const partsPrises = choisies.reduce((s, c) => s + c.servings, 0)
  const cible = cycle?.servings_target ?? 10
  const actifs = nombreDeFiltres(filtres)

  // Un filtre change la liste : on repart de sa première page.
  const modifie = (p: Partial<Filtres>) => { setFiltres(f => ({ ...f, ...p })); setPage(1) }

  /* « Les 10 suivantes » remonte en haut de la LISTE, pas de l'écran : la carte
     des parts et la recherche restent au-dessus. Le focus suit, pour qu'un
     lecteur d'écran sache où il est. */
  function vaALaPage(p: number) {
    setPage(p)
    const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    hautDeListe.current?.scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'start' })
    hautDeListe.current?.focus({ preventScroll: true })
  }

  function ajoute(r: Candidate) {
    if (!cycle) return
    choisit.mutate({
      cycleId: cycle.id, recipeId: r.id,
      parts: partsAProposer(cible, partsPrises, r.yield_servings),
    }, issue('retenir', setEchecAjout))
  }

  /* Les champs ne rendent que des entiers dans les bornes (`ChampParts`) : un « 2.5 »
     n'atteint plus la colonne `int`, un refus s'y dit par `setEchecCarte`. */
  function reglePartsDeLaCible(parts: number) {
    if (!cycle) return
    majCycle.mutate({ id: cycle.id, servings_target: parts },
      issue('cible', setEchecCarte, reprend))
  }

  function reglePartsDeLaRecette(recipeId: string, parts: number) {
    if (!cycle) return
    regle.mutate({ cycleId: cycle.id, recipeId, parts }, issue('parts', setEchecCarte, reprend))
  }

  async function versLesCourses() {
    if (!cycle) return
    await genere.mutateAsync(cycle.id)
    if (cycle.state === 'vide') await change.mutateAsync({ id: cycle.id, vers: 'selection' })
    await change.mutateAsync({ id: cycle.id, vers: 'courses' })
    va('/magasin')
  }

  if (cycleRequete.isPending) return <Passage retour={retour}><Attente /></Passage>
  if (!cycle) {
    return (
      <Passage retour={retour}>
        <Vide titre="Aucun cycle ouvert"
              texte="Repasse par l’accueil : c’est lui qui ouvre la semaine." />
      </Passage>
    )
  }

  // Une requête en échec n'attend plus rien : son message s'affiche à la place.
  const enAttente = isPending
    || (filtres.jamaisFaites && !dejaFaites && !erreurDejaFaites)
    || (filtres.avecCeQuOnA && placard.size > 0 && !faisables && !erreurFaisables)
    // Le placard se lit encore : « tes placards sont vides » serait faux, et s'afficherait.
    || (filtres.avecCeQuOnA && stockEnCours)

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
                             font-medium shrink-0 disabled:bg-brume disabled:text-encre
                             transition-colors">
            {genere.isPending ? 'Je prépare…' : 'Faire la liste'}
          </button>
        </div>
        <Erreur de={echecCarte ?? genere.error ?? change.error} />
      </BarreAction>
    }>
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-doux">
        {dateLongue(dimancheDe(cycle.week_of))}
      </p>
      <h1 className="titre-fort text-[46px] mt-1">Choisir</h1>

      <Retenues cible={cible} choisies={choisies}
                reprise={reprise} surRefus={setEchecCarte}
                surCible={reglePartsDeLaCible} surParts={reglePartsDeLaRecette}
                surRetire={id => retire.mutate(id, issue('retirer', setEchecCarte))} />

      {/* ── Le catalogue, d'abord. L'IA est à côté, jamais à la place. ────── */}
      <section aria-label="Catalogue">
        <Recherche texte={filtres.texte} surTexte={t => modifie({ texte: t })}
                   ouvert={affine} basculer={() => setAffine(o => !o)} actifs={actifs} />
        <Puces filtres={filtres} modifie={modifie} />
        {affine && <PanneauFiltres filtres={filtres} modifie={modifie} />}

        <div className="mt-[22px] flex items-baseline justify-between gap-2.5">
          <h2 ref={hautDeListe} tabIndex={-1}
              className="titre-fort text-[25px] scroll-mt-4 outline-none">Recettes</h2>
          <span aria-live="polite" className="text-[14px] text-doux tabular-nums">
            {enAttente ? '…' : filtrees.length === 0 ? '0'
              : `${fr(filtrees.length)}, de ${fr(de)} à ${fr(a)}`}
          </span>
        </div>
        {actifs > 0 && (
          <button type="button" onClick={() => {
            setFiltres({ ...FILTRES_VIDES, texte: filtres.texte })
            setPage(1)
          }} className="text-[14px] text-doux min-h-11">
            Tout effacer
          </button>
        )}
        <Erreur de={error ?? erreurFaisables ?? erreurDejaFaites} />
        <Erreur de={echecAjout} />

        {enAttente ? <Attente /> : filtrees.length === 0 ? (error ? null : (
          <Vide titre="Rien ne correspond"
                texte={filtres.avecCeQuOnA && placard.size === 0
                  ? (stock.length === 0
                    ? 'Tes placards sont vides dans l’app : ce filtre ne rendra rien.'
                    // Des articles, mais aucun rattaché à un aliment : « vides » mentirait.
                    : 'Rien dans tes placards n’est reconnu comme un aliment : ce filtre ne rendra rien.')
                  : actifs > 0 || filtres.texte.trim()
                    ? 'Desserre un filtre, ou invente une recette depuis l’accueil.'
                    : 'Le catalogue se remplit par l’ingestion.'} />
        )) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {affichees.map(r => (
              <Vignette key={r.id} recette={r} prise={prises.has(r.id)}
                        manques={manques?.get(r.id) ?? []}
                        surInfo={() => setFicheDe(r)}
                        surAjoute={() => ajoute(r)} />
            ))}
          </div>
        )}

        {!enAttente && !error && <Pagination page={pageSure} total={filtrees.length} surPage={vaALaPage} />}

        <button onClick={() => va('/inventer')}
                className="mt-6 w-full h-[46px] rounded-[16px] bg-brume/50 text-[15px]
                           hover:bg-brume transition-colors">
          Rien ne va ? Invente-moi une recette
        </button>

        {/* Coller la sienne : d'un carnet, d'un message, d'un site qu'on
            n'ingère pas. Sa place est ici, au moment où l'on cherche. */}
        <button onClick={() => va('/importer')}
                className="mt-3 w-full py-3.5 rounded-[16px] bg-brume/40 text-[15px]
                           hover:bg-brume transition-colors">
          J’ai ma propre recette à coller
        </button>
      </section>

      {ficheDe && (
        <FicheRecette recette={ficheDe} fermer={() => setFicheDe(null)}
                      retenue={prises.has(ficheDe.id)}
                      parts={prises.get(ficheDe.id)
                        ?? partsAProposer(cible, partsPrises, ficheDe.yield_servings)}
                      ajoute={() => ajoute(ficheDe)} enCours={choisit.isPending}
                      erreur={echecAjout} />
      )}
    </Passage>
  )
}
