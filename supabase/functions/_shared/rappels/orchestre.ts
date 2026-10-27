/**
 * Ce que fait la fonction `rappels` à chaque passage, sans rien savoir de Deno ni de Gmail : on lui passe de quoi
 * lire ce qui est dû, réserver, libérer et envoyer.
 *
 * L'ordre est la sécurité :
 *   1. RÉSERVER d'abord. L'insertion unique de `rappel_envoye` fait office de verrou : deux passages en même temps,
 *      un seul réserve, l'autre passe son tour. Mieux vaut un mail perdu qu'un mail en double.
 *   2. Construire et envoyer.
 *   3. LIBÉRER seulement si le mail n'est SÛREMENT pas parti : le gabarit a levé, ou l'envoi a échoué avant les
 *      données (connexion, authentification : `avantLesDonnees`). Après `DATA`, ou dans le doute, la réservation reste.
 * Tout ce qui touche un rappel (réserver, construire, envoyer, libérer) est dans un `try` : un rappel qui échoue ne
 * bloque pas les autres. Une passe a un budget de temps : au-delà, on s'arrête, et les rappels restants (pas encore
 * réservés) partent à la passe suivante.
 */
import { construis } from './mails.ts'
import { avantLesDonnees } from './smtp.ts'
import { estUnType } from './types.ts'
import type { Mail, RappelDu } from './types.ts'

export type Dependances = {
  dus: () => Promise<RappelDu[]>
  reserve: (r: RappelDu) => Promise<boolean>
  libere: (r: RappelDu) => Promise<void>
  envoie: (m: Mail & { a: string }) => Promise<void>
  /** Le transport est-il prêt (connexion, authentification) ? Appelé UNE fois, avant de réserver quoi que ce soit. */
  pret?: () => Promise<void>
  maintenant: () => Date
  base: string
  /** Au-delà, la passe s'arrête. Par défaut `BUDGET_MS`. */
  budgetMs?: number
  /** Un journal SANS adresse ni contenu : un type, un résultat. */
  journal?: (ligne: string) => void
}

export type Bilan = {
  /** Ce que la base a rendu (au plus `MAXIMUM_PAR_PASSAGE`). */
  dus: number
  envoyes: number
  /** Déjà réservés par un autre passage, ou d'un type que cette version ne connaît pas. */
  ignores: number
  echecs: number
  /** Pas traités faute de temps : ils partiront à la passe suivante. */
  reportes: number
}

/** Au plus : un passage qui en trouverait davantage est suspect (une boucle, une base mal lue). */
export const MAXIMUM_PAR_PASSAGE = 100
/** Le temps d'une passe : `pg_net` attend 60 s, et chaque envoi peut en prendre une vingtaine. */
export const BUDGET_MS = 20_000

export async function envoieLesRappels(dep: Dependances): Promise<Bilan> {
  const log = dep.journal ?? (() => {})
  const dus = (await dep.dus()).slice(0, MAXIMUM_PAR_PASSAGE)
  const bilan: Bilan = { dus: dus.length, envoyes: 0, ignores: 0, echecs: 0, reportes: 0 }
  if (dus.length === 0) return bilan

  /* Le transport d'abord : s'il est en panne, rien n'est réservé, rien n'est à rendre. */
  if (dep.pret) {
    try { await dep.pret() } catch (e) {
      bilan.echecs = dus.length
      log(`transport indisponible (${nomDe(e)}) : rien n’est réservé, ${dus.length} reporté(s)`)
      return bilan
    }
  }

  const debut = dep.maintenant().getTime()
  const budget = dep.budgetMs ?? BUDGET_MS

  for (const [i, r] of dus.entries()) {
    if (dep.maintenant().getTime() - debut > budget) {
      bilan.reportes = dus.length - i
      log(`temps écoulé : ${bilan.reportes} rappel(s) partiront à la passe suivante`)
      break
    }
    if (!estUnType(r.type)) { bilan.ignores++; log(`type inconnu : ${r.type}`); continue }

    let reserve = false
    let envoye = false
    try {
      reserve = await dep.reserve(r)
      if (!reserve) { bilan.ignores++; log(`${r.type} : déjà réservé`); continue }
      const mail = construis(r.type, r.donnees, { base: dep.base, maintenant: dep.maintenant(), prenom: r.prenom })
      envoye = true   // à partir d'ici, le mail peut être parti
      try {
        await dep.envoie({ ...mail, a: r.email })
      } catch (e) {
        if (avantLesDonnees(e)) envoye = false
        throw e
      }
      bilan.envoyes++
      log(`${r.type} : envoyé`)
    } catch (e) {
      bilan.echecs++
      log(`${r.type} : échec (${nomDe(e)})`)
      if (reserve && !envoye) {
        /* Sûrement pas parti : on rend la réservation, l'heure suivante réessaie. */
        try { await dep.libere(r) } catch { log(`${r.type} : la réservation n’a pas pu être rendue`) }
      } else if (reserve) {
        log(`${r.type} : envoi incertain, la réservation reste`)
      }
    }
  }
  return bilan
}

/** Le nom d'une erreur et son code (`EAUTH`…), jamais son message : il peut porter une adresse. */
function nomDe(e: unknown): string {
  if (!(e instanceof Error)) return 'erreur'
  const code = (e as { code?: unknown }).code
  return typeof code === 'string' && /^[A-Z_]{3,20}$/.test(code) ? `${e.name}/${code}` : e.name
}
