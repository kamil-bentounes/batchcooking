/**
 * Une poche d'épargne : sa photo, ce qu'il y a dessus, qui l'a versé, et de quoi verser ou retirer.
 *
 * Une chose à ne jamais perdre de vue : une épargne PERSISTE, donc elle appartient à quelqu'un. Le solde
 * affiché n'est jamais « 4 000 € » tout court mais accompagné du registre — un livret joint est présumé
 * moitié-moitié alors que les versements, eux, ne l'étaient pas (D64).
 */
import { useState } from 'react'
import { Erreur } from '../coque.tsx'
import { montant } from '../../lib/budget/mois.ts'
import { refusDuRetrait } from '../../lib/budget/feuilles.ts'
import {
  VOILE, partDeLaBarre, pastilleDe, photoDeLaPoche, pourcentage, repereDeLaDate,
} from '../../lib/budget/epargne-lecture.ts'
import { useSolde, useVerse, enCentimes, type Poche } from '../../lib/donnees/budget.ts'
import { ChampMontant } from './Champ.tsx'
import { Information, Retirer, Tirelire, Valise, Verser } from './pictos.tsx'
import { Projet } from './Projet.tsx'

export type Membre = { id: string; prenom: string }

export function CartePoche({ poche, userId, foyerId, membres }: {
  poche: Poche; userId: string; foyerId: string; membres: Membre[]
}) {
  const solde = useSolde(poche.id)
  const verse = useVerse()
  const [saisi, setSaisi] = useState('')
  /* Le refus d'un retrait trop gros : dit sous les boutons, effacé dès qu'on retape. */
  const [refus, setRefus] = useState<string | null>(null)

  const cumul = solde.data ?? []
  const total = cumul.reduce((s, c) => s + c.cents, 0)
  const cents = enCentimes(saisi)
  const monSolde = cumul.find(c => c.userId === userId)?.cents ?? 0
  /* ⚠️ `solde.data` absent (pas encore revenu, ou en panne) n'est PAS zéro : `monSolde` valait 0,
     et « Je retire » répondait « Tu n'as rien versé ici » à quelqu'un qui a 380 € dans la poche.
     Pendant une relecture le chiffre est périmé aussi (une réponse perdue, puis un second retrait
     qui passerait la garde) : le retrait attend le solde frais. */
  const soldeLu = solde.data !== undefined
  const soldeFrais = soldeLu && !solde.isFetching
  const lu = soldeLu ? total : null
  const part = partDeLaBarre(lu, poche.objectif_cents)
  const pct = pourcentage(lu, poche.objectif_cents)
  const versements = cumul.filter(c => c.cents !== 0)
    .map(c => ({ ...c, rang: membres.findIndex(m => m.id === c.userId),
                 prenom: membres.find(m => m.id === c.userId)?.prenom ?? '?' }))
    .sort((a, b) => (a.rang < 0 ? 99 : a.rang) - (b.rang < 0 ? 99 : b.rang))
  const dit = soldeLu && poche.objectif_cents
    ? `${montant(total)} sur ${montant(poche.objectif_cents)}` : null

  return (
    <section aria-label={poche.libelle} className="overflow-hidden rounded-[24px] bg-surface shadow-carte">
      {/* Le fond du bandeau est sombre : tant que la photo n'est pas là (ou si elle ne vient pas), le titre blanc
          se lit quand même. */}
      <div className="relative h-[136px] min-[900px]:h-[176px] bg-encre">
        <img src={`${import.meta.env.BASE_URL}budget/${photoDeLaPoche(poche.genre)}.jpg`} alt=""
             loading="lazy" className="h-full w-full object-cover" />
        <div aria-hidden="true" className="absolute inset-0" style={{ background: VOILE }} />
        <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-2.5">
          <h2 className="titre text-[22px] font-semibold text-white min-w-0 break-words">{poche.libelle}</h2>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-2.5 py-1
                           text-[13px] font-semibold text-herbe">
            {poche.genre === 'urgence' ? <Tirelire taille={15} /> : <Valise taille={15} />}
            {poche.genre === 'urgence' ? 'Fonds d’urgence' : 'Un projet'}
          </span>
        </div>
      </div>

      <div className="grid gap-3.5 p-4 min-[900px]:p-[22px]">
        <p className="flex flex-wrap items-baseline gap-x-2.5">
          <b className="titre text-[44px] min-[361px]:text-[52px] min-[900px]:text-[64px] font-semibold
                        leading-none tracking-[-0.03em] text-herbe">
            {soldeLu ? montant(total) : '…'}
          </b>
          {poche.objectif_cents && (
            <span className="text-[16px] text-doux">sur {montant(poche.objectif_cents)}</span>
          )}
        </p>

        {part !== null && (
          <div role="meter" aria-valuemin={0} aria-valuenow={Math.max(0, total)}
               aria-valuemax={poche.objectif_cents ?? 0} aria-valuetext={dit ?? undefined}
               aria-label={dit ?? poche.libelle}
               className="h-3 rounded-[7px] bg-piste overflow-hidden">
            <div className="h-full rounded-[7px] bg-herbe motion-safe:transition-[width]"
                 style={{ width: `${part * 100}%` }} />
          </div>
        )}
        <p className="-mt-1.5 flex justify-between gap-3 text-[13.5px] text-doux">
          <span>{pct !== null ? `${pct} %` : ''}</span>
          <span>{repereDeLaDate(poche.echeance)}</span>
        </p>

        {/* Le registre par personne, toujours affiché. C'est LUI la donnée, pas le solde : sans lui,
            c'est la présomption de moitié-moitié qui gagne. */}
        {soldeLu && versements.length === 0 && (
          <p className="flex items-start gap-3 rounded-2xl bg-sable px-3.5 py-3 text-[14.5px] leading-[1.4]">
            <span className="mt-px text-ocre"><Information /></span>
            <span>
              Rien n’y est encore versé. Chaque versement s’écrit au nom de celui qui le fait : le
              registre garde qui a mis quoi.
            </span>
          </p>
        )}
        {versements.length > 0 && (
          <ul aria-label="Qui a versé quoi" className="grid grid-cols-2 max-[360px]:grid-cols-1 gap-2">
            {versements.map(v => (
              <li key={v.userId} className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-fond px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--color-brume)]">
                <span aria-hidden="true"
                      className={`grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full
                                  text-[13px] font-bold ${pastilleDe(v.rang)}`}>
                  {v.prenom.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <b className="titre block text-[22px] font-semibold leading-none tracking-[-0.02em]">
                    {montant(v.cents)}
                  </b>
                  <span className="mt-0.5 block truncate text-[13px] text-doux">{v.prenom}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-2.5 border-t border-brume pt-3.5">
          <ChampMontant label="Verser (€)" grand placeholder="0" value={saisi}
                        onChange={e => { setSaisi(e.target.value); setRefus(null) }} />
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" disabled={!cents || verse.isPending}
                    onClick={() => verse.mutate(
                      { foyerId, pocheId: poche.id, userId, cents: cents! },
                      { onSuccess: () => setSaisi('') })}
                    /* Désactivé, il gardait un fond plein qui le faisait passer pour actif. La bordure et
                       le fond effacé disent mieux « pas encore » qu'un aplat plus pâle. */
                    className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl
                               bg-herbe text-[16px] font-semibold text-fond
                               disabled:bg-transparent disabled:text-doux
                               disabled:shadow-[inset_0_0_0_1.5px_var(--color-brume)]">
              <Verser />Je verse
            </button>
            <button type="button" disabled={!cents || verse.isPending || !soldeFrais}
                    onClick={() => {
                      /* Jamais plus que ce qu'on a versé : la table n'a aucun plancher. */
                      const non = refusDuRetrait(cents!, monSolde)
                      if (non) { setRefus(non); return }
                      if (!confirm(`Retirer ${montant(cents!)} de « ${poche.libelle} » ?`)) return
                      verse.mutate({ foyerId, pocheId: poche.id, userId, cents: -cents!,
                                     motif: 'retrait' },
                                   { onSuccess: () => setSaisi('') })
                    }}
                    /* `opacity-60` sur du `doux` tombait à 2,42:1 : un bouton désactivé doit se lire, sinon
                       on ne sait pas ce qu'on ne peut pas faire. Il reste distinct par sa couleur. */
                    className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl
                               bg-surface text-[16px] font-semibold text-herbe
                               shadow-[inset_0_0_0_1.5px_var(--color-herbe)]
                               disabled:text-doux disabled:shadow-[inset_0_0_0_1.5px_var(--color-brume)]">
              <Retirer />Je retire
            </button>
          </div>
          {refus && <p role="alert" className="text-[14px] font-semibold text-ocre">{refus}</p>}
          <Erreur de={verse.error ?? solde.error} />
        </div>

        {poche.genre === 'projet' && (
          <Projet poche={poche} foyerId={foyerId} deja={lu} />
        )}
      </div>
    </section>
  )
}
