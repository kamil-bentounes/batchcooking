/**
 * Analyse d'une étape de recette française.
 *
 * C'est la moitié DÉTERMINISTE de l'ingestion : sans aucun modèle, elle doit
 * trouver le verbe, l'appareil, la durée et la charge. La mesure de référence
 * sur 299 étapes réelles donne 98 % de durées trouvées par `default_duration`
 * seule — c'est cette barre-là qu'il faut tenir.
 *
 * Ce qui n'est PAS ici : le raffinement par modèle. Il vient après, et seulement
 * là où le déterministe a rendu `null`.
 */

export type Charge = 'actif' | 'passif' | 'bloquant'
export type Echelle = 'constant' | 'lineaire_plafonne'

export interface EtapeAnalysee {
  brut: string
  /** Faux pour « bon appétit » : autant de minutes fantômes évitées. */
  estAction: boolean
  verbe: string | null
  /** Code de `appliance_catalog`, jamais le type brut du référentiel. */
  appareil: string | null
  dureeMin: number | null
  sourceDuree: 'declaree' | 'defaut' | null
  temperatureC: number | null
  sourceTemperature: 'declaree' | 'defaut' | null
  charge: Charge | null
  echelle: Echelle | null
  dureeBaseMin: number | null
  /** Grammes cités dans l'étape elle-même, s'il y en a. */
  quantiteG: number | null
  /** 1 quand tout est écrit dans le texte, moins quand on a comblé. */
  confiance: number
}

export interface LigneDuree {
  verb: string
  appliance_type: string | null
  base_minutes: number
  load_type: Charge
  scaling: Echelle
}

export interface Referentiel {
  durees: LigneDuree[]
  /** Verbe de recette → verbe de `default_duration`. */
  alias: Record<string, string>
  /** Phrases qui ne décrivent aucun geste. */
  nonActions: RegExp[]
  temperatures?: { preparation: string; celsius: number }[]
}

/** Accents et casse retirés : on compare des radicaux, pas des orthographes. */
export const pliure = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .toLowerCase()

/**
 * Les appareils du référentiel des durées ne sont pas ceux que l'on coche.
 * Une poêle et une casserole occupent chacune un feu, et il y en a quatre :
 * c'est « plaques » que l'utilisateur coche, et c'est le bon modèle.
 */
const VERS_CATALOGUE: Record<string, string> = {
  poele: 'plaques',
  casserole: 'plaques',
  plaque: 'plaques',
}
export const appareilDuCatalogue = (t: string | null): string | null =>
  t === null ? null : VERS_CATALOGUE[t] ?? t

/** Appareils nommés dans le texte. L'ordre compte : le plus précis d'abord. */
const APPAREILS_ECRITS: [RegExp, string][] = [
  [/\bair\s?fry(?:er|euse)|friteuse\s+(?:sans|a)\s+huile/, 'air_fryer'],
  [/\bmicro[-\s]?ondes?\b/, 'micro_ondes'],
  [/\b(?:autocuiseur|cocotte[-\s]minute|cookeo)\b/, 'autocuiseur'],
  [/\b(?:thermomix|robot\s+cuiseur|companion)\b/, 'robot_cuiseur'],
  [/\b(?:blender|mixeur|mixer\s+plongeant)\b/, 'blender'],
  [/\b(?:batteur|fouet\s+electrique|robot\s+pat)/, 'batteur'],
  [/\bfour\b(?!\s*(?:chette|nir))/, 'four'],
  [/\b(?:poele|sauteuse|wok|casserole|faitout|fait[-\s]tout|cocotte|marmite|plaque)/, 'plaques'],
]

/**
 * Le radical d'un verbe, tel qu'on le cherche dans le texte.
 *
 * On ne conjugue pas : on coupe. « émincer » → « eminc », qui attrape
 * « émincez », « émincés », « en émincant ». C'est grossier et ça tient, parce
 * qu'un radical français de cinq lettres est rarement ambigu — et les cas qui
 * le sont (« coup » dans « coupelle ») sont réglés par l'ordre de recherche.
 */
function radical(verbe: string): string {
  const v = pliure(verbe)
  // Verbes composés : on ne garde que le premier mot pour le radical, la suite
  // devient une contrainte de proximité (voir `motifDe`).
  const premier = v.split(/\s+/)[0]
  return premier
    .replace(/er$/, '')      // éplucher → épluch
    .replace(/ir$/, 'i')     // saisir → saisi
    .replace(/re$/, '')      // cuire → cui
}

/** Le motif d'un verbe, composés compris (« faire revenir », « porter à ébullition »). */
function motifDe(verbe: string): RegExp {
  const mots = pliure(verbe).split(/\s+/)
  const tete = radical(verbe)
  if (mots.length === 1) return new RegExp(`\\b${tete}`)
  // « faire revenir » : le premier mot se conjugue, les suivants suivent de près.
  const suite = mots.slice(1).map(m => m.replace(/er$/, '')).join('\\S*\\s+')
  return new RegExp(`\\b${tete}\\S*\\s+(?:\\w+\\s+){0,2}${suite}`)
}

/** « 25 min », « 1 h 30 », « une heure », « 10 à 15 minutes ». */
function dureeEcrite(texte: string): number | null {
  const t = pliure(texte)

  // « 1 h 30 », « 1h30 », « 2 heures 15 »
  const composee = t.match(/(\d+)\s*h(?:eures?)?\s*(\d{1,2})\b/)
  if (composee) return Number(composee[1]) * 60 + Number(composee[2])

  // Une plage : on prend le milieu, comme pour les ingrédients.
  const plage = t.match(/(\d+)\s*(?:a|-|et)\s*(\d+)\s*(min|minutes?|h|heures?)\b/)
  if (plage) {
    const milieu = (Number(plage[1]) + Number(plage[2])) / 2
    return plage[3].startsWith('h') ? milieu * 60 : milieu
  }

  const simple = t.match(/(\d+(?:[.,]\d+)?)\s*(min|minutes?|mn|h|heures?|secondes?|sec)\b/)
  if (simple) {
    const n = Number(simple[1].replace(',', '.'))
    if (/^h/.test(simple[2])) return n * 60
    if (/^sec/.test(simple[2])) return Math.max(1, Math.round(n / 60))
    return n
  }

  // « une demi-heure », « un quart d'heure » : écrits en toutes lettres, mais
  // sans ambiguïté. « quelques minutes » ne l'est pas : on ne devine pas.
  if (/\bune?\s+demi[-\s]heure\b/.test(t)) return 30
  if (/\bun\s+quart\s+d.?\s*heure\b/.test(t)) return 15
  if (/\bune\s+heure\b/.test(t)) return 60
  return null
}

/** « 180 °C », « th. 6 », « thermostat 7 ». */
function temperatureEcrite(texte: string): number | null {
  const t = pliure(texte)
  const degres = t.match(/(\d{2,3})\s*°?\s*c\b|\b(\d{2,3})\s*degres?/)
  if (degres) return Number(degres[1] ?? degres[2])
  const thermostat = t.match(/\bth(?:ermostat)?\.?\s*(\d{1,2})\b/)
  // Le thermostat français vaut 30 °C par cran. C'est une convention, pas une
  // mesure — mais elle est universelle dans les recettes.
  if (thermostat) return Number(thermostat[1]) * 30
  return null
}

/** Les grammes cités dans l'étape, s'il y en a. Sert à la mise à l'échelle. */
function quantiteEcrite(texte: string): number | null {
  const t = pliure(texte)
  let total = 0
  let vu = false
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|gr|grammes?)\b/g)) {
    const n = Number(m[1].replace(',', '.'))
    total += /^k/.test(m[2]) ? n * 1000 : n
    vu = true
  }
  return vu ? total : null
}

/** Index des verbes, du radical le plus long au plus court. */
function indexVerbes(ref: Referentiel): { verbe: string; motif: RegExp }[] {
  const tous = new Set<string>([
    ...ref.durees.map(d => d.verb),
    ...Object.keys(ref.alias),
  ])
  return [...tous]
    // Le plus spécifique gagne : « cuire sous pression » avant « cuire »,
    // « faire revenir » avant « faire fondre ».
    .sort((a, b) => pliure(b).length - pliure(a).length)
    .map(verbe => ({ verbe, motif: motifDe(verbe) }))
}

/** Le verbe apparaît-il dans les premiers mots ? C'est là qu'est l'impératif. */
const MOTS_DE_TETE = 4
function enTete(plie: string, motif: RegExp): boolean {
  const debut = plie.split(/\s+/).slice(0, MOTS_DE_TETE).join(' ')
  return motif.test(debut)
}

let cacheRef: Referentiel | null = null
let cacheIndex: { verbe: string; motif: RegExp }[] = []

export function analyserEtape(brut: string, ref: Referentiel): EtapeAnalysee {
  if (cacheRef !== ref) { cacheRef = ref; cacheIndex = indexVerbes(ref) }

  const vide: EtapeAnalysee = {
    brut, estAction: false, verbe: null, appareil: null,
    dureeMin: null, sourceDuree: null,
    temperatureC: null, sourceTemperature: null,
    charge: null, echelle: null, dureeBaseMin: null, quantiteG: null, confiance: 0,
  }

  const texte = brut.trim()
  if (texte.length === 0) return vide

  const plie = pliure(texte)
  // Une phrase qui ne décrit aucun geste n'entre pas dans le plan : sans cela,
  // « bon appétit » vaudrait quatre minutes de four.
  if (ref.nonActions.some(m => m.test(plie))) return vide

  // ── Le verbe ───────────────────────────────────────────────────────────────
  // Une étape contient souvent deux verbes. Deux règles, dans cet ordre :
  //
  // 1. celui qui MOBILISE UN APPAREIL gagne. « Ajoutez le poulet et faites-le
  //    dorer » est une action de poêle : retenir « ajouter » libérerait le feu
  //    dans le plan, ce qui est bien pire qu'une minute mal comptée.
  // 2. à défaut, celui de TÊTE DE PHRASE. « Ajoutez les poivrons coupés en
  //    lanières » décrit des poivrons, elle ne demande pas de couper.
  const matches = cacheIndex
    .filter(v => v.motif.test(plie))
    .map(v => {
      const canonique = ref.alias[v.verbe] ?? v.verbe
      return {
        canonique,
        tete: enTete(plie, v.motif),
        avecAppareil: ref.durees.some(d => d.verb === canonique && d.appliance_type !== null),
      }
    })
  const retenu = matches.find(m => m.avecAppareil && m.tete)
    ?? matches.find(m => m.avecAppareil)
    ?? matches.find(m => m.tete)
    ?? matches[0]
  const verbe = retenu?.canonique ?? null

  // ── L'appareil : ce qui est écrit prime sur ce que le référentiel suppose ──
  const ecrit = APPAREILS_ECRITS.find(([m]) => m.test(plie))?.[1] ?? null

  const candidats = verbe ? ref.durees.filter(d => d.verb === verbe) : []
  const parAppareil = ecrit
    ? candidats.find(d => appareilDuCatalogue(d.appliance_type) === ecrit)
    : undefined
  const ligne = parAppareil
    ?? candidats.find(d => d.appliance_type === null)
    ?? candidats[0]

  const appareil = ecrit ?? appareilDuCatalogue(ligne?.appliance_type ?? null)

  // ── La durée : déclarée d'abord, référentiel ensuite ──────────────────────
  const declaree = dureeEcrite(texte)
  const quantite = quantiteEcrite(texte)
  let dureeMin: number | null = null
  let sourceDuree: EtapeAnalysee['sourceDuree'] = null

  if (declaree !== null) {
    dureeMin = declaree
    sourceDuree = 'declaree'
  } else if (ligne) {
    const facteur = ligne.scaling === 'lineaire_plafonne' && quantite
      ? Math.min(3, Math.max(1, quantite / 250))
      : 1
    dureeMin = Math.round(ligne.base_minutes * facteur * 10) / 10
    sourceDuree = 'defaut'
  }

  // ── La température ────────────────────────────────────────────────────────
  const tempEcrite = temperatureEcrite(texte)
  const tempDefaut = tempEcrite === null && verbe
    ? ref.temperatures?.find(t => pliure(t.preparation) === pliure(verbe))?.celsius ?? null
    : null

  // Sans verbe ni durée, ce n'est pas une action ordonnançable.
  const estAction = verbe !== null || declaree !== null

  return {
    brut: texte,
    estAction,
    verbe,
    appareil: estAction ? appareil : null,
    dureeMin: estAction ? dureeMin : null,
    sourceDuree: estAction ? sourceDuree : null,
    temperatureC: tempEcrite ?? tempDefaut,
    sourceTemperature: tempEcrite !== null ? 'declaree' : tempDefaut !== null ? 'defaut' : null,
    charge: ligne?.load_type ?? (estAction ? 'actif' : null),
    echelle: ligne?.scaling ?? null,
    dureeBaseMin: ligne?.base_minutes ?? null,
    quantiteG: estAction ? quantite : null,
    // Tout écrit : 1. Verbe reconnu mais durée déduite : 0,7. Durée seule : 0,5.
    confiance: !estAction ? 0
      : sourceDuree === 'declaree' && verbe ? 1
      : sourceDuree === 'declaree' ? 0.5
      : verbe ? 0.7 : 0.3,
  }
}

/**
 * Le graphe d'une recette : par défaut, l'ordre du texte.
 *
 * On ne bat pas les cartes d'une recette sous prétexte que personne n'a saisi
 * son graphe de dépendances. Une exception, et une seule : le préchauffage ne
 * dépend de rien — c'est justement ce qu'on veut lancer en premier.
 */
export function dependances(etapes: EtapeAnalysee[]): string[][] {
  const liens: string[][] = []
  let precedente = -1
  etapes.forEach((e, i) => {
    if (!e.estAction) { liens.push([]); return }
    const libre = e.verbe === 'préchauffer'
    liens.push(libre || precedente < 0 ? [] : [String(precedente)])
    precedente = i
  })
  return liens
}
