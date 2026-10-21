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

function categorieDe(l: Ligne, charges: Map<string, ChargeVue>): Categorie {
  return infoCategorie((l.charge_id && charges.get(l.charge_id)?.categorie) || 'autre').cle
}

/**
 * Le filtre (§ 3.1, point 8). « Commun » : les lignes dont la charge est
 * commune. « Moi » : mes lignes perso. « Tout » : les deux — y compris les
 * lignes perso de l'autre, parce que c'est un seul foyer (D80).
 */
export function dansLeFiltre(l: Ligne, charges: Map<string, ChargeVue>, filtre: Filtre,
                             moi: string): boolean {
  if (filtre === 'tout') return true
  const commune = (l.charge_id && charges.get(l.charge_id)?.commun) || false
  if (filtre === 'commun') return commune
  return !commune && l.parts.some(p => p.user_profile_id === moi)
}

export function totauxDuFiltre(lignes: Ligne[], charges: Map<string, ChargeVue>,
                               saisies: Saisie[], moi: string, clos: boolean): Record<Filtre, number> {
  const t = { tout: 0, commun: 0, moi: 0 }
  for (const l of lignes) {
    const m = montantCompte(l, saisies, clos)
    for (const f of ['tout', 'commun', 'moi'] as const) {
      if (dansLeFiltre(l, charges, f, moi)) t[f] += m
    }
  }
  return t
}

/**
 * Une ligne « à dire » : au fil du mois, sans aucune saisie, dans un mois
 * ouvert. Une facture du mois n'en est pas : on la valide à la clôture, et elle
 * ne doit pas rester signalée tout le mois.
 */
export function estADire(l: Ligne, saisies: Saisie[], clos: boolean): boolean {
  return !clos && l.facon === 'au_fil' && !aDesSaisies(l, saisies)
}

export function aDire(lignes: Ligne[], saisies: Saisie[], clos: boolean): number {
  return lignes.filter(l => estADire(l, saisies, clos)).length
}

/** Générique : l'écran y range ses `Depense`, et les retrouve telles quelles. */
export type CategorieDuMois<L extends Ligne = Ligne> = {
  cle: Categorie; nom: string; total: number; lignes: L[]; aDire: number
}

/** Les catégories du filtre, par montant décroissant, et dans l'ordre de D74 à montant
    égal. Une catégorie sans ligne ne s'affiche pas. */
export function parCategorie<L extends Ligne>(o: {
  lignes: L[]; charges: Map<string, ChargeVue>; saisies: Saisie[]
  filtre: Filtre; moi: string; clos: boolean
}): CategorieDuMois<L>[] {
  const groupes = new Map<Categorie, L[]>()
  for (const l of o.lignes) {
    if (!dansLeFiltre(l, o.charges, o.filtre, o.moi)) continue
    const c = categorieDe(l, o.charges)
    groupes.set(c, [...(groupes.get(c) ?? []), l])
  }
  const poids = (l: L) => montantCompte(l, o.saisies, o.clos)
  return [...groupes].map(([cle, lignes]) => ({
    cle, nom: infoCategorie(cle).nom,
    total: lignes.reduce((t, l) => t + poids(l), 0),
    lignes: [...lignes].sort((a, b) => poids(b) - poids(a)
                                       || a.libelle.localeCompare(b.libelle, 'fr')),
    aDire: lignes.filter(l => estADire(l, o.saisies, o.clos)).length,
  })).sort((a, b) => b.total - a.total || rangDeCategorie(a.cle) - rangDeCategorie(b.cle))
}

/** Des pourcentages entiers dont la somme fait 100, au plus fort reste. Une valeur
    négative ou nulle vaut 0. Arrondis un à un, 33 + 33 + 33 faisait 99. */
export function pourcentages(valeurs: number[]): number[] {
  const v = valeurs.map(x => Math.max(0, Math.round(x)))
  const total = v.reduce((t, x) => t + x, 0)
  if (total === 0) return v.map(() => 0)
  const bas = v.map(x => Math.floor((x * 100) / total))
  let manque = 100 - bas.reduce((t, x) => t + x, 0)
  const ordre = v.map((x, i) => ({ i, r: (x * 100) % total }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
  for (const { i } of ordre) {
    if (manque <= 0) break
    bas[i]++
    manque--
  }
  return bas
}

export type Segment = { cle: Categorie | 'reste'; nom: string; cents: number; pourcent: number }

/**
 * La barre du récap (§ 3.1, point 4) : mes parts par catégorie, et ce qui reste,
 * en part du revenu. Quand il manque de l'argent, elle se répartit sur le total
 * des charges, sans segment « Reste ».
 */
export function barre(o: {
  lignes: Ligne[]; charges: Map<string, ChargeVue>; saisies: Saisie[]
  moi: string; revenu: number; clos: boolean
}): Segment[] {
  const parCat = new Map<Categorie, number>()
  for (const l of o.lignes) {
    const c = categorieDe(l, o.charges)
    parCat.set(c, (parCat.get(c) ?? 0) + maPart(l, o.moi, o.saisies, o.clos))
  }
  const cats = [...parCat].filter(([, cents]) => cents > 0)
    .sort((a, b) => b[1] - a[1] || rangDeCategorie(a[0]) - rangDeCategorie(b[0]))
    .map(([cle, cents]) => ({ cle: cle as Categorie | 'reste', nom: infoCategorie(cle).nom, cents }))
  const reste = o.revenu - cats.reduce((t, s) => t + s.cents, 0)
  const tous = reste > 0 ? [...cats, { cle: 'reste' as const, nom: 'Reste', cents: reste }] : cats
  const p = pourcentages(tous.map(s => s.cents))
  return tous.map((s, i) => ({ ...s, pourcent: p[i] }))
}

// (suite en 2.5)
export { CATEGORIES }
