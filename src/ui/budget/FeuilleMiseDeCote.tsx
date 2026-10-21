/**
 * La feuille « Facture mise de côté » (§ 3.4).
 *
 * Une facture se saisit toujours au présent : la feuille est la même sur un mois
 * clôturé, et son ajustement tombe sur le mois en cours, qui n'est jamais
 * clôturé (D78). L'année d'une facture est celle de sa date de paiement.
 *
 * Un relevé ne se retire pas, il se corrige : retirer celui de la taxe foncière
 * rouvrait l'année sur les seuls mois suivis, et le ressaisir ajoutait
 * 966,68 € à octobre.
 *
 * La feuille lit `etat_de_l_annee` et applique la formule du § 4.4 au montant tapé
 * (`apercuFacture`) ; elle ne recompte rien elle-même.
 *
 * `VueMiseDeCote` est le dessin, sans état ni réseau : c'est elle que le banc rend
 * en chaîne.
 */
import { useRef, useState } from 'react'
import {
  moisDe, useCorrigeLeReleve, useEtatDeLAnnee, useFactures, usePaieFacture, useRetireFacture,
  type Charge, type EtatAnnee, type Facture,
} from '../../lib/donnees/budget.ts'
import { aujourdhui } from '../../lib/horloge.ts'
import { dateCourte, montant, nomDuMois } from '../../lib/budget/mois.ts'
import {
  apercuFacture, apercuReleve, depuisLe, envoiPermis, envoiPour, jourAccepte, lisLeMontant,
  plancherDuJour, provisionParMois, questionDeRetrait, saisiDe, type Envoi, type MontantTape,
} from '../../lib/budget/feuilles.ts'
import { Erreur } from '../coque.tsx'
import { Feuille } from './Feuille.tsx'
import { Corbeille, Croix, Info } from './icones.tsx'
import { Photo } from './Photo.tsx'

/** Le relevé en cours de correction : son identifiant, l'ancien total, ce qu'on tape. */
export type Correction = { id: string; ancien: number; saisi: string }

export function VueMiseDeCote({
  charge, jour, moisEnCours, annee, etat, factures, erreur,
  payeLe, autre, plancher, jourOk, saisi, montantTape, correction, occupe,
  tape, aujourdhuiChoisi, autreJour, ecrisLeJour, paie, retirer, debuteCorrection,
  tapeCorrection, corrige, fermer,
}: {
  charge: Charge
  /** Aujourd'hui, « 2026-10-21 » : la borne haute d'« Autre jour ». */
  jour: string
  /** Le nom du mois en cours (« octobre ») : c'est là que tombe l'ajustement. */
  moisEnCours: string
  annee: number
  /** `undefined` tant que la base n'a pas répondu : on n'invente aucun chiffre. */
  etat: EtatAnnee | undefined
  factures: Facture[]
  erreur: unknown
  payeLe: string; autre: boolean; plancher: string; jourOk: boolean
  saisi: string; montantTape: MontantTape
  correction: Correction | null
  /** Ce qui est en vol : un second toucher ne lance pas un second envoi. */
  occupe: { paie: boolean; retrait: boolean; correction: boolean }
  tape: (v: string) => void; aujourdhuiChoisi: () => void; autreJour: () => void
  ecrisLeJour: (date: string) => void; paie: () => void
  retirer: (f: Facture) => void; debuteCorrection: (f: Facture) => void
  tapeCorrection: (v: string) => void; corrige: () => void
  fermer: () => void
}) {
  const e = etat
  const premier = e?.premier_mois_suivi ?? null
  const nouveau = montantTape
  const releve = correction ? lisLeMontant(correction.saisi, { zeroOk: true }) : null

  return (
    <Feuille fermer={fermer} titre={charge.libelle}>
      <div className="flex items-center gap-3">
        <Photo categorie={charge.categorie} taille={52} />
        <div className="grow min-w-0">
          <h2 className="titre text-[28px] leading-tight truncate">{charge.libelle}</h2>
          <p className="text-[14px] text-doux">{montant(provisionParMois(charge))} mis de côté chaque mois</p>
        </div>
        <button onClick={fermer} aria-label="Fermer"
                className="w-11 h-11 shrink-0 rounded-full bg-piste grid place-items-center"><Croix /></button>
      </div>

      <div className="mt-4 rounded-[22px] bg-surface shadow-carte px-4 divide-y divide-brume">
        {e?.soldee && <p className="py-3 text-[15px] font-semibold">{annee} est soldée.</p>}
        <p className="py-3 flex items-baseline justify-between gap-3 text-[15px]">
          {/* « Prévu pour 2026, depuis septembre » : Popote n'a pas suivi toute l'année (D77). */}
          <span>Prévu pour {annee}{depuisLe(premier, annee)}</span>
          <span className="font-semibold tabular-nums">{e ? montant(e.pl) : '…'}</span>
        </p>
        <p className="py-3 flex items-baseline justify-between gap-3 text-[15px]">
          <span>Factures payées en {annee}</span>
          <span className="font-semibold tabular-nums">{e ? montant(e.b) : '…'}</span>
        </p>
        {factures.length === 0 ? (
          <p className="py-3 text-[14px] text-doux">Aucune facture cette année pour l’instant.</p>
        ) : factures.map(f => f.origine === 'releve' ? (
          <div key={f.id} className="py-3">
            <p className="flex items-baseline justify-between gap-3 text-[15px]">
              <span>Relevé {f.annee} — total de l’année</span>
              <span className="tabular-nums">{montant(f.montant_cents)}</span>
            </p>
            {correction?.id === f.id && releve ? (
              <div className="mt-2 space-y-2">
                <input value={correction.saisi} inputMode="decimal" aria-label="Le montant du relevé"
                       onChange={ev => tapeCorrection(ev.target.value)}
                       className="w-full min-h-11 rounded-[14px] border border-brume bg-fond px-3 text-[16px]" />
                {releve.refus && (
                  <p role="alert" className="text-[14px]" style={{ color: 'var(--color-ocre)' }}>{releve.refus}</p>
                )}
                {releve.valide && (
                  <p className="text-[14px]">{apercuReleve(correction.ancien, releve.cents, moisEnCours)}</p>
                )}
                <button disabled={!envoiPermis({ valide: releve.valide, enCours: occupe.correction })}
                        onClick={corrige}
                        className="min-h-11 px-4 rounded-[14px] bg-herbe text-fond text-[15px] font-semibold
                                   disabled:opacity-50">
                  Corriger le relevé
                </button>
              </div>
            ) : (
              <button onClick={() => debuteCorrection(f)}
                      className="mt-1 min-h-11 text-[14px] text-herbe">Corriger le montant</button>
            )}
          </div>
        ) : (
          <p key={f.id} className="py-1 flex items-center gap-3 text-[15px] min-h-11">
            <span className="grow">{dateCourte(f.paye_le)}</span>
            <span className="tabular-nums">{montant(f.montant_cents)}</span>
            <button aria-label={`Retirer la facture de ${montant(f.montant_cents)}`}
                    disabled={occupe.retrait} onClick={() => retirer(f)}
                    className="w-11 h-11 grid place-items-center text-doux disabled:opacity-50"><Corbeille /></button>
          </p>
        ))}
      </div>

      <label className="mt-5 block">
        <span className="text-[15px] text-doux">Montant de la facture</span>
        <span className="mt-1.5 flex items-center rounded-[18px] border-2 border-herbe bg-surface px-4">
          <input value={saisi} onChange={ev => tape(ev.target.value)} inputMode="decimal"
                 aria-label="Montant de la facture"
                 className="chiffre grow min-w-0 bg-transparent py-3 text-[32px] outline-none" />
          <span aria-hidden="true" className="chiffre text-[28px] text-doux">€</span>
        </span>
      </label>
      {nouveau.refus && (
        <p role="alert" className="mt-1.5 text-[14px]" style={{ color: 'var(--color-ocre)' }}>{nouveau.refus}</p>
      )}

      <p className="mt-3 text-[15px] text-doux">Payée</p>
      <div role="radiogroup" aria-label="Payée" className="mt-1.5 flex flex-wrap gap-2">
        <button role="radio" aria-checked={!autre} onClick={aujourdhuiChoisi}
                className={`min-h-11 px-4 rounded-full text-[15px] ${!autre ? 'bg-encre text-fond' : 'bg-piste'}`}>
          Aujourd’hui
        </button>
        <button role="radio" aria-checked={autre} onClick={autreJour}
                className={`min-h-11 px-4 rounded-full text-[15px] ${autre ? 'bg-encre text-fond' : 'bg-piste'}`}>
          Autre jour
        </button>
      </div>
      {autre && (
        <input type="date" value={payeLe} min={plancher} max={jour} aria-label="Payée le"
               onChange={ev => ev.target.value && ecrisLeJour(ev.target.value)}
               className="mt-3 min-h-11 rounded-[14px] border border-brume bg-surface px-3 text-[16px]" />
      )}
      {/* `min` et `max` n'empêchent pas la frappe : on le dit, et le bouton reste éteint. */}
      {autre && !jourOk && (
        <p role="alert" className="mt-1.5 text-[14px]" style={{ color: 'var(--color-ocre)' }}>
          Un jour entre le {dateCourte(plancher)} et le {dateCourte(jour)}.
        </p>
      )}

      {e && nouveau.valide && jourOk && (
        <p className="mt-4 rounded-[16px] bg-sable p-3.5 flex gap-2.5 text-[15px] leading-snug">
          <span style={{ color: 'var(--color-ocre)' }}><Info /></span>
          <span>{apercuFacture(e, annee, nouveau.cents, moisEnCours)}</span>
        </p>
      )}

      <button disabled={!envoiPermis({ valide: nouveau.valide, enCours: occupe.paie, jourOk })}
              onClick={paie}
              className="mt-4 w-full h-[56px] rounded-[18px] bg-safran text-encre text-[17px] font-semibold
                         disabled:opacity-50">
        Ajouter la facture
      </button>
      <Erreur de={erreur} />
    </Feuille>
  )
}

export function FeuilleMiseDeCote({ charge, fermer }: { charge: Charge; fermer: () => void }) {
  const jour = aujourdhui()
  const moisEnCours = nomDuMois(moisDe())
  const [payeLe, setPayeLe] = useState(jour)
  const [autre, setAutre] = useState(false)
  const [saisi, setSaisi] = useState('')
  const [correction, setCorrection] = useState<Correction | null>(null)
  /* Une référence, pas un état : un second toucher qui arrive avant le rendu doit
     déjà retrouver l'identifiant du premier. Il en prend un neuf dès que l'envoi
     porte autre chose (autre montant, autre jour), et l'oublie après un succès. */
  const envoi = useRef<Envoi | null>(null)
  const annee = Number(payeLe.slice(0, 4))
  const etat = useEtatDeLAnnee(charge.id, annee)
  const factures = useFactures(charge.id, annee)
  const paie = usePaieFacture()
  const retire = useRetireFacture()
  const corrige = useCorrigeLeReleve()
  /* Une facture se saisit entre 0,01 € et 1 000 000 € : 0 € n'est pas une facture. */
  const m = lisLeMontant(saisi, { zeroOk: false })
  const plancher = plancherDuJour(jour, etat.data?.premier_mois_suivi ?? null)
  const jourOk = jourAccepte(payeLe, plancher, jour)

  return (
    <VueMiseDeCote
      charge={charge} jour={jour} moisEnCours={moisEnCours} annee={annee} etat={etat.data}
      factures={factures.data ?? []}
      erreur={paie.error ?? retire.error ?? corrige.error ?? etat.error}
      payeLe={payeLe} autre={autre} plancher={plancher} jourOk={jourOk}
      saisi={saisi} montantTape={m} correction={correction}
      occupe={{ paie: paie.isPending, retrait: retire.isPending, correction: corrige.isPending }}
      tape={setSaisi}
      aujourdhuiChoisi={() => { setAutre(false); setPayeLe(jour) }}
      autreJour={() => setAutre(true)} ecrisLeJour={setPayeLe}
      paie={() => {
        if (!m.valide || !envoiPermis({ valide: true, enCours: paie.isPending, jourOk })) return
        envoi.current = envoiPour(envoi.current, [charge.id, m.cents, payeLe].join('|'),
                                  () => crypto.randomUUID())
        paie.mutate({ id: envoi.current.id, chargeId: charge.id, cents: m.cents, payeLe },
                    { onSuccess: () => { setSaisi(''); envoi.current = null } })
      }}
      retirer={f => {
        if (retire.isPending) return
        if (!confirm(questionDeRetrait(f.montant_cents, f.paye_le, moisEnCours))) return
        retire.mutate(f.id)
      }}
      debuteCorrection={f => setCorrection({ id: f.id, ancien: f.montant_cents,
                                             saisi: saisiDe(f.montant_cents) })}
      tapeCorrection={v => setCorrection(c => c && { ...c, saisi: v })}
      corrige={() => {
        const r = correction && lisLeMontant(correction.saisi, { zeroOk: true })
        if (!correction || !r?.valide || corrige.isPending) return
        corrige.mutate({ id: correction.id, cents: r.cents }, { onSuccess: () => setCorrection(null) })
      }}
      fermer={fermer} />
  )
}
