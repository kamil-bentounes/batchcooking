/**
 * Ce que les écrans de saisie disent d'une lecture : des phrases et des regroupements, sans rien d'affiché.
 * Tout vient de la réponse de la fonction : une valeur absente se tait, elle ne se remplace jamais.
 */

export type Lieu = 'frigo' | 'congelateur' | 'placard'

export const NOM_LIEU: Record<Lieu, string> = {
  frigo: 'Frigo', congelateur: 'Congélateur', placard: 'Placard',
}
export const LIEUX: Lieu[] = ['frigo', 'congelateur', 'placard']

export type Vu = {
  /** Où le modèle l'a vu. Il le rend AVANT de compter : c'est ce qui l'empêche de fusionner deux groupes distincts. */
  ou: string
  nom: string
  variete: string | null
  quantite: number | null
  unite: string | null
  lieu: Lieu
  confiance: number
  remarque: string | null
}

/** En dessous, le modèle a deviné : on le dit, et on ne coche pas d'avance. */
export const SEUIL_SUR = 0.8

export const libelle = (a: Pick<Vu, 'nom' | 'variete'>) => [a.nom, a.variete].filter(Boolean).join(' ')

export const estDevine = (a: Pick<Vu, 'confiance'>) => !(a.confiance >= SEUIL_SUR)

/** Les indices à cocher d'avance : ce dont le modèle est sûr, et seulement cela. */
export const cocheesDAvance = (articles: Pick<Vu, 'confiance'>[]): Set<number> =>
  new Set(articles.flatMap((a, i) => (estDevine(a) ? [] : [i])))

export const pluriel = (n: number, un: string, plusieurs = `${un}s`) => (n > 1 ? plusieurs : un)

/** « pot » devient « pots » au-delà d'un ; « u » se dit « pièce ». Une unité inconnue se rend telle quelle. */
export function uniteAffichee(unite: string | null, quantite: number | null): string {
  if (!unite) return ''
  const plusieurs = quantite !== null && quantite > 1
  if (unite === 'u') return plusieurs ? 'pièces' : 'pièce'
  if (['pot', 'paquet', 'bouteille', 'barquette', 'botte'].includes(unite)) return plusieurs ? `${unite}s` : unite
  return unite
}

export type GroupeDeLieu = { lieu: Lieu; items: { a: Vu; i: number }[] }

/** Les articles regroupés par lieu, dans l'ordre frigo, congélateur, placard ; l'indice d'origine suit chaque ligne. */
export function regroupeParLieu(articles: Vu[]): GroupeDeLieu[] {
  return LIEUX
    .map(lieu => ({ lieu, items: articles.flatMap((a, i) => (a.lieu === lieu ? [{ a, i }] : [])) }))
    .filter(g => g.items.length > 0)
}

/** « 14 s » : seulement un temps mesuré. Une réponse sans durée, ou à zéro, n'en affiche pas. */
export function tempsDeLecture(ms: number | null | undefined): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return null
  return `${Math.max(1, Math.round(ms / 1000))} s`
}

/** « 9 articles vus · 7 retenus · 14 s », sans le nombre en tête (l'écran le met en grand). */
export function resumeDeLaPhoto(vus: number, retenus: number, ms: number | null | undefined) {
  return [
    `${pluriel(vus, 'article')} ${pluriel(vus, 'vu')}`,
    `${retenus} ${pluriel(retenus, 'retenu')}`,
    tempsDeLecture(ms),
  ].filter((x): x is string => x !== null).join(' · ')
}

export const euros = (n: number) => `${n.toFixed(2).replace('.', ',')} €`

/** L'écart avec le total imprimé : `null` quand il n'y en a pas (ou moins d'un centime). */
export function ecartDit(ecart: number | null | undefined): string | null {
  if (typeof ecart !== 'number' || !Number.isFinite(ecart) || Math.abs(ecart) < 0.01) return null
  return `écart de ${euros(Math.abs(ecart))} avec le total imprimé`
}

/** « 1 photo restante ce mois-ci. » : le quota que la fonction a rendu, jamais un nombre posé ici. */
export function quotaDit(restantes: number | null | undefined, chose: 'photo' | 'ticket'): string | null {
  if (typeof restantes !== 'number' || !Number.isFinite(restantes)) return null
  const n = Math.max(0, restantes)
  const reste = chose === 'photo' ? 'restante' : 'restant'
  return `${n} ${chose}${n > 1 ? 's' : ''} ${reste}${n > 1 ? 's' : ''} ce mois-ci.`
}

/** « 2026-10-26 » se lit « 26/10/2026 » ; ce que le modèle a écrit autrement se montre tel quel. */
export function dateFr(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim())
  return m ? `${m[3]}/${m[2]}/${m[1]}` : date
}
