/**
 * Ce que la fiche (i) écrit, sans réseau (R2).
 */
import { decodeEntites } from './texte.ts'

const UNITES = [
  'kg', 'g', 'gr', 'mg', 'l', 'cl', 'dl', 'ml',
  // « c. à soupe », « c.à.s », « càs », « c à café » : les points et les blancs varient.
  String.raw`c\.?\s*à\.?\s*(?:soupe|café|s|c)\.?`,
  String.raw`cuill(?:è|e)res?\s+à\s+(?:soupe|café)`,
  'cs', 'cc', 'pincées?', 'gousses?', 'tranches?', 'sachets?', 'bo(?:i|î)tes?', 'brins?',
  'feuilles?', 'verres?', 'bols?', 'tasses?', 'poignées?', 'morceaux?', 'filets?',
  'branches?', 'pots?',
].join('|')
const FRACTION = String.raw`(?:\d+\s*/\s*\d+|[½¼¾⅓⅔])`
// Un nombre mixte (« 1 ½ », « 1 1/2 ») d'abord : sinon « 1 » s'en irait seul.
const NOMBRE = String.raw`(?:\d+\s*${FRACTION}|\d+(?:[.,]\d+)?|${FRACTION})`
// « 3 x 100 g » : un nombre de fois la quantité.
const FOIS = String.raw`(?:\d+\s*[x×]\s*)?`
const QTE = String.raw`${FOIS}${NOMBRE}(?:\s*(?:à|-)\s*${NOMBRE})?(?:\s*(?:${UNITES})\.?)?`
const QUANTITE = new RegExp(String.raw`^(${QTE})\s+(?:(?:de|d['’])\s*)?(.+)$`, 'i')
// Rien après la quantité et l'unité : « 250 g », « 2 à 3 ».
const QUANTITE_SEULE = new RegExp(String.raw`^${QTE}$`, 'i')

const majuscule = (s: string) => (s ? s[0].toLocaleUpperCase('fr') + s.slice(1) : s)

/**
 * Une ligne d'ingrédient en deux colonnes, comme la maquette : la quantité en
 * gras, le nom à côté. Sans quantité lisible, ou sans rien après elle, tout va
 * dans le nom — on ne devine pas.
 */
export function ingredientEnDeux(brut: string): { qte: string; nom: string } {
  const t = decodeEntites(brut).replace(/\s+/g, ' ').trim()
  const m = QUANTITE_SEULE.test(t) ? null : t.match(QUANTITE)
  if (!m) return { qte: '', nom: majuscule(t) }
  return { qte: m[1].trim(), nom: majuscule(m[2].trim()) }
}

/** PostgREST rend parfois les `numeric` en chaîne ; une valeur illisible compte
    zéro, comme un temps illisible (temps.ts). */
const lu = (v: number | string): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/**
 * La pastille de la carte « Par part » : ce que vaut la fourchette. Ce qu'on ne
 * connaît pas passe avant ce qu'on connaît mal.
 */
export function precision(n: {
  kcal_margin: number | string; protein_g_margin: number | string; coverage: number | string
}): string {
  // Ce qu'on compare est ce qu'on écrit : 0,8999 s'affiche « 90 % », il ne peut
  // donc pas passer sous le seuil de 90 %.
  const pourcent = Math.round(lu(n.coverage) * 100)
  if (pourcent < 90) return `${pourcent} % des ingrédients connus`
  const km = Math.round(lu(n.kcal_margin))
  return km < 1 ? 'Tout est pesé' : `à ${km} kcal près`
}
