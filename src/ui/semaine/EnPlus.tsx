/**
 * Ce qu'on mange en plus d'un repas, ou hors de ceux qu'on choisit : l'extra (`meal_extra`).
 *
 * « La semaine » choisit le midi et le soir ; ce qui reste — le petit déjeuner, la collation, le yaourt de
 * « en plus » — s'écrit ici, en un geste, comme avant.
 */
import { useState } from 'react'
import { Erreur } from '../coque.tsx'
import { NOM_REPAS, useAjouteExtra, useSupprimeExtra } from '../../lib/donnees/barquettes.ts'
import type { Case, Repas } from '../../lib/donnees/barquettes.ts'
import type { Ligne as LigneBase } from '../../lib/supabase.ts'
import { reperesDe } from '../../lib/reperes.ts'
import { MOMENTS_EN_PLUS, caseVide } from '../../lib/choix.ts'
import type { CaseLue } from '../../lib/choix.ts'

type Frequent = LigneBase<'frequent_food'>

/**
 * Ce qu'on a mangé EN PLUS de la barquette (D26, D34, D38).
 *
 * Le batch cooking couvre les dîners. Sans le petit-déjeuner ni le midi, le
 * tableau de bord ment de ~900 kcal par jour — il vaudrait mieux ne rien
 * afficher. Mais personne ne tape des calories deux semaines de suite : d'où
 * des repères en UN GESTE, et ce que le foyer remange sans cesse à portée de
 * pouce. Approximatif et tenu vaut mieux que précis et abandonné.
 */
export function EnPlus({ cas, frequents, deployeParDefaut = false, surAjoute }:
  { cas: Case; frequents: Frequent[]; deployeParDefaut?: boolean
    surAjoute?: () => void }) {
  const ajoute = useAjouteExtra({ onSuccess: surAjoute })
  const supprime = useSupprimeExtra()
  const [ouvert, setOuvert] = useState(deployeParDefaut)
  const laCase = {
    id: cas.id, user_profile_id: cas.user_profile_id, day: cas.day, meal: cas.meal,
  }
  const [libre, setLibre] = useState({ label: '', kcal: '', prot: '' })

  const reperes = reperesDe(cas.meal)
  const k = Number(libre.kcal.replace(',', '.'))
  const pr = Number(libre.prot.replace(',', '.'))
  const saisi = libre.label.trim() !== '' && Number.isFinite(k) && k >= 0

  return (
    <div>
      {cas.extras.length > 0 && (
        <ul className="mb-2 space-y-1">
          {cas.extras.map(e => (
            <li key={e.id} className="flex items-center gap-2 text-[13px] text-doux">
              <span className="grow">
                {e.label} · {Math.round(Number(e.kcal))} kcal ·
                {' '}{Math.round(Number(e.protein_g))} g de protéines
              </span>
              <button onClick={() => supprime.mutate(e.id)}
                      aria-label={`Retirer ${e.label}`}
                      className="min-h-11 px-2 underline underline-offset-2">retirer</button>
            </li>
          ))}
        </ul>
      )}

      {!ouvert ? (
        <button onClick={() => setOuvert(true)}
                className="inline-flex min-h-11 items-center text-[13px] text-doux underline underline-offset-2">
          + ce que j’ai mangé en plus
        </button>
      ) : (
        <div className="space-y-3">
          {frequents.length > 0 && (
            <div>
              <p className="text-[13px] text-doux mb-1.5">Ce que tu reprends souvent</p>
              <div className="flex gap-2 flex-wrap">
                {frequents.slice(0, 6).map(f => (
                  <button key={f.id} onClick={() => ajoute.mutate({
                    cas: laCase, label: f.label, grammes: Number(f.grams),
                    kcal: Number(f.kcal), proteinG: Number(f.protein_g),
                    foodId: f.food_id,
                  })}
                          className="min-h-11 px-3.5 rounded-full bg-surface text-[14px]">
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
                <button key={r.label} onClick={() => ajoute.mutate({
                  cas: laCase, label: r.label, kcal: r.kcal, proteinG: r.proteinG,
                })}
                        className="min-h-11 px-3.5 rounded-full bg-brume/50 text-[14px]">
                  {r.label}
                  <span className="text-doux"> {r.kcal}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 items-end">
            <label className="grow">
              <span className="sr-only">Quoi</span>
              <input value={libre.label} placeholder="Autre chose"
                     onChange={e => setLibre({ ...libre, label: e.target.value })}
                     className="w-full h-[44px] px-3 rounded-[13px] bg-brume/40 text-[15px]" />
            </label>
            <label className="w-[74px]">
              <span className="sr-only">Kilocalories</span>
              <input inputMode="numeric" value={libre.kcal} placeholder="kcal"
                     onChange={e => setLibre({ ...libre, kcal: e.target.value })}
                     className="w-full h-[44px] px-2 rounded-[13px] bg-brume/40
                                text-[15px] text-center" />
            </label>
            <label className="w-[64px]">
              <span className="sr-only">Grammes de protéines</span>
              <input inputMode="numeric" value={libre.prot} placeholder="g prot"
                     onChange={e => setLibre({ ...libre, prot: e.target.value })}
                     className="w-full h-[44px] px-2 rounded-[13px] bg-brume/40
                                text-[15px] text-center" />
            </label>
            <button disabled={!saisi}
                    onClick={() => {
                      ajoute.mutate({
                        cas: laCase, label: libre.label, kcal: k,
                        proteinG: Number.isFinite(pr) ? pr : 0,
                      })
                      setLibre({ label: '', kcal: '', prot: '' })
                    }}
                    className="h-[44px] px-4 rounded-[13px] bg-herbe text-fond text-[15px]
                               disabled:bg-brume disabled:text-encre">
              Ajouter
            </button>
          </div>

          <Erreur de={ajoute.error} />
          {!deployeParDefaut && (
            <button onClick={() => setOuvert(false)}
                    className="inline-flex min-h-11 items-center text-[13px] text-doux underline underline-offset-2">
              Fermer
            </button>
          )}
        </div>
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
export function HorsBarquette({ jour: j, userId, frequents, dejaLa, surSaute, enCours = false }: {
  jour: string
  userId: string
  frequents: Frequent[]
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
          <EnPlus frequents={frequents} deployeParDefaut
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
