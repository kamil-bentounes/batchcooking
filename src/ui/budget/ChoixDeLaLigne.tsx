/**
 * « Déclarer », depuis les gestes du mois (§ 3.1, point 3) : d'abord la ligne au
 * fil du mois, puis sa feuille (choix 5). Sortie de l'écran pour se rendre en
 * chaîne dans les bancs.
 *
 * Elle ne dit « Aucune ligne… » que quand les lignes sont LUES : le geste est
 * visible dès l'en-tête, et touché avant la réponse de la base il annonçait à
 * tort qu'aucune ligne ne se dépense au fil du mois.
 */
import type { Depense, Saisie } from '../../lib/donnees/budget.ts'
import type { EtatDeLEcran } from '../../lib/budget/ecran.ts'
import { declare, montant, prevu } from '../../lib/budget/mois.ts'
import { Feuille } from './Feuille.tsx'
import { Croix } from './icones.tsx'

export function ChoixDeLaLigne({ etat, lignes, saisies, choisir, fermer }: {
  etat: EtatDeLEcran; lignes: Depense[]; saisies: Saisie[]
  choisir: (l: Depense) => void; fermer: () => void
}) {
  return (
    <Feuille fermer={fermer} titre="Déclarer une dépense">
      <div className="flex items-center justify-between gap-3">
        <h2 className="titre text-[28px]">Déclarer</h2>
        <button onClick={fermer} aria-label="Fermer"
                className="w-11 h-11 shrink-0 rounded-full bg-piste grid place-items-center"><Croix /></button>
      </div>
      {etat === 'chargement' ? (
        <p className="mt-3 text-[15px] text-doux">Un instant…</p>
      ) : etat === 'erreur' ? (
        <p className="mt-3 text-[15px] leading-snug text-doux">
          Je n’ai pas pu lire les lignes du mois. Ferme cette feuille et réessaie.
        </p>
      ) : lignes.length === 0 ? (
        <p className="mt-3 text-[15px] leading-snug text-doux">
          Aucune ligne ne se dépense au fil du mois. Dans « Mes charges », choisis « Plusieurs
          dépenses dans le mois ».
        </p>
      ) : (
        <>
          <p className="mt-1 text-[15px] text-doux">Pour quelle ligne ?</p>
          <ul className="mt-3 rounded-[22px] bg-surface shadow-carte px-4 divide-y divide-brume">
            {lignes.map(l => (
              <li key={l.id}>
                <button onClick={() => choisir(l)}
                        className="w-full min-h-11 py-3 flex items-baseline justify-between gap-3 text-left">
                  <span className="text-[16px] font-medium">{l.libelle}</span>
                  <span className="text-[14px] text-doux tabular-nums whitespace-nowrap">
                    {montant(declare(l, saisies))} sur {montant(prevu(l))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Feuille>
  )
}
