/**
 * La feuille « Facture du mois » (§ 3.3) : le montant habituel compte. On le
 * valide d'un geste (« C'est ça »), ou on le corrige. 0 € s'accepte : c'est ainsi
 * qu'un avoir se saisit (§ 10), sans quoi l'électricité prévue à 50 € et
 * remboursée de 50 € compterait ses 50 €.
 *
 * Aucune phrase de confirmation ne reste sur l'écran du mois (D79) : la ligne
 * affiche le bon chiffre, c'est tout.
 *
 * « C'est ça » confirme le montant que la feuille AFFICHE (`montantPropose`),
 * pas un autre champ de la ligne : sinon le bouton pouvait valider un chiffre
 * que personne n'avait lu.
 *
 * `VueFactureMois` est le dessin, sans état ni réseau : c'est elle que le banc
 * rend en chaîne.
 */
import { useState, type ReactNode } from 'react'
import { useConfirmeFacture, type Depense } from '../../lib/donnees/budget.ts'
import { montant } from '../../lib/budget/mois.ts'
import { envoiPermis, lisLeMontant, montantPropose, saisiDe, type MontantTape }
  from '../../lib/budget/feuilles.ts'
import { Erreur } from '../coque.tsx'
import { Feuille } from './Feuille.tsx'
import { Croix } from './icones.tsx'
import { Photo } from './Photo.tsx'

export function VueFactureMois({
  ligne, categorie, clos = null, modifie, saisi, montantTape, enCours, erreur,
  cestca, modifier, tape, valider, fermer,
}: {
  ligne: Depense; categorie: string
  /** Lot 3 : sur un mois clôturé, lecture seule. */
  clos?: ReactNode
  modifie: boolean; saisi: string; montantTape: MontantTape
  /** Un envoi est en vol : les boutons s'éteignent, un second toucher n'en lance pas un autre. */
  enCours: boolean
  erreur: unknown
  cestca: () => void; modifier: () => void; tape: (v: string) => void; valider: () => void
  fermer: () => void
}) {
  const validee = ligne.confirme_le !== null

  return (
    <Feuille fermer={fermer} titre={ligne.libelle}>
      <div className="flex items-center gap-3">
        <Photo categorie={categorie} taille={52} />
        <h2 className="titre grow text-[28px] leading-tight">{ligne.libelle}</h2>
        <button onClick={fermer} aria-label="Fermer"
                className="w-11 h-11 shrink-0 rounded-full bg-piste grid place-items-center"><Croix /></button>
      </div>

      <p className="mt-5 text-[17px]">
        {validee ? `Le montant retenu : ${montant(ligne.montant_cents)}`
                 : `Le montant habituel : ${montant(montantPropose(ligne))}`}
      </p>

      {clos ?? (!modifie ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {!validee && (
            <button onClick={cestca} disabled={enCours}
                    className="h-[52px] rounded-[16px] bg-herbe text-fond text-[16px] font-semibold
                               disabled:opacity-50">
              C’est ça
            </button>
          )}
          <button onClick={modifier} disabled={enCours}
                  className={`h-[52px] rounded-[16px] border border-brume bg-surface text-[16px] font-semibold
                              disabled:opacity-50 ${validee ? 'col-span-2' : ''}`}>
            Modifier
          </button>
        </div>
      ) : (
        <>
          <label className="mt-4 block">
            <span className="text-[15px] text-doux">Le montant de la facture</span>
            <span className="mt-1.5 flex items-center rounded-[18px] border-2 border-herbe bg-surface px-4">
              <input value={saisi} onChange={e => tape(e.target.value)} inputMode="decimal" autoFocus
                     aria-label="Le montant de la facture"
                     className="chiffre grow min-w-0 bg-transparent py-3 text-[32px] outline-none" />
              <span aria-hidden="true" className="chiffre text-[28px] text-doux">€</span>
            </span>
          </label>
          {montantTape.refus && (
            <p role="alert" className="mt-1.5 text-[14px]" style={{ color: 'var(--color-ocre)' }}>
              {montantTape.refus}
            </p>
          )}
          <button disabled={!envoiPermis({ valide: montantTape.valide, enCours })} onClick={valider}
                  className="mt-4 w-full h-[56px] rounded-[18px] bg-safran text-encre text-[17px] font-semibold
                             disabled:opacity-50">
            {montantTape.valide ? `Valider ${montant(montantTape.cents)}` : 'Valider'}
          </button>
        </>
      ))}
      <Erreur de={erreur} />
    </Feuille>
  )
}

export function FeuilleFactureMois({ ligne, categorie, fermer, clos = null }: {
  ligne: Depense; categorie: string; fermer: () => void
  /** Lot 3 : sur un mois clôturé, lecture seule. */
  clos?: ReactNode
}) {
  const confirme = useConfirmeFacture()
  const [modifie, setModifie] = useState(false)
  const [saisi, setSaisi] = useState('')
  /* 0 € passe : un avoir. Plus de 1 000 000 €, non : la borne de la base. */
  const m = lisLeMontant(saisi, { zeroOk: true })

  return (
    <VueFactureMois ligne={ligne} categorie={categorie} clos={clos} modifie={modifie}
                    saisi={saisi} montantTape={m} enCours={confirme.isPending} erreur={confirme.error}
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
                    }}
                    fermer={fermer} />
  )
}
