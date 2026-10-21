/**
 * Les calculs de l'écran du mois — purs, sans réseau (§ 6.2).
 *
 * La base porte l'argent ; ce module le lit et le montre. Il ne recompte que ce
 * que l'écran affiche avant elle : le montant d'une ligne au fil du mois tant
 * que le mois est ouvert (le plus grand du prévu et du déclaré), et ce que la
 * clôture laissera. Tout est en CENTIMES ENTIERS.
 */
import { CATEGORIES, infoCategorie, rangDeCategorie, type Categorie, type Mode } from './categories.ts'

export type Facon = Mode
export type Part = { user_profile_id: string; part_cents: number; part_bps?: number }
/** Une ligne du mois, telle que `useMois` la lit. */
export type Ligne = {
  id: string; charge_id: string | null; libelle: string
  montant_cents: number; montant_prevu_cents: number | null
  /** La façon de la LIGNE, figée à sa naissance (§ 4.1). Null : un ajustement. */
  facon: Facon | null
  confirme_le: string | null
  regularise_annee: number | null
  parts: Part[]
}
export type Saisie = {
  id: string; depense_id: string; fait_le: string; montant_cents: number
  saisi_par: string | null
}
export type ChargeVue = { id: string; categorie: Categorie | string; commun: boolean }
export type Revenu = { user_profile_id: string; net_mensuel_cents: number; valid_from: string }
export type Filtre = 'tout' | 'commun' | 'moi'

/** « 4 325 € », « 426,80 € » : sans « ,00 » quand le montant est rond. */
export function montant(cents: number): string {
  const rond = cents % 100 === 0
  const s = (Math.abs(cents) / 100).toLocaleString('fr-FR', {
    minimumFractionDigits: rond ? 0 : 2, maximumFractionDigits: 2 })
  return `${cents < 0 ? '−' : ''}${s} €`
}

/** La façon d'une ligne. Celle de la charge ne sert qu'à « Mes charges ». */
export function facon(l: Ligne): Facon | 'ajustement' {
  return l.facon ?? 'ajustement'
}

export function prevu(l: Ligne): number {
  return l.montant_prevu_cents ?? l.montant_cents
}

/** Ce qui a été déclaré sur une ligne au fil du mois. */
export function declare(l: Ligne, saisies: Saisie[]): number {
  let total = 0
  for (const s of saisies) if (s.depense_id === l.id) total += s.montant_cents
  return total
}

export function aDesSaisies(l: Ligne, saisies: Saisie[]): boolean {
  return saisies.some(s => s.depense_id === l.id)
}

/**
 * Ce que la ligne pèse dans le mois, pour le foyer (§ 3.1.1). Mois ouvert, ligne
 * au fil du mois : max(prévu, déclaré), confirmée ou non — le chiffre ne baisse
 * que si l'on dépasse, et ne remonte qu'à la clôture. Partout ailleurs : la base.
 */
export function montantCompte(l: Ligne, saisies: Saisie[], clos: boolean): number {
  if (clos || l.facon !== 'au_fil') return l.montant_cents
  return Math.max(prevu(l), declare(l, saisies))
}

/** Ma part d'un montant, dans la proportion de mes parts sur la ligne. */
export function partSur(l: Ligne, moi: string, cents: number): number {
  const mienne = l.parts.find(p => p.user_profile_id === moi)
  if (!mienne) return 0
  if (cents === l.montant_cents) return mienne.part_cents
  const total = l.parts.reduce((t, p) => t + p.part_cents, 0)
  if (total !== 0) return Math.round((cents * mienne.part_cents) / total)
  /* Une ligne confirmée à 0 € (« Rien dépensé ») n'a plus que des parts nulles :
     la proportion se lit alors sur les points de base, qu'elle a gardés. Sans
     eux, un mois rouvert effaçait le prévu revenu de « Il te reste ». */
  const totalBps = l.parts.reduce((t, p) => t + (p.part_bps ?? 0), 0)
  return totalBps === 0 ? 0 : Math.round((cents * (mienne.part_bps ?? 0)) / totalBps)
}

/** Ma part de la ligne, comme « Il te reste » la compte (§ 3.1.1). « Voir une ligne
    ne veut pas dire la payer » (D80) : sans part, elle ne compte pas. */
export function maPart(l: Ligne, moi: string, saisies: Saisie[], clos: boolean): number {
  if (clos || l.facon !== 'au_fil') {
    return l.parts.find(p => p.user_profile_id === moi)?.part_cents ?? 0
  }
  return partSur(l, moi, montantCompte(l, saisies, false))
}

/** « 2026-10-31 » pour « 2026-10-01 ». */
export function dernierJour(mois: string): string {
  const [a, m] = mois.split('-').map(Number)
  return `${mois.slice(0, 7)}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`
}

/**
 * Le revenu du mois : celui dont le `valid_from` est le plus récent sans dépasser
 * le dernier jour du mois, comme la base. Ne garder que le dernier posé faisait
 * afficher décembre « sur 4 500 € » quand le revenu changeait en janvier.
 */
export function revenuDuMois(revenus: Revenu[], qui: string, mois: string): number | null {
  const fin = dernierJour(mois)
  let retenu: Revenu | null = null
  for (const r of revenus) {
    if (r.user_profile_id !== qui || r.valid_from > fin) continue
    if (!retenu || r.valid_from > retenu.valid_from) retenu = r
  }
  return retenu ? retenu.net_mensuel_cents : null
}

export type Reste = { revenu: number | null; charges: number; reste: number | null }

/** « Il te reste » : mon revenu du mois, moins ma part de chaque ligne. */
export function resteDuMois(o: {
  lignes: Ligne[]; saisies: Saisie[]; moi: string; revenus: Revenu[]; mois: string; clos: boolean
}): Reste {
  const charges = o.lignes.reduce((t, l) => t + maPart(l, o.moi, o.saisies, o.clos), 0)
  const revenu = revenuDuMois(o.revenus, o.moi, o.mois)
  return { revenu, charges, reste: revenu === null ? null : revenu - charges }
}

// (suite en 2.4 et 2.5)
export { CATEGORIES, infoCategorie, rangDeCategorie }
