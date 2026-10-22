/**
 * Ce que les étapes de la clôture décident quand l'argent est en jeu (§ 3.5) —
 * pur, sans réseau : l'écran n'a pas de banc de composants, c'est ici que le test
 * fige les règles. Tout est en CENTIMES ENTIERS.
 *
 * La base reste juge : `cloture_le_mois` calcule son propre reste, au centime. Ce
 * module dit d'avance ce qu'elle fera, pour que l'écran et l'envoi ne se
 * contredisent pas — `leReste` sert à la fois à dessiner l'étape 3 et à
 * composer l'appel de la page.
 */
import type { Poche, Solde } from '../donnees/budget.ts'
import { lisLeMontant, type MontantTape } from './feuilles.ts'
import { montant, type RecapCloture } from './mois.ts'

export type ChoixDuReste = {
  /** « Le garder sur le compte » : rien ne part, `mis_de_cote_cents` = 0. */
  garder: boolean
  poche: string | null
  /** null : « tout ce qui reste ». Sinon, ce qu'on a tapé. */
  combien: string | null
}

/** Y, sous la liste de l'étape 2. */
export function phraseDeLEcart(ecart: number): string {
  if (ecart > 0) return `Tu as dépensé ${montant(ecart)} de moins que prévu.`
  if (ecart < 0) return `Tu as dépensé ${montant(-ecart)} de plus que prévu.`
  return 'Tu as dépensé ce qui était prévu.'
}

/** Sous le chiffre de l'étape 3 : X, puis Y. X + Y fait le chiffre. */
export function phraseDesPrevus(r: RecapCloture): string {
  if (r.ecart > 0) return `${montant(r.prevus)} prévus, plus ${montant(r.ecart)} dépensés en moins`
  if (r.ecart < 0) return `${montant(r.prevus)} prévus, moins ${montant(-r.ecart)} dépensés en plus`
  return `${montant(r.prevus)} prévus`
}

/**
 * Une année que la clôture solde. `cents` est `cible − posé` (`apercu_des_soldes`) :
 * négatif, ce qui n'a pas servi revient au mois ; positif, l'année a coûté plus que
 * prévu. À 0 la base ne rend rien, mais on ne se fie pas à elle pour le bruit.
 */
export function phraseDuSolde(s: Solde): string | null {
  if (s.cents < 0) return `${s.libelle} : ${montant(-s.cents)} non dépensés en ${s.annee} reviennent.`
  if (s.cents > 0) return `${s.libelle} : ${montant(s.cents)} de plus que prévu en ${s.annee}.`
  return null
}

/** Par défaut, la poche d'urgence s'il y en a une, sinon la première (§ 3.5). */
export function pocheParDefaut(poches: Poche[]): Poche | null {
  return poches.find(p => p.genre === 'urgence') ?? poches[0] ?? null
}

/**
 * La poche que l'envoi désignera. Un identifiant qui n'existe plus (poche retirée
 * entre-temps) retombe sur la poche par défaut : envoyé tel quel, la base refusait
 * la clôture avec « poche introuvable » sans que rien à l'écran ne l'explique.
 */
export function pocheDuChoix(poches: Poche[], id: string | null): Poche | null {
  return poches.find(p => p.id === id) ?? pocheParDefaut(poches)
}

export type ResteChoisi = {
  /** « Le mettre de côté » est permis : une poche, et de quoi la remplir. */
  possible: boolean
  /** Pourquoi il est grisé, dit en français. */
  raison: string | null
  mettre: boolean
  /** La poche visée — seulement si l'on met de côté. */
  poche: Poche | null
  /** Ce qu'on a tapé, lu — seulement si l'on met de côté et qu'on a tapé. */
  tape: MontantTape | null
  /** Ce qui partira à l'écran, ramené au reste. 0 si l'on garde ; null si la saisie est illisible. */
  mis: number | null
  /** Ce qu'on a tapé dépasse ce qui reste. */
  rogne: boolean
}

/** Ce que l'étape 3 montre et ce que la clôture enverra, d'une seule lecture du choix. */
export function leReste(o: { reste: number; poches: Poche[]; choix: ChoixDuReste }): ResteChoisi {
  const { reste, poches, choix } = o
  const raison = poches.length === 0 ? 'Il n’y a pas encore de poche d’épargne.'
    : reste <= 0 ? 'Il ne reste rien à mettre de côté ce mois-ci.' : null
  const possible = raison === null
  const mettre = possible && !choix.garder
  if (!mettre) {
    return { possible, raison, mettre, poche: null, tape: null, mis: 0, rogne: false }
  }
  const poche = pocheDuChoix(poches, choix.poche)
  if (choix.combien === null) {
    return { possible, raison, mettre, poche, tape: null, mis: reste, rogne: false }
  }
  const tape = lisLeMontant(choix.combien, { zeroOk: true })
  if (!tape.valide) return { possible, raison, mettre, poche, tape, mis: null, rogne: false }
  return { possible, raison, mettre, poche, tape, mis: Math.min(tape.cents, reste),
           rogne: tape.cents > reste }
}

export type EnvoiDuReste = { valide: boolean; misDeCote: number | null; poche: string | null }

/**
 * L'appel de `cloture_le_mois` pour ce choix.
 *
 * « Tout ce qui reste » part tel quel (`null`) : la base met de côté son propre
 * reste, au centime. À deux, la projection de l'écran peut en différer d'un
 * centime, et c'est la sienne qui compte. Une saisie part de même TELLE QUELLE,
 * non rognée : la base la ramène à son reste, là où l'écran, rognant à sa
 * projection, ferait perdre ce centime.
 *
 * Garder l'argent, ou n'avoir rien à mettre de côté : 0 — la clôture ne bloque
 * jamais. Seule une saisie illisible, quand on met de côté, bloque l'envoi.
 */
export function envoiDuReste(o: { reste: number; poches: Poche[]; choix: ChoixDuReste }): EnvoiDuReste {
  const r = leReste(o)
  if (!r.mettre) return { valide: true, misDeCote: 0, poche: null }
  const poche = r.poche?.id ?? null
  if (o.choix.combien === null) return { valide: true, misDeCote: null, poche }
  if (!r.tape?.valide) return { valide: false, misDeCote: null, poche }
  return { valide: true, misDeCote: r.tape.cents, poche }
}

/** « Ton épargne d'urgence passe à 793,40 € sur 4 000 €. » `mis` : ce qui part, déjà ramené au reste. */
export function phraseDeLaPoche(poche: Poche, dessus: number, mis: number): string {
  const nom = poche.genre === 'urgence' ? 'Ton épargne d’urgence' : poche.libelle
  const sur = poche.objectif_cents ? ` sur ${montant(poche.objectif_cents)}` : ''
  return `${nom} passe à ${montant(dessus + mis)}${sur}.`
}

/**
 * La flèche d'un `radiogroup` : → et ↓ vont au suivant, ← et ↑ au précédent, en
 * boucle, en sautant ce qui est grisé. Toute autre touche rend `null` : Tab,
 * Entrée et les lettres restent au navigateur.
 */
export function voisinDuChoix(courant: number, touche: string, permis: boolean[]): number | null {
  const pas = touche === 'ArrowRight' || touche === 'ArrowDown' ? 1
    : touche === 'ArrowLeft' || touche === 'ArrowUp' ? -1 : 0
  if (pas === 0) return null
  const n = permis.length
  for (let i = 1; i < n; i++) {
    const k = (((courant + pas * i) % n) + n) % n
    if (permis[k]) return k
  }
  return null
}
