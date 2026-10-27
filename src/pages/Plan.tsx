/**
 * Le plan de la session (D5, D8, D30, D31, D47) — refait le 26/10/2026 d'après
 * la maquette `plan.html` : la durée et les trois chiffres en gros, les
 * photos du menu, les gestes dans l'ordre, l'occupation des appareils, et
 * l'équipement du jour replié en dernier.
 *
 * Le temps se lit de gauche à droite sur chaque ligne : un geste, et sa barre
 * posée sur toute la session. Les couleurs ne décorent pas : chacune désigne un
 * appareil — deux plats au four ne sont pas deux plats sur le feu.
 */
import { useMemo, useState } from 'react'
import {
  Attente, BarreAction, Erreur, Passage, Principal, Surface, Vide, dateLongue, duree,
} from '../ui/coque.tsx'
import { dimancheDe, useChangeEtat, useCycle, useMajCycle, useRecettesDuCycle } from '../lib/donnees/cycle.ts'
import { useConvie, useFoyersAmis } from '../lib/donnees/convives.ts'
import { useAppareils } from '../lib/donnees/foyer.ts'
import {
  goulot, useAppareilsDeLaSession, useChoisitAppareils, useEnregistrePlan, useEquipementPrecedent,
  useSimule,
} from '../lib/donnees/session.ts'
import type { Plan as PlanCalcule } from '../lib/plan/types.ts'
import { equipementInitial } from '../lib/plan/equipement.ts'
import { Photo } from '../ui/recettes/Photo.tsx'
import { DESSINS, TuileIcone } from '../ui/rayons.tsx'

/** Une couleur par ressource, pas une par recette. */
const COULEURS = ['#2F5D45', '#8F5A0D', '#7A9484', '#4C6E8A', '#8A6E9E']

export function Plan({ retour, va }: { retour: () => void; va: (v: string) => void }) {
  const { data: cycle } = useCycle()
  const { data: catalogue = [] } = useAppareils()
  const { data: choisis = [], isPending: lisLesAppareils } = useAppareilsDeLaSession(cycle?.id)
  const { data: precedent, isError: precedentEnPanne } = useEquipementPrecedent(cycle?.id)
  const { data: simulation, isPending, error } = useSimule(cycle?.id)
  const choisitAppareils = useChoisitAppareils()
  const enregistre = useEnregistrePlan()
  const change = useChangeEtat()
  const majCycle = useMajCycle()
  const convie = useConvie()
  const { data: choisies = [] } = useRecettesDuCycle(cycle?.id)
  const { data: foyersAmis = [] } = useFoyersAmis()
  const [reglages, setReglages] = useState(false)
  const [convies, setConvies] = useState<string[]>([])

  const capacites = useMemo(
    () => Object.fromEntries(choisis.map(a => [a.appliance_code, a.capacity])),
    [choisis])

  async function commence() {
    if (!cycle || !simulation) return
    await enregistre.mutateAsync({ cycleId: cycle.id, plan: simulation.base })
    if (!cycle.cook_at) {
      await majCycle.mutateAsync({ id: cycle.id, cook_at: new Date().toISOString() })
    }
    // Les convives AVANT le changement d'état : si l'invitation échoue, on ne
    // veut pas d'une session déjà commencée à laquelle personne n'est convié
    // sans qu'on l'ait su.
    if (convies.length > 0) await convie.mutateAsync({ cycleId: cycle.id, foyers: convies })
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
  const cuisiniers = simulation.ressources.cuisiniers
  const equipementOuvert = reglages || choisis.length === 0
  const carteOuverte = equipementOuvert && (precedent !== undefined || precedentEnPanne)
    && !lisLesAppareils && catalogue.length > 0
  const menu = choisies.filter(c => c.recipe !== null)
  const titres = new Map(menu.map(c => [c.recipe!.id, c.recipe!.title]))
  const nomsDesPlats = (ids: string[]) => ids.map(id => titres.get(id)).filter((n): n is string => !!n)

  return (
    <Passage retour={retour} barre={
      <BarreAction>
        <Principal onClick={commence}
                   disabled={enregistre.isPending || change.isPending || convie.isPending}>
          Commencer la session
        </Principal>
        <Erreur de={enregistre.error ?? change.error ?? convie.error} />
      </BarreAction>
    }>
      <h1 className="titre-fort text-[40px] font-[560]">Le plan</h1>
      <p className="mt-2 text-[15px] text-doux">
        Pour la cuisine du {dateLongue(dimancheDe(cycle.week_of))}
        {cuisiniers === 2 ? ', à deux' : cuisiniers > 2 ? `, à ${cuisiniers}` : ''}.
      </p>

      <section aria-label="La durée de la session"
               className="mt-5 rounded-[28px] bg-surface shadow-carte p-5">
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="chiffre text-[clamp(46px,16vw,64px)] font-semibold leading-[.9] tracking-[-.035em]
                           whitespace-nowrap">
            {duree(base.finEnCuisineMin)}
          </span>
          <span className="text-[15px] text-doux">en cuisine</span>
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <Chiffre3 valeur={duree(base.occupeMin)} legende="les mains prises" sable />
          <Chiffre3 valeur={duree(base.attenteMin)} legende="d’attente" />
          <Chiffre3 valeur={String(base.taches.length)}
                    legende={`actions pour ${cuisiniers > 1 ? `${cuisiniers} personnes` : 'une personne'}`} />
        </div>
        {/* Un repos au frigo ne retient personne : on le dit à part, jamais dans
            le chiffre principal — « 4 h 57 » serait exact et parfaitement inutile. */}
        {base.dureeMin > base.finEnCuisineMin + 1 && (
          <p className="mt-3.5 text-[14px] text-doux">
            Puis {duree(base.dureeMin - base.finEnCuisineMin)} de repos, sans toi.
          </p>
        )}
      </section>

      {/* L'arbitrage (D5) : on chiffre le coût de l'appareil et on laisse trancher. */}
      {bloquant && gainSiElargi > 2 && (
        <Surface className="mt-4 shadow-carte">
          <p className="text-[15px]">
            <strong className="font-semibold">{nomAppareil(bloquant)}</strong> est le goulot.
          </p>
          <p className="text-[14px] text-doux mt-1.5">
            S’il prenait deux plats à la fois, la session durerait{' '}
            <strong className="text-encre font-semibold">{duree(gainSiElargi)} de moins</strong>.
            À toi de voir si tes plats y tiennent.
          </p>
          <button onClick={() => setReglages(true)}
                  className="mt-2 text-[14px] font-semibold text-herbe inline-flex items-center
                             min-h-11">Modifier l’équipement</button>
        </Surface>
      )}

      {menu.length > 0 && (
        <>
          <Titre>Au menu</Titre>
          <ul aria-label="Les recettes de la session"
              className="-mx-6 px-6 flex gap-2.5 overflow-x-auto pb-1 snap-x scroll-pl-6
                         [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {menu.map(c => (
              <li key={c.id} className="snap-start shrink-0 w-[104px]">
                <Photo url={c.recipe!.image_url} glyphe={40}
                       className="block size-[104px] rounded-[22px] shadow-carte" />
                <p className="mt-2 text-[13px] leading-[1.2] font-semibold [overflow-wrap:anywhere]">
                  {c.recipe!.title}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <Frise plan={base} nomAppareil={nomAppareil} nomsDesPlats={nomsDesPlats} />

      {/*
        * Qui cuisine avec toi ?
        *
        * La question se pose ICI et pas en cuisine : une fois les mains dans la
        * farine, personne n'ouvre un écran de réglages. Et elle ne se pose que
        * s'il y a quelqu'un à convier — sinon c'est une case vide de plus.
        */}
      {foyersAmis.length > 0 && (
        <Surface className="mt-8 shadow-carte">
          <h2 className="text-[15px] font-semibold">Qui cuisine avec toi ?</h2>
          <p className="mt-1.5 text-[14px] text-doux">
            Tes amis suivront l’avancement et pourront prendre des gestes. Ils
            verront l’invitation en ouvrant l’application — il n’y a pas de
            notification.
          </p>
          {/* Dit ici plutôt que découvert après coup : ce qu'un autre foyer
              t'a prêté ne se repartage pas par la bande. */}
          <p className="mt-1.5 text-[14px] text-doux">
            Ils verront le nom de tes recettes, pas celui de ce qu’un autre
            foyer t’a prêté.
          </p>
          <ul className="mt-3 space-y-1">
            {foyersAmis.map(f => (
              <li key={f.id}>
                <label className="flex items-center gap-3 text-[15px] min-h-11">
                  <input type="checkbox" checked={convies.includes(f.id)}
                         onChange={e => setConvies(c => e.target.checked
                           ? [...c, f.id] : c.filter(x => x !== f.id))}
                         className="size-6 accent-herbe" />
                  {f.nom}
                </label>
              </li>
            ))}
          </ul>
        </Surface>
      )}

      {/* L'équipement, en dernier : on le règle une fois, on le relit rarement. */}
      {choisis.length > 0 && <Titre>Ce dont tu disposes</Titre>}
      {choisis.length > 0 && (
        <div className="rounded-[22px] bg-surface px-4 py-3.5 flex items-center gap-3.5
                        shadow-[inset_0_0_0_1.5px_var(--color-brume)]">
          <TuileIcone className="size-11 rounded-[14px] bg-piste text-encre" taille={24}>
            {DESSINS.marmite}
          </TuileIcone>
          <div className="grow min-w-0">
            <p className="font-semibold">
              {choisis.length} appareil{choisis.length > 1 ? 's' : ''}
            </p>
            <p className="mt-0.5 text-[13.5px] leading-[1.3] text-doux [overflow-wrap:anywhere]">
              {resumeEquipement(choisis, nomAppareil)}
            </p>
          </div>
          <button onClick={() => setReglages(r => !r)} aria-expanded={reglages}
                  aria-label={reglages ? 'Masquer l’équipement' : 'Changer l’équipement du jour'}
                  className="size-11 rounded-full bg-piste text-encre grid place-items-center shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {DESSINS.crayon}
            </svg>
          </button>
        </div>
      )}
      {/* `precedent` d'abord : l'état initial de la carte se pose UNE fois, au montage. */}
      {carteOuverte && (
        <Equipement catalogue={catalogue} seul={choisis.length === 0}
                    depart={equipementInitial({ propres: capacites, derniere: precedent ?? {}, catalogue })}
                    surValide={codes => {
                      choisitAppareils.mutate({ cycleId: cycle.id, codes })
                      setReglages(false)
                    }} />
      )}
    </Passage>
  )
}

/** « Four ×2, plaques ×4, air fryer » : ce que la session a, dans l'ordre du catalogue. */
function resumeEquipement(
  choisis: { appliance_code: string; capacity: number }[], nom: (c: string) => string,
): string {
  const t = choisis.map(a => `${nom(a.appliance_code)}${a.capacity > 1 ? ` ×${a.capacity}` : ''}`)
  return t.map((x, i) => (i === 0 ? x : x.charAt(0).toLowerCase() + x.slice(1))).join(', ')
}

function Titre({ children }: { children: string }) {
  return <h2 className="titre-fort text-[24px] font-[560] mt-8 mb-3">{children}</h2>
}

/** Un chiffre de la tuile du haut : en Fraunces, sa légende dessous. */
function Chiffre3({ valeur, legende, sable }: { valeur: string; legende: string; sable?: boolean }) {
  return (
    <div className={`rounded-[18px] p-3 ${sable ? 'bg-sable' : 'bg-piste'}`}>
      <p className={`chiffre text-[26px] font-semibold leading-none tracking-[-.02em]
                     ${sable ? 'text-ocre' : ''}`}>{valeur}</p>
      <p className={`mt-1.5 text-[12.5px] leading-[1.25] ${sable ? 'text-doux' : 'text-encre'}`}>{legende}</p>
    </div>
  )
}

/**
 * Le plat que sert un geste : « Émincer les oignons » trois fois de suite ne dit pas
 * lequel. Un geste fusionné nomme tous ses plats ; sans titre connu, leur nombre.
 */
function PourQui({ noms, nombre }: { noms: string[]; nombre: number }) {
  if (noms.length === 0) {
    return nombre > 1 ? <p className="text-[12.5px] text-doux">pour {nombre} recettes</p> : null
  }
  const liste = noms.length === 1 ? noms[0]
    : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`
  return <p className="text-[12.5px] leading-[1.3] text-doux [overflow-wrap:anywhere]">pour {liste}</p>
}

/**
 * Les gestes dans l'ordre, puis les appareils. Le temps de la session fait la
 * largeur de chaque piste : le début d'un geste est à sa place, sa durée est sa
 * longueur.
 */
function Frise({ plan, nomAppareil, nomsDesPlats }:
  { plan: PlanCalcule; nomAppareil: (c: string) => string; nomsDesPlats: (ids: string[]) => string[] }) {
  const appareils = useMemo(
    () => [...new Set(plan.taches.map(t => t.appareil).filter((a): a is string => !!a))],
    [plan])
  const gestes = useMemo(() => plan.taches.filter(t => t.actif), [plan])
  const total = Math.max(1, plan.dureeMin)
  const pct = (m: number) => `${Math.min(100, Math.max(0, m / total * 100)).toFixed(2)}%`
  const critiques = new Set(plan.chemin)
  // Un repère toutes les 30 min, toutes les heures au-delà de quatre heures.
  const pas = total > 240 ? 60 : 30
  const reperes = Array.from({ length: Math.floor(total / pas) + 1 }, (_, i) => i * pas)
    .filter(m => m / total < 0.96)

  return (
    <>
      <Titre>Dans l’ordre</Titre>
      <section aria-label="Déroulé de la session"
               className="rounded-[26px] bg-surface shadow-carte px-4 pt-1.5 pb-2">
        <div aria-hidden="true" className="relative h-[30px] ml-[74px] text-[12px] text-doux">
          {reperes.map(m => (
            <span key={m} className="absolute top-2.5 whitespace-nowrap tabular-nums"
                  style={{ left: pct(m), transform: m === 0 ? undefined : 'translateX(-50%)' }}>
              {m === 0 ? '0' : duree(m)}
            </span>
          ))}
        </div>
        <ol>
          {gestes.map(t => (
            <li key={t.id} className="grid grid-cols-[62px_1fr] gap-3 items-center min-h-16 py-2
                                      border-t border-brume first:border-0">
              <p className="chiffre text-[15px] font-semibold leading-[1.15] text-doux tracking-normal">
                {t.debutMin < 1 ? '0' : duree(t.debutMin)}
                <small className="block font-[family-name:var(--font-texte)] text-[12px] font-normal">
                  {duree(t.dureeMin)}
                </small>
              </p>
              <div className="min-w-0">
                <p className="font-semibold text-[15.5px] leading-[1.25] [overflow-wrap:anywhere]">
                  {critiques.has(t.id) && <span aria-hidden="true" className="text-ocre mr-1">•</span>}
                  {t.label}
                </p>
                <PourQui noms={nomsDesPlats(t.recettes)} nombre={t.recettes.length} />
                <div className="relative mt-2 h-2.5 rounded-full bg-piste" aria-hidden="true">
                  <i className="absolute top-0 h-2.5 min-w-2.5 rounded-full bg-herbe"
                     style={{ left: pct(t.debutMin), width: pct(t.dureeMin) }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {appareils.length > 0 && (
        <>
          <Titre>Les appareils</Titre>
          <section aria-label="L’occupation des appareils"
                   className="rounded-[26px] bg-surface shadow-carte p-4 space-y-4">
            {appareils.map((a, i) => (
              <div key={a}>
                <p className="flex items-center gap-2 text-[14px] font-semibold mb-2">
                  <i aria-hidden="true" className="size-3 rounded-[4px]"
                     style={{ background: COULEURS[i % COULEURS.length] }} />
                  {nomAppareil(a)}
                </p>
                <div className="relative h-4 rounded-full bg-piste" aria-hidden="true">
                  {plan.taches.filter(t => t.appareil === a).map(t => (
                    <i key={t.id} title={`${nomAppareil(a)} · ${duree(t.dureeMin)}`}
                       className="absolute top-0 h-4 min-w-2 rounded-full"
                       style={{ left: pct(t.debutMin), width: pct(t.dureeMin),
                                background: COULEURS[i % COULEURS.length] }} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  )
}

/** L'équipement du jour : il change d'une session à l'autre (D8). */
function Equipement({ catalogue, depart, surValide, seul }: {
  catalogue: { code: string; label: string; default_capacity: number }[]
  /** Aucun appareil choisi : pas de ligne de résumé au-dessus, la carte prend sa place. */
  seul: boolean
  /** Ce qui arrive coché : la dernière session du foyer, sinon le catalogue (`equipementInitial`). */
  depart: Record<string, number>
  surValide: (codes: Record<string, number>) => void
}) {
  const [choix, setChoix] = useState<Record<string, number>>(depart)

  return (
    <Surface className={`${seul ? 'mt-8' : 'mt-3'} shadow-carte`}>
      <p className="text-[15px] font-semibold">Ce dont tu disposes aujourd’hui</p>
      <p className="text-[13.5px] text-doux mt-1.5">
        Le nombre dit combien de plats l’appareil prend à la fois. C’est lui qui
        décide de la durée de la session.
      </p>
      <ul className="mt-3 space-y-1">
        {catalogue.map(a => (
          <li key={a.code} className="flex items-center gap-3">
            <button onClick={() => setChoix(c => {
              const n = { ...c }
              if (n[a.code]) delete n[a.code]
              else n[a.code] = a.default_capacity
              return n
            })}
                    role="checkbox" aria-checked={!!choix[a.code]}
                    className="flex items-center gap-3 grow text-left min-h-12">
              <span className={`size-7 rounded-[9px] border-2 shrink-0 grid place-items-center
                                ${choix[a.code] ? 'bg-herbe border-herbe text-fond' : 'border-doux/40'}`}>
                {choix[a.code] && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </span>
              <span className="text-[15.5px]">{a.label}</span>
            </button>
            {choix[a.code] !== undefined && (
              <input type="number" min={1} max={8} value={choix[a.code]}
                     aria-label={`Capacité de ${a.label}`}
                     onChange={e => setChoix(c => ({
                       ...c, [a.code]: Math.max(1, Number(e.target.value) || 1),
                     }))}
                     className="chiffre w-16 min-h-11 rounded-[14px] bg-piste px-2 py-1 text-right
                                text-[18px] font-semibold outline-none focus:ring-2 focus:ring-herbe" />
            )}
          </li>
        ))}
      </ul>
      <button onClick={() => surValide(choix)}
              className="mt-4 w-full min-h-[52px] rounded-[18px] bg-herbe text-fond text-[16px]
                         font-semibold">
        Recalculer le plan
      </button>
    </Surface>
  )
}
