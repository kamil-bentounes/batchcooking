/**
 * La liste « Les charges », rangée par catégorie : ce que l'écran montre, sans l'écran.
 *
 * Les catégories, leur ordre et leurs couleurs sont ceux du budget : la plus lourde d'abord, et à poids
 * égal l'ordre de `CATEGORIES` (D74) — comme le tableau de bord du mois type.
 */
import { CATEGORIES, NOM_DU_MODE, infoCategorie, type Categorie, type Mode } from './categories.ts'
import { departDeLaCharge, pourquoiElleNeComptePas } from './charges.ts'
import { estLaCeMois, montant } from './mois.ts'

export type Filtre = 'tout' | 'commun' | 'moi'

export const PERIODE: Record<string, string> = {
  mensuel: 'par mois', trimestriel: 'par trimestre', annuel: 'par an',
}

/** Ce que la liste lit d'une charge : le strict nécessaire, pour que le test n'ait pas à tout fabriquer. */
export type ChargeDeListe = {
  id: string; libelle: string; montant_cents: number; periodicite: 'mensuel' | 'trimestriel' | 'annuel'
  mode: Mode; categorie: Categorie | string; debut: string; participants: string[]
  cle: 'prorata' | 'moitie' | null; commun: boolean
  compte_id: string | null; modifie_par: string | null
}

/** Ce que la charge pèse par mois : un trimestre compte un tiers, une année un douzième. */
export function parMois(c: { montant_cents: number; periodicite: string }): number {
  return c.periodicite === 'mensuel' ? c.montant_cents
    : c.periodicite === 'annuel' ? Math.round(c.montant_cents / 12)
    : Math.round(c.montant_cents / 3)
}

/** Les participants dans l'ordre du foyer, pas celui de la base (qui ne range rien) : « Kamil et Thauba » ne devient
    pas « Thauba et Kamil » d'un rechargement à l'autre. Un inconnu passe en dernier. */
export function dansLOrdreDuFoyer(ids: string[], ordre: Iterable<string>): string[] {
  const rang = new Map([...ordre].map((id, i) => [id, i]))
  return [...ids].sort((a, z) => (rang.get(a) ?? Infinity) - (rang.get(z) ?? Infinity))
}

/** « Kamil », « Kamil et Thauba », « Kamil, Thauba et Inès ». */
export function listeDeNoms(noms: string[]): string {
  if (noms.length <= 1) return noms[0] ?? ''
  return `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`
}

/** Les charges qu'un filtre garde : « En commun », c'est plus d'une personne ; « À moi », moi seul. */
export function duFiltre<C extends { participants: string[] }>(charges: C[], filtre: Filtre, moi: string): C[] {
  return charges.filter(c =>
    filtre === 'tout' ? true
    : filtre === 'commun' ? c.participants.length > 1
    : c.participants.length === 1 && c.participants[0] === moi)
}

/** Le nombre de lignes derrière chaque filtre, pour le dire sur le filtre lui-même. */
export function comptesDesFiltres<C extends { participants: string[] }>(charges: C[], moi: string): Record<Filtre, number> {
  return { tout: charges.length, commun: duFiltre(charges, 'commun', moi).length, moi: duFiltre(charges, 'moi', moi).length }
}

/** Ceux qui sont dans le foyer CE mois-là (arrivée au plus tard le dernier jour du mois) : ce que `parts_du_foyer`
    rend au mois type. Une arrivée inconnue ne cache personne. */
export function presentsAuMois(membres: { id: string; entre_le?: string | null }[], mois: string): Set<string> {
  return new Set(membres.filter(m => estLaCeMois(m, mois)).map(m => m.id))
}

export type GroupeDeCharges<C> = {
  cle: Categorie; nom: string; clair: string; sombre: string
  /** Ce que la catégorie pèse par mois, au mois demandé : une charge qui n'a pas commencé n'y compte pas. */
  total: number; lignes: C[]
}

/**
 * Les charges rangées par catégorie. Dans chacune, ce qui court d'abord, du plus lourd au plus léger (par
 * mois), puis ce qui commence plus tard ; à poids égal, le montant payé le plus gros (une taxe annuelle avant un trimestre
 * qui pèse autant par mois), puis l'ordre alphabétique.
 */
export function rangeParCategorie<C extends { libelle: string; montant_cents: number; periodicite: string
  categorie: string; debut: string; participants: string[] }>(
  charges: C[], mois: string, presents: ReadonlySet<string>): GroupeDeCharges<C>[] {
  const compte = (x: C) => pourquoiElleNeComptePas(x, mois, presents) === null
  const groupes = CATEGORIES.map(c => {
    const lignes = charges.filter(x => infoCategorie(x.categorie).cle === c.cle).sort((a, z) =>
      Number(compte(z)) - Number(compte(a))
      || parMois(z) - parMois(a) || z.montant_cents - a.montant_cents || a.libelle.localeCompare(z.libelle, 'fr'))
    const total = lignes.filter(compte).reduce((t, x) => t + parMois(x), 0)
    return { cle: c.cle, nom: c.nom, clair: c.clair, sombre: c.sombre, total, lignes }
  }).filter(g => g.lignes.length > 0)
  /* `sort` est stable : à total égal, l'ordre de `CATEGORIES` reste. */
  return groupes.sort((a, z) => z.total - a.total)
}

/** Ce que pèsent des charges par mois, au mois demandé — le total du mois type : celles qui n'ont pas commencé, ou
    dont aucun participant n'est encore là, n'y comptent pas. */
export function totalDuMois(
  charges: { montant_cents: number; periodicite: string; debut: string; participants: string[] }[],
  mois: string, presents: ReadonlySet<string>,
): number {
  return charges.filter(c => pourquoiElleNeComptePas(c, mois, presents) === null).reduce((t, c) => t + parMois(c), 0)
}

/** La façon, dite en minuscules sous le nom — rien pour « Fixe », qui est le cas ordinaire. */
export function faconDeLaLigne(mode: Mode): string | null {
  return mode === 'fixe' ? null : NOM_DU_MODE[mode].toLowerCase()
}

/** « 100 € par mois » sous le montant d'une charge qui ne se paie pas chaque mois ; null sinon. */
export function ceQuElleCouteParMois(c: { montant_cents: number; periodicite: string }): string | null {
  return c.periodicite === 'mensuel' ? null : `${montant(parMois(c))} par mois`
}

/**
 * Le sous-titre d'une ligne : « 1 200 € par an · Kamil seul · mise de côté ». « sans compte » n'y figure plus,
 * il est une pastille à part : c'est la seule chose de la ligne qui demande un geste.
 */
export function sousTitreDeLaLigne(c: ChargeDeListe, o: {
  prenoms: Map<string, string>; mois: string; moi: string; presents: ReadonlySet<string>
}): string {
  const nom = (u: string) => o.prenoms.get(u) ?? '?'
  const qui = c.participants.length > 1 ? listeDeNoms(dansLOrdreDuFoyer(c.participants, o.prenoms.keys()).map(nom))
    /* Zéro participant est un état atteignable — on peut tous se décocher — et il se lisait « personne seul ». */
    : c.participants.length === 0 ? 'personne n’y participe' : `${nom(c.participants[0])} seul`
  const morceaux = [
    `${montant(c.montant_cents)} ${PERIODE[c.periodicite]}`,
    qui,
    c.cle === 'moitie' ? 'moitié-moitié' : c.cle === 'prorata' ? 'au prorata' : null,
    faconDeLaLigne(c.mode),
    departDeLaCharge(c, o.mois),
    /* Personne de ceux qui la paient n'est encore dans le foyer : elle est grisée et hors du total, comme dans le
       tableau de toutes les charges. */
    pourquoiElleNeComptePas(c, o.mois, o.presents) === 'arrivee' ? 'pas encore dans le foyer' : null,
    /* « en attente du foyer » ne disait pas ce qui est attendu : c'est une charge marquée commune alors qu'on
       est encore seul — elle attend quelqu'un. */
    c.commun && c.participants.length === 1 ? 'partagée dès que quelqu’un arrive' : null,
    /* Le foyer partage tout : chacun peut corriger la ligne de l'autre, et c'est voulu. On ne verrouille pas, on dit qui. */
    c.modifie_par && c.modifie_par !== o.moi ? `✎ ${o.prenoms.get(c.modifie_par) ?? 'quelqu’un'}` : null,
  ]
  return morceaux.filter((m): m is string => m !== null).join(' · ')
}

/**
 * Avant le premier mois, l'écran se cale sur le mois d'arrivée, comme le hub : la phrase qui le dit.
 * Null quand on est déjà là.
 */
export function phraseDeLArrivee(o: { avant: boolean; nomDuMois: string }): string | null {
  return o.avant
    ? `Tu entres dans le foyer en ${o.nomDuMois} : les montants sont ceux de ton premier mois, pas ceux d’aujourd’hui.`
    : null
}
