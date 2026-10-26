/**
 * Ce que fait la fonction `rappels` à chaque passage, sans rien savoir de Deno ni de Gmail : on lui passe de quoi
 * lire ce qui est dû, réserver, libérer et envoyer.
 *
 * L'ordre est la sécurité :
 *   1. RÉSERVER d'abord. L'insertion unique de `rappel_envoye` fait office de verrou : deux passages en même temps,
 *      un seul réserve, l'autre passe son tour. Mieux vaut un mail perdu qu'un mail en double.
 *   2. Construire et envoyer.
 *   3. Si l'envoi échoue (ou si le gabarit lève), LIBÉRER : l'heure suivante réessaie.
 * Un rappel qui échoue ne bloque pas les autres.
 */
import { construis } from './mails.ts'
import { estUnType } from './types.ts'
import type { Mail, RappelDu } from './types.ts'

export type Dependances = {
  dus: () => Promise<RappelDu[]>
  reserve: (r: RappelDu) => Promise<boolean>
  libere: (r: RappelDu) => Promise<void>
  envoie: (m: Mail & { a: string }) => Promise<void>
  maintenant: () => Date
  base: string
  /** Un journal SANS adresse ni contenu : un type, un résultat. */
  journal?: (ligne: string) => void
}

export type Bilan = {
  envoyes: number
  /** Déjà réservés par un autre passage, ou d'un type que cette version ne connaît pas. */
  ignores: number
  echecs: number
}

/** Au plus : un passage qui en trouverait davantage est suspect (une boucle, une base mal lue). */
export const MAXIMUM_PAR_PASSAGE = 100

export async function envoieLesRappels(dep: Dependances): Promise<Bilan> {
  const bilan: Bilan = { envoyes: 0, ignores: 0, echecs: 0 }
  const log = dep.journal ?? (() => {})
  const dus = (await dep.dus()).slice(0, MAXIMUM_PAR_PASSAGE)

  for (const r of dus) {
    if (!estUnType(r.type)) { bilan.ignores++; log(`type inconnu : ${r.type}`); continue }
    if (!(await dep.reserve(r))) { bilan.ignores++; log(`${r.type} : déjà réservé`); continue }
    try {
      const mail = construis(r.type, r.donnees, { base: dep.base, maintenant: dep.maintenant(), prenom: r.prenom })
      await dep.envoie({ ...mail, a: r.email })
      bilan.envoyes++
      log(`${r.type} : envoyé`)
    } catch (e) {
      bilan.echecs++
      log(`${r.type} : échec (${e instanceof Error ? e.name : 'erreur'})`)
      try { await dep.libere(r) } catch { log(`${r.type} : la réservation n’a pas pu être rendue`) }
    }
  }
  return bilan
}
