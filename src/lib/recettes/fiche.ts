/**
 * Ce que la fiche (i) écrit, sans réseau (R2).
 */
import { decodeEntites } from './texte.ts'

const UNITES = [
  'kg', 'g', 'gr', 'mg', 'l', 'cl', 'dl', 'ml',
  String.raw`c\.?\s*à\s*(?:soupe|café|s\.?|c\.?)`,
  String.raw`cuill(?:è|e)res?\s+à\s+(?:soupe|café)`,
  'cs', 'cc', 'pincées?', 'gousses?', 'tranches?', 'sachets?', 'boîtes?', 'brins?',
  'feuilles?', 'verres?', 'bols?', 'tasses?', 'poignées?', 'morceaux?', 'filets?',
  'branches?', 'pots?',
].join('|')
const NOMBRE = String.raw`(?:\d+(?:[.,]\d+)?|\d+\s*/\s*\d+|[½¼¾⅓⅔])`
const QUANTITE = new RegExp(String.raw`^(${NOMBRE}(?:\s*(?:à|-)\s*${NOMBRE})?`
  + String.raw`(?:\s*(?:${UNITES})\.?)?)\s+(?:(?:de|d['’])\s*)?(.+)$`, 'i')

const majuscule = (s: string) => (s ? s[0].toLocaleUpperCase('fr') + s.slice(1) : s)

/**
 * Une ligne d'ingrédient en deux colonnes, comme la maquette : la quantité en
 * gras, le nom à côté. Sans quantité lisible, tout va dans le nom — on ne devine
 * pas.
 */
export function ingredientEnDeux(brut: string): { qte: string; nom: string } {
  const t = decodeEntites(brut).replace(/\s+/g, ' ').trim()
  const m = t.match(QUANTITE)
  if (!m) return { qte: '', nom: majuscule(t) }
  return { qte: m[1].trim(), nom: majuscule(m[2].trim()) }
}

/**
 * La pastille de la carte « Par part » : ce que vaut la fourchette. Ce qu'on ne
 * connaît pas passe avant ce qu'on connaît mal.
 */
export function precision(n: {
  kcal_margin: number | string; protein_g_margin: number | string; coverage: number | string
}): string {
  const couverture = Number(n.coverage)
  if (couverture < 0.9) return `${Math.round(couverture * 100)} % des ingrédients connus`
  const km = Math.round(Number(n.kcal_margin))
  return km < 1 ? 'Tout est pesé' : `à ${km} kcal près`
}
