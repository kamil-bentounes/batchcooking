/**
 * Ce qu'on mange en plus d'un repas, ou hors de ceux qu'on choisit : l'extra (`meal_extra`).
 *
 * « La semaine » choisit le midi et le soir ; ce qui reste — le petit déjeuner, la collation, le yaourt de
 * « en plus » — s'écrit ici, en un geste, comme avant.
 */
import { useId, useRef, useState } from 'react'
import { Erreur } from '../coque.tsx'
import { NOM_REPAS, useAjouteExtra, useSupprimeExtra } from '../../lib/donnees/barquettes.ts'
import type { Case, Repas } from '../../lib/donnees/barquettes.ts'
import type { Ligne as LigneBase } from '../../lib/supabase.ts'
import { reperesDe } from '../../lib/reperes.ts'
import { MOMENTS_EN_PLUS, MOT_DU_MOMENT, caseVide } from '../../lib/choix.ts'
import type { CaseLue } from '../../lib/choix.ts'
import type { Aliment } from '../../lib/donnees/aliments.ts'
import { ecrit } from '../../lib/aliments/calcul.ts'
import {
  boutonAjouter, extraDeLaQuantite, lisLaSaisieAMain, motDeLaPastille, premierChampRefuse,
} from '../../lib/aliments/en-plus.ts'
import type { ErreursDeLaSaisie, SaisieAMain } from '../../lib/aliments/en-plus.ts'
import { sansLesRemplaces } from '../../lib/aliments/ordre.ts'
import { prepare } from '../../lib/photo.ts'
import { photoEnFrancais } from '../../lib/reseau.ts'
import { Pot } from '../aliments/Pictos.tsx'
import { QuantiteDeLAliment } from '../aliments/Quantite.tsx'
import { BoutonAppareil, EtiquetteEnPlus } from './EtiquetteEnPlus.tsx'

type Frequent = LigneBase<'frequent_food'>

/**
 * Ce qu'on a mangé EN PLUS de la barquette (D26, D34, D38).
 *
 * Le batch cooking couvre les dîners. Sans le petit-déjeuner ni le midi, le
 * tableau de bord ment de ~900 kcal par jour — il vaudrait mieux ne rien
 * afficher. Mais personne ne tape des calories deux semaines de suite : d'où
 * des repères en UN GESTE, et ce que le foyer remange sans cesse à portée de
 * pouce. Approximatif et tenu vaut mieux que précis et abandonné.
 *
 * Nos aliments demandent « combien ? » (un panneau sous les pastilles : deux pots, 30 g) ; ce qui n'est nulle part se
 * tape à la main (les calories ET les protéines sont obligatoires) ou se lit sur une étiquette photographiée.
 */
export function EnPlus({ cas, frequents, nosAliments = [], userId, deployeParDefaut = false, surAjoute }:
  { cas: Case; frequents: Frequent[]
    /** Nos aliments (migration 0124) : AVANT les repères, avec leur quantité (« combien ? »). */
    nosAliments?: Aliment[]
    /** Moi : ce sont MES quantités récentes que le panneau propose. */
    userId: string
    deployeParDefaut?: boolean
    surAjoute?: () => void }) {
  const ajoute = useAjouteExtra({ onSuccess: surAjoute })
  /* Un geste à la fois : un double toucher sur une pastille (nos aliments, une habitude, un repère) écrivait deux fois le
     repas. Une ref, pas `ajoute.isPending` : le second toucher arrive avant que le rendu n'ait eu lieu. */
  const enVol = useRef(false)
  const geste = (e: Parameters<typeof ajoute.mutate>[0], apres?: () => void) => {
    if (enVol.current) return
    enVol.current = true
    ajoute.mutate(e, { onSuccess: apres, onSettled: () => { enVol.current = false } })
  }
  const supprime = useSupprimeExtra()
  const [ouvert, setOuvert] = useState(deployeParDefaut)
  /* L'aliment dont le panneau « combien ? » est ouvert. */
  const [choisi, setChoisi] = useState<string | null>(null)
  const laCase = {
    id: cas.id, user_profile_id: cas.user_profile_id, day: cas.day, meal: cas.meal,
  }
  const mot = MOT_DU_MOMENT[cas.meal] ?? MOT_DU_MOMENT.diner
  const id = useId()
  const [libre, setLibre] = useState<SaisieAMain>({ label: '', kcal: '', prot: '' })
  const [erreurs, setErreurs] = useState<ErreursDeLaSaisie>({})
  /* Une photo d'étiquette en attente de lecture : la feuille s'ouvre dessus. `n` : une nouvelle photo, une nouvelle feuille. */
  const [photo, setPhoto] = useState<{ n: number; url: string } | null>(null)
  const [erreurPhoto, setErreurPhoto] = useState('')
  const boutonPhoto = useRef<HTMLInputElement>(null)

  /* Un repère (ou une habitude) qu'un de nos aliments remplace — nommé dans son formulaire (« Remplace le repère »),
     ou de même nom — ne se glisse plus à côté : c'est le nôtre, avec ses vrais chiffres. */
  const reperes = sansLesRemplaces(reperesDe(cas.meal), nosAliments)
  const habitudes = sansLesRemplaces(frequents, nosAliments)
  const alimentChoisi = nosAliments.find(a => a.id === choisi)

  function ajouteLaSaisie(ev: React.FormEvent) {
    ev.preventDefault()
    if (enVol.current) return
    const r = lisLaSaisieAMain(libre)
    if (!r.ok) {
      setErreurs(r.erreurs)
      const premier = premierChampRefuse(r.erreurs)
      if (premier) document.getElementById(`${id}-${premier}`)?.focus()
      return
    }
    setErreurs({})
    geste({ cas: laCase, label: r.valeurs.label, kcal: r.valeurs.kcal, proteinG: r.valeurs.proteinG },
      () => setLibre({ label: '', kcal: '', prot: '' }))
  }
  const tape = (c: keyof SaisieAMain) => (v: string) => {
    setLibre(p => ({ ...p, [c]: v }))
    setErreurs(e => (e[c] ? { ...e, [c]: undefined } : e))
  }

  async function surPhoto(f: File) {
    setErreurPhoto('')
    try {
      const { dataUrl } = await prepare(f)
      setPhoto(p => ({ n: (p?.n ?? 0) + 1, url: dataUrl }))
    } catch (e) { setErreurPhoto(photoEnFrancais(e)) }
  }

  const zone = (c: keyof SaisieAMain, nom: string, extra: { inputMode: 'text' | 'decimal' }) => (
    <div>
      <label htmlFor={`${id}-${c}`} className="block text-[14px] font-bold">{nom}</label>
      <input id={`${id}-${c}`} value={libre[c]} onChange={ev => tape(c)(ev.target.value)} inputMode={extra.inputMode}
             autoComplete="off" aria-invalid={erreurs[c] ? true : undefined}
             aria-describedby={erreurs[c] ? `${id}-${c}-erreur` : undefined}
             className="mt-1 h-12 w-full rounded-[14px] bg-surface px-3.5 text-[16px] text-encre"
             style={erreurs[c] ? { boxShadow: 'inset 0 0 0 1.5px var(--color-groseille)' } : { boxShadow: 'inset 0 0 0 1px var(--color-brume)' }} />
      {erreurs[c] && <p id={`${id}-${c}-erreur`} className="mt-1 text-[13px] leading-[1.35] text-groseille">{erreurs[c]}</p>}
    </div>
  )

  return (
    <div>
      {cas.extras.length > 0 && (
        <ul className="mb-2 space-y-1">
          {cas.extras.map(e => (
            <li key={e.id} className="flex items-center gap-2 text-[13px] text-doux">
              <span className="grow">
                {e.label} · {Math.round(Number(e.kcal))} kcal ·
                {' '}{ecrit(Number(e.protein_g))} g de protéines
              </span>
              <button onClick={() => supprime.mutate(e.id)}
                      aria-label={`Retirer ${e.label}`}
                      className="min-h-11 px-2 underline underline-offset-2">retirer</button>
            </li>
          ))}
        </ul>
      )}
      {/* Retirer un extra qui échoue : la ligne restait, sans un mot. */}
      <Erreur de={supprime.error} />

      {!ouvert ? (
        <button onClick={() => setOuvert(true)}
                className="inline-flex min-h-11 items-center text-[13px] text-doux underline underline-offset-2">
          + ce que j’ai mangé en plus
        </button>
      ) : (
        <div role="group" aria-label={`En plus ${mot.du}`}
             className={deployeParDefaut ? 'space-y-3' : 'space-y-3 rounded-[18px] bg-brume/30 p-3.5'}>
          {!deployeParDefaut && (
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-[16px] font-bold">En plus {mot.du}</h4>
              <button type="button" onClick={() => { setOuvert(false); setChoisi(null) }}
                      className="inline-flex min-h-11 items-center text-[14px] text-doux">
                fermer
              </button>
            </div>
          )}
          {nosAliments.length > 0 && (
            <div>
              <p className="text-[13px] text-doux mb-1.5">Nos aliments</p>
              <div className="flex gap-2 flex-wrap">
                {nosAliments.map(a => (
                  <button key={a.id} type="button" onClick={() => setChoisi(c => (c === a.id ? null : a.id))}
                          aria-pressed={choisi === a.id}
                          className="min-h-11 px-3.5 rounded-full bg-sable text-[14px] inline-flex items-center gap-2"
                          style={choisi === a.id ? { boxShadow: 'inset 0 0 0 2px var(--color-herbe)' } : undefined}>
                    <Pot largeur={13} />
                    <span>{a.label}</span>
                    <span className="text-doux">{motDeLaPastille(a)}</span>
                  </button>
                ))}
              </div>
              {alimentChoisi && (
                <div className="mt-2.5">
                  <QuantiteDeLAliment key={alimentChoisi.id} aliment={alimentChoisi} moi={userId}
                                      bouton={boutonAjouter(mot.au)} enCours={ajoute.isPending}
                                      surAjoute={q => geste({ cas: laCase, ...extraDeLaQuantite(alimentChoisi, q) }, () => setChoisi(null))} />
                </div>
              )}
            </div>
          )}

          {habitudes.length > 0 && (
            <div>
              <p className="text-[13px] text-doux mb-1.5">Ce que vous reprenez souvent</p>
              <div className="flex gap-2 flex-wrap">
                {habitudes.slice(0, 6).map(f => (
                  <button key={f.id} onClick={() => geste({
                    cas: laCase, label: f.label, grammes: Number(f.grams),
                    kcal: Number(f.kcal), proteinG: Number(f.protein_g),
                    foodId: f.food_id,
                  })}
                          aria-disabled={ajoute.isPending || undefined}
                          className="min-h-11 px-3.5 rounded-full bg-surface text-[14px] aria-disabled:opacity-60">
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[13px] text-doux mb-1.5">
              Un repère, pas une pesée
            </p>
            <div className="flex gap-2 flex-wrap">
              {reperes.map(r => (
                <button key={r.label} onClick={() => geste({
                  cas: laCase, label: r.label, kcal: r.kcal, proteinG: r.proteinG,
                })}
                        aria-disabled={ajoute.isPending || undefined}
                        className="min-h-11 px-3.5 rounded-full bg-surface text-[14px] aria-disabled:opacity-60">
                  {r.label}
                  <span className="text-doux"> {r.kcal}</span>
                </button>
              ))}
            </div>
          </div>

          {/* À la main : les calories ET les protéines sont obligatoires, chaque manque a sa phrase. */}
          <form onSubmit={ajouteLaSaisie} noValidate className="space-y-2.5">
            <p className="text-[13px] leading-[1.45] text-doux">
              Autre chose, à la main : les calories et les protéines sont obligatoires
            </p>
            {zone('label', 'Quoi', { inputMode: 'text' })}
            <div className="grid grid-cols-2 gap-2.5">
              {zone('kcal', 'Calories', { inputMode: 'decimal' })}
              {zone('prot', 'Protéines, en g', { inputMode: 'decimal' })}
            </div>
            <button type="submit" disabled={ajoute.isPending}
                    className="min-h-[52px] w-full rounded-[16px] bg-herbe px-4 text-[17px] font-semibold text-fond disabled:opacity-60">
              {boutonAjouter(mot.au)}
            </button>
          </form>

          {/* ou : l'étiquette d'un produit, photographiée. */}
          <div role="separator" aria-label="ou" className="flex items-center gap-3 text-[14px] text-doux">
            <span aria-hidden="true" className="h-px flex-1 bg-brume" />
            <span aria-hidden="true">ou</span>
            <span aria-hidden="true" className="h-px flex-1 bg-brume" />
          </div>
          <BoutonAppareil texte="Photographier l’étiquette" onFichier={surPhoto} inputRef={boutonPhoto}
                          className="min-h-[52px] w-full rounded-[16px] bg-surface text-[16px] font-semibold text-herbe" />
          {erreurPhoto && <p role="alert" className="text-[13px] leading-[1.45] text-groseille">{erreurPhoto}</p>}

          <Erreur de={ajoute.error} />
        </div>
      )}

      {photo && (
        <EtiquetteEnPlus key={photo.n} cas={laCase} photoInitiale={photo.url} surFini={surAjoute}
                         fermer={() => { setPhoto(null); setTimeout(() => boutonPhoto.current?.focus(), 0) }} />
      )}
    </div>
  )
}

/**
 * Noter un repas là où rien n'était prévu (D26, D34).
 *
 * Le batch cooking couvre les dîners. Un déjeuner au restaurant n'a donc pas de
 * case — et sans case, il n'y avait nulle part où l'écrire. La case se crée au
 * moment où l'on a quelque chose à y mettre.
 */
export function HorsBarquette({ jour: j, userId, frequents, nosAliments, dejaLa, surSaute, enCours = false }: {
  jour: string
  userId: string
  frequents: Frequent[]
  nosAliments?: Aliment[]
  dejaLa: Case[]
  /** « Sauté » : « on ne mange rien à ce moment » est une réponse (D33), pas un trou. Absent : pas de bouton. */
  surSaute?: (moment: 'petit_dejeuner' | 'collation') => void
  enCours?: boolean
}) {
  const [moment, setMoment] = useState<Repas | null>(null)
  /* Une case VIDE (ce que laissait « retirer » le dernier extra) ne prend pas la place du moment : on peut y noter. */
  const pris = new Set(dejaLa.filter(c => !caseVide(c as unknown as CaseLue)).map(c => c.meal))
  const libres = MOMENTS_EN_PLUS.filter(r => !pris.has(r))
  if (libres.length === 0) return null

  return (
    <div className="mt-3">
      {moment === null ? (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-[13px] text-doux">Mangé sans barquette ?</span>
          {libres.map(r => (
            <button key={r} onClick={() => setMoment(r)}
                    className="px-3 min-h-11 inline-flex items-center rounded-full bg-brume/50 text-[13px]
                               hover:bg-brume transition-colors">
              {NOM_REPAS[r]}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-[16px] bg-brume/25 p-3.5">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-[14px]">{NOM_REPAS[moment]}</span>
            <button onClick={() => setMoment(null)}
                    className="inline-flex min-h-11 items-center text-[13px] text-doux underline underline-offset-2">
              annuler
            </button>
          </div>
          {surSaute && (moment === 'petit_dejeuner' || moment === 'collation') && (
            <button type="button" disabled={enCours} onClick={() => { surSaute(moment); setMoment(null) }}
                    className="mb-2 inline-flex min-h-11 items-center rounded-full bg-brume/50 px-3.5 text-[14px] disabled:opacity-60">
              {moment === 'collation' ? 'Je saute la collation' : 'Je saute le petit déjeuner'}
            </button>
          )}
          <EnPlus frequents={frequents} nosAliments={nosAliments} userId={userId} deployeParDefaut
                  surAjoute={() => setMoment(null)}
                  cas={{
                    // Une case seulement AFFICHÉE : elle n'existe en base que
                    // si l'on y met quelque chose.
                    id: `vide:${userId}:${j}:${moment}`,
                    user_profile_id: userId, day: j, meal: moment, extras: [],
                  } as unknown as Case} />
        </div>
      )}
    </div>
  )
}
