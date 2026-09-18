/**
 * La semaine (D33, D39, D41).
 *
 * Sans cet écran, personne ne sait ce qu'on mange ce soir — c'était le trou de
 * l'app avant qu'on remette le cycle au centre. La distribution est proposée à
 * la fin de la session, puis se déplace librement.
 *
 * Trois états par case, et « vide » n'est PAS « zéro » : une case non renseignée
 * veut dire « on ne sait pas », et le bilan doit pouvoir le dire.
 */
import { useMemo, useState } from 'react'
import { Attente, Ecran, Erreur, Surface, Vide, dateLongue, jourCourt } from '../ui/coque.tsx'
import { useFoyer } from '../lib/donnees/foyer.ts'
import {
  NOM_REPAS, REPAS, jour, useAjouteExtra, useBarquettes, useDistribue, useFrequents,
  useMange, useSaute, useSemaine, useSupprimeExtra,
} from '../lib/donnees/barquettes.ts'
import type { Barquette, Case, Repas } from '../lib/donnees/barquettes.ts'
import type { Ligne as LigneBase } from '../lib/supabase.ts'
import { reperesDe } from '../lib/reperes.ts'

type Frequent = LigneBase<'frequent_food'>
import { useCycle } from '../lib/donnees/cycle.ts'
import { urgence } from '../lib/peremption.ts'

export function Semaine({ userId, va }: { userId: string; va: (v: string) => void }) {
  const debut = useMemo(() => new Date(), [])
  const { data: foyer } = useFoyer()
  const { data: cycle } = useCycle()
  const { data: cases = [], isPending } = useSemaine(debut, 7)
  const { data: libres = [] } = useBarquettes()
  const mange = useMange()
  const saute = useSaute()
  const distribue = useDistribue()
  const { data: frequents = [] } = useFrequents()

  const [qui, setQui] = useState<string | 'tous'>(userId)
  const [quoi, setQuoi] = useState<Repas | 'tous'>('tous')
  const [caseOuverte, setCaseOuverte] = useState<string | null>(null)

  const jours = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(debut)
    d.setDate(d.getDate() + i)
    return d
  }), [debut])

  const membres = foyer?.membres ?? []
  const placees = new Set(cases.map(c => c.portion_id).filter(Boolean))
  const disponibles = libres.filter(b => !placees.has(b.id))

  const visibles = cases.filter(c =>
    (qui === 'tous' || c.user_profile_id === qui) &&
    (quoi === 'tous' || c.meal === quoi))

  if (isPending) return <Ecran actif="semaine" va={va}><Attente /></Ecran>

  return (
    <Ecran actif="semaine" va={va}>
      <h1 className="titre text-[38px]">La semaine</h1>
      <p className="mt-2.5 text-[15px] text-doux">
        {cases.filter(c => c.portion_id).length} barquettes placées
        {disponibles.length > 0 && ` · ${disponibles.length} encore libre${disponibles.length > 1 ? 's' : ''}`}
      </p>

      <div className="mt-6 flex gap-2 flex-wrap" role="group" aria-label="Filtrer">
        <Puce actif={qui === 'tous'} surClic={() => setQui('tous')}>Tout le monde</Puce>
        {membres.map(m => (
          <Puce key={m.id} actif={qui === m.id} surClic={() => setQui(m.id)}>
            {m.display_name}
          </Puce>
        ))}
      </div>
      <div className="mt-2.5 flex gap-2 flex-wrap" role="group" aria-label="Filtrer par repas">
        <Puce actif={quoi === 'tous'} surClic={() => setQuoi('tous')}>Tous les repas</Puce>
        {REPAS.map(r => (
          <Puce key={r} actif={quoi === r} surClic={() => setQuoi(r)}>{NOM_REPAS[r]}</Puce>
        ))}
      </div>

      {visibles.length === 0 && qui === 'tous' && (
        <Vide titre="Rien de planifié"
              texte={cycle
                ? 'La distribution se fait à la fin de la session de cuisine.'
                : 'Ouvre une semaine depuis l’accueil.'} />
      )}

      {/* Les sept jours, TOUS affichés — y compris ceux où rien n'est prévu.
          Un déjeuner au restaurant n'a pas de barquette : sans jour à toucher,
          il n'y avait nulle part où le noter, et le bilan mentait de ~900 kcal
          par jour (D26). */}
      {(qui !== 'tous' || visibles.length > 0) && (
        <div className="mt-8 space-y-8">
          {jours.map(d => {
            const j = jour(d)
            const duJour = visibles.filter(c => c.day === j)
            const aujourdhui = j === jour(new Date())
            return (
              <section key={j} aria-label={dateLongue(d)}>
                <h2 className={`text-[13px] uppercase tracking-[0.04em]
                                ${aujourdhui ? 'text-encre' : 'text-doux'}`}>
                  {aujourdhui ? 'Aujourd’hui' : jourCourt(d)}
                </h2>
                {duJour.length === 0 && (
                  <p className="mt-1.5 text-[14px] text-doux">Rien de prévu.</p>
                )}
                <ul className="mt-3 space-y-3">
                  {duJour.map(c => (
                    <Ligne key={c.id} cas={c}
                           qui={qui === 'tous'
                             ? membres.find(m => m.id === c.user_profile_id)?.display_name ?? null
                             : null}
                           ouvert={caseOuverte === c.id}
                           disponibles={disponibles}
                           frequents={frequents}
                           surOuvre={() => setCaseOuverte(caseOuverte === c.id ? null : c.id)}
                           surMange={() => mange.mutate(c.id)}
                           surSaute={() => saute.mutate(c.id)}
                           surPlace={p => cycle && distribue.mutate({
                             cycleId: cycle.id,
                             cases: [{
                               userId: c.user_profile_id, jour: c.day,
                               repas: c.meal as Repas, portionId: p,
                             }],
                           })} />
                  ))}
                </ul>

                {/* La porte pour ce qui n'était pas prévu. Elle n'apparaît que
                    quand on regarde UNE personne : on ne saisit pas un repas
                    sans savoir de qui il s'agit. */}
                {qui !== 'tous' && (
                  // ⚠️ `cases`, pas `duJour` : ce dernier est déjà filtré par
                  //    repas, si bien qu'avec le filtre « Dîner » l'écran
                  //    proposait « Déjeuner » alors que la case existait —
                  //    et l'ajout écrasait une case déjà mangée.
                  <HorsBarquette jour={j} userId={qui} frequents={frequents}
                                 dejaLa={cases.filter(
                                   c => c.day === j && c.user_profile_id === qui)} />
                )}
              </section>
            )
          })}
        </div>
      )}

      {disponibles.length > 0 && (
        <Surface className="mt-10">
          <p className="text-[15px]">
            {disponibles.length} barquette{disponibles.length > 1 ? 's' : ''} sans jour
          </p>
          <p className="text-[13px] text-doux mt-1.5">
            Touche une case vide ci-dessus pour en poser une. Les plus pressées
            d’abord : elles périment en premier.
          </p>
        </Surface>
      )}
    </Ecran>
  )
}

function Ligne({ cas, qui, ouvert, disponibles, frequents,
                 surOuvre, surMange, surSaute, surPlace }: {
  cas: Case
  qui: string | null
  ouvert: boolean
  disponibles: Barquette[]
  frequents: Frequent[]
  surOuvre: () => void
  surMange: () => void
  surSaute: () => void
  surPlace: (portionId: string) => void
}) {
  const p = cas.portion
  const u = p ? urgence(p.expires_at, p.location as 'frigo' | 'congelateur') : null
  const mange = cas.state === 'mange'
  const saute = cas.state === 'saute'

  return (
    <li>
      <button onClick={surOuvre} className="w-full flex items-center gap-3 text-left py-1">
        <span className="w-[68px] shrink-0 text-[13px] text-doux">
          {NOM_REPAS[cas.meal as Repas]}
        </span>
        <span className="grow">
          <span className={`block text-[15px] ${mange ? 'text-doux line-through' : ''}
                            ${saute ? 'text-doux italic' : ''}`}>
            {saute ? 'Rien' : p?.label ?? '—'}
          </span>
          {(qui || (p && !mange)) && (
            <span className="block text-[13px] text-doux mt-0.5">
              {[qui, p && !mange && `${Math.round(Number(p.grams))} g · ${Math.round(Number(p.protein_g))} g de protéines`]
                .filter(Boolean).join(' · ')}
            </span>
          )}
          {cas.extras.length > 0 && (
            <span className="block text-[13px] text-doux mt-0.5">
              + {cas.extras.map(e => e.label).join(', ')}
            </span>
          )}
        </span>
        {u && !mange && u.niveau !== 'ok' && (
          <span className="text-[13px] shrink-0" style={{ color: u.encre }}>{u.mot}</span>
        )}
        {mange && (
          <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="#2F5D45"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
               className="shrink-0" aria-label="Mangé">
            <path d="M3.5 9 7 12.5l6.5-8" />
          </svg>
        )}
      </button>

      {ouvert && (
        <div className="pl-[80px] pb-3 space-y-3">
          {!mange && (
            <div className="flex gap-2 flex-wrap">
              {p && (
                <button onClick={surMange}
                        className="px-4 py-2 rounded-full bg-herbe text-fond text-[14px]">
                  Je l’ai mangé
                </button>
              )}
              <button onClick={surSaute}
                      className="px-4 py-2 rounded-full bg-brume/60 text-[14px]">
                Sauté
              </button>
            </div>
          )}
          {!p && disponibles.length > 0 && (
            <div>
              <p className="text-[13px] text-doux mb-2">Poser une barquette</p>
              <div className="flex gap-2 flex-wrap">
                {disponibles.slice(0, 6).map(b => (
                  <button key={b.id} onClick={() => surPlace(b.id)}
                          className="px-3.5 py-2 rounded-full bg-surface text-[14px]
                                     hover:bg-brume/60 transition-colors">
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <EnPlus cas={cas} frequents={frequents} />
        </div>
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

/**
 * Ce qu'on a mangé EN PLUS de la barquette (D26, D34, D38).
 *
 * Le batch cooking couvre les dîners. Sans le petit-déjeuner ni le midi, le
 * tableau de bord ment de ~900 kcal par jour — il vaudrait mieux ne rien
 * afficher. Mais personne ne tape des calories deux semaines de suite : d'où
 * des repères en UN GESTE, et ce que le foyer remange sans cesse à portée de
 * pouce. Approximatif et tenu vaut mieux que précis et abandonné.
 */
function EnPlus({ cas, frequents, deployeParDefaut = false, surAjoute }:
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
                      className="h-9 px-2 underline underline-offset-2">retirer</button>
            </li>
          ))}
        </ul>
      )}

      {!ouvert ? (
        <button onClick={() => setOuvert(true)}
                className="text-[13px] text-doux underline underline-offset-2">
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
                          className="px-3 py-2 rounded-full bg-surface text-[14px]">
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[13px] text-doux mb-1.5">
              Un repère, pas une pesée — c’est marqué comme estimé
            </p>
            <div className="flex gap-2 flex-wrap">
              {reperes.map(r => (
                <button key={r.label} onClick={() => ajoute.mutate({
                  cas: laCase, label: r.label, kcal: r.kcal, proteinG: r.proteinG,
                })}
                        className="px-3 py-2 rounded-full bg-brume/50 text-[14px]">
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
                               disabled:bg-brume disabled:text-doux">
              Ajouter
            </button>
          </div>

          <Erreur de={ajoute.error} />
          {!deployeParDefaut && (
            <button onClick={() => setOuvert(false)}
                    className="text-[13px] text-doux underline underline-offset-2">
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
function HorsBarquette({ jour: j, userId, frequents, dejaLa }: {
  jour: string
  userId: string
  frequents: Frequent[]
  dejaLa: Case[]
}) {
  const [moment, setMoment] = useState<Repas | null>(null)
  const pris = new Set(dejaLa.map(c => c.meal))
  const libres = REPAS.filter(r => !pris.has(r))
  if (libres.length === 0) return null

  return (
    <div className="mt-3">
      {moment === null ? (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-[13px] text-doux">Mangé sans barquette ?</span>
          {libres.map(r => (
            <button key={r} onClick={() => setMoment(r)}
                    className="px-3 py-1.5 rounded-full bg-brume/50 text-[13px]
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
                    className="text-[13px] text-doux underline underline-offset-2">
              annuler
            </button>
          </div>
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
