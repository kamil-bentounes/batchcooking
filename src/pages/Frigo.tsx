/**
 * Le frigo (D28, D29, D36, D37, D49, D57) : un frigo américain, dessiné, qu'on ouvre.
 *
 * Fermé, il dit l'essentiel sans qu'on y touche : à gauche, sur le distributeur du congélateur, le dîner de
 * ce soir ; à droite, sur la porte du frigo, un magnet pour ce qui presse et la photo du plat de demain.
 * On touche une porte, elle pivote, et l'intérieur s'ouvre en plein écran : les plats dans leur bac, les
 * ingrédients rangés par étagère, le bac à légumes — ou, côté congélateur, les paniers givrés.
 *
 * Deux règles de l'ancien écran « Ce que j'ai » restent :
 *   · l'urgence se lit avec le MOT, pas seulement avec la couleur ;
 *   · tout se supprime, sans exception : une barquette mangée en douce ne doit pas rester une semaine à l'écran.
 *
 * La maquette est `FrigoUS.dc.html` (hors dépôt, `~/PERSO/sauvegardes-popote/maquettes-2026-10-26-frigo/`).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Barre, Attente, Erreur } from '../ui/coque.tsx'
import { Feuille } from '../ui/budget/Feuille.tsx'
import { FrigoFerme, LARGEUR } from '../ui/frigo/FrigoFerme.tsx'
import { useEchelle } from '../ui/frigo/useEchelle.ts'
import type { Porte } from '../ui/frigo/FrigoFerme.tsx'
import { InterieurCongelo, InterieurFrigo } from '../ui/frigo/Interieurs.tsx'
import type { PlatAffiche } from '../ui/frigo/Interieurs.tsx'
import { FichePlat } from '../ui/frigo/FichePlat.tsx'
import { FicheIngredient } from '../ui/frigo/FicheIngredient.tsx'
import { SortirParLien } from '../ui/frigo/SortirParLien.tsx'
import { TuileIngredient } from '../ui/frigo/Cartes.tsx'
import { FormulaireAjout } from './AjoutManuel.tsx'
import { useBarquettes } from '../lib/donnees/barquettes.ts'
import { prenomDe, useFoyer } from '../lib/donnees/foyer.ts'
import { useIngredients, usePrevus, useRecettesDesPlats } from '../lib/donnees/frigo.ts'
import { afficheur, groupeLesParts, magnet, quand } from '../lib/frigo.ts'
import { maintenant } from '../lib/horloge.ts'
import { jour } from '../lib/semaine.ts'
import { lisLesSorties } from '../lib/rappels.ts'

const sansAnimation = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Le temps que la porte pivote avant que l'intérieur ne prenne l'écran, et que l'intérieur s'efface avant que la porte ne se ferme. */
const OUVRE_APRES_MS = 620
const FERME_APRES_MS = 280

export function Frigo({ userId, va }: { userId: string; va: (v: string) => void }) {
  const { data: barquettes = [], isPending: chargeParts, error: erreurParts } = useBarquettes()
  const { data: lesPrevus, isPending: chargePrevus, error: erreurPrevus } = usePrevus()
  /* `null` tant que les repas ne sont pas lus (chargement, erreur) : ni « rien de prévu ce soir », ni une part
     « libre » que des repas réclament peut-être, ni un geste qui s'en fierait. */
  const prevus = lesPrevus ?? null
  const [boite, echelle] = useEchelle(LARGEUR)
  const { data: ingredients = [] } = useIngredients()
  const { data: foyer } = useFoyer()
  const now = maintenant()

  const groupes = useMemo(() => groupeLesParts(barquettes), [barquettes])
  const idsRecettes = useMemo(
    () => [...new Set(groupes.map(g => g.recipeId).filter((x): x is string => !!x))], [groupes])
  const { data: recettes } = useRecettesDesPlats(idsRecettes)
  const photoDe = (recipeId: string | null) => (recipeId ? recettes?.get(recipeId)?.image_url ?? null : null)

  const membres = (foyer?.membres ?? []).map(m => ({ id: m.id, prenom: prenomDe(m.display_name) }))

  /* ── Les portes ──────────────────────────────────────────────────────────── */
  const [porte, setPorte] = useState<Porte | null>(null)
  const [vue, setVue] = useState<Porte | null>(null)
  /* Les portes déjà ouvertes : les photos de l'intérieur ne se demandent qu'à la première ouverture. */
  const [ouvertes, setOuvertes] = useState<Porte[]>([])
  const minuteur = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const refCongelo = useRef<HTMLButtonElement>(null)
  const refFrigo = useRef<HTMLButtonElement>(null)
  useEffect(() => () => clearTimeout(minuteur.current), [])

  function ouvre(p: Porte) {
    clearTimeout(minuteur.current)
    setPorte(p)
    setOuvertes(o => (o.includes(p) ? o : [...o, p]))
    minuteur.current = setTimeout(() => setVue(p), sansAnimation() ? 0 : OUVRE_APRES_MS)
  }
  function ferme() {
    const derniere = porte
    clearTimeout(minuteur.current)
    setVue(null); setFicheCle(null); setIngredientId(null); setAnnonce(null)
    minuteur.current = setTimeout(() => {
      setPorte(null)
      /* Le focus revient à la porte qu'on vient de fermer : sinon il se perd avec l'intérieur. */
      if (derniere) (derniere === 'congelo' ? refCongelo : refFrigo).current?.focus()
    }, sansAnimation() ? 0 : FERME_APRES_MS)
  }

  /* Échap ferme l'intérieur d'où que soit le focus — sauf quand une feuille est ouverte par-dessus : c'est elle
     que Échap ferme (un `Combien` le prend aussi, et le dit en annulant l'événement). */
  useEffect(() => {
    if (vue === null) return
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return
      ferme()
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  })

  /* ── Ce qui est ouvert par-dessus ────────────────────────────────────────── */
  const [ficheCle, setFicheCle] = useState<string | null>(null)
  const [ingredientId, setIngredientId] = useState<string | null>(null)
  const [ajout, setAjout] = useState<'frigo' | 'congelateur' | null>(null)
  const [placard, setPlacard] = useState(false)
  const [ajoutPlacard, setAjoutPlacard] = useState(false)
  const [annonce, setAnnonce] = useState<string | null>(null)
  const effaceAnnonce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(effaceAnnonce.current), [])
  const annonceUnTemps = (m: string) => {
    setAnnonce(m)
    clearTimeout(effaceAnnonce.current)
    effaceAnnonce.current = setTimeout(() => setAnnonce(null), 6000)
  }

  /* « C'est fait » d'un mail de rappel : `/frigo?sortir=<ids>`. Lu une fois, au montage ; la feuille de confirmation
     reste jusqu'à la réponse, puis l'adresse est nettoyée (un rechargement ne repose pas la question). */
  const [sorties, setSorties] = useState<string[] | null>(() => lisLesSorties(window.location.search))
  const finiLesSorties = () => {
    setSorties(null)
    window.history.replaceState(null, '', window.location.pathname)
  }

  const groupeOuvert = groupes.find(g => g.cle === ficheCle) ?? null
  const ingredientOuvert = ingredients.find(i => i.id === ingredientId) ?? null

  /* ── Ce que dit le frigo fermé ───────────────────────────────────────────── */
  const dit = afficheur(prevus, barquettes, userId, now)
  const aimant = magnet(barquettes, prevus, now)
  const charge = chargeParts || chargePrevus
  const demainJ = (() => { const d = new Date(now); d.setDate(d.getDate() + 1); return jour(d) })()
  const demain = (() => {
    const ordre = ['petit_dejeuner', 'dejeuner', 'collation', 'diner']
    const mien = (prevus ?? []).filter(r => r.user_profile_id === userId && r.day === demainJ && r.portion_id)
      .sort((a, b) => ordre.indexOf(a.meal) - ordre.indexOf(b.meal))
    for (const r of mien) {
      const part = barquettes.find(p => p.id === r.portion_id)
      const url = part?.recipe_id ? recettes?.get(part.recipe_id)?.image_url ?? null : null
      if (url) return url
    }
    return null
  })()

  /* Pas de photo avant que la porte n'ait été ouverte : l'intérieur est masqué, ses images n'ont pas à partir. */
  const affiche = (lieu: 'frigo' | 'congelateur'): PlatAffiche[] =>
    groupes.filter(g => g.location === lieu)
      .map(g => ({
        groupe: g, quand: quand(g, prevus, now),
        photo: ouvertes.includes(lieu === 'frigo' ? 'frigo' : 'congelo') ? photoDe(g.recipeId) : null,
      }))
  const platsFrigo = affiche('frigo')
  const platsCongelo = affiche('congelateur')
  const plusTard = platsCongelo.length === 0 ? null
    : new Date(Math.max(...platsCongelo.flatMap(p => p.groupe.parts.map(x => new Date(x.expires_at).getTime()))))

  const duLieu = (l: string) => ingredients.filter(i => i.location === l)

  return (
    <>
      {/* Le frigo fermé et la barre du bas : inertes tant qu'un intérieur est ouvert (il est modal). */}
      <div inert={vue !== null} className="flex min-h-dvh flex-col">
      <main className="flex flex-1 flex-col overflow-x-hidden pt-[54px]">
        <div className="relative z-10 mx-auto w-full max-w-lg px-5">
          <h1 className="titre text-[34px] font-semibold leading-none">Le frigo</h1>
          <p className="mt-2 text-[14px] text-doux">Touche une porte pour l’ouvrir.</p>

          <div ref={boite} className="mt-[10px]">
            {charge
              ? <Attente />
              : (
                <FrigoFerme ouverte={porte} surOuvre={ouvre} afficheur={dit} magnet={aimant} echelle={echelle}
                            demain={demain} refCongelo={refCongelo} refFrigo={refFrigo} />
              )}
          </div>
          <Erreur de={erreurParts} />
          <Erreur de={erreurPrevus} />
        </div>

        {/* Le sol : une bande plus sombre derrière le bas du frigo, comme la maquette. Elle commence 68 px (à
            l'échelle) au-dessus du pied du dessin, qui est devant, et suit le dessin s'il est réduit. */}
        <div className="flex-1 pb-28" style={{ marginTop: -68 * echelle, background: 'linear-gradient(180deg, #E6EAE2, #E1E6DD)' }}>
          <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-0.5 px-5"
               style={{ paddingTop: 68 * echelle + 48 }}>
            <button type="button" onClick={() => setPlacard(true)}
                    className="min-h-11 px-3 text-[15px] font-semibold text-herbe underline underline-offset-[3px]">
              Le placard
            </button>
            <button type="button" onClick={() => va('/peser')}
                    className="min-h-11 px-3 text-[14px] text-doux underline underline-offset-[3px]">
              Peser ce qu’on compte à l’unité
            </button>
          </div>
        </div>
      </main>
      <Barre actif="frigo" va={va} />
      </div>

      <InterieurFrigo visible={vue === 'frigo'} plats={platsFrigo} ingredients={duLieu('frigo')}
                      annonce={vue === 'frigo' ? annonce : null} erreur={erreurPrevus} attente={charge} surFerme={ferme}
                      surPlat={setFicheCle} surIngredient={setIngredientId}
                      surAjoute={() => setAjout('frigo')} surPhoto={() => va('/photo')} />
      <InterieurCongelo visible={vue === 'congelo'} plats={platsCongelo} ingredients={duLieu('congelateur')}
                        plusTard={plusTard} annonce={vue === 'congelo' ? annonce : null} erreur={erreurPrevus} attente={charge}
                        surFerme={ferme} surPlat={setFicheCle} surIngredient={setIngredientId}
                        surAjoute={() => setAjout('congelateur')} />

      {/* Le lien « C'est fait » d'un mail : sortir ces barquettes du congélateur, après confirmation. */}
      <SortirParLien ids={sorties} barquettes={barquettes} chargement={chargeParts} surFerme={finiLesSorties} />

      {/* La fiche d'un plat. */}
      <Feuille ouverte={!!groupeOuvert} fermer={() => setFicheCle(null)} titre={groupeOuvert?.label ?? 'Plat'}>
        {groupeOuvert && (
          <FichePlat groupe={groupeOuvert} prevus={prevus} erreurPrevus={erreurPrevus} membres={membres}
                     recette={groupeOuvert.recipeId ? recettes?.get(groupeOuvert.recipeId) : undefined}
                     photoLien={photoDe(groupeOuvert.recipeId)} foyerId={foyer?.id ?? null} moi={userId}
                     va={va} surAnnonce={annonceUnTemps} />
        )}
      </Feuille>

      {/* La fiche d'un ingrédient. */}
      <Feuille ouverte={!!ingredientOuvert} fermer={() => setIngredientId(null)}
               titre={ingredientOuvert?.label ?? 'Ingrédient'}>
        {ingredientOuvert && <FicheIngredient item={ingredientOuvert} surAnnonce={annonceUnTemps} />}
      </Feuille>

      {/* Ajouter au frigo ou au congélateur : le formulaire d'avant, dans une feuille. */}
      <Feuille ouverte={ajout !== null} fermer={() => setAjout(null)}
               titre={ajout === 'congelateur' ? 'Ajouter au congélateur' : 'Ajouter au frigo'}>
        {ajout && (
          <>
            <h2 className="titre mx-1 text-[24px] font-semibold">
              {ajout === 'congelateur' ? 'Ajouter au congélateur' : 'Ajouter au frigo'}
            </h2>
            <FormulaireAjout lieu={ajout} surFini={() => setAjout(null)} />
          </>
        )}
      </Feuille>

      {/* Le placard : une simple liste. */}
      <Feuille ouverte={placard && !ingredientOuvert} fermer={() => { setPlacard(false); setAjoutPlacard(false) }} titre="Le placard">
        <h2 className="titre mx-1 text-[24px] font-semibold">Le placard</h2>
        {duLieu('placard').length === 0 ? (
          <p className="mx-1 mt-3 text-[14px] text-doux">Rien au placard pour l’instant.</p>
        ) : (
          <ul className="mx-1 mt-3 flex flex-wrap gap-2">
            {duLieu('placard').map(i => (
              <li key={i.id}><TuileIngredient item={i} surOuvre={() => setIngredientId(i.id)} /></li>
            ))}
          </ul>
        )}
        <div className="mx-1 mt-4">
          <button type="button" onClick={() => setAjoutPlacard(a => !a)} aria-expanded={ajoutPlacard}
                  className="min-h-11 rounded-xl border-[1.5px] border-dashed border-[#9FB0A4] px-3.5 text-[14px] font-semibold text-herbe">
            + Ajouter au placard
          </button>
        </div>
        {ajoutPlacard && <FormulaireAjout lieu="placard" surFini={() => setAjoutPlacard(false)} />}
      </Feuille>
    </>
  )
}
