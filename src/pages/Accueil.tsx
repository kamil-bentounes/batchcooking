/**
 * L'accueil : un seul écran, sept visages.
 *
 * Ce n'est pas un tableau de bord. C'est la question « et maintenant ? », et il
 * n'y a jamais qu'une seule réponse. Mardi elle est « mange le poulet
 * basquaise », samedi « pars faire les courses », dimanche « émince les
 * oignons ». Même place, même bouton — seul l'état du cycle change ce qu'il dit.
 *
 * Le reste (calories du jour, barquettes qui périment) est là, en dessous, sans
 * boîte autour. On le lit si on veut. On n'a rien à en faire.
 */
import { useMemo } from 'react'
import { Chiffre, Ecran, Principal, Secondaire, Vide, dateLongue, duree, Marque } from '../ui/coque.tsx'
import { GESTE, useCycle, useOuvreCycle } from '../lib/donnees/cycle.ts'
import { useFoyer } from '../lib/donnees/foyer.ts'
import {
  NOM_REPAS, bilanDuJour, jour, useBarquettes, useMange, useSemaine,
} from '../lib/donnees/barquettes.ts'
import type { Case } from '../lib/donnees/barquettes.ts'
import { usePlanEnregistre } from '../lib/donnees/session.ts'
import { useInvitations, useRejoint } from '../lib/donnees/convives.ts'
import { urgence } from '../lib/peremption.ts'

export function Accueil({ userId, va }: { userId: string; va: (v: string) => void }) {
  const aujourdhui = useMemo(() => new Date(), [])
  const { data: cycle, isPending: chargeCycle } = useCycle()
  const { data: foyer } = useFoyer()
  const { data: cases = [] } = useSemaine(aujourdhui, 1)
  const { data: barquettes = [] } = useBarquettes()
  const { data: plan = [] } = usePlanEnregistre(cycle?.id)
  const mange = useMange()
  const ouvre = useOuvreCycle()
  const { data: invitations = [] } = useInvitations()
  const rejoint = useRejoint()

  const moi = foyer?.membres.find(m => m.id === userId)
  const objectif = moi?.objectif
  const jourDit = jour(aujourdhui)
  const duJour = cases.filter(c => c.user_profile_id === userId && c.day === jourDit)
  const prochain = duJour.find(c => c.state === 'prevu' && c.portion)
  const consomme = bilanDuJour(cases, userId, jourDit)

  const etat = cycle?.state ?? 'vide'
  const geste = GESTE[etat]
  const presses = barquettes
    .map(b => ({ b, u: urgence(b.expires_at, b.location as 'frigo' | 'congelateur') }))
    .filter(x => x.u.niveau !== 'ok')
    .sort((a, b) => a.u.heuresRestantes - b.u.heuresRestantes)
    .slice(0, 2)

  if (chargeCycle) {
    return <Ecran actif="accueil" va={va}><Vide titre="Un instant…" /></Ecran>
  }

  return (
    <Ecran actif="accueil" va={va}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2.5 text-herbe">
          <Marque taille={26} />
          <span className="text-[14px] text-doux first-letter:uppercase">
            {dateLongue(aujourdhui)}
          </span>
        </span>
        <button onClick={() => va('/reglages')} aria-label="Réglages"
                className="w-[34px] h-[34px] rounded-full bg-herbe text-fond text-[13px]
                           grid place-items-center">
          {(moi?.display_name ?? '?').slice(0, 1).toUpperCase()}
        </button>
      </div>

      {/*
        * « Alice cuisine maintenant. »
        *
        * Au-dessus de tout, parce que c'est la seule chose de cet écran qui ne
        * peut pas attendre : une session se suit pendant qu'elle a lieu. Il n'y
        * a pas de notification poussée — c'est ici qu'on l'apprend, donc ici que
        * ça doit sauter aux yeux.
        */}
      {invitations.map(i => (
        <div key={i.id} className="mt-6 rounded-[18px] bg-herbe text-fond p-4">
          <p className="text-[15px]">
            <strong className="font-medium">{i.nom}</strong>
            {i.rejoint ? ' cuisine — tu suis la session.' : ' t’invite à cuisiner.'}
          </p>
          <button onClick={() => i.rejoint
                    ? va(`/cuisine/${i.cycle_id}`)
                    : rejoint.mutate(i.id, { onSuccess: () => va(`/cuisine/${i.cycle_id}`) })}
                  disabled={rejoint.isPending}
                  className="mt-3 h-[44px] px-4 rounded-[14px] bg-fond text-herbe
                             text-[15px] font-medium">
            {i.rejoint ? 'Reprendre la session' : 'Rejoindre'}
          </button>
        </div>
      ))}

      {/* LA chose du moment. Rien ne lui dispute la place. */}
      {etat === 'semaine' && prochain
        ? <CeSoir cas={prochain} />
        : <LeGeste etat={etat} plan={plan} titre={geste.titre} />}

      <div className="mt-[34px]">
        {etat === 'semaine' && prochain
          ? (
            <Principal onClick={() => mange.mutate(prochain.id)} disabled={mange.isPending}>
              Je l’ai mangé
            </Principal>
          )
          : (
            <Principal onClick={() => {
              if (!cycle) ouvre.mutate({}, { onSuccess: () => va('/choisir') })
              else va(geste.vers)
            }} disabled={ouvre.isPending}>
              {geste.action}
            </Principal>
          )}

        {etat === 'semaine' && (
          <Secondaire onClick={() => va('/semaine')}>Voir toute la semaine</Secondaire>
        )}
      </div>

      {/* Le second plan : discret, sans boîte, et parfaitement facultatif. */}
      {objectif && (
        <section className="mt-11" aria-label="Aujourd’hui">
          <Chiffre valeur={consomme.kcal.toLocaleString('fr-FR')} taille={26}
                   unite={`kcal aujourd’hui, sur ${Number(objectif.kcal).toLocaleString('fr-FR')}`} />
          <div className="h-1.5 rounded-full bg-brume mt-3 overflow-hidden">
            <div className="h-1.5 rounded-full bg-herbe transition-[width] duration-500"
                 style={{ width: `${Math.min(100, (consomme.kcal / Number(objectif.kcal)) * 100)}%` }} />
          </div>
          {consomme.renseignes < consomme.prevus && (
            // D33 : un repas non renseigné n'est pas un repas à zéro.
            <p className="mt-2.5 text-[14px] text-doux">
              {consomme.prevus - consomme.renseignes} repas pas encore renseigné
              {consomme.prevus - consomme.renseignes > 1 ? 's' : ''}.
            </p>
          )}
        </section>
      )}

      {presses.length > 0 && (
        <section className="mt-8 space-y-4" aria-label="À manger bientôt">
          {presses.map(({ b, u }) => (
            <div key={b.id} className="flex items-center gap-3">
              <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: u.pastille }} />
              <span className="grow text-[15px]">{b.label}</span>
              <span className="text-[14px]" style={{ color: u.encre }}>{u.mot}</span>
            </div>
          ))}
        </section>
      )}

      {/* La porte de côté : rien de prévu ne fait envie ce soir. */}
      <button onClick={() => va('/inventer')}
              className="mt-10 w-full flex items-center gap-3.5 p-4 rounded-[19px]
                         bg-brume/45 text-left hover:bg-brume/70 transition-colors">
        <svg width="19" height="19" viewBox="0 0 19 19" fill="none" stroke="#8F5A0D"
             strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
             className="shrink-0" aria-hidden="true">
          <path d="M9.5 2.2 11 6.6l4.4 1.5-4.4 1.5-1.5 4.4-1.5-4.4L3.6 8.1 8 6.6z" />
          <path d="M15.2 13.2l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z" />
        </svg>
        <span className="grow">
          <span className="block text-[15px] font-medium">Envie spéciale ?</span>
          <span className="block text-[13px] text-doux mt-0.5">
            Une recette inventée avec ce qu’on a
          </span>
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
             strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
             className="shrink-0 text-doux" aria-hidden="true">
          <path d="M6 3.5 10.5 8 6 12.5" />
        </svg>
      </button>
    </Ecran>
  )
}

function CeSoir({ cas }: { cas: Case }) {
  const p = cas.portion!
  return (
    <section className="mt-[52px]" aria-label="Le prochain repas">
      <p className="text-[15px] text-doux">{NOM_REPAS[cas.meal as keyof typeof NOM_REPAS]}</p>
      <h1 className="titre text-[46px] mt-2.5">{p.label}</h1>
      <p className="mt-4">
        <Chiffre valeur={Math.round(Number(p.protein_g))} taille={30} couleur="#E8A33D" />
        <span className="text-[14px] text-doux ml-1.5">
          g de protéines · {Math.round(Number(p.grams))} g pour toi
        </span>
      </p>
    </section>
  )
}

function LeGeste({ etat, plan, titre }:
  { etat: string; plan: { duration_min: number | string; is_active: boolean }[]; titre: string }) {
  const actif = plan.reduce((s, t) => s + (t.is_active ? Number(t.duration_min) : 0), 0)
  return (
    <section className="mt-[52px]" aria-label="Où en est le cycle">
      <h1 className="titre text-[42px]">{titre}</h1>
      {etat === 'pret' && plan.length > 0 && (
        <p className="mt-4 text-[15px] text-doux">
          {plan.length} actions, {duree(actif)} les mains prises.
        </p>
      )}
      {etat === 'vide' && (
        <p className="mt-4 text-[15px] text-doux max-w-[32ch]">
          On choisit les recettes maintenant, on cuisine dimanche, on mange la
          semaine d’après.
        </p>
      )}
    </section>
  )
}
