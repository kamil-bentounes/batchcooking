/**
 * « On range » : ce qui reste au frigo, ce qui part au congélateur, et ce que ça donne.
 *
 * Pur : aucune requête. Le dressage fabrique les barquettes ; l'hôte choisit ensuite, recette par
 * recette et pour le foyer entier, combien restent au frais. Ces fonctions proposent la découpe de
 * départ, écrivent ses conséquences en mots, et disent ce que la session a pris dans le stock.
 */

/** Au-delà de quatre jours, une barquette ne tient pas au frigo (D29, D40). */
export const JOURS_AU_FRAIS = 4
/** Trois mois au congélateur (D29). */
export const JOURS_AU_CONGELO = 90

export type PlatARanger = { recipeId: string; total: number }

/**
 * La proposition de départ : on remplit le frigo jusqu'à quatre jours de dîners pour le foyer
 * (4 × le nombre de membres), recette par recette dans l'ordre du cycle ; le reste part au
 * congélateur. C'est la règle d'avant, transposée du « chacun ses quatre » au foyer entier.
 */
export function propositionAuFrigo(plats: PlatARanger[], membres: number): Record<string, number> {
  let place = JOURS_AU_FRAIS * Math.max(1, membres)
  const frigo: Record<string, number> = {}
  for (const p of plats) {
    const n = Math.min(p.total, place)
    frigo[p.recipeId] = n
    place -= n
  }
  return frigo
}

/** « toi », « vous deux », « vous trois »… : le foyer, comme on en parle. */
export function pourLeFoyer(membres: number): string {
  const noms = ['', 'toi', 'vous deux', 'vous trois', 'vous quatre', 'vous cinq', 'vous six']
  return noms[membres] ?? `vous ${membres}`
}

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/** « jeu. 29 oct. » */
export function jourAbrege(d: Date): string {
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`
}

/** « dim. 25 oct. à 21 h 26 » */
export function jourEtHeure(d: Date): string {
  return `${jourAbrege(d)} à ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`
}

/** Le même instant, `jours` jours de calendrier plus tard : c'est ce que la base ajoute (`make_interval`). */
export function plusDeJours(d: Date, jours: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + jours)
  return r
}

/** Ce que dit un `<input type="datetime-local">` : l'heure LOCALE, à la minute. */
export function pourLeChamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Ce que le champ rend, lu en heure locale. `null` : vide ou illisible, on garde l'ancienne. */
export function depuisLeChamp(valeur: string): Date | null {
  const m = valeur.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!m) return null
  const [a, mo, j, h, mi] = m.slice(1).map(Number)
  const d = new Date(a, mo - 1, j, h, mi)
  // `new Date(2026, 1, 31)` glisse au 3 mars : on refuse ce qui ne se relit pas à l'identique.
  return d.getMonth() === mo - 1 && d.getDate() === j && !Number.isNaN(d.getTime()) ? d : null
}

/** Ce que l'écran dit du frigo d'une recette. */
export function phraseDuFrigo(n: number, rangeLe: Date): string {
  return n > 0 ? `à manger avant le ${jourAbrege(plusDeJours(rangeLe, JOURS_AU_FRAIS))}` : 'rien au frais'
}

/** Ce que l'écran dit du congélateur d'une recette. */
export function phraseDuCongelo(n: number, rangeLe: Date): string {
  return n > 0 ? `se garde jusqu’au ${jourAbrege(plusDeJours(rangeLe, JOURS_AU_CONGELO))}` : 'rien au froid'
}

export type Bilan = { titre: string; texte: string; trop: boolean; jours: number }

/**
 * Le bilan du frigo : de quoi tenir combien de jours de dîners, ou — au-delà de quatre — ce qui
 * périmera avant d'être mangé. Un dîner par personne et par jour : c'est ce que la règle des quatre
 * jours compte.
 */
export function bilanDuFrigo(auFrais: number, membres: number, rangeLe: Date): Bilan {
  const m = Math.max(1, membres)
  const jours = Math.floor(auFrais / m)
  const titre = `${auFrais} barquette${auFrais > 1 ? 's' : ''} au frigo`
  const trop = auFrais > JOURS_AU_FRAIS * m
  const pour = pourLeFoyer(m)
  if (trop) {
    return {
      titre, trop, jours,
      texte: `C’est plus de ${JOURS_AU_FRAIS} jours de dîners pour ${pour} : congèle-en quelques-unes, `
        + `les dernières périmeront après le ${jourAbrege(plusDeJours(rangeLe, JOURS_AU_FRAIS))}`,
    }
  }
  return {
    titre, trop, jours,
    texte: `De quoi tenir ${jours} jour${jours > 1 ? 's' : ''} de dîners pour ${pour}. `
      + `Le frigo garde ${JOURS_AU_FRAIS} jours.`,
  }
}

/**
 * Les barquettes d'une recette dans l'ordre où on les range : chacun à son tour. Les premières
 * restent au frigo, les dernières partent au froid — de sorte que chaque membre garde du frais
 * plutôt que le premier tout et le second rien.
 */
export function ordreDeRangement<T extends { userId: string; nombre: number }>(parts: T[]): string[] {
  const restantes = parts.map(p => ({ userId: p.userId, reste: p.nombre }))
  const ordre: string[] = []
  while (restantes.some(r => r.reste > 0)) {
    for (const r of restantes) {
      if (r.reste > 0) { ordre.push(r.userId); r.reste -= 1 }
    }
  }
  return ordre
}

/**
 * Une quantité prise, comme on la lit : « 1,5 kg », « 750 ml », « 4 ». Les grammes passent en kg
 * au-delà de mille ; les `ml` restent en `ml` ; à l'unité, le nombre seul.
 */
export function ecritLaPrise(n: number, unite: string | null): string {
  const f = (v: number) => (Math.round(v * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
  if (unite === 'g') return n >= 1000 ? `${f(n / 1000)} kg` : `${f(n)} g`
  if (unite === 'ml') return n >= 1000 ? `${f(n / 1000)} l` : `${f(n)} ml`
  return unite && unite !== 'u' ? `${f(n)} ${unite}` : f(n)
}

/** Ce qu'on tape dans « il en reste … » : zéro est une réponse valable (« plus rien »). */
export function lisLeReste(saisie: string): number | null {
  const t = saisie.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export type LignePrise = {
  stock_item_id: string
  libelle: string
  lieu: string
  quantite: number | null
  unite: string | null
  prise: number | null
  reste: number | null
  calculable: boolean
}

/** Les puces de « La session a pris » : ce qui est calculable, et qui sort vraiment. */
export function puces(lignes: LignePrise[]): LignePrise[] {
  return lignes.filter(l => l.calculable && (l.prise ?? 0) > 0)
}

/**
 * Ce que l'hôte a corrigé : « il en reste … » l'emporte sur le calcul. Une correction qui retombe
 * sur le calcul n'en est pas une, et ne part pas. Bornée au stock (la base borne aussi).
 */
export function corrections(lignes: LignePrise[], restes: Record<string, number>): Record<string, number> {
  const sortie: Record<string, number> = {}
  for (const l of puces(lignes)) {
    const dit = restes[l.stock_item_id]
    if (dit === undefined) continue
    const borne = Math.min(l.quantite ?? 0, Math.max(0, dit))
    if (Math.abs(borne - (l.reste ?? 0)) > 1e-9) sortie[l.stock_item_id] = borne
  }
  return sortie
}

/** Le reste d'une ligne d'après ce qu'on a corrigé, sinon d'après le calcul. */
export function resteApres(l: LignePrise, restes: Record<string, number>): number {
  const dit = restes[l.stock_item_id]
  return dit === undefined ? (l.reste ?? 0) : Math.min(l.quantite ?? 0, Math.max(0, dit))
}

/**
 * « Reste au frigo : … » : ce que la session n'a pas touché — le frigo moins les lignes dont la
 * session retire quelque chose.
 */
export function resteAuFrigo(
  stock: { id: string; label: string; location: string }[], lignes: LignePrise[],
): string[] {
  const prises = new Set(puces(lignes).map(l => l.stock_item_id))
  return stock.filter(s => s.location === 'frigo' && !prises.has(s.id)).map(s => s.label)
}
