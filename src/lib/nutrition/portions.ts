/**
 * Un seul plat, deux objectifs (D25).
 *
 * Vous cuisinez la même chose. Ce qui diffère, c'est la portion — et c'est là
 * qu'est le piège : une part plus grosse donne plus de TOUT, pas plus de
 * protéines. Mettre 20 % de plus dans l'assiette de celui qui vise 20 % de
 * protéines en plus lui donne aussi 20 % de calories en plus, dont il n'a
 * peut-être pas besoin.
 *
 * Il y a donc DEUX diagnostics à ne pas confondre, et c'est toute la valeur de
 * ce module :
 *
 *   · la part est trop petite (ou trop grosse) — le plat est mal dimensionné
 *     pour le nombre de barquettes demandé. Il faut cuisiner plus, ou prévoir
 *     moins de parts. Ajouter du skyr n'y changerait rien.
 *   · la part fait le compte en calories mais pas en protéines — le plat n'est
 *     pas assez protéiné. Là, et là seulement, on complète.
 *
 * Confondre les deux, c'est proposer 400 g de skyr à quelqu'un qui a surtout
 * besoin d'une deuxième barquette.
 */

/** Objectif d'UNE part. L'appelant a déjà ramené la journée au repas. */
export type Cible = {
  userId: string
  kcal: number
  proteinG: number
}

export type Plat = {
  grammes: number
  kcal: number
  proteinG: number
  fiberG: number
  carbG: number
  fatG: number
}

export type Demande = {
  cible: Cible
  /** Combien de parts cette personne emporte de ce plat. */
  nombre: number
}

export type Diagnostic = 'ok' | 'complement' | 'insuffisant' | 'excessif'

export type Part = {
  userId: string
  nombre: number
  grammes: number
  kcal: number
  proteinG: number
  fiberG: number
  carbG: number
  fatG: number
  diagnostic: Diagnostic
  /** Ce que la part livre rapporté à ce qu'elle vise, en calories. */
  ratioKcal: number
}

export type Complement = {
  userId: string
  source: string
  grammes: number
  proteinG: number
}

export type Repartition = {
  parts: Part[]
  complements: Complement[]
  /** Ce que l'écran affiche pour expliquer la découpe. Jamais vide. */
  explication: string
}

/**
 * Tolérances. Elles sont larges à dessein : l'incertitude des macros (D18) est
 * souvent plus grande que ça, et faire de la dentelle par-dessus serait une
 * précision de façade.
 */
const PLANCHER_KCAL = 0.9
const PLAFOND_KCAL = 1.15
const SEUIL_PROTEINE = 0.9

export type SourceProteinee = { nom: string; proteinesPour100g: number }

/** Le complément par défaut. Le foyer peut en désigner un autre (D38). */
export const SKYR: SourceProteinee = { nom: 'skyr', proteinesPour100g: 10 }

/** On ne propose pas 37 g de skyr : on arrondit à la cuillère. */
function arrondiUtile(grammes: number): number {
  return Math.round(grammes / 25) * 25
}

function diagnostique(ratioKcal: number, proteinG: number, cible: Cible): Diagnostic {
  if (ratioKcal < PLANCHER_KCAL) return 'insuffisant'
  if (ratioKcal > PLAFOND_KCAL) return 'excessif'
  if (cible.proteinG > 0 && proteinG < cible.proteinG * SEUIL_PROTEINE) return 'complement'
  return 'ok'
}

function partDe(plat: Plat, grammes: number, cible: Cible, nombre: number): Part {
  const r = plat.grammes > 0 ? grammes / plat.grammes : 0
  const kcal = plat.kcal * r
  const proteinG = plat.proteinG * r
  const ratioKcal = cible.kcal > 0 ? kcal / cible.kcal : 1
  return {
    userId: cible.userId,
    nombre,
    grammes: Math.round(grammes),
    kcal: Math.round(kcal),
    proteinG: Math.round(proteinG * 10) / 10,
    fiberG: Math.round(plat.fiberG * r * 10) / 10,
    carbG: Math.round(plat.carbG * r * 10) / 10,
    fatG: Math.round(plat.fatG * r * 10) / 10,
    diagnostic: diagnostique(ratioKcal, proteinG, cible),
    ratioKcal: Math.round(ratioKcal * 100) / 100,
  }
}

function phrase(parts: Part[], complements: Complement[]): string {
  const maigres = parts.filter(p => p.diagnostic === 'insuffisant')
  const grosses = parts.filter(p => p.diagnostic === 'excessif')
  const detail = parts.map(p => `${p.nombre} × ${p.grammes} g`).join(', ')

  if (maigres.length > 0) {
    const manque = Math.round((1 - Math.min(...maigres.map(p => p.ratioKcal))) * 100)
    return `${detail} — la part est ${manque} % en dessous de l'objectif. `
      + 'Le plat est trop petit pour ce nombre de barquettes : cuisinez plus, '
      + 'ou prévoyez moins de parts. Un complément protéiné n\'y changerait rien.'
  }
  if (grosses.length > 0) {
    const trop = Math.round((Math.max(...grosses.map(p => p.ratioKcal)) - 1) * 100)
    return `${detail} — la part dépasse l'objectif de ${trop} %. `
      + 'Faites-en une barquette de plus plutôt que des parts trop grosses.'
  }
  if (complements.length > 0) {
    const qui = complements.map(c => `${c.grammes} g de ${c.source}`).join(' et ')
    return `${detail}, puis ${qui} : le plat fait le compte en calories mais pas `
      + 'en protéines, et agrandir la part aurait donné des calories.'
  }
  return `Le plat couvre les deux objectifs : ${detail}.`
}

export function repartit(
  plat: Plat,
  demandes: Demande[],
  complement: SourceProteinee = SKYR,
): Repartition {
  const utiles = demandes.filter(d => d.nombre > 0 && d.cible.kcal > 0)
  if (utiles.length === 0 || plat.grammes <= 0) {
    return { parts: [], complements: [], explication: 'Rien à répartir.' }
  }

  // Découpe au prorata des calories visées, pondérée par le nombre de parts :
  // cinq barquettes pour l'un et deux pour l'autre ne partagent pas le plat
  // dans le même rapport que leurs objectifs journaliers.
  const total = utiles.reduce((s, d) => s + d.nombre * d.cible.kcal, 0)
  const parts = utiles.map(d =>
    partDe(plat, (plat.grammes * d.cible.kcal) / total, d.cible, d.nombre))

  // On ne complète que ce qui est vraiment un problème de protéines.
  const complements = parts
    .filter(p => p.diagnostic === 'complement')
    .map(p => {
      const vise = utiles.find(d => d.cible.userId === p.userId)!.cible.proteinG
      const grammes = arrondiUtile(((vise - p.proteinG) * 100) / complement.proteinesPour100g)
      return {
        userId: p.userId,
        source: complement.nom,
        grammes,
        proteinG: Math.round((grammes * complement.proteinesPour100g) / 10) / 10,
      }
    })
    .filter(c => c.grammes > 0)

  return { parts, complements, explication: phrase(parts, complements) }
}

/**
 * La part d'une journée qu'un repas représente. Valeurs par défaut, modifiables
 * par foyer : ce sont des conventions, pas des mesures.
 */
export const PART_DU_JOUR: Record<string, number> = {
  petit_dejeuner: 0.2,
  dejeuner: 0.35,
  diner: 0.35,
  collation: 0.1,
}

/** Ramène un objectif journalier à l'objectif d'un repas donné. */
export function cibleDuRepas(
  userId: string, kcalJour: number, proteinJour: number, repas: string,
): Cible {
  const f = PART_DU_JOUR[repas] ?? 0.35
  return { userId, kcal: kcalJour * f, proteinG: proteinJour * f }
}

/**
 * Combien de parts il faut prévoir pour que la découpe tombe juste.
 * Sert à l'écran de choix (D52) : « ce plat fait 6 parts pour vos objectifs ».
 */
export function partsConseillees(plat: Plat, cibles: Cible[]): number {
  const moyenne = cibles.reduce((s, c) => s + c.kcal, 0) / Math.max(1, cibles.length)
  if (moyenne <= 0 || plat.kcal <= 0) return 0
  return Math.max(1, Math.round(plat.kcal / moyenne))
}
