/**
 * Une facture du mois non validée, à l'étape 1 de la clôture : le dessin, sans
 * état ni réseau — c'est lui que le banc rend en chaîne.
 *
 * Le montant montré est celui que « C'est ça » valide (`montantPropose`), comme dans
 * la feuille « Facture du mois » : sans cela, le bouton pouvait valider un chiffre
 * que personne n'avait lu.
 */
import type { Depense } from '../../lib/donnees/budget.ts'
import { montant } from '../../lib/budget/mois.ts'
import { envoiPermis, montantPropose, type MontantTape } from '../../lib/budget/feuilles.ts'
import { Erreur } from '../coque.tsx'

export function VueUneFacture({
  ligne, modifie, saisi, montantTape, enCours, erreur, cestca, modifier, tape, valider,
}: {
  ligne: Depense
  modifie: boolean; saisi: string; montantTape: MontantTape
  /** Un envoi est en vol : les boutons s'éteignent, un second toucher n'en lance pas un autre. */
  enCours: boolean
  erreur: unknown
  cestca: () => void; modifier: () => void; tape: (v: string) => void; valider: () => void
}) {
  return (
    <li className="rounded-[22px] bg-surface shadow-carte p-4">
      <p className="flex items-baseline justify-between gap-3">
        <span className="text-[16px] font-semibold">{ligne.libelle}</span>
        <span className="chiffre text-[22px] tabular-nums">{montant(montantPropose(ligne))}</span>
      </p>
      {!modifie ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={cestca} disabled={enCours} aria-label={`C’est ça, ${ligne.libelle}`}
                  className="min-h-11 rounded-[14px] bg-herbe text-fond text-[15px] font-semibold
                             disabled:opacity-50">
            C’est ça
          </button>
          <button onClick={modifier} disabled={enCours} aria-label={`Modifier ${ligne.libelle}`}
                  className="min-h-11 rounded-[14px] border border-brume text-[15px] font-semibold
                             disabled:opacity-50">
            Modifier
          </button>
        </div>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <input value={saisi} onChange={e => tape(e.target.value)} inputMode="decimal" autoFocus
                   aria-label={`Le montant de ${ligne.libelle}`}
                   className="grow min-w-0 min-h-11 rounded-[14px] border-2 border-herbe
                              bg-surface px-3 text-[17px]" />
            <button disabled={!envoiPermis({ valide: montantTape.valide, enCours })} onClick={valider}
                    className="shrink-0 min-h-11 px-4 rounded-[14px] bg-safran text-encre text-[15px]
                               font-semibold disabled:opacity-50">
              {montantTape.valide ? `Valider ${montant(montantTape.cents)}` : 'Valider'}
            </button>
          </div>
          {montantTape.refus && (
            <p role="alert" className="mt-1.5 text-[14px]" style={{ color: 'var(--color-ocre)' }}>
              {montantTape.refus}
            </p>
          )}
        </>
      )}
      <Erreur de={erreur} />
    </li>
  )
}
