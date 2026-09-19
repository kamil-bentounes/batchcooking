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
    // ⚠️ Les verbes en -vrir et -frir ne gardent pas le « i » : « couvrir » se
    //    conjugue « couvrez », pas « couvrissez ». Le radical « couvri » ne
    //    reconnaissait donc aucune forme réelle, et l'étape passait pour muette.
    .replace(/([vf])rir$/, '$1r')   // couvrir → couvr, offrir → offr
    .replace(/ir$/, 'i')     // saisir → saisi
    .replace(/re$/, '')      // cuire → cui
}

/**
 * Sous cette longueur, un radical attrape n'importe quoi.
 *
 * « saler » donne « sal », et `\bsal` reconnaît « saladier » et « salade » : la
 * phrase « Dans un grand saladier » devenait une action, avec une durée et un
 * cuisinier mobilisé. Le commentaire de `radical` disait déjà « un radical de
 * cinq lettres est rarement ambigu » — il fallait l'appliquer.
 */
const RADICAL_MIN = 5

/**
 * Pour un radical court, on ne préfixe pas : on énumère les formes.
 *
 * ⚠️ Et on les énumère PAR GROUPE. La première version ne connaissait que le
 *    premier groupe, si bien que « cuire », « rôtir » et « battre » — dont le
 *    radical tombe sous la borne une fois la terminaison retirée — n'étaient
 *    plus reconnus du tout. Mesuré : cinq gestes de cuisson courants passaient
 *    de 6 minutes de travail à 167, parce qu'une étape sans verbe perd la
 *    charge « passif » du référentiel et retombe sur « actif ».
 *
 * La borne de fin de mot fait le reste du travail : elle écarte « cuillère »
 * pour « cuire », et « saladier » pour « saler ».
 */
function formesCourtes(tete: string, infinitif: string): RegExp {
  const fins = infinitif.endsWith('ir')
    // rôtir → roti : rôtir, rôtit, rôti, rôtis, rôtissez, rôtissant
    ? 'r|t|ts|s|e|es|ssez|ssent|ssons|ssant'
    : infinitif.endsWith('re')
      // cuire → cui : cuire, cuit, cuite, cuisez, cuisant · battre → batt : battre, battez
      ? 're|res|t|te|tes|ts|sez|sent|sons|sant|s|ez|e|es'
      // saler → sal : saler, salez, sale, salé, salés, salant
      : 'er|ez|e|es|ee|ees|ant|ons'
  return new RegExp(`\\b${tete}(?:${fins})\\b`)
}

/** Le motif d'un verbe, composés compris (« faire revenir », « porter à ébullition »). */
function motifDe(verbe: string): RegExp {
  const mots = pliure(verbe).split(/\s+/)
  const tete = radical(verbe)
  if (mots.length === 1) {
    return tete.length < RADICAL_MIN
      ? formesCourtes(tete, pliure(verbe))
      : new RegExp(`\\b${tete}`)
  }
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
    // ⚠️ `'actif'` par défaut est FAUX pour un repos.
    //
    //    « Laissez décongeler 2 heures », « laissez reposer une nuit », « laissez
    //    refroidir » : aucun verbe du référentiel, mais une durée déclarée —
    //    donc `estAction`, donc 120 minutes comptées comme du TRAVAIL. Ces
    //    minutes entrent dans `recipe.active_time_min`, c'est-à-dire dans le
    //    filtre principal du catalogue : la recette disparaît de « 25 min
    //    actif » alors qu'elle n'en demande que cinq. Et l'ordonnanceur
    //    mobilise un cuisinier deux heures pour regarder décongeler.
    //
    //    Mesuré : sept formulations sur dix, sur des recettes réelles.
    // La PHRASE l'emporte sur le verbe : « réservez la préparation » est un
    // geste, « réservez au frais 20 minutes » est une attente, et c'est le même
    // verbe. Le référentiel décide par défaut, la phrase quand elle est claire.
    charge: !estAction ? null
      : estRepos(texte) ? 'passif'
      : ligne?.load_type ?? 'actif',
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
 * Une étape où l'on ATTEND, et rien d'autre.
 *
 * Elle n'a pas de verbe du référentiel — « laisser » n'en est pas un — mais
 * elle a une durée, souvent longue. Sans ce test, elle passait pour du travail
 * actif : deux heures de décongélation comptées comme deux heures de cuisine.
 *
 * On exige que l'étape ne porte QUE de l'attente : « laissez mijoter en remuant »
 * demande la main, et le verbe le dira.
 */
export function estRepos(texte: string): boolean {
  const t = texte.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const attente = /\b(laisse[rz]?|laissant|reserve[rz]?|patiente[rz]?)\b.{0,40}\b(repose|reposer|refroidi|refroidir|decongel|tiedir|lever|pousser|mariner|macerer|infuser|prendre|figer|durcir|degorger|dessale|tremper|au frais|au froid|au refrigerateur|au frigo|a temperature ambiante)/
  const direct = /^\s*(repos|attente|temps de (repos|pousse|levee|pause))\b/
  if (!attente.test(t) && !direct.test(t)) return false
  // Un geste dans la même phrase rend la main : « laissez reposer puis fouettez ».
  return !/\b(remu|fouett|melang|tourn|surveill|arros|retourn|verifi)/.test(t)
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
  /**
   * Le préchauffage attend d'être UTILISÉ.
   *
   * On lui retirait bien son arc entrant, mais on le posait ensuite comme
   * prédécesseur de la suite : tout ce qui venait après attendait les douze
   * minutes de four, épluchage compris. Mesuré : 65 min au lieu de 53, sur une
   * recette réelle. Or le four chauffe pendant qu'on travaille — c'est
   * exactement ce que D30 achète.
   *
   * Il devient donc le prédécesseur de la PREMIÈRE étape qui se sert du four,
   * et de personne d'autre. La chaîne du texte, elle, l'enjambe.
   */
  let prechauffage = -1
  etapes.forEach((e, i) => {
    if (!e.estAction) { liens.push([]); return }
    if (e.verbe === 'préchauffer') {
      liens.push([])
      prechauffage = i
      return
    }
    const avant: string[] = []
    if (precedente >= 0) avant.push(String(precedente))
    if (prechauffage >= 0 && e.appareil === 'four') {
      if (!avant.includes(String(prechauffage))) avant.push(String(prechauffage))
      prechauffage = -1        // une fois utilisé, il ne retient plus personne
    }
    liens.push(avant)
    precedente = i
  })
  return liens
}
