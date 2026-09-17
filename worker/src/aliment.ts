/**
 * Rattachement d'un nom d'ingrédient de recette à un aliment CIQUAL.
 *
 * Le problème : une recette écrit « farine », CIQUAL écrit « Farine de blé tendre
 * ou froment T55 (pour pains) ». Il n'y a pas de correspondance exacte, seulement
 * une meilleure correspondance — et il faut savoir dire « je ne sais pas » plutôt
 * que de rattacher au hasard, sinon les macros sont fausses sans prévenir.
 */

export interface Correspondance {
  foodId: string
  nom: string
  /** 0 à 1. En dessous du seuil, on ne rattache pas : la ligne part en relecture. */
  score: number
}

const ACCENTS = /[̀-ͯ]/g
/**
 * ⚠️ NFD ne décompose PAS les ligatures : « Œuf » restait « uf » après filtrage,
 * ce qui faisait échouer l'ingrédient le plus courant des recettes. Elles se
 * remplacent à la main, avant la normalisation.
 */
const LIGATURES: Array<[RegExp, string]> = [
  [/[\u0153\u0152]/g, 'oe'], [/[\u00e6\u00c6]/g, 'ae'], [/\u00df/g, 'ss'],
]

export const pliure = (s: string) => {
  let t = s
  for (const [re, par] of LIGATURES) t = t.replace(re, par)
  return t.normalize('NFD').replace(ACCENTS, '').toLowerCase()
          .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Mots qui ne discriminent rien et faussent le score s'ils sont comptés. */
const VIDES = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'a', 'au', 'aux', 'en', 'et',
  'ou', 'pour', 'avec', 'sans', 'bio', 'frais', 'fraiche', 'nature', 'environ',
])

/**
 * Désinence minimale : la recette écrit « oignons », CIQUAL écrit « Oignon ».
 * On ne fait pas de lemmatisation — juste ce qui sert vraiment, mesuré sur le
 * corpus : le pluriel en -s/-x, et le féminin des participes (-ée, -ées).
 */
function racine(m: string): string {
  if (m.length <= 3) return m
  // ⚠️ L'ordre compte : « poireaux » finit aussi par « aux ». Le cas le plus
  // spécifique d'abord, sinon « poireaux » devient « poireal ».
  if (m.endsWith('eaux')) return m.slice(0, -1)          // « poireaux » → « poireau »
  if (m.endsWith('aux')) return m.slice(0, -3) + 'al'    // « chevaux » → « cheval »
  if (m.endsWith('x') || m.endsWith('s')) return m.slice(0, -1)
  return m
}

const mots = (s: string) =>
  pliure(s).split(' ').filter(m => m.length > 1 && !VIDES.has(m)).map(racine)

/**
 * Une recette dit « poulet », CIQUAL a 40 entrées de poulet. Sans préférence,
 * on tombe sur « Poulet au curry, préemballé » au lieu du blanc cru. Ces mots
 * pénalisent les préparations industrielles quand la recette ne les demande pas.
 */
const PENALITES = [
  /pr[ée]emball/i, /appertis/i, /surgel/i, /d[ée]shydrat/i, /reconstitu/i,
  /aliment moyen/i, /enrichi/i, /pour nourrisson/i, /all[ée]g[ée]/i, /sp[ée]cialit/i,
]

/**
 * Noms usuels que CIQUAL nomme autrement. Comme `default_duration`, cette table
 * est courte, écrite à la main, et s'étend à partir de ce que la mesure signale.
 * Elle ne remplace pas le rattachement : elle le précède.
 */
export const SYNONYMES: Record<string, string> = {
  'maizena': 'amidon de mais',
  'fecule de mais': 'amidon de mais',
  'cassonade': 'sucre roux',
  'vergeoise': 'sucre roux',
  'butternut': 'courge butternut',
  'potimarron': 'courge potimarron',
  'creme fraiche': 'creme fraiche epaisse',
  'gruyere': 'emmental',
  'blanc de poulet': 'poulet blanc',
  'filet de poulet': 'poulet blanc',
  'escalope de poulet': 'poulet blanc',
  'lardons': 'lard fume',
  'pomme de terre': 'pomme de terre chair ferme',
}

export interface AlimentIndexe { id: string; name: string; state: string; _mots?: Set<string> }

/** Prépare l'index une fois : 3 185 aliments, on ne veut pas replier à chaque ligne. */
export function indexer(aliments: AlimentIndexe[]): AlimentIndexe[] {
  for (const a of aliments) a._mots = new Set(mots(a.name))
  return aliments
}

/**
 * Score de Jaccard pondéré : la part des mots de la recette retrouvés dans le nom
 * CIQUAL, moins une pénalité pour les mots CIQUAL en trop (une entrée très
 * spécifique ne doit pas gagner contre une entrée générique).
 */
function score(recherche: string[], cible: AlimentIndexe, prefereCru: boolean): number {
  const c = cible._mots!
  if (!recherche.length || !c.size) return 0
  const communs = recherche.filter(m => c.has(m)).length
  if (!communs) return 0

  const rappel = communs / recherche.length          // ai-je retrouvé ce que je cherche ?
  const precision = communs / c.size                  // la cible parle-t-elle d'autre chose ?
  let s = (2 * rappel * precision) / (rappel + precision)   // moyenne harmonique

  for (const p of PENALITES) if (p.test(cible.name)) { s *= 0.6; break }
  if (prefereCru && cible.state === 'cuit') s *= 0.85

  /**
   * ⚠️ Sans cela, « carotte » choisit « Bœuf aux carottes » : un plat composé a
   * le même score qu'un ingrédient simple, et l'ordre d'index tranche au hasard.
   * Une recette calculerait alors ses macros sur du bœuf. On privilégie l'entrée
   * dont le PREMIER mot significatif est celui qu'on cherche — c'est le nom de
   * la chose, pas un complément.
   */
  const teteCible = [...c][0]
  if (teteCible && teteCible === recherche[0]) s *= 1.35

  return s
}

/** Le seuil sous lequel on refuse de rattacher. Réglé sur le corpus, voir la mesure. */
export const SEUIL = 0.34

export function rattacher(
  nomRecette: string,
  index: AlimentIndexe[],
  options: { prefereCru?: boolean } = {},
): Correspondance | null {
  const recherche = mots(SYNONYMES[pliure(nomRecette)] ?? nomRecette)
  if (!recherche.length) return null

  let meilleur: AlimentIndexe | null = null
  let meilleurScore = 0
  for (const a of index) {
    const s = score(recherche, a, options.prefereCru ?? true)
    if (s > meilleurScore) { meilleurScore = s; meilleur = a }
  }

  if (!meilleur || meilleurScore < SEUIL) return null
  return { foodId: meilleur.id, nom: meilleur.name, score: Number(meilleurScore.toFixed(3)) }
}
