/**
 * La fiche d'un plat (le contenu de la feuille du bas) : sa photo, où il est, combien il en reste, quand
 * c'est prévu, ses dates — modifiables —, et ce qu'on peut en faire.
 *
 * Une fiche parle d'un GROUPE de barquettes (même recette, même lieu, même état) : « 6 parts » de lasagnes.
 * Les gestes qui n'en prennent qu'une partie demandent combien (`Combien`), sauf quand la réponse est
 * évidente (une seule part, ou celles qu'un repas d'aujourd'hui ou de demain réclame).
 */
import { useState } from 'react'
import { BoutonPhoto, Erreur } from '../coque.tsx'
import { Appareil, PlatImage } from './PlatImage.tsx'
import { Combien } from './Combien.tsx'
import { LigneDate } from './ChampDate.tsx'
import {
  auPlusTard, ecrituresDesDates, fondDuPlat, macrosDuGroupe, noteDeLaFiche, partsAChoisir, partsASortir,
  peremptionApres, phraseDesRepasLibres, prevuesPour,
} from '../../lib/frigo.ts'
import type { Groupe, Prevu } from '../../lib/frigo.ts'
import { depuisLeChamp, jourEtHeure, pourLeChamp } from '../../lib/ranger.ts'
import { jour } from '../../lib/semaine.ts'
import { maintenant } from '../../lib/horloge.ts'
import {
  useCongele, useEcarteDesParts, useModifieLesDates, useMangeMaintenant, usePhotoDuPlat, useSortDuCongelo,
} from '../../lib/donnees/frigo.ts'
import type { Ecarte, RecetteDuPlat } from '../../lib/donnees/frigo.ts'
import type { Barquette } from '../../lib/donnees/barquettes.ts'

const ROUGE = '#9A3526'
const pluriel = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un)

type Question = 'congeler' | 'jeter' | 'retirer' | 'sortir' | null

export function FichePlat({ groupe, prevus, erreurPrevus, membres, recette, foyerId, moi, va, surAnnonce, photoLien }: {
  groupe: Groupe<Barquette>
  /** Les repas posés ; `null` tant qu'ils ne sont pas lus (chargement, erreur) : aucun geste ne se fie à ce qu'on ne sait pas. */
  prevus: Prevu[] | null
  erreurPrevus?: unknown
  membres: { id: string; prenom: string }[]
  recette: RecetteDuPlat | undefined
  foyerId: string | null
  moi: string
  va: (v: string) => void
  surAnnonce: (message: string) => void
  /** L'adresse de la photo du plat, ou `null`. */
  photoLien: string | null
}) {
  const now = maintenant()
  const [question, setQuestion] = useState<Question>(null)
  /* Ce que le dernier geste a fait, dit dans la feuille elle-même : l'intérieur, derrière, est inerte. */
  const [dit, setDit] = useState<string | null>(null)
  const mange = useMangeMaintenant()
  const congele = useCongele()
  const sort = useSortDuCongelo()
  const ecarte = useEcarteDesParts()
  const dates = useModifieLesDates()
  const photo = usePhotoDuPlat()

  const n = groupe.parts.length
  const auFroid = groupe.location === 'congelateur'
  const decongelee = groupe.state === 'decongelee'
  const ids = groupe.parts.map(p => p.id)
  const lus = prevus !== null
  const lesPrevus = prevus ?? []
  const quand = prevuesPour(groupe, lesPrevus, membres, now)
  const note = lus ? noteDeLaFiche(groupe, lesPrevus, now) : ''
  const sorties = auFroid && lus ? partsASortir(groupe, lesPrevus, now) : null
  const peutPhotographier = !!(groupe.recipeId && recette?.owner_household_id && recette.owner_household_id === foyerId)

  /* ⚠️ `mutateAsync().then`, pas `mutate(…, { onSuccess })` : quand le geste vide le groupe, la fiche se démonte,
     et TanStack n'appelle plus les rappels d'un composant parti — l'annonce se perdait. */
  const fait = <T,>(p: Promise<T>, message: string | ((r: T) => string)) => {
    p.then(r => { const m = typeof message === 'function' ? message(r) : message; setDit(m); surAnnonce(m) }, () => {})
  }
  /** « 2 parts jetées. Le dîner de dimanche n'a plus de barquette. » : le geste, puis les repas qu'il a privés de leur part. */
  const avecLesRepas = (geste: string, libere: Ecarte['libere']) =>
    [geste, phraseDesRepasLibres(libere, moi, membres, now)].filter(Boolean).join(' ')

  /* Un geste en vol verrouille les autres : « Congeler » puis « Jeter » en deux appuis rapides visaient les
     mêmes parts (la fiche n'a pas encore relu le frigo), et la seconde écriture échouait ou jetait ce qu'on
     venait de congeler. */
  const occupe = mange.isPending || congele.isPending || sort.isPending || ecarte.isPending

  const erreur = mange.error ?? congele.error ?? sort.error ?? ecarte.error ?? dates.error ?? photo.error ?? erreurPrevus

  const efface = () => { mange.reset(); congele.reset(); sort.reset(); ecarte.reset(); dates.reset(); photo.reset() }

  /* Les parts que « Congeler », « Sortir », « Jeter » et « Retirer » prennent : les libres d'abord (un repas d'avant
     aujourd'hui ne réclame plus sa part). */
  const choisies = (k: number) => partsAChoisir(groupe, lesPrevus, k, now).map(p => p.id)

  function congeler(k: number) {
    efface(); setQuestion(null)
    fait(congele.mutateAsync(choisies(k)),
      `${k} ${pluriel(k, 'part', 'parts')} au congélateur : ça se garde trois mois.`)
  }
  function sortir(parts: string[]) {
    efface(); setQuestion(null)
    fait(sort.mutateAsync(parts),
      `${parts.length} ${pluriel(parts.length, 'part sortie', 'parts sorties')} du congélateur : à manger dans les 24 heures.`)
  }
  function jeter(k: number) {
    efface(); setQuestion(null)
    fait(ecarte.mutateAsync({ ids: choisies(k), geste: 'jeter' }),
      r => avecLesRepas(`${r.n} ${pluriel(r.n, 'part jetée', 'parts jetées')}.`, r.libere))
  }
  /* Retirer : ni mangée ni jetée. La part disparaît (mangée en douce, donnée, perdue) sans compter comme gaspillée. */
  function retirer(k: number) {
    efface(); setQuestion(null)
    fait(ecarte.mutateAsync({ ids: choisies(k), geste: 'retirer' }),
      r => avecLesRepas(`${r.n} ${pluriel(r.n, 'part retirée', 'parts retirées')} du ${auFroid ? 'congélateur' : 'frigo'}.`, r.libere))
  }
  function mangerUne() {
    efface()
    fait(mange.mutateAsync({ groupe }),
      r => avecLesRepas(`C’est noté : une part de ${groupe.nom.toLowerCase()} mangée.`, r.libere))
  }

  /* Les dates. Une saisie qu'on ne lit pas se dit ; une saisie inchangée n'écrit RIEN (elle réécrasait des
     péremptions différentes par celle de la première part) ; une saisie lue s'applique, part par part, là
     où elle change quelque chose. */
  function enregistreLeDepart(saisie: string): string | null {
    const d = depuisLeChamp(saisie)
    if (!d) return 'Cette date ne se lit pas.'
    if (d.getTime() > now.getTime() + 60_000) return 'Pas dans le futur : c’est le moment où c’est rangé.'
    if (saisie === pourLeChamp(premierDepart)) return null
    const fin = peremptionApres(groupe.location, groupe.state, d)
    const ecritures = ecrituresDesDates(groupe.parts, {
      ...(auFroid ? { frozen_at: d.toISOString() } : { prepared_at: d.toISOString() }),
      ...(fin ? { expires_at: fin.toISOString() } : {}),
    })
    if (ecritures.length === 0) return null
    efface()
    fait(dates.mutateAsync(ecritures), 'Date corrigée.')
    return null
  }
  function enregistreLaFin(saisie: string): string | null {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(saisie) ? new Date(`${saisie}T23:59:00`) : null
    if (!d || Number.isNaN(d.getTime())) return 'Cette date ne se lit pas.'
    if (saisie === jour(fin)) return null
    const ecritures = ecrituresDesDates(groupe.parts, { expires_at: d.toISOString() }, { expiresParJour: true })
    if (ecritures.length === 0) return null
    efface()
    fait(dates.mutateAsync(ecritures), 'Date corrigée.')
    return null
  }

  const premierDepart = new Date(groupe.parts.reduce((m, p) => {
    const d = auFroid ? (p.frozen_at ?? p.prepared_at) : p.prepared_at
    return d < m ? d : m
  }, auFroid ? (groupe.parts[0].frozen_at ?? groupe.parts[0].prepared_at) : groupe.parts[0].prepared_at))
  const fin = new Date(groupe.parts[0].expires_at)

  const lieu = auFroid ? 'Au congélateur' : decongelee ? 'Au frigo · décongelée' : 'Au frigo'
  const chip = auFroid ? 'bg-congel-fond text-congel-encre' : 'bg-frais-fond text-frais-encre'

  return (
    <div>
      <div className="relative h-[168px] overflow-hidden rounded-[20px]" style={{ background: fondDuPlat(groupe.label) }}>
        {photoLien || !peutPhotographier ? (
          <PlatImage url={photoLien} glyphe={30} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-doux">
            <Appareil taille={30} />
            <BoutonPhoto texte={photo.isPending ? 'Envoi de la photo…' : 'Prendre le plat en photo'}
                         disabled={photo.isPending}
                         onFichier={f => { efface(); photo.mutate({ recette: groupe.recipeId!, foyer: foyerId!, fichier: f, ancienne: recette?.image_url ?? null }) }}
                         className="min-h-11 rounded-full bg-surface px-3.5 text-[14px] font-semibold text-herbe" />
          </div>
        )}
        {photoLien && peutPhotographier && (
          <BoutonPhoto texte={photo.isPending ? 'Envoi…' : 'Changer la photo'} disabled={photo.isPending}
                       onFichier={f => { efface(); photo.mutate({ recette: groupe.recipeId!, foyer: foyerId!, fichier: f, ancienne: recette?.image_url ?? null }) }}
                       className="absolute bottom-3 right-3 min-h-11 rounded-full bg-surface/95 px-3.5 text-[13px] font-semibold text-herbe" />
        )}
        <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1.5 text-[12px] font-bold ${chip}`}>{lieu}</span>
      </div>

      <h2 className="titre mx-1 mt-3.5 text-[25px] font-semibold leading-[1.12] [overflow-wrap:anywhere]">{groupe.label}</h2>
      <p className="mx-1 mt-2.5 flex items-baseline gap-2.5">
        <span className="chiffre text-[44px] font-semibold leading-none" data-parts={n}>{n}</span>
        <span className="text-[15px] font-semibold">{pluriel(n, 'part', 'parts')}</span>
      </p>
      <div className="mx-1 mt-1.5 text-[14px] text-doux" data-macros="">
        {macrosDuGroupe(groupe, membres).map(l => <p key={l}>{l}</p>)}
      </div>

      {lus ? (
        <>
          <h3 className="mx-1 mb-2 mt-4 text-[14px] font-bold">{quand.titre}</h3>
          <div className="flex flex-wrap gap-1.5 px-1">
            {quand.puces.length === 0
              ? <span className="rounded-[10px] bg-sable px-[11px] py-[7px] text-[13px] font-semibold text-ocre">Pas encore</span>
              : quand.puces.map((p, i) => (
                <span key={`${p}-${i}`} className="rounded-[10px] bg-piste px-[11px] py-[7px] text-[13px] font-semibold">{p}</span>
              ))}
          </div>
        </>
      ) : (
        <p className="mx-1 mt-4 text-[14px] text-doux">
          {erreurPrevus ? 'Les repas prévus ne se lisent pas : rien ne se fait sur cette fiche pour l’instant.' : 'Les repas prévus se lisent…'}
        </p>
      )}
      {note && <p className="mx-1 mt-3 rounded-[14px] bg-sable px-3.5 py-3 text-[14px] leading-[1.4]">{note}</p>}

      <div className="mx-1 mt-3 border-t border-piste">
        {!decongelee && (
          <LigneDate nom={auFroid ? pluriel(n, 'Congelé le', 'Congelés le') : 'Au frigo depuis'}
                     valeur={jourEtHeure(premierDepart)} type="datetime-local"
                     initiale={pourLeChamp(premierDepart)} max={pourLeChamp(now)}
                     surEnregistre={enregistreLeDepart} enCours={dates.isPending} />
        )}
        <LigneDate nom="À manger avant" valeur={auPlusTard(groupe, now)} type="date"
                   initiale={jour(fin)} surEnregistre={enregistreLaFin} enCours={dates.isPending} />
      </div>

      {question === 'congeler' && (
        <Combien titre="Combien tu en congèles ?" max={n} defaut={n} oui="Congeler"
                 surOui={congeler} surNon={() => setQuestion(null)} enCours={congele.isPending} />
      )}
      {question === 'sortir' && (
        <Combien titre="Combien tu en sors du congélateur ?" max={n} defaut={1} oui="Sortir"
                 surOui={k => sortir(choisies(k))}
                 surNon={() => setQuestion(null)} enCours={sort.isPending} />
      )}
      {question === 'jeter' && (
        <Combien titre="Combien tu en jettes ?" max={n} defaut={n} oui="Jeter"
                 surOui={jeter} surNon={() => setQuestion(null)} enCours={ecarte.isPending} />
      )}
      {question === 'retirer' && (
        <Combien titre="Combien tu en retires ?" max={n} defaut={n} oui="Retirer"
                 surOui={retirer} surNon={() => setQuestion(null)} enCours={ecarte.isPending} />
      )}

      <Erreur de={erreur} />
      {dit && <p role="status" className="mx-1 mt-3 rounded-[14px] bg-frais-fond px-3.5 py-2.5 text-[14px] text-frais-encre">{dit}</p>}

      <div className="mx-1 mt-4 flex flex-col gap-2.5">
        {auFroid ? (
          <button type="button" disabled={occupe || !lus}
                  onClick={() => sorties ? sortir(sorties.map(p => p.id)) : n > 1 ? setQuestion('sortir') : sortir(ids)}
                  className="h-[52px] rounded-2xl bg-herbe text-[16px] font-semibold text-fond disabled:opacity-60">
            Je les sors du congélateur
          </button>
        ) : (
          <button type="button" disabled={occupe || !lus} onClick={mangerUne}
                  className="h-[52px] rounded-2xl bg-herbe text-[16px] font-semibold text-fond disabled:opacity-60">
            En manger une maintenant
          </button>
        )}
        <div className="flex gap-2.5">
          {auFroid ? (
            <button type="button" onClick={() => va('/semaine')}
                    className="h-12 flex-1 rounded-2xl bg-piste text-[15px] font-semibold">
              Changer le repas
            </button>
          ) : (
            <button type="button" disabled={occupe || !lus}
                    onClick={() => n > 1 ? setQuestion('congeler') : congeler(1)}
                    className="h-12 flex-1 rounded-2xl bg-piste text-[15px] font-semibold disabled:opacity-60">
              Congeler
            </button>
          )}
          <button type="button" disabled={occupe || !lus}
                  onClick={() => n > 1 ? setQuestion('jeter') : jeter(1)}
                  className="h-12 flex-1 rounded-2xl bg-transparent text-[15px] font-semibold shadow-[inset_0_0_0_1.5px_var(--color-brume)] disabled:opacity-60"
                  style={{ color: ROUGE }}>
            Jeter
          </button>
        </div>
        <button type="button" disabled={occupe || !lus}
                onClick={() => n > 1 ? setQuestion('retirer') : retirer(1)}
                className="min-h-11 self-start px-1 text-[14px] font-semibold text-doux underline underline-offset-[3px] disabled:opacity-60">
          {auFroid ? 'Retirer du congélateur' : 'Retirer du frigo'}
        </button>
        <p className="-mt-1.5 px-1 text-[13px] text-doux">
          Retirer : ni mangée ni jetée, la part disparaît simplement.
        </p>
      </div>
      {!auFroid && (
        <p className="mx-1 mt-3 text-[13px] text-doux">
          {decongelee ? 'Recongeler une part décongelée n’est pas conseillé.' : 'Congeler repart de zéro : la part tiendra trois mois.'}
        </p>
      )}
    </div>
  )
}

