/**
 * Le plan de la session (D5, D8, D30, D31, D47).
 *
 * Le pari de dessin : à gauche les machines, à droite vous. Un Gantt horizontal
 * est illisible sur 390 px ; ici le temps DESCEND, les barres des appareils
 * courent dans un rail étroit, et les gestes occupent la colonne large. Le
 * parallélisme se voit sans rien lire — une barre longue à côté de trois gestes,
 * c'est le four qui travaille pendant qu'on prépare.
 *
 * Les couleurs ne décorent pas : chacune désigne une ressource. C'est la seule
 * entorse à la règle de l'accent unique, et elle est justifiée — deux plats au
 * four ne sont pas deux plats sur le feu.
 */
import { useMemo, useState } from 'react'
import {
  Attente, Chiffre, Erreur, Passage, Principal, Secondaire, Surface, Vide, duree,
} from '../ui/coque.tsx'
import { useChangeEtat, useCycle, useMajCycle } from '../lib/donnees/cycle.ts'
import { useAppareils } from '../lib/donnees/foyer.ts'
import {
  goulot, useAppareilsDeLaSession, useChoisitAppareils, useEnregistrePlan, useSimule,
} from '../lib/donnees/session.ts'
import type { Plan as PlanCalcule, TachePlanifiee } from '../lib/plan/types.ts'

/** Pixels par minute. 3,2 tient une session de deux heures sur un écran. */
const ECHELLE = 3.2

/** Une couleur par ressource, pas une par recette. */
const COULEURS = ['#2F5D45', '#B8791A', '#7A9484', '#4C6E8A', '#8A6E9E']

export function Plan({ retour, va }: { retour: () => void; va: (v: string) => void }) {
  const { data: cycle } = useCycle()
  const { data: catalogue = [] } = useAppareils()
  const { data: choisis = [] } = useAppareilsDeLaSession(cycle?.id)
  const { data: simulation, isPending, error } = useSimule(cycle?.id)
  const choisitAppareils = useChoisitAppareils()
  const enregistre = useEnregistrePlan()
  const change = useChangeEtat()
  const majCycle = useMajCycle()
  const [reglages, setReglages] = useState(false)

  const capacites = useMemo(
    () => Object.fromEntries(choisis.map(a => [a.appliance_code, a.capacity])),
    [choisis])

  async function commence() {
    if (!cycle || !simulation) return
    await enregistre.mutateAsync({ cycleId: cycle.id, plan: simulation.base })
    if (!cycle.cook_at) {
      await majCycle.mutateAsync({ id: cycle.id, cook_at: new Date().toISOString() })
    }
    await change.mutateAsync({ id: cycle.id, vers: 'en_cuisine' })
    va('/cuisine')
  }

  if (!cycle) return <Passage retour={retour}><Vide titre="Aucun cycle ouvert" /></Passage>
  if (isPending) return <Passage retour={retour}><Attente /></Passage>

  if (error || !simulation || simulation.actions.length === 0) {
    return (
      <Passage retour={retour}>
        <Vide titre="Rien à ordonnancer"
              texte="Les recettes choisies n’ont pas d’étapes exploitables. L’ingestion doit passer avant." />
        <Erreur de={error} />
      </Passage>
    )
  }

  const { base, gainSiElargi } = simulation
  const bloquant = goulot(base)
  const nomAppareil = (code: string) =>
    catalogue.find(a => a.code === code)?.label ?? code

  return (
    <Passage retour={retour}>
      <h1 className="titre text-[44px]">{duree(base.dureeMin)}</h1>
      <p className="mt-3 text-[15px] text-doux">
        dont {duree(base.attenteMin)} d’attente · {base.taches.length} actions
        pour {simulation.ressources.cuisiniers > 1
          ? `${simulation.ressources.cuisiniers} personnes` : 'une personne'}
      </p>
      <p className="mt-1.5 text-[15px] text-doux">
        <Chiffre valeur={duree(base.occupeMin)} taille={20} /> les mains prises.
      </p>

      {/* L'arbitrage (D5) : on chiffre le coût de l'appareil et on laisse trancher. */}
      {bloquant && gainSiElargi > 2 && (
        <Surface className="mt-6">
          <p className="text-[15px]">
            <strong className="font-medium">{nomAppareil(bloquant)}</strong> est le goulot.
          </p>
          <p className="text-[14px] text-doux mt-1.5">
            S’il prenait deux plats à la fois, la session durerait{' '}
            <strong className="text-encre font-medium">{duree(gainSiElargi)} de moins</strong>.
            À toi de voir si tes plats y tiennent.
          </p>
          <button onClick={() => setReglages(true)}
                  className="mt-3 text-[14px] text-herbe">Modifier l’équipement</button>
        </Surface>
      )}

      {(reglages || choisis.length === 0) && (
        <Equipement catalogue={catalogue} capacites={capacites}
                    surValide={codes => {
                      choisitAppareils.mutate({ cycleId: cycle.id, codes })
                      setReglages(false)
                    }} />
      )}

      <Frise plan={base} nomAppareil={nomAppareil} />

      <div className="mt-10">
        <Principal onClick={commence} disabled={enregistre.isPending || change.isPending}>
          Commencer la session
        </Principal>
        <Erreur de={enregistre.error ?? change.error} />
        <Secondaire onClick={() => setReglages(r => !r)}>
          {reglages ? 'Masquer l’équipement' : 'Changer l’équipement du jour'}
        </Secondaire>
      </div>
    </Passage>
  )
}

/** Le temps descend. Les rails à gauche, les gestes à droite. */
function Frise({ plan, nomAppareil }:
  { plan: PlanCalcule; nomAppareil: (c: string) => string }) {
  const appareils = useMemo(
    () => [...new Set(plan.taches.map(t => t.appareil).filter((a): a is string => !!a))],
    [plan])
  const hauteur = Math.max(220, plan.dureeMin * ECHELLE)
  const largeurRail = Math.max(26, appareils.length * 14)
  const critiques = new Set(plan.chemin)

  return (
    <section className="mt-9" aria-label="Déroulé de la session">
      <div className="flex gap-3 flex-wrap mb-4">
        {appareils.map((a, i) => (
          <span key={a} className="inline-flex items-center gap-2 text-[13px] text-doux">
            <span aria-hidden="true" className="w-2.5 h-2.5 rounded-[3px]"
                  style={{ background: COULEURS[i % COULEURS.length] }} />
            {nomAppareil(a)}
          </span>
        ))}
      </div>

      <div className="relative" style={{ height: hauteur }}>
        {/* Les repères de temps, toutes les 15 min. */}
        {Array.from({ length: Math.floor(plan.dureeMin / 15) + 1 }, (_, i) => i * 15).map(m => (
          <div key={m} className="absolute left-0 right-0 flex items-center gap-2"
               style={{ top: m * ECHELLE }}>
            <span className="chiffre text-[11px] text-doux w-9 shrink-0 tabular-nums">
              {m === 0 ? '0' : duree(m)}
            </span>
            <span className="h-px grow bg-brume/60" aria-hidden="true" />
          </div>
        ))}

        {/* Les rails : une colonne par appareil. */}
        <div className="absolute" style={{ left: 40, top: 0, width: largeurRail, height: hauteur }}>
          {plan.taches.filter(t => t.appareil).map(t => {
            const i = appareils.indexOf(t.appareil!)
            return (
              <div key={t.id} title={`${nomAppareil(t.appareil!)} · ${duree(t.dureeMin)}`}
                   className="absolute rounded-full"
                   style={{
                     left: i * 14, width: 9,
                     top: t.debutMin * ECHELLE,
                     height: Math.max(6, t.dureeMin * ECHELLE),
                     background: COULEURS[i % COULEURS.length],
                   }} />
            )
          })}
        </div>

        {/* Les gestes. */}
        <div className="absolute right-0" style={{ left: 40 + largeurRail + 10, top: 0 }}>
          {plan.taches.filter(t => t.actif).map(t => (
            <Geste key={t.id} tache={t} critique={critiques.has(t.id)} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Geste({ tache, critique }: { tache: TachePlanifiee; critique: boolean }) {
  return (
    <div className="absolute left-0 right-0" style={{ top: tache.debutMin * ECHELLE - 2 }}>
      <p className={`text-[14px] leading-snug ${critique ? 'text-encre' : 'text-encre/85'}`}>
        {critique && <span aria-hidden="true" className="text-safran mr-1">•</span>}
        {tache.label}
      </p>
      <p className="text-[12px] text-doux mt-0.5">
        {duree(tache.dureeMin)}
        {tache.recettes.length > 1 && ` · pour ${tache.recettes.length} recettes`}
      </p>
    </div>
  )
}

/** L'équipement du jour : il change d'une session à l'autre (D8). */
function Equipement({ catalogue, capacites, surValide }: {
  catalogue: { code: string; label: string; default_capacity: number }[]
  capacites: Record<string, number>
  surValide: (codes: Record<string, number>) => void
}) {
  const [choix, setChoix] = useState<Record<string, number>>(() =>
    Object.keys(capacites).length > 0
      ? capacites
      : Object.fromEntries(catalogue.map(a => [a.code, a.default_capacity])))

  return (
    <Surface className="mt-6">
      <p className="text-[15px]">Ce dont tu disposes aujourd’hui</p>
      <p className="text-[13px] text-doux mt-1.5">
        Le nombre dit combien de plats l’appareil prend à la fois. C’est lui qui
        décide de la durée de la session.
      </p>
      <ul className="mt-4 space-y-2.5">
        {catalogue.map(a => (
          <li key={a.code} className="flex items-center gap-3">
            <button onClick={() => setChoix(c => {
              const n = { ...c }
              if (n[a.code]) delete n[a.code]
              else n[a.code] = a.default_capacity
              return n
            })}
                    role="checkbox" aria-checked={!!choix[a.code]}
                    className="flex items-center gap-3 grow text-left py-1.5">
              <span className={`w-[22px] h-[22px] rounded-[7px] border-2 shrink-0
                                ${choix[a.code] ? 'bg-herbe border-herbe' : 'border-brume'}`} />
              <span className="text-[15px]">{a.label}</span>
            </button>
            {choix[a.code] !== undefined && (
              <input type="number" min={1} max={8} value={choix[a.code]}
                     aria-label={`Capacité de ${a.label}`}
                     onChange={e => setChoix(c => ({
                       ...c, [a.code]: Math.max(1, Number(e.target.value) || 1),
                     }))}
                     className="w-14 rounded-lg border border-brume bg-fond px-2 py-1
                                text-right outline-none focus:border-herbe" />
            )}
          </li>
        ))}
      </ul>
      <button onClick={() => surValide(choix)}
              className="mt-4 w-full h-[46px] rounded-[16px] bg-herbe text-fond text-[15px]">
        Recalculer le plan
      </button>
    </Surface>
  )
}
