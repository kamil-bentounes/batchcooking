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
import { Chiffre, Ecran, Erreur, Principal, Secondaire, Vide, dateLongue, duree, Marque } from '../ui/coque.tsx'
import { PetitFrigo } from '../ui/frigo/PetitFrigo.tsx'
import { Appareil, PlatImage } from '../ui/frigo/PlatImage.tsx'
import { GESTE, useChangeEtat, useCycle, useCycleInterrompu, useOuvreCycle } from '../lib/donnees/cycle.ts'
import { enFrancais } from '../lib/reseau.ts'
import { useFoyer, initialeDe, prenomDe } from '../lib/donnees/foyer.ts'
import { usePrevus, useRecettesDesPlats, useSortDuCongelo } from '../lib/donnees/frigo.ts'
import { magnet, nomCourt, pourQui, pressesGroupees, repasDuJour } from '../lib/frigo.ts'
import {
  NOM_REPAS, bilanDuJour, jour, useBarquettes, useMange, useSemaine,
} from '../lib/donnees/barquettes.ts'
import type { Case } from '../lib/donnees/barquettes.ts'
import { usePlanEnregistre } from '../lib/donnees/session.ts'
import { useInvitations, useRejoint } from '../lib/donnees/convives.ts'
import { BoutonAide } from '../ui/Aide.tsx'

export function Accueil({ userId, va }: { userId: string; va: (v: string) => void }) {
  const aujourdhui = useMemo(() => new Date(), [])
  const { data: cycle, isPending: chargeCycle } = useCycle()
  const { data: foyer } = useFoyer()
  const { data: cases = [] } = useSemaine(aujourdhui, 2)
  const { data: lesPrevus, error: erreurPrevus } = usePrevus()
  /* `null` tant que les repas posés ne sont pas lus : le magnet ne dit pas « libre » d'une part qu'un repas réclame. */
  const prevus = lesPrevus ?? null
  const sortDuCongelo = useSortDuCongelo()
  const { data: barquettes = [] } = useBarquettes()
  const { data: plan = [] } = usePlanEnregistre(cycle?.id, cycle?.state === 'en_cuisine')
  const mange = useMange()
  const ouvre = useOuvreCycle()
  const reprend = useChangeEtat()
  const { data: interrompu, isLoading: chargeInterrompu } = useCycleInterrompu(!chargeCycle && !cycle)
  const { data: invitations = [] } = useInvitations()
  const rejoint = useRejoint()

  const moi = foyer?.membres.find(m => m.id === userId)
  const objectif = moi?.objectif
  const jourDit = jour(aujourdhui)
  const duJour = cases.filter(c => c.user_profile_id === userId && c.day === jourDit)
  const prochain = duJour.find(c => c.state === 'prevu' && c.portion)
  /* Demain, pour moi : les repas posés, dits « midi et soir ». */
  const demainDit = useMemo(() => {
    const d = new Date(aujourdhui); d.setDate(d.getDate() + 1)
    return jour(d)
  }, [aujourdhui])
  const demain = cases.filter(c => c.user_profile_id === userId && c.day === demainDit
    && c.state === 'prevu' && c.portion)
  const idsRecettes = [...new Set([prochain, ...demain].map(c => c?.portion?.recipe_id)
    .filter((x): x is string => !!x))]
  const { data: recettes } = useRecettesDesPlats(idsRecettes)
  const photoDe = (c: Case | undefined) =>
    (c?.portion?.recipe_id ? recettes?.get(c.portion.recipe_id)?.image_url ?? null : null)
  const auFrais = barquettes.filter(b => b.location === 'frigo').length
  const auFroid = barquettes.filter(b => b.location === 'congelateur').length
  const aimant = magnet(barquettes, prevus, aujourdhui)
  const membres = (foyer?.membres ?? []).map(m => ({ id: m.id, prenom: prenomDe(m.display_name) }))
  const consomme = bilanDuJour(cases, userId, jourDit)

  /* Une session interrompue est LA chose du moment : le hub le dit (« Session interrompue »), l'accueil disait
     « Rien de prévu » et ne la proposait qu'en second, sous « Choisir les recettes » (revue du 25/10). */
  const etat = cycle?.state ?? (interrompu ? 'interrompue' : 'vide')
  const geste = GESTE[etat]
  const presses = pressesGroupees(barquettes, new Date())
  /* La carte du repas dit à elle seule le geste du moment pendant la semaine, quand il y a un repas posé. */
  const enSemaine = etat === 'semaine' && !!prochain
  /* Les parts que « Je les sors » sort : celles du même plat posées sur ce repas, et au congélateur. */
  const aSortir = prochain
    ? cases.flatMap(c => c.day === jourDit && c.meal === prochain.meal && c.state === 'prevu'
      && c.portion?.label === prochain.portion?.label && c.portion?.location === 'congelateur'
      ? [c.portion.id] : [])
    : []

  const carteDuSoir = prochain && (
    <CeSoir cas={prochain} photo={photoDe(prochain)} enCours={mange.isPending || sortDuCongelo.isPending}
            pour={pourQui(
              cases.filter(c => c.day === jourDit && c.meal === prochain.meal && c.state === 'prevu'
                && c.portion?.label === prochain.portion?.label).map(c => c.user_profile_id),
              membres, userId)}
            surMange={() => mange.mutate(prochain.id)}
            nbASortir={aSortir.length}
            surSort={() => sortDuCongelo.mutate(aSortir)}
            surChange={() => va(`/semaine?jour=${jourDit}&repas=${prochain.meal}`)}
            /* Le titre de la page : le plat de ce soir quand il EST la page, le geste du cycle sinon. */
            titreDePage={enSemaine} />
  )

  if (chargeCycle || chargeInterrompu) {
    return <Ecran actif="accueil" va={va}><Vide titre="Un instant…" /></Ecran>
  }

  return (
    <Ecran actif="accueil" va={va}>
      <div className="flex items-center justify-between">
        {/* Le bloc marque est le RETOUR AU HUB. La barre du bas reste dans
            l'univers cuisine ; c'est l'en-tête qui fait passer d'un univers à
            l'autre, sinon cinq onglets mélangeraient « Ce que j'ai » et
            « Virements », et on aurait deux applications cousues ensemble. */}
        <button onClick={() => va('/')} aria-label="Retour à l’accueil de Popote"
                className="flex items-center gap-2.5 min-h-11 -my-2 text-herbe">
          <span aria-hidden="true" className="text-[20px] text-doux -ml-1">‹</span>
          <Marque taille={26} />
          <span className="text-[14px] text-doux first-letter:uppercase">
            {dateLongue(aujourdhui)}
          </span>
        </button>
        {/* 44 px touchables, 34 visibles : c'est la SEULE porte vers les
            réglages — la barre du bas n'y mène pas. */}
        <span className="flex items-center">
          <BoutonAide />
          <button onClick={() => va('/reglages')} aria-label="Réglages"
                  className="w-11 h-11 -mr-2 grid place-items-center">
            <span className="w-[34px] h-[34px] rounded-full bg-herbe text-fond text-[13px]
                             grid place-items-center">
              {initialeDe(moi?.display_name)}
            </span>
          </button>
        </span>
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

      {/* Le frigo, en petit : on le touche pour l'ouvrir. */}
      <section aria-label="Le frigo"
               className="mt-6 flex h-[286px] items-end gap-[18px] rounded-[26px] pl-[22px] pr-[18px]"
               style={{
                 background: 'linear-gradient(180deg, #FBFCFA 0%, #FBFCFA 82%, #EEF1EA 82%)',
                 boxShadow: 'inset 0 0 0 1px var(--color-brume)',
               }}>
        {/* Le dessin double le lien « Ouvrir le frigo » : il ne se lit pas deux fois. */}
        <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => va('/frigo')}>
          <PetitFrigo photo={photoDe(demain[0])} magnet={aimant !== null} />
        </button>
        <div className="flex flex-1 flex-col gap-3.5 pb-[66px]">
          <div>
            <div className="chiffre text-[30px] font-semibold leading-none" data-compte="frigo">{auFrais}</div>
            <div className="mt-0.5 text-[13px] text-doux">{auFrais > 1 ? 'parts' : 'part'} au frigo</div>
          </div>
          <div>
            <div className="chiffre text-[30px] font-semibold leading-none text-congel-encre" data-compte="congelateur">{auFroid}</div>
            <div className="mt-0.5 text-[13px] text-doux">au congélateur</div>
          </div>
          <button type="button" onClick={() => va('/frigo')}
                  className="inline-flex min-h-11 items-center self-start text-[14px] font-bold text-herbe">
            Ouvrir le frigo
          </button>
        </div>
      </section>

      <Erreur de={erreurPrevus} />

      {/*
        * L'ordre dit ce qui est LE geste du moment. Pendant la semaine, c'est le repas de ce soir (carte sombre,
        * juste sous le frigo) ; dans tout autre état du cycle — session interrompue, choix des recettes,
        * courses, cuisine —, c'est le geste du cycle, et la carte passe dessous : elle le repoussait sous le
        * pli.
        */}
      {enSemaine && carteDuSoir}
      {enSemaine && <Erreur de={mange.error ?? sortDuCongelo.error} />}

      {/* LA chose du moment, quand le repas ne la dit pas déjà. Rien ne lui dispute la place. */}
      {!enSemaine && <LeGeste etat={etat} plan={plan} titre={geste.titre} />}

      <div className={enSemaine ? '' : 'mt-[34px]'}>
        {!enSemaine && (
          <Principal onClick={() => {
            if (!cycle && interrompu) {
              reprend.mutate({ id: interrompu.id, vers: 'en_cuisine' }, { onSuccess: () => va('/cuisine') })
            } else if (!cycle) ouvre.mutate({}, { onSuccess: () => va('/choisir') })
            else va(geste.vers)
          }} disabled={ouvre.isPending || reprend.isPending}>
            {geste.action}
          </Principal>
        )}

        {/* Le refus de la base (« la semaine … a déjà son cycle ») se lisait nulle part : le bouton
            semblait mort. */}
        <Erreur de={ouvre.error
          ? (/a une session interrompue/.test(ouvre.error.message)
            ? 'Cette semaine a une session interrompue : reprends-la.'
            : /a déjà son cycle/.test(ouvre.error.message)
              ? 'Cette semaine a déjà eu sa session : reprends-la, ou attends la semaine suivante.'
              : enFrancais(ouvre.error.message))
          : reprend.error} />
        {/* L'autre chemin : la laisser là et repartir sur de nouvelles recettes. */}
        {!cycle && interrompu && (
          <Secondaire onClick={() => ouvre.mutate({}, { onSuccess: () => va('/choisir') })}
                      disabled={ouvre.isPending}>
            Choisir de nouvelles recettes
          </Secondaire>
        )}
      </div>

      {!enSemaine && carteDuSoir}
      {!enSemaine && <Erreur de={mange.error ?? sortDuCongelo.error} />}

      {/* Demain : « La semaine » mène où tout se choisit. Pendant la semaine, on le dit même vide : c'est
          aussi la porte vers elle, que « Voir toute la semaine » tenait avant. */}
      {(demain.length > 0 || (etat === 'semaine' && prochain)) && (
        <Demain cases={demain} photo={photoDe(demain[0])} surSemaine={() => va(`/semaine?jour=${demainDit}`)} />
      )}

      {/* Le second plan : discret, sans boîte, et parfaitement facultatif. */}
      {/* Aucun repas aujourd'hui : « 0 kcal aujourd'hui » et une barre vide ne disent rien. */}
      {objectif && consomme.prevus > 0 && (
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
          {presses.map(({ label, n, u }) => (
            <div key={`${label}|${u.mot}`} className="flex items-center gap-3">
              <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: u.pastille }} />
              {/* Deux barquettes du même plat : une ligne, avec leur nombre — pas deux lignes identiques. */}
              <span className="grow text-[15px]">
                {label}{n > 1 && <span className="text-doux"> · {n} barquettes</span>}
              </span>
              <span className="text-[14px]" style={{ color: u.encre }}>{u.mot}</span>
            </div>
          ))}
        </section>
      )}

      {/* La porte de côté : rien de prévu ne fait envie ce soir. */}
      <button onClick={() => va('/inventer')}
              className="mt-10 w-full flex items-center gap-3.5 p-4 rounded-[19px]
                         bg-brume/45 text-left hover:bg-brume/70 transition-colors">
        <svg width="19" height="19" viewBox="0 0 19 19" fill="none" stroke="var(--color-ocre)"
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

/** Le repas du jour, en carte sombre : le plat, pour qui, et — s'il dort au congélateur — ce qu'il faut faire. */
function CeSoir({ cas, photo, pour, enCours, nbASortir, surMange, surSort, surChange, titreDePage }: {
  cas: Case; photo: string | null; pour: string; enCours: boolean
  /** Vrai quand la carte est le geste de la page : son titre en est alors le `<h1>` (il n'y en a qu'un). */
  titreDePage: boolean
  /** Combien de barquettes « Je les sors » sort : le texte et le bouton s'accordent avec ce nombre. */
  nbASortir: number
  surMange: () => void; surSort: () => void; surChange: () => void
}) {
  const p = cas.portion!
  const auFroid = p.location === 'congelateur'
  const meal = cas.meal as keyof typeof NOM_REPAS
  const Titre = titreDePage ? 'h1' : 'h2'
  const quand = meal === 'diner' ? 'Ce soir' : meal === 'dejeuner' ? 'Ce midi' : `Ce ${NOM_REPAS[meal].toLowerCase()}`
  return (
    <section aria-label="Le prochain repas" data-carte="repas"
             className={`sur-encre rounded-3xl bg-encre p-4 text-fond ${titreDePage ? 'mt-[18px]' : 'mt-10'}`}>
      <div className="flex items-center gap-3.5">
        <div className="relative size-[72px] shrink-0 overflow-hidden rounded-2xl bg-[#3A4A41] text-[#B9C7BD]">
          {photo ? <PlatImage url={photo} texte={false} /> : <span className="absolute inset-0 grid place-items-center"><Appareil taille={26} /></span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-[#B9C7BD]">{quand}, pour {pour}</p>
          <Titre className="titre mt-[3px] text-[22px] font-semibold leading-[1.15] [overflow-wrap:anywhere]">{nomCourt(p.label)}</Titre>
        </div>
      </div>
      {auFroid && (
        <p className="mt-3.5 rounded-[14px] px-3 py-2.5 text-[14px] leading-[1.4] text-[#E3EEF3]"
           style={{ background: 'rgba(220, 232, 238, 0.14)' }}>
          Il est au congélateur : sors-{nbASortir > 1 ? 'les' : 'le'} maintenant, ou micro-ondes avant de manger.
        </p>
      )}
      <div className="mt-3.5 flex gap-2.5">
        {auFroid ? (
          <button type="button" onClick={surSort} disabled={enCours}
                  className="h-[50px] flex-1 rounded-[15px] bg-safran text-[15px] font-bold text-encre disabled:opacity-60">
            {nbASortir > 1 ? 'Je les sors' : 'Je le sors'}
          </button>
        ) : (
          <button type="button" onClick={surMange} disabled={enCours}
                  className="h-[50px] flex-1 rounded-[15px] bg-safran text-[15px] font-bold text-encre disabled:opacity-60">
            Je l’ai mangé
          </button>
        )}
        <button type="button" onClick={surChange}
                className="h-[50px] flex-1 rounded-[15px] text-[15px] font-semibold text-fond"
                style={{ background: 'rgba(242, 244, 239, 0.12)' }}>
          Changer
        </button>
      </div>
    </section>
  )
}

/** « Demain, midi et soir — Lasagnes » : ce qui est posé, et la porte vers la semaine. */
function Demain({ cases, photo, surSemaine }: { cases: Case[]; photo: string | null; surSemaine: () => void }) {
  const plats = [...new Set(cases.map(c => nomCourt(c.portion!.label)))]
  return (
    <section aria-label="Demain" className="mt-[22px] flex items-center gap-3">
      <div className="relative size-[54px] shrink-0 overflow-hidden rounded-[14px] bg-piste text-doux">
        {cases.length > 0
          ? <PlatImage url={photo} texte={false} glyphe={20} />
          : <span className="absolute inset-0 grid place-items-center"><Appareil taille={20} /></span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-doux">
          {cases.length > 0 ? `Demain, ${repasDuJour(cases.map(c => c.meal))}` : 'Demain'}
        </div>
        <div className="mt-0.5 text-[15px] font-bold [overflow-wrap:anywhere]">
          {plats.length > 0 ? plats.join(', ') : 'Rien de posé pour l’instant'}
        </div>
      </div>
      <button type="button" onClick={surSemaine}
              className="inline-flex min-h-11 items-center text-[14px] font-bold text-herbe">
        La semaine
      </button>
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
