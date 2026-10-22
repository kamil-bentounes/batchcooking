/**
 * Ce qu'une étape de la clôture dit quand elle n'a pas encore de quoi compter.
 * Jamais un chiffre : « Tout est validé » pendant la lecture des factures, ou
 * « Rien de déclaré » sur chaque ligne avant celle des saisies, sont de faux
 * constats, pires qu'un « Un instant… » (voir `ecran.ts`).
 */
import { messageDeLecture } from '../../lib/budget/ecran.ts'

export function LectureDeLEtape({ etat, panne }: { etat: 'chargement' | 'erreur'; panne?: unknown }) {
  if (etat === 'erreur') {
    return <p role="alert" className="mt-3 text-[15px] text-groseille">{messageDeLecture(panne)}</p>
  }
  return <p role="status" className="mt-3 text-[15px] text-doux">Un instant…</p>
}
