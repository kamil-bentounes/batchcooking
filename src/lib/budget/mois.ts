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

/**
 * Un reste non nul que l'arrondi à l'euro ferait disparaître (−0,30 € devient « 0 € »).
 * Le hub arrondit ses gros chiffres ; sur ceux-là il dit les centimes, parce que « Il te
 * manque 0 € » est faux et que le signe, lui, ne se lit plus.
 */
export function sousLEuro(cents: number): boolean {
  const a = Math.abs(cents)
  return a !== 0 && Math.round(a / 100) === 0
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

/** Ma part de `cents`, dans la proportion de mes parts sur la ligne. Les parts en centimes ;
    et si elles sont toutes nulles, les points de base. */
function prorata(l: Ligne, moi: string, cents: number): number {
  const mienne = l.parts.find(p => p.user_profile_id === moi)
  if (!mienne) return 0
  const total = l.parts.reduce((t, p) => t + p.part_cents, 0)
  if (total !== 0) return Math.round((cents * mienne.part_cents) / total)
  /* Une ligne confirmée à 0 € (« Rien dépensé ») n'a plus que des parts nulles :
     la proportion se lit alors sur les points de base, qu'elle a gardés. Sans
     eux, un mois rouvert effaçait le prévu revenu de « Il te reste ». */
  const totalBps = l.parts.reduce((t, p) => t + (p.part_bps ?? 0), 0)
  return totalBps === 0 ? 0 : Math.round((cents * (mienne.part_bps ?? 0)) / totalBps)
}

/** Ma part d'un montant, dans la proportion de mes parts sur la ligne. */
export function partSur(l: Ligne, moi: string, cents: number): number {
  const mienne = l.parts.find(p => p.user_profile_id === moi)
  if (!mienne) return 0
  if (cents === l.montant_cents) return mienne.part_cents
  return prorata(l, moi, cents)
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
  /* Le reste se compte sur TOUTES les parts nettes, y compris celles d'une catégorie à 0 ou
     en négatif (un solde réglé) : seul l'affichage les écarte. Sinon « Reste » ne valait plus
     « Il te reste » (`resteDuMois` les compte). */
  const reste = o.revenu - [...parCat.values()].reduce((t, c) => t + c, 0)
  const cats = [...parCat].filter(([, cents]) => cents > 0)
    .sort((a, b) => b[1] - a[1] || rangDeCategorie(a[0]) - rangDeCategorie(b[0]))
    .map(([cle, cents]) => ({ cle: cle as Categorie | 'reste', nom: infoCategorie(cle).nom, cents }))
  const tous = reste > 0 ? [...cats, { cle: 'reste' as const, nom: 'Reste', cents: reste }] : cats
  const p = pourcentages(tous.map(s => s.cents))
  return tous.map((s, i) => ({ ...s, pourcent: p[i] }))
}

export const NOMS_DES_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'] as const

export function nomDuMois(iso: string): string {
  return NOMS_DES_MOIS[Number(iso.slice(5, 7)) - 1]
}

export function capitale(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function moisVoisin(iso: string, pas: number): string {
  const [a, m] = iso.split('-').map(Number)
  const d = new Date(a, m - 1 + pas, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** « Il reste N jours. », sur le mois courant seulement. On compte des JOURS : le dernier
    jour à 14 h, il en reste 0 (« Dernier jour. »). */
export function joursRestants(mois: string, aujourdhui: string): number | null {
  if (aujourdhui.slice(0, 7) !== mois.slice(0, 7)) return null
  return Number(dernierJour(mois).slice(8)) - Number(aujourdhui.slice(8))
}

const JOURS_COURTS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.']
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août',
  'sept.', 'oct.', 'nov.', 'déc.']

/** « Sam. 3 oct. » */
export function dateCourte(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number)
  return `${JOURS_COURTS[new Date(a, m - 1, j).getDay()]} ${j} ${MOIS_COURTS[m - 1]}`
}

function veille(iso: string): string {
  const [a, m, j] = iso.split('-').map(Number)
  const d = new Date(a, m - 1, j - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${
    String(d.getDate()).padStart(2, '0')}`
}

/**
 * Les jours qu'on propose pour une dépense (§ 3.2) : toujours dans le mois
 * affiché. Mois courant : « Aujourd'hui », « Hier » (pas le 1er), et un autre
 * jour jusqu'à aujourd'hui. Mois passé : son dernier jour, et un autre jour du
 * mois. Une dépense n'est pas dans l'avenir.
 */
export function joursProposes(mois: string, aujourdhui: string): {
  choix: { libelle: string; date: string }[]; min: string; max: string
} {
  if (aujourdhui.slice(0, 7) === mois.slice(0, 7)) {
    const choix = [{ libelle: 'Aujourd’hui', date: aujourdhui }]
    if (aujourdhui.slice(8) !== '01') choix.push({ libelle: 'Hier', date: veille(aujourdhui) })
    return { choix, min: mois, max: aujourdhui }
  }
  const dernier = dernierJour(mois)
  return { choix: [{ libelle: dateCourte(dernier), date: dernier }], min: mois, max: dernier }
}

export const JOUR_DU_RAPPEL = 27

export type Bandeau = { genre: 'rappel' | 'bientot' | 'cloturer'; mois: string } | null

/**
 * Le bandeau du mois (§ 3.1, point 9) : un seul à la fois, et celui du mois
 * précédent non clôturé passe devant les autres. Les bandeaux de clôture ne
 * paraissent que si j'ai un revenu ce mois-là : sans revenu (janvier à août
 * 2026), un mois ne se clôture pas, et rien ne le propose.
 */
export function bandeau(o: {
  mois: string; aujourdhui: string; clos: (m: string) => boolean; aRevenu: (m: string) => boolean
}): Bandeau {
  const courant = `${o.aujourdhui.slice(0, 7)}-01`
  if (o.clos(o.mois)) return null
  if (o.mois === courant) {
    const precedent = moisVoisin(courant, -1)
    if (!o.clos(precedent) && o.aRevenu(precedent)) return { genre: 'cloturer', mois: precedent }
    return { genre: Number(o.aujourdhui.slice(8)) >= JOUR_DU_RAPPEL ? 'bientot' : 'rappel',
             mois: o.mois }
  }
  if (o.mois < courant && o.aRevenu(o.mois)) return { genre: 'cloturer', mois: o.mois }
  return null
}

/** La seconde ligne de la carte Budget du hub (§ 3.6). */
export function ligneDuHub(o: { aCloturer: string | null; aDire: number }): string {
  if (o.aCloturer) return `${capitale(nomDuMois(o.aCloturer))} est à clôturer`
  if (o.aDire > 0) return `${o.aDire} montant${o.aDire > 1 ? 's' : ''} à dire`
  return 'Tout est à jour'
}

/** Ma part des soldes que la clôture posera (`apercu_des_soldes`) : au prorata de mes
    parts sur la ligne du mois de la même charge ; tout, si elle n'en a pas. La base
    reste juge (`reste_cents`) : à deux, l'aperçu peut différer de quelques centimes. */
export function maPartDesSoldes(apercu: { charge: string; cents: number }[], lignes: Ligne[],
                                moi: string): number {
  return apercu.reduce((t, s) => {
    const l = lignes.find(x => x.charge_id === s.charge && x.facon !== null && x.parts.length > 0)
    if (!l) return t + s.cents
    return t + prorata(l, moi, s.cents)
  }, 0)
}

export type RecapCloture = { prevus: number; ecart: number; reste: number }

/**
 * Le récap de la clôture (§ 3.5, étape 3). X (`prevus`) : ce qui resterait si
 * chaque ligne au fil du mois coûtait son prévu, soldes d'année compris. Y
 * (`ecart`) : l'écart net de l'étape 2, prévu moins réel. X + Y fait le chiffre.
 * Le tout en MES parts, comme « Il te reste ».
 *
 * Le réel d'une ligne au fil du mois est ce que la clôture retiendra : la somme
 * des saisies s'il y en a ; 0 si « Rien dépensé » ; sinon le prévu.
 */
export function recapCloture(o: {
  revenu: number; lignes: Ligne[]; saisies: Saisie[]; moi: string
  factures: Map<string, number>; rien: Set<string>; soldes: number
}): RecapCloture {
  let prevus = o.revenu - o.soldes
  let ecart = 0
  for (const l of o.lignes) {
    if (l.facon === 'au_fil') {
      const p = prevu(l)
      const reel = aDesSaisies(l, o.saisies) ? declare(l, o.saisies)
        : l.charge_id && o.rien.has(l.charge_id) ? 0 : p
      prevus -= partSur(l, o.moi, p)
      ecart += partSur(l, o.moi, p) - partSur(l, o.moi, reel)
    } else if (l.facon === 'facture' && o.factures.has(l.id)) {
      prevus -= partSur(l, o.moi, o.factures.get(l.id)!)
    } else {
      prevus -= l.parts.find(p => p.user_profile_id === o.moi)?.part_cents ?? 0
    }
  }
  return { prevus, ecart, reste: prevus + ecart }
}

export { CATEGORIES }
