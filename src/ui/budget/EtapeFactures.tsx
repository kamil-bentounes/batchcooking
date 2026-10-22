/**
 * Étape 1 de la clôture (§ 3.5) : les factures du mois non validées. « C'est
 * ça » et « Modifier » valident tout de suite, comme dans la feuille (§ 3.3).
 * Une facture laissée sans réponse est confirmée à son montant actuel par la
 * clôture : elle ne bloque jamais.
 *
 * `lignes` à `undefined` : le mois n'est pas encore lu. On ne dit alors ni
 * « Tout est validé » ni rien d'autre qu'« Un instant… » : ce serait un faux constat.
 */
import { useState } from 'react'
import { useConfirmeFacture, type Depense } from '../../lib/donnees/budget.ts'
import { lisLeMontant, montantPropose, saisiDe } from '../../lib/budget/feuilles.ts'
import { LectureDeLEtape } from './LectureDeLEtape.tsx'
import { VueUneFacture } from './VueFacture.tsx'

function UneFacture({ ligne }: { ligne: Depense }) {
  const confirme = useConfirmeFacture()
  const [modifie, setModifie] = useState(false)
  const [saisi, setSaisi] = useState('')
  /* 0 € passe : un avoir (§ 10). Plus de 1 000 000 €, non : la borne de la base. */
  const m = lisLeMontant(saisi, { zeroOk: true })
  return (
    <VueUneFacture ligne={ligne} modifie={modifie} saisi={saisi} montantTape={m}
                   enCours={confirme.isPending} erreur={confirme.error}
                   cestca={() => {
                     if (confirme.isPending) return
                     confirme.mutate({ depenseId: ligne.id, cents: montantPropose(ligne) })
                   }}
                   modifier={() => { setModifie(true); setSaisi(saisiDe(montantPropose(ligne))) }}
                   tape={setSaisi}
                   valider={() => {
                     if (!m.valide || confirme.isPending) return
                     confirme.mutate({ depenseId: ligne.id, cents: m.cents },
                                     { onSuccess: () => setModifie(false) })
                   }} />
  )
}

export function EtapeFactures({ lignes, panne }: { lignes: Depense[] | undefined; panne?: unknown }) {
  if (lignes === undefined) {
    return <LectureDeLEtape etat={panne ? 'erreur' : 'chargement'} panne={panne} />
  }
  const aValider = lignes.filter(l => l.facon === 'facture' && l.confirme_le === null)
  if (aValider.length === 0) return <p className="mt-3 text-[15px] text-doux">Tout est validé.</p>
  return (
    <>
      <p className="mt-1 text-[15px] text-doux">
        Le montant habituel est déjà là. Corrige-le seulement s’il a changé.
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {aValider.map(l => <UneFacture key={l.id} ligne={l} />)}
      </ul>
    </>
  )
}
