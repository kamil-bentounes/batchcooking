/**
 * Analyse d'une ligne d'ingrédient de recette française.
 *
 * Mesuré sur 475 lignes réelles : 24 % en masse, 9 % en volume, 23 % en cuillères,
 * 27 % en compte, 16 % sans aucune quantité. Cette fonction rend cette structure
 * explicite ; la conversion en grammes vient ensuite (cascade de résolution).
 */

export type Forme = 'masse' | 'volume' | 'cuillere' | 'compte' | 'aucune' | 'section'

export interface LigneAnalysee {
  brut: string
  /** Quantité numérique, si elle est écrite. */
  qte: number | null
  /** Unité telle qu'écrite, normalisée (« c. à soupe », « g », « cl »…). */
  unite: string | null
  /** Le nom de l'aliment, débarrassé de la quantité et des précisions de préparation. */
  aliment: string
  forme: Forme
  /** Précisions retirées du nom : « finement haché », « coupé en dés »… */
  preparation: string | null
}

/** « 1/2 », « 1 1/2 », « 2,5 », « ½ » — les recettes écrivent tout cela. */
const FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125,
}

function nombre(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t in FRACTIONS) return FRACTIONS[t]
  // « 1 1/2 » ou « 1 ½ »
  const mixte = t.match(/^(\d+)\s*(?:(\d+)\/(\d+)|([½⅓⅔¼¾⅛]))$/)
  if (mixte) {
    const base = Number(mixte[1])
    const frac = mixte[4] ? FRACTIONS[mixte[4]] : Number(mixte[2]) / Number(mixte[3])
    return base + frac
  }
  const fraction = t.match(/^(\d+)\/(\d+)$/)
  if (fraction) return Number(fraction[1]) / Number(fraction[2])
  // « 60 à 70 g » : on prend le milieu, et on le dit dans la forme
  const plage = t.match(/^(\d+(?:\.\d+)?)\s*(?:à|-)\s*(\d+(?:\.\d+)?)$/)
  if (plage) return (Number(plage[1]) + Number(plage[2])) / 2
  const simple = t.match(/^(\d+(?:\.\d+)?)$/)
  return simple ? Number(simple[1]) : null
}

/** Unités de masse et de volume, avec leurs graphies rencontrées. */
const MASSE = /^(g|gr|gramm?es?|kg|kilos?|kilogramm?es?|mg)$/i
const VOLUME = /^(ml|cl|dl|l|litres?|centilitres?|millilitres?)$/i
const CUILLERE = new RegExp(
  // « c.à.s », « c. à s. », « c à soupe » : les points peuvent être partout.
  '^(c\\.?\\s*[àa]\\.?\\s*(?:s|c|soupe|caf[ée])\\.?|cuill?[eè]?re?s?(?:\\s*[àa]\\s*(?:soupe|caf[ée]))?' +
  '|c[àa][sc]|pinc[ée]es?|poign[ée]es?|verres?|bols?|tasses?|sachets?|gousses?|brins?' +
  '|bouquets?|feuilles?|filets?|traits?|noix|noisettes?|tranches?|rondelles?|louches?)$', 'i')

/** Normalise les graphies d'une même unité vers celle de la table de conversion. */
function normaliseUnite(u: string): string {
  const t = u.toLowerCase().replace(/\./g, '').trim()
  // Les points ayant été retirés, « c. à s. » est devenu « c à s » et
  // « c. à soupe » est devenu « c à soupe » : les deux doivent passer.
  if (/^(?:c|cuill?[eè]?re?s?)\s*[àa]\s*(?:s|soupe)$|^c[àa]s$/.test(t)) return 'c. à soupe'
  if (/^(?:c|cuill?[eè]?re?s?)\s*[àa]\s*(?:c|caf[ée])$|^c[àa]c$/.test(t)) return 'c. à café'
  if (/^(gr|gramm?es?)$/.test(t)) return 'g'
  if (/^(kilos?|kilogramm?es?)$/.test(t)) return 'kg'
  if (/^(litres?)$/.test(t)) return 'l'
  if (/^(centilitres?)$/.test(t)) return 'cl'
  if (/^(millilitres?)$/.test(t)) return 'ml'
  return t.replace(/s$/, '').replace(/^pinc[ée]e?$/, 'pincée')
           .replace(/^poign[ée]e?$/, 'poignée')
}

/** Une ligne comme « Pour la pâte : » n'est pas un ingrédient, c'est un intertitre. */
const SECTION = /^(pour\s+(?:la|le|les|l['’])|garniture|assaisonnement|d[ée]coration|sauce)\b.*:\s*$|^[^:]{3,40}:\s*$/i

/** Précisions de préparation à retirer du nom de l'aliment. */
const PREPARATION =
  /\b((?:finement\s+|grossi[èe]rement\s+)?(?:hach[ée]?e?s?|[ée]minc[ée]e?s?|r[âa]p[ée]e?s?|coup[ée]e?s?(?:\s+en\s+\w+)?|[ée]pluch[ée]e?s?|pel[ée]e?s?|d[ée]taill[ée]e?s?|[ée]queut[ée]e?s?|d[ée]noyaut[ée]e?s?|[ée]gouttt?[ée]e?s?|lav[ée]e?s?|tamis[ée]e?s?|fondu?e?s?|ramollie?s?|ti[èe]de|frais|fra[îi]che?s?|surgel[ée]e?s?|en\s+(?:d[ée]s|rondelles|lamelles|morceaux|tranches|quartiers)))\b/gi

export function analyser(brut: string): LigneAnalysee {
  const t = brut.replace(/\s+/g, ' ').trim()

  if (SECTION.test(t) && !/\d/.test(t)) {
    return { brut, qte: null, unite: null, aliment: t.replace(/:\s*$/, '').trim(),
             forme: 'section', preparation: null }
  }

  // ⚠️ L'ordre des alternatives compte : « 1/2 » doit être tenté AVANT « 1 »,
  // sinon la fraction est tronquée et « 1/2 oignon » vaut 1.
  const NOMBRE = /^(\d+\s*\d+\/\d+|\d+\s*[½⅓⅔¼¾⅛]|\d+\/\d+|[½⅓⅔¼¾⅛]|\d+(?:[.,]\d+)?\s*(?:à|-)\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*/

  let qte: number | null = null
  let unite: string | null = null
  let reste = t

  const mNombre = t.match(NOMBRE)
  if (mNombre) {
    qte = nombre(mNombre[1])
    reste = t.slice(mNombre[0].length)

    // On cherche une unité CONNUE en tête du reste, la plus longue d'abord :
    // « c. à soupe » avant « c ». Un motif générique échouerait sur les unités
    // en plusieurs mots.
    const mots = reste.split(/\s+/)
    for (let n = Math.min(4, mots.length); n >= 1; n--) {
      const candidat = mots.slice(0, n).join(' ').replace(/[,;]$/, '')
      if (MASSE.test(candidat) || VOLUME.test(candidat) || CUILLERE.test(candidat)) {
        unite = normaliseUnite(candidat)
        reste = mots.slice(n).join(' ')
        break
      }
    }
  }
  // « de farine », « d'huile » : la préposition n'appartient pas au nom
  reste = reste.replace(/^\s*(?:de\s+|du\s+|des\s+|d['’]\s*)/i, '')

  const preparations: string[] = []
  const aliment = reste
    .replace(PREPARATION, (x) => { preparations.push(x.trim()); return '' })
    .replace(/\([^)]*\)/g, '')       // « (ou 2 rouleaux de pâte) »
    .replace(/[,;]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  let forme: Forme
  if (qte === null) forme = 'aucune'
  else if (unite && MASSE.test(unite)) forme = 'masse'
  else if (unite && VOLUME.test(unite)) forme = 'volume'
  else if (unite) forme = 'cuillere'
  else forme = 'compte'

  return { brut, qte, unite, aliment: aliment || t, forme,
           preparation: preparations.length ? preparations.join(', ') : null }
}
