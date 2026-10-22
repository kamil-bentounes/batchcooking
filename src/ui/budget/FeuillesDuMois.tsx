/**
 * Ce qui s'ouvre par-dessus le mois : le choix de la ligne, puis la feuille de la ligne.
 *
 * C'est ici qu'on décide ce qu'un mois CLÔTURÉ permet (3.7) : rien d'écrit. Sans cela,
 * l'écran ne passait pas `clos` aux feuilles, et on pouvait saisir une dépense, valider
 * une facture, sur un mois que la base refuse de toucher. Une feuille déjà ouverte au
 * moment où le mois se clôture se met en lecture seule au rendu suivant.
 *
 * La facture mise de côté reste la même (§ 3.4) : elle se saisit au présent, son
 * ajustement tombe sur le mois en cours, qui n'est jamais clôturé (D78) — elle
 * n'écrit rien dans le mois affiché.
 */
import type { Charge, Depense, Saisie } from '../../lib/donnees/budget.ts'
import type { EtatDeLEcran } from '../../lib/budget/ecran.ts'
import { ChoixDeLaLigne } from './ChoixDeLaLigne.tsx'
import { FeuilleDeclarer } from './FeuilleDeclarer.tsx'
import { FeuilleFactureMois } from './FeuilleFactureMois.tsx'
import { FeuilleMiseDeCote } from './FeuilleMiseDeCote.tsx'
import type { Geste } from './Ligne.tsx'
import { MoisClos } from './MoisClos.tsx'

/** Ce qui est ouvert par-dessus l'écran. On garde l'IDENTIFIANT de la ligne, pas
    la ligne : une copie restait figée après « C'est ça », et la feuille
    continuait d'annoncer le montant habituel pendant que la base avait validé. */
export type Ouverte = { geste: Geste; id: string } | { geste: 'choix' } | null

type Membre = { id: string; display_name: string | null }

export function FeuillesDuMois({ ouverte, clos, misDeCote, etat, lignes, auFil, saisies, charges,
                                 mois, moi, foyerId, membres, fermer, choisir }: {
  ouverte: Ouverte; clos: boolean; misDeCote: number; etat: EtatDeLEcran
  lignes: Depense[]; auFil: Depense[]; saisies: Saisie[]; charges: Map<string, Charge>
  mois: string; moi: string; foyerId: string; membres: Membre[]
  fermer: () => void; choisir: (l: Depense) => void
}) {
  const choisie = ouverte && 'id' in ouverte ? lignes.find(l => l.id === ouverte.id) : undefined
  const categorieDe = (l: Depense) =>
    (l.charge_id && charges.get(l.charge_id)?.categorie) || 'autre'
  /* Posée une fois : une feuille qui se lit seulement dit pourquoi, au lieu de se vider. */
  const lecture = clos ? <MoisClos mois={mois} misDeCote={misDeCote} /> : null
  return (
    <>
      {/* Pas de choix sur un mois clôturé : il mènerait à une feuille où rien ne se saisit. */}
      {ouverte?.geste === 'choix' && !clos && (
        <ChoixDeLaLigne etat={etat} lignes={auFil} saisies={saisies} fermer={fermer}
                        choisir={choisir} />
      )}
      {choisie && ouverte?.geste === 'declarer' && (
        <FeuilleDeclarer ligne={choisie} categorie={categorieDe(choisie)} mois={mois} moi={moi}
                         foyerId={foyerId} saisies={saisies} membres={membres} fermer={fermer}
                         clos={lecture} />
      )}
      {choisie && ouverte?.geste === 'facture' && (
        <FeuilleFactureMois ligne={choisie} categorie={categorieDe(choisie)} fermer={fermer}
                            clos={lecture} />
      )}
      {choisie && ouverte?.geste === 'mise' && choisie.charge_id && charges.has(choisie.charge_id) && (
        <FeuilleMiseDeCote charge={charges.get(choisie.charge_id)!} fermer={fermer} />
      )}
    </>
  )
}
