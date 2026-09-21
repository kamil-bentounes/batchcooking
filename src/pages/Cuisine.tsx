/**
 * En cuisine (D47, D48, D50).
 *
 * Le seul écran sombre de l'app, et ce n'est pas un goût : c'est le seul moment
 * où le téléphone est posé sur un plan de travail, à un mètre des yeux, les
 * mains sales. Donc fond encre, un chiffre de 58 px, UN geste à l'écran.
 *
 * Deux téléphones, une seule session : chacun voit son geste à lui, et
 * « Pendant ce temps » sert de preuve que le four tourne pour de vrai.
 *
 * Deux téléphones, vraiment : l'écran s'abonne aux changements de la session
 * (0037). Sans cela on avait le droit de lire la même chose sans jamais être
 * prévenu, et deux personnes prenaient le même geste.
 *
 * L'écran sert aussi au CONVIVE — un foyer ami convié à la session. Il voit le
 * même plan et prend des gestes ; il n'interrompt pas la session de son hôte et
 * ne la fait pas avancer. La base le lui interdit ; ici on ne lui montre pas
 * des boutons qui échoueraient.
 */
import { useEffect, useState } from 'react'
import { Attente, Erreur, Vide, duree } from '../ui/coque.tsx'
import { useChangeEtat, useCycle, useCycleParId } from '../lib/donnees/cycle.ts'
import { useFoyer } from '../lib/donnees/foyer.ts'
import {
  useConvives, usePrenoms, useQuitteSession, useRetireConvive,
} from '../lib/donnees/convives.ts'
import { useTempsReel } from '../lib/temps-reel.ts'
import {
  avancement, useCommenceAction, usePlanEnregistre, useTermineAction,
} from '../lib/donnees/session.ts'
import type { Action } from '../lib/donnees/session.ts'

export function Cuisine({ userId, va, cycleId }:
  { userId: string; va: (v: string) => void; cycleId?: string }) {
  // `cycleId` n'est présent que pour un convive : il suit la session d'un autre
  // foyer, que `current_cycle()` ne connaît évidemment pas.
  const chezMoi = useCycle()
  const chezUnAmi = useCycleParId(cycleId)
  const cycle = cycleId ? chezUnAmi.data : chezMoi.data
  const invite = !!cycleId

  const { data: foyer } = useFoyer()
  const { data: convives = [] } = useConvives(invite ? undefined : cycle?.id)
  const { data: prenoms } = usePrenoms()
  const { data: plan = [], isPending } = usePlanEnregistre(cycle?.id)
  useTempsReel(cycle?.id)
  const prend = useCommenceAction()
  const termine = useTermineAction()
  const change = useChangeEtat()
  const retire = useRetireConvive()
  const quitte = useQuitteSession()

  // L'horloge de la session (D47) : une seconde suffit, et on l'arrête en
  // sortant pour ne pas faire tourner un intervalle dans le vide.
  const [maintenant, setMaintenant] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setMaintenant(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  /*
   * ⚠️ L'ordre des gardes compte, et il était faux.
   *
   *    `usePlanEnregistre(undefined)` est désactivé, donc `isPending` reste
   *    vrai POUR TOUJOURS quand il n'y a pas de cycle. Un convive dont
   *    l'invitation vient d'être retirée — ou qui suit un lien périmé —
   *    tombait sur « Un instant… » éternel au lieu d'un écran qui explique.
   */
  if (cycleId ? chezUnAmi.isPending : chezMoi.isPending) {
    return <Sombre><Attente /></Sombre>
  }
  if (!cycle) {
    return (
      <Sombre>
        <Vide titre={invite ? 'Cette session n’est plus ouverte' : 'Aucune session en cours'}
              texte={invite
                ? 'Ton hôte l’a terminée, ou ne t’y attend plus.'
                : undefined} />
        {/* Sans ce bouton, la ligne d'invitation survivait à la session et
            l'écran n'offrait aucune sortie : il fallait attendre que l'hôte y
            pense. */}
        {invite && (
          <button onClick={async () => { await quitte.mutateAsync(cycleId!); va('/') }}
                  disabled={quitte.isPending}
                  className="mt-8 w-full h-[52px] rounded-[16px] bg-safran text-encre
                             text-[16px] font-medium">
            Quitter cette session
          </button>
        )}
      </Sombre>
    )
  }
  if (isPending) return <Sombre><Attente /></Sombre>
  if (plan.length === 0) {
    return <Sombre><Vide titre="Aucune session en cours" /></Sombre>
  }

  const debut = cycle.started_at ? new Date(cycle.started_at) : null
  const etat = avancement(plan, debut, maintenant)
  const mien = etat.enCours.find(a => a.assignee_id === userId)
  const aFaire = mien ?? etat.suivantes[0] ?? null
  const passives = plan.filter(a => !a.is_active && a.started_at && !a.done_at)
  const nomDe = (id: string | null) =>
    id === userId ? 'toi' : id ? prenoms?.get(id) ?? null : null

  const fini = etat.faites === etat.total

  return (
    <Sombre>
      <header className="flex items-center justify-between">
        <span className="text-[14px] opacity-60">
          Session en cours · {duree(etat.ecoulesMin)}
        </span>
        <span className="flex -space-x-2">
          {(invite ? [] : foyer?.membres ?? []).map((m, i) => (
            <span key={m.id} aria-hidden="true"
                  className="w-[30px] h-[30px] rounded-full text-[12px] grid place-items-center
                             border-2 border-encre text-fond"
                  style={{ background: i === 0 ? '#2F5D45' : '#B8791A' }}>
              {m.display_name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </span>
      </header>

      {/*
        * Qui d'autre est là — et le moyen de le faire partir.
        *
        * Sans ce bouton, convier était irréversible depuis l'application : la
        * seule façon de refermer une session partagée aurait été de rompre
        * l'amitié.
        */}
      {convives.length > 0 && (
        <ul className="mt-2.5 space-y-1" aria-label="Convives">
          {convives.map(c => (
            <li key={c.id} className="flex items-center gap-2 text-[13px] opacity-55">
              <span className="grow">
                {c.nom}{c.rejoint ? '' : ' — invité, pas encore là'}
              </span>
              <button onClick={() => retire.mutate({ id: c.id, cycleId: cycle.id })}
                      disabled={retire.isPending}
                      className="px-2 py-1 text-safran">Retirer</button>
            </li>
          ))}
        </ul>
      )}
      {invite && (
        <p className="mt-2.5 text-[13px] opacity-55">
          Tu cuisines chez quelqu’un d’autre : tu prends des gestes, tu ne
          touches pas au plan.
        </p>
      )}

      {fini ? (
        <section className="mt-12">
          <h1 className="titre text-[42px]">C’est cuit.</h1>
          <p className="mt-3.5 text-[15px] opacity-65">
            {etat.total} actions en {duree(etat.ecoulesMin)}.
            {invite ? ' Le dressage revient à ton hôte.' : ' Il reste à dresser.'}
          </p>
          {invite ? (
            <button onClick={() => va('/')}
                    className="w-full h-[58px] mt-8 rounded-[18px] bg-safran text-encre
                               text-[17px] font-semibold">
              Revenir chez moi
            </button>
          ) : (
          <button onClick={async () => {
            await change.mutateAsync({ id: cycle.id, vers: 'dressage' })
            va('/dressage')
          }}
                  disabled={change.isPending}
                  className="w-full h-[58px] mt-8 rounded-[18px] bg-safran text-encre
                             text-[17px] font-semibold">
            Passer au dressage
          </button>
          )}
          <Erreur de={change.error} />
        </section>
      ) : aFaire ? (
        <section className="mt-11">
          <p className="text-[14px] text-safran">
            {aFaire.assignee_id
              // ⚠️ Pas de repli sur « toi » : un geste pris par quelqu'un dont
              //    on ignore le prénom n'est PAS le sien.
              ? `À ${nomDe(aFaire.assignee_id) ?? 'quelqu’un'}`
              : `À prendre · ${etat.faites} sur ${etat.total} faites`}
          </p>
          <h1 className="titre text-[42px] mt-2.5">{aFaire.label}</h1>
          {aFaire.recettes.length > 0 && (
            <p className="mt-3.5 text-[15px] opacity-65 leading-relaxed">
              {aFaire.recettes.length > 1
                ? `Pour ${aFaire.recettes.join(' et ')} à la fois.`
                : `Pour ${aFaire.recettes[0]}.`}
            </p>
          )}

          <p className="mt-5">
            <span className="chiffre text-[58px]">
              {mien ? restant(mien, maintenant) : duree(Number(aFaire.duration_min))}
            </span>
            <span className="text-[15px] opacity-60 ml-2.5">
              {mien ? 'restantes' : 'prévues'}
            </span>
          </p>

          <button
            onClick={() => mien
              ? termine.mutate(mien.id)
              : prend.mutate({ id: aFaire.id, parQui: userId })}
            disabled={prend.isPending || termine.isPending}
            className="w-full h-[58px] mt-7 rounded-[18px] bg-safran text-encre
                       text-[17px] font-semibold">
            {mien ? 'C’est fait' : 'Je prends'}
          </button>
          <Erreur de={prend.error ?? termine.error} />
        </section>
      ) : (
        <section className="mt-11">
          <h1 className="titre text-[38px]">Rien à faire, ça cuit.</h1>
          <p className="mt-3.5 text-[15px] opacity-65">
            {etat.faites} sur {etat.total} faites. La suite s’ouvrira toute seule.
          </p>
        </section>
      )}

      {passives.length > 0 && (
        <section className="mt-11 pt-5 border-t border-fond/15" aria-label="Pendant ce temps">
          <p className="text-[13px] opacity-50 mb-3.5">Pendant ce temps</p>
          {passives.map(a => (
            <div key={a.id} className="flex items-center gap-3 mb-3">
              <span aria-hidden="true" className="w-2.5 h-2.5 rounded-[3px] bg-herbe shrink-0" />
              <span className="grow text-[15px]">{a.label}</span>
              <span className="chiffre text-[17px] opacity-80 tabular-nums">
                {restant(a, maintenant)}
              </span>
            </div>
          ))}
        </section>
      )}

      {etat.suivantes.length > 1 && (
        <section className="mt-9 pt-5 border-t border-fond/15" aria-label="Ensuite">
          <p className="text-[13px] opacity-50 mb-3.5">Ensuite, si quelqu’un est libre</p>
          {etat.suivantes.slice(1).map(a => (
            <button key={a.id} onClick={() => prend.mutate({ id: a.id, parQui: userId })}
                    className="w-full flex items-center gap-3 mb-3 text-left">
              <span className="grow text-[15px] opacity-80">{a.label}</span>
              <span className="text-[14px] opacity-55">{duree(Number(a.duration_min))}</span>
            </button>
          ))}
        </section>
      )}

      <button onClick={async () => {
        // Quitter, c'est partir pour de bon : sinon la ligne survit, l'accueil
        // reproposerait la session et la lecture resterait ouverte.
        if (invite) { await quitte.mutateAsync(cycle.id); va('/'); return }
        await change.mutateAsync({ id: cycle.id, vers: 'interrompue' })
        va('/')
      }}
              className="mt-12 w-full h-[46px] rounded-[16px] text-[15px] opacity-60">
        {invite ? 'Quitter la session' : 'Interrompre la session'}
      </button>
    </Sombre>
  )
}

/** Le temps restant d'une action commencée. Jamais négatif : « 0:00 » suffit. */
function restant(a: Action, maintenant: Date): string {
  if (!a.started_at) return duree(Number(a.duration_min))
  const fin = new Date(a.started_at).getTime() + Number(a.duration_min) * 60_000
  const s = Math.max(0, Math.round((fin - maintenant.getTime()) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function Sombre({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-encre text-fond px-6 pt-16 pb-14">
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </main>
  )
}
