/**
 * La fiche (i) d'une recette (R2) : elle monte du bas, sans quitter la liste.
 *
 * `fiche()` dans la maquette, validée telle quelle. Ce que la liste a déjà —
 * photo, temps, parts, macros — s'affiche tout de suite ; ingrédients et étapes
 * arrivent avec la fiche (`useFiche`).
 *
 * Un `<dialog>` modal : Échap le ferme, le focus y reste, et le voile se touche
 * pour sortir. Les étapes disent ce qui demande tes mains et ce qui cuit seul.
 *
 * Fermer, c'est `close()` sur le `<dialog>`, jamais le démonter d'abord : c'est
 * l'événement `close` qui prévient le parent (`fermer`), et Chrome ne rend le
 * focus au bouton (i) qu'à ce prix.
 */
import { useEffect, useRef } from 'react'
import { Attente, Erreur, duree } from '../coque.tsx'
import { ecrit } from '../../lib/nutrition/macros.ts'
import { useFiche } from '../../lib/donnees/fiche.ts'
import type { EtapeDeFiche } from '../../lib/donnees/fiche.ts'
import type { Candidate } from '../../lib/donnees/catalogue.ts'
import { ingredientEnDeux, precision } from '../../lib/recettes/fiche.ts'
import { parts as motParts } from '../../lib/recettes/parts.ts'
import { decodeEntites } from '../../lib/recettes/texte.ts'
import {
  MOT_DE_CHARGE, actifConnu, enTout, minutesDeMains, tempsActif,
} from '../../lib/recettes/temps.ts'
import { Photo } from './Photo.tsx'
import { Icone, Picto, PictoEtNom } from './pictos.tsx'

const INSECABLE = ' '

/** Un foyer écrit ce qu'il veut dans `source_url` : seul un lien web se rend cliquable. */
const lienWeb = (url: string | null | undefined): string | null =>
  url && /^https?:\/\//i.test(url) ? url : null

export function FicheRecette({ recette: r, fermer, parts, retenue, ajoute, enCours, erreur }: {
  recette: Candidate
  /** Appelée quand le `<dialog>` s'est fermé (croix, voile, Échap) : le parent la démonte. */
  fermer: () => void
  /** Les parts qu'« Ajouter » posera, ou celles déjà retenues. */
  parts: number
  retenue: boolean
  ajoute: () => void
  enCours: boolean
  /** Ce qui a raté quand « Ajouter » a échoué, dit en français ; `null` sinon. */
  erreur?: string | null
}) {
  const boite = useRef<HTMLDialogElement>(null)
  const { data: fiche, error, isPending } = useFiche(r.id)

  // Ouverte dès qu'elle existe ; la page derrière ne défile plus.
  useEffect(() => {
    const d = boite.current
    if (d && !d.open) d.showModal()
    const avant = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = avant }
  }, [])

  const titre = r.title ?? 'Recette'
  const n = r.nutrition
  const actif = actifConnu(r.active_time_min) ? Number(r.active_time_min) : null
  const total = fiche ? enTout(r.total_time_min, r.active_time_min, fiche.etapes) : null
  const mains = fiche ? tempsActif(fiche.etapes) : null
  const passives = fiche?.etapes.some(e => e.load_type === 'passif') ?? false
  // Une recette de foyer dit qui l'a ajoutée (§ 3.6) ; le catalogue, son site.
  const provenance = r.owner_household_id !== null && r.ajoutePar
    ? `Ajoutée par ${r.ajoutePar}`
    : fiche?.source_name ?? null
  const lien = lienWeb(fiche?.source_url)
  const ferme = () => boite.current?.close()

  return (
    <dialog ref={boite} aria-label={titre} onClose={fermer}
            onClick={e => { if (e.target === boite.current) ferme() }}
            className="fixed inset-0 m-0 p-0 border-0 w-full max-w-none h-dvh max-h-none
                       bg-transparent text-encre backdrop:bg-encre/55">
      <section className="absolute inset-x-0 bottom-0 top-11 mx-auto max-w-lg flex flex-col
                          rounded-t-[28px] bg-fond overflow-hidden animate-[monte_220ms_ease-out]">
        <div className="grow overflow-y-auto overscroll-contain">
          <div className="relative h-[230px]">
            <Photo url={r.image_url} glyphe={72} className="size-full" />
            <span aria-hidden="true"
                  className="absolute top-2 left-1/2 -ml-5 w-10 h-[5px] rounded-full bg-surface/85" />
            <button type="button" onClick={ferme} aria-label="Fermer"
                    className="absolute top-3.5 right-3.5 size-11 grid place-items-center
                               rounded-full bg-surface/90 text-encre">
              <Icone nom="fermer" taille={22} epaisseur={2.2} />
            </button>
          </div>

          <div className="px-4 py-[18px]">
            {provenance && (
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-doux">
                {provenance}
              </p>
            )}
            <h2 className="titre-fort text-[30px] leading-[1.08] mt-1.5">{titre}</h2>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Tuile valeur={actif !== null ? duree(actif) : '—'} unite="actives" />
              <Tuile valeur={total !== null ? duree(total) : fiche ? '—' : '…'} unite="en tout" />
              <Tuile valeur={r.yield_servings ? String(r.yield_servings) : '—'}
                     unite={r.yield_servings === 1 ? 'part' : 'parts'} />
            </div>

            <div className="mt-3 rounded-[28px] bg-encre text-fond px-5 pt-5 pb-[18px]">
              <div className="flex items-center justify-between gap-2 text-[15px] text-[#B7C6BC]">
                <span>Par part</span>
                {n && (
                  <span className="text-[13px] text-brume bg-fond/8 rounded-full px-[11px] py-[5px]
                                   whitespace-nowrap">
                    {precision(n)}
                  </span>
                )}
              </div>
              {n ? (
                /* Les protéines gardent la place qu'il leur faut, sur UNE ligne : « 22–26 g »
                   passait à la ligne (« 22– » puis « 26 g ») dès que les kcal avaient trois
                   chiffres, parce que les colonnes se partageaient la largeur par fractions. */
                <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-4 items-end">
                  <div>
                    <span className="chiffre font-semibold block text-safran text-[44px] leading-[1.05]
                                     whitespace-nowrap">
                      {ecrit(Number(n.protein_g), Number(n.protein_g_margin))}{INSECABLE}g
                    </span>
                    <span className="block mt-0.5 text-[12.5px] text-[#B7C6BC]">de protéines</span>
                  </div>
                  <div>
                    <span className="chiffre font-semibold block text-fond text-[22px] leading-[1.05]">
                      {ecrit(Number(n.kcal), Number(n.kcal_margin))}
                    </span>
                    <span className="block mt-0.5 text-[12.5px] text-[#B7C6BC]">kcal</span>
                  </div>
                  <div>
                    <span className="chiffre font-semibold block text-fond text-[22px] leading-[1.05]">
                      {Math.round(Number(n.fiber_g))}{INSECABLE}g
                    </span>
                    <span className="block mt-0.5 text-[12.5px] text-[#B7C6BC]">de fibres</span>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[15px] text-brume">
                  Macros inconnues : trop d’ingrédients non reconnus.
                </p>
              )}
            </div>

            {r.appliances.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {r.appliances.map(a => <PictoEtNom key={a} code={a} />)}
              </div>
            )}

            {isPending ? <Attente /> : error ? <Erreur de={error} /> : fiche && (
              <>
                <h3 className="titre-fort text-[21px] mt-[26px] mb-2.5 flex items-baseline
                               justify-between gap-2.5">
                  Ingrédients
                  {r.yield_servings ? (
                    <span className="font-texte text-[13px] font-medium text-doux">
                      pour {motParts(r.yield_servings)}
                    </span>
                  ) : null}
                </h3>
                <ul className="px-4 rounded-[22px] bg-surface shadow-carte">
                  {fiche.ingredients.map(i => {
                    const { qte, nom } = ingredientEnDeux(i.raw_text)
                    return (
                      <li key={i.ordinal}
                          className="grid grid-cols-[86px_minmax(0,1fr)] gap-2.5 py-[11px] text-[15px]
                                     border-t border-piste first:border-t-0">
                        <span className="font-semibold tabular-nums">{qte}</span>
                        <span>{nom}</span>
                      </li>
                    )
                  })}
                </ul>

                <h3 className="titre-fort text-[21px] mt-[26px] mb-2.5 flex items-baseline
                               justify-between gap-2.5">
                  Étapes
                  <span className="font-texte text-[13px] font-medium text-doux">
                    {mains !== null && mains > 0
                      ? `${duree(mains)} de gestes${passives ? ', le reste cuit seul' : ''}`
                      : 'Gestes non comptés'}
                  </span>
                </h3>
                <ol className="flex flex-col gap-2.5">
                  {fiche.etapes.map(e => <Etape key={e.ordinal} etape={e} />)}
                </ol>
              </>
            )}

            {lien && (
              <a href={lien} target="_blank" rel="noopener noreferrer"
                 className="mt-[18px] flex items-center justify-center gap-1.5 min-h-11
                            text-herbe text-[14px] font-semibold">
                Voir la recette sur {fiche?.source_name ?? 'le site'}
                <Icone nom="sortie" taille={16} />
              </a>
            )}
          </div>
        </div>

        <div className="shrink-0 px-4 pt-3 pb-[max(18px,env(safe-area-inset-bottom))]
                        bg-linear-to-t from-fond from-70% to-fond/0">
          <div className="-mt-2 mb-2"><Erreur de={erreur} /></div>
          {retenue ? (
            <p className="min-h-14 rounded-[18px] bg-herbe/10 text-herbe text-[16px] font-semibold
                          grid place-items-center">
              Retenue pour dimanche · {motParts(parts)}
            </p>
          ) : (
            <button type="button" onClick={ajoute} disabled={enCours}
                    className="w-full min-h-14 rounded-[18px] bg-safran text-encre text-[16px]
                               font-semibold disabled:opacity-60">
              Ajouter à dimanche · {motParts(parts)}
            </button>
          )}
        </div>
      </section>
    </dialog>
  )
}

function Tuile({ valeur, unite }: { valeur: string; unite: string }) {
  return (
    <div className="rounded-[18px] bg-surface shadow-carte p-3">
      <span className="chiffre font-semibold block text-[23px] leading-[1.05]">{valeur}</span>
      <span className="block mt-0.5 text-[12.5px] text-doux">{unite}</span>
    </div>
  )
}

/** Une étape : ce qu'elle demande à tes mains, et ce qu'elle laisse cuire seul. */
function Etape({ etape: e }: { etape: EtapeDeFiche }) {
  const gestes = Number(e.gesture_min ?? 0)
  const minutes = e.duration_min === null ? 0 : Number(e.duration_min)
  const mains = minutesDeMains(e)
  return (
    <li className="flex gap-3 p-3.5 rounded-[22px] bg-surface shadow-carte">
      <span className="size-[30px] shrink-0 grid place-items-center rounded-full bg-encre text-fond
                       font-titre font-semibold text-[15px]">
        {e.ordinal}
      </span>
      <div className="min-w-0">
        <p className="mt-[3px] text-[15px] leading-[1.45]">{decodeEntites(e.text)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {e.load_type === 'passif' ? (
            <>
              {gestes > 0 && <Pilule mains texte={`${duree(gestes)} · ${MOT_DE_CHARGE.actif}`} />}
              {minutes > 0 && <Pilule texte={`${duree(minutes)} · ${MOT_DE_CHARGE.passif}`} />}
            </>
          ) : mains > 0 && (
            <Pilule mains texte={`${duree(mains)} · ${
              MOT_DE_CHARGE[e.load_type === 'bloquant' ? 'bloquant' : 'actif']}`} />
          )}
          {e.appliance_type && (
            <Picto code={e.appliance_type} taille={15} className="size-7 bg-piste text-herbe" />
          )}
        </div>
      </div>
    </li>
  )
}

/*
 * « sans toi » : `doux` sur `piste` ne fait que 4,40:1 ; `encre` à 80 % en fait
 * 6,77:1 (calculé depuis les jetons de index.css). Le sable et l'ocre : 4,85:1.
 */
function Pilule({ texte, mains = false }: { texte: string; mains?: boolean }) {
  return (
    <span className={`text-[13px] font-semibold rounded-full px-2.5 py-[5px] tabular-nums
      ${mains ? 'bg-sable text-ocre' : 'bg-piste text-encre/80'}`}>
      {texte}
    </span>
  )
}
