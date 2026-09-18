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
  // Ce qu'une recette écrit pour dire « pas beaucoup ». Ces mots ne nomment
  // rien, et les compter faisait chuter le rappel : « un peu de sel » perdait
  // le sel et tombait sur un beurre demi-sel.
  'peu', 'quelques', 'quelque', 'petit', 'petite', 'gros', 'grosse', 'grand',
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
  /enrichi/i, /pour nourrisson/i, /all[ée]g[ée]/i, /sp[ée]cialit/i,
]

/**
 * Les mots qui disent qu'on a TRANSFORMÉ l'aliment.
 *
 * Mesuré sur trente ingrédients courants : dix-sept tombaient à côté, et
 * toujours de la même façon — « tomate » rendait « Tomate, séchée », « œuf »
 * rendait « Œuf, en poudre », « pâtes » rendait « Pâté breton ». Une recette
 * calcule alors ses macros sur un aliment qui n'a plus rien à voir : la tomate
 * séchée pèse cinq fois les calories de la fraîche.
 *
 * La pénalité est FORTE, parce qu'une recette qui écrit « tomate » sans
 * précision ne parle jamais de tomate séchée. Elle reste franchissable : une
 * recette qui écrit « tomates séchées » retrouve le mot, et le rappel compense.
 */
const TRANSFORMATIONS = [
  /s[ée]ch[ée]/i, /en poudre/i, /fum[ée]/i, /pur[ée]e/i, /germ[ée]/i,
  /confit/i, /marin[ée]/i, /pan[ée]/i, /farci/i, /au sirop/i, /en conserve/i,
  /lyophilis/i, /concentr[ée]/i, /r[ée]hydrat/i, /pr[ée]par[ée]/i, /assaisonn/i,
  /en croûte/i, /sauc[ée]/i, /aromatis/i, /sucr[ée]/i, /confiture/i,
]

/**
 * Ce que CIQUAL ajoute pour dire « c'est l'état de base ».
 *
 * « Tomate, crue » et « tomate » désignent la même chose : compter « crue »
 * comme un mot en trop faisait perdre l'entrée canonique contre n'importe
 * quelle variante à un seul qualificatif. C'est la cause de la moitié des
 * rattachements faux.
 */
const ETAT_DE_BASE = new Set(['cru', 'crue', 'entier', 'entiere', 'demi', 'standard'])

/** Le nom générique que CIQUAL signale explicitement. */
const GENERIQUE = /aliment moyen/i

/**
 * « X au Y » n'est pas du X : c'est du X mélangé à autre chose.
 *
 * « Sel au céleri » était l'aliment LE PLUS rattaché du catalogue — 658 lignes
 * de recette écrivant « sel ». Les mots de liaison sont dans `VIDES`, donc le
 * composite ne payait rien pour ce qu'il ajoute. La pénalité ne s'applique que
 * si la recette n'a pas demandé le complément.
 */
const COMPOSITE = /\b(au|aux|à la|à l'|fourré|fourrée|sauce)\b/i

/** Chiffres, taux et unités : une spécification, jamais un autre aliment. */
const SPEC = /^(\d+|mg|g|kg|ml|cl|l|uht|t\d+|[a-z]\d+)$/

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
  'blanc de poulet': 'poulet filet sans peau cru',
  'filet de poulet': 'poulet filet sans peau cru',
  'escalope de poulet': 'poulet filet sans peau cru',
  'poulet': 'poulet filet sans peau cru',
  'lardons': 'lard fume',
  'pomme de terre': 'pomme de terre chair ferme',

  /*
   * Ce que la MESURE a signalé, sur trente ingrédients courants (18/09/2026).
   *
   * Tous les cas où CIQUAL n'a pas d'entrée simple, et où le rattachement
   * tombait donc sur la variante la plus proche par le nom plutôt que par la
   * chose : « beurre » rendait « Haricot beurre », « pâtes » rendait « Pâté
   * breton », « crème fraîche » rendait « Crème de cassis ».
   *
   * Cette table ne remplace pas le rattachement, elle le précède — et elle est
   * courte à dessein : chaque ligne est une décision qu'on peut relire.
   */
  'beurre': 'beurre 82 mg doux',
  'farine': 'farine de ble tendre froment t55',
  'riz': 'riz blanc cuit non sale',
  'pates': 'pates seches standard crues',
  'pate': 'pates seches standard crues',
  'spaghetti': 'pates seches standard crues',
  'tagliatelles': 'pates seches standard crues',
  'penne': 'pates seches standard crues',
  'macaroni': 'pates seches standard crues',
  'sucre': 'sucre blanc',
  'sucre en poudre': 'sucre blanc',
  'creme': 'creme de lait 30 mg epaisse',
  'creme liquide': 'creme de lait 30 mg liquide',
  'fromage frais': 'fromage blanc aliment moyen',
  'fromage blanc': 'fromage blanc aliment moyen',
  'yaourt': 'yaourt lait fermente ou specialite laitiere nature',
  'yaourt nature': 'yaourt lait fermente ou specialite laitiere nature',
  'jambon': 'jambon cuit superieur',
  'lentilles': 'lentille bouillie cuite eau',
  'lentille': 'lentille bouillie cuite eau',
  'chocolat': 'chocolat noir croquer tablette',
  'chocolat noir': 'chocolat noir croquer tablette',
  'coulis de tomates': 'tomate coulis appertise puree',
  'coulis de tomate': 'tomate coulis appertise puree',
  'concentre de tomates': 'tomate concentre',
  'huile': 'huile olive vierge extra',

  /*
   * Trouvés en CONTRÔLANT la production par échantillon, après la correction du
   * score — c'est-à-dire par un autre chemin que le corpus de trente, qui ne
   * les couvrait pas. Ce sont les deux aliments les PLUS rattachés du
   * catalogue, et les deux tombaient à côté :
   *
   *  · « sel » rendait « Sel au céleri » — 658 lignes ;
   *  · « eau » rendait « Eau de vie », c'est-à-dire de l'alcool à 40° là où la
   *    recette met de l'eau — 171 lignes. Sur les macros, l'écart est total.
   *
   * La leçon vaut d'être écrite : un corpus de trente cas bien choisis ne
   * remplace pas un comptage sur ce qui est réellement rattaché.
   */
  'sel': 'sel blanc alimentaire iode non fluore',
  'sel fin': 'sel blanc alimentaire iode non fluore',
  'gros sel': 'sel marin gris non iode non fluore',
  'fleur de sel': 'sel marin gris non iode non fluore',
  'eau': 'eau du robinet',
  'eau froide': 'eau du robinet',
  'eau chaude': 'eau du robinet',
  'eau tiede': 'eau du robinet',
  'sauce soja': 'sauce soja preemballee',
  'soja sauce': 'sauce soja preemballee',

  /*
   * Et ceux que le score seul ne peut pas trancher, parce que le français
   * courant et CIQUAL ne nomment pas la même chose : « jambon » veut dire
   * jambon CUIT dans une recette française, et « 200 g de lentilles » est un
   * poids de lentilles SÈCHES, celui qu'on achète et qu'on pèse.
   */
  'jambon': 'jambon cuit superieur',
  'des de jambon': 'jambon cuit superieur',
  'lait': 'lait entier uht',
  'yaourt nature': 'yaourt lait fermente ou specialite laitiere nature',
  'sauce tomate': 'tomate coulis appertise puree',
  'eau de fleur d oranger': 'eau de fleur d oranger',
}

export interface AlimentIndexe {
  id: string
  name: string
  state: string
  _mots?: Set<string>
  /** Les mots de la TÊTE du nom : ce qui précède la première virgule. */
  _tete?: Set<string>
}

/**
 * Prépare l'index une fois : 3 185 aliments, on ne veut pas replier à chaque ligne.
 *
 * On garde la TÊTE à part, parce que CIQUAL nomme ses aliments « Tête,
 * qualificatifs » : « Tomate, crue », « Beurre à 82% MG, doux », « Sel blanc
 * alimentaire, iodé, non fluoré (marin, ignigène ou gemme) ». La tête est
 * l'aliment ; le reste le précise.
 *
 * Compter la queue dans la précision punissait les entrées CANONIQUES, qui
 * sont justement celles que CIQUAL décrit le plus longuement : « sel » perdait
 * contre « Beurre à 80% MG, demi-sel », dont la tête ne parle même pas de sel.
 * 217 lignes de recette annonçaient du beurre là où il y a du sel.
 */
export function indexer(aliments: AlimentIndexe[]): AlimentIndexe[] {
  for (const a of aliments) {
    a._mots = new Set(mots(a.name))
    a._tete = new Set(mots(a.name.split(/[,(]/)[0]))
  }
  return aliments
}

/**
 * Score de Jaccard pondéré : la part des mots de la recette retrouvés dans le nom
 * CIQUAL, moins une pénalité pour les mots CIQUAL en trop (une entrée très
 * spécifique ne doit pas gagner contre une entrée générique).
 */
function score(recherche: string[], cible: AlimentIndexe, prefereCru: boolean): number {
  // La TÊTE porte l'aliment ; la queue le précise. On mesure sur la tête, et la
  // queue ne peut qu'ajouter — jamais retrancher.
  const c = cible._tete!.size > 0 ? cible._tete! : cible._mots!
  const queue = cible._mots!
  if (!recherche.length || !c.size) return 0
  const communs = recherche.filter(m => c.has(m)).length
  if (!communs) return 0

  // ⚠️ « Tomate, crue » ne parle pas d'autre chose que de tomate : les mots
  //    d'ÉTAT DE BASE ne comptent pas comme des mots en trop. Sans cela,
  //    l'entrée canonique perd contre n'importe quelle variante à un seul
  //    qualificatif — « Tomate, séchée » gagnait, et les macros avec.
  // Les chiffres et les unités décrivent une spécification, pas un autre
  // aliment : « Beurre à 82% MG, doux » parle bien de beurre. Les compter
  // comme des mots en trop faisait perdre le beurre contre le haricot beurre.
  const enTrop = [...c].filter(m =>
    !recherche.includes(m) && !ETAT_DE_BASE.has(m) && !SPEC.test(m)).length
  const utiles = communs + enTrop

  const rappel = communs / recherche.length          // ai-je retrouvé ce que je cherche ?
  const precision = communs / Math.max(1, utiles)     // la cible parle-t-elle d'autre chose ?
  let s = (2 * rappel * precision) / (rappel + precision)   // moyenne harmonique

  /*
   * On ne pénalise QUE ce que la recette n'a pas demandé.
   *
   * Une recette qui écrit « tomate » ne parle jamais de tomate séchée — mais
   * une qui écrit « coulis de tomates » demande bien une purée, et lui reprocher
   * le mot « purée » revenait à lui refuser la seule entrée qui lui convienne.
   * La pénalité porte sur l'écart au demandé, pas sur le mot en soi.
   */
  const demande = recherche.join(' ')
  const pasDemande = (p: RegExp) => p.test(cible.name) && !p.test(demande)
  for (const p of PENALITES) if (pasDemande(p)) { s *= 0.6; break }
  for (const p of TRANSFORMATIONS) if (pasDemande(p)) { s *= 0.45; break }
  /*
   * Un composite doit perdre contre l'aliment simple, sauf si on l'a demandé.
   *
   * On ne regarde que la TÊTE du nom — avant la première virgule, la première
   * parenthèse et le premier « ou ». « Sel au céleri » est bien un composite ;
   * « Fromage blanc nature ou aux fruits (aliment moyen) » ne l'est pas, son
   * « aux » ouvre une alternative, pas un mélange.
   */
  const tete = cible.name.split(/[,(]|\bou\b/)[0]
  if (COMPOSITE.test(tete) && !COMPOSITE.test(demande)) s *= 0.5
  // CIQUAL nomme ses entrées génériques : quand elle existe, c'est CELLE-LÀ
  // qu'une recette sans précision désigne.
  if (GENERIQUE.test(cible.name)) s *= 1.08
  if (prefereCru && cible.state === 'cuit') s *= 0.75

  /**
   * ⚠️ Sans cela, « carotte » choisit « Bœuf aux carottes » : un plat composé a
   * le même score qu'un ingrédient simple, et l'ordre d'index tranche au hasard.
   * Une recette calculerait alors ses macros sur du bœuf. On privilégie l'entrée
   * dont le PREMIER mot significatif est celui qu'on cherche — c'est le nom de
   * la chose, pas un complément.
   */
  const teteCible = [...c][0]
  if (teteCible && teteCible === recherche[0]) s *= 1.35

  // Ce que la recette demande et que seule la QUEUE porte : « lait demi-écrémé »
  // contre « Lait demi-écrémé, UHT ». Un bonus, jamais une pénalité.
  const dansLaQueue = recherche.filter(m => !c.has(m) && queue.has(m)).length
  if (dansLaQueue > 0) s *= 1 + 0.12 * dansLaQueue

  return s
}

/** Le seuil sous lequel on refuse de rattacher. Réglé sur le corpus, voir la mesure. */
export const SEUIL = 0.34

export function rattacher(
  nomRecette: string,
  index: AlimentIndexe[],
  options: { prefereCru?: boolean } = {},
): Correspondance | null {
  /*
   * Le synonyme se cherche sur la forme NETTOYÉE, pas sur le texte brut :
   * « de la farine » et « farine » désignent la même chose, et n'en trouver
   * qu'une des deux dans la table revenait à ce que la moitié des recettes
   * passe à côté. On cherche les deux, le texte brut d'abord — il peut porter
   * une expression que le nettoyage casserait.
   */
  const nettoye = mots(nomRecette).join(' ')
  const canonique = SYNONYMES[pliure(nomRecette)] ?? SYNONYMES[nettoye] ?? nomRecette
  const recherche = mots(canonique)
  if (!recherche.length) return null

  let meilleur: AlimentIndexe | null = null
  let meilleurScore = 0
  for (const a of index) {
    const s = score(recherche, a, options.prefereCru ?? true)
    if (s > meilleurScore) { meilleurScore = s; meilleur = a; continue }
    /*
     * ⚠️ À score ÉGAL, le vainqueur dépendait de l'ordre de lecture de la base
     *    — c'est-à-dire de `gen_random_uuid()`. La même URL ingérée deux fois
     *    donnait deux aliments différents, donc deux jeux de macros, et un
     *    `db reset` rebattait tout le catalogue. On départage sur le nom : le
     *    plus court d'abord, qui est le plus générique, puis l'alphabet.
     */
    if (meilleur && Math.abs(s - meilleurScore) < 1e-9) {
      if (a.name.length < meilleur.name.length
          || (a.name.length === meilleur.name.length && a.name < meilleur.name)) {
        meilleur = a
      }
    }
  }

  if (!meilleur || meilleurScore < SEUIL) return null
  /*
   * Le score RENDU est borné à 1, celui qui a servi à comparer ne l'est pas.
   *
   * Les bonus sont multiplicatifs — tête de nom, entrée générique, mot trouvé
   * dans la queue — et peuvent dépasser 1. C'est sans importance pour choisir
   * le vainqueur, mais `confidence` est une CONFIANCE : elle se lit entre 0 et
   * 1, la base le vérifie, et c'est elle qui décide du verrou de relecture.
   */
  return {
    foodId: meilleur.id,
    nom: meilleur.name,
    score: Number(Math.min(1, meilleurScore).toFixed(3)),
  }
}
