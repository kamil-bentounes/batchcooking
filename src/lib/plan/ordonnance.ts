/**
 * L'ordonnancement d'une session de batch cooking.
 *
 * C'est un RCPSP (resource-constrained project scheduling problem), NP-difficile
 * dans le cas général. On n'en cherche pas l'optimum : on cherche un plan bon,
 * calculé en moins de 100 ms sur un téléphone, et surtout EXPLICABLE — l'écran
 * doit pouvoir dire « le four est le goulot », pas « faites confiance ».
 *
 * Méthode : schéma sériel de génération (SSGS) piloté par une liste de priorité,
 * puis recherche locale sur cette liste. Le SSGS garantit un plan faisable quelle
 * que soit la permutation, ce qui rend la recherche locale triviale à écrire et
 * impossible à casser.
 *
 * DÉTERMINISME : deux téléphones doivent afficher le MÊME plan (D50). Le tirage
 * aléatoire est donc semé par l'identifiant du cycle, jamais par l'horloge.
 */
import type { Plan, Ressources, Tache, TachePlanifiee } from './types.ts'

/** Les durées sont des nombres à virgule ; on ne compare jamais deux flottants. */
const EPS = 1e-9

/** Pool des mains humaines. Le dièse ne peut heurter aucun code d'appareil. */
const CUISINIER = '#cuisinier'

type Reservation = { debut: number; fin: number }
type Occupation = Map<string, Reservation[]>

/** Capacité d'un pool. Un appareil inconnu de la session compte pour un. */
function capacite(ressources: Ressources, pool: string): number {
  if (pool === CUISINIER) return Math.max(1, ressources.cuisiniers)
  return ressources.appareils[pool] ?? 1
}

/** Les pools qu'une tâche occupe pendant toute sa durée. */
function pools(t: Tache): string[] {
  const p: string[] = []
  if (t.actif) p.push(CUISINIER)
  if (t.appareil) p.push(t.appareil)
  return p
}

/**
 * La capacité tient-elle sur TOUT l'intervalle ?
 *
 * Compter les réservations qui chevauchent [debut, fin) surestime : deux
 * réservations peuvent chevaucher l'intervalle sans se chevaucher entre elles.
 * On balaie donc les seuls instants où le compte peut changer.
 */
function tient(res: Reservation[], debut: number, fin: number, cap: number): boolean {
  const instants = [debut]
  for (const r of res) if (r.debut > debut + EPS && r.debut < fin - EPS) instants.push(r.debut)
  for (const t of instants) {
    let n = 0
    for (const r of res) if (r.debut <= t + EPS && t < r.fin - EPS) n++
    if (n >= cap) return false
  }
  return true
}

/** Le plus tôt possible à partir de `apres`, tous pools satisfaits ensemble. */
function premierCreneau(
  t: Tache, apres: number, occ: Occupation, ressources: Ressources,
): number {
  const concernes = pools(t)
  if (concernes.length === 0) return apres

  // Un créneau ne peut s'ouvrir qu'au moment où quelque chose se libère.
  const candidats = new Set<number>([apres])
  for (const p of concernes)
    for (const r of occ.get(p) ?? []) if (r.fin > apres + EPS) candidats.add(r.fin)

  for (const c of [...candidats].sort((a, b) => a - b)) {
    const ok = concernes.every(p =>
      tient(occ.get(p) ?? [], c, c + t.dureeMin, capacite(ressources, p)))
    if (ok) return c
  }
  // Inatteignable : passé la dernière fin, tout est libre.
  return Math.max(apres, ...concernes.flatMap(p => (occ.get(p) ?? []).map(r => r.fin)))
}

/** Le cuisinier le moins chargé parmi ceux qui sont libres sur l'intervalle. */
function attribueCuisinier(
  planifiees: TachePlanifiee[], debut: number, fin: number, nb: number,
): number {
  const charge = new Array<number>(nb).fill(0)
  const pris = new Set<number>()
  for (const p of planifiees) {
    if (p.cuisinier === null) continue
    charge[p.cuisinier] += p.dureeMin
    if (p.debutMin < fin - EPS && debut < p.finMin - EPS) pris.add(p.cuisinier)
  }
  let choix = 0
  let min = Infinity
  for (let i = 0; i < nb; i++) {
    if (pris.has(i)) continue
    if (charge[i] < min) { min = charge[i]; choix = i }
  }
  return choix
}

/**
 * Schéma sériel : on prend les tâches une à une dans l'ordre de priorité, en
 * ne retenant à chaque tour que celles dont tous les prédécesseurs sont posés.
 * Toute permutation donne un plan faisable ; c'est ce qui permet à la recherche
 * locale de brasser la liste sans jamais produire d'aberration.
 */
export function ordonnance(
  taches: Tache[], ressources: Ressources, priorite: string[],
): Plan {
  const parId = new Map(taches.map(t => [t.id, t]))
  const rang = new Map(priorite.map((id, i) => [id, i]))
  const occ: Occupation = new Map()
  const posees = new Map<string, TachePlanifiee>()
  const planifiees: TachePlanifiee[] = []
  const restantes = new Set(taches.map(t => t.id))

  while (restantes.size > 0) {
    const eligibles = [...restantes]
      .filter(id => parId.get(id)!.dependDe.every(d => !restantes.has(d)))
      .sort((a, b) => (rang.get(a) ?? 1e9) - (rang.get(b) ?? 1e9))

    if (eligibles.length === 0) {
      // Rien d'éligible alors qu'il reste des tâches : le graphe a une boucle.
      // On refuse plutôt que de rendre un plan qui oublierait des actions.
      throw new Error(`dépendances circulaires : ${[...restantes].join(', ')}`)
    }

    const t = parId.get(eligibles[0])!
    const apres = t.dependDe.reduce((m, d) => Math.max(m, posees.get(d)?.finMin ?? 0), 0)
    const debut = premierCreneau(t, apres, occ, ressources)
    const fin = debut + t.dureeMin

    const pl: TachePlanifiee = {
      ...t,
      debutMin: debut,
      finMin: fin,
      cuisinier: t.actif
        ? attribueCuisinier(planifiees, debut, fin, Math.max(1, ressources.cuisiniers))
        : null,
    }
    for (const p of pools(t)) {
      if (!occ.has(p)) occ.set(p, [])
      occ.get(p)!.push({ debut, fin })
    }
    posees.set(t.id, pl)
    planifiees.push(pl)
    restantes.delete(t.id)
  }

  planifiees.sort((a, b) => a.debutMin - b.debutMin || a.label.localeCompare(b.label, 'fr'))
  return { ...mesure(planifiees), taches: planifiees, chemin: cheminCritique(planifiees) }
}

/** Les trois chiffres que l'écran affiche, et le seul que l'on minimise. */
function mesure(taches: TachePlanifiee[]): Omit<Plan, 'taches' | 'chemin'> {
  const dureeMin = taches.reduce((m, t) => Math.max(m, t.finMin), 0)
  const travailMin = taches.reduce((s, t) => s + (t.actif ? t.dureeMin : 0), 0)

  // Union des intervalles actifs : deux personnes qui travaillent en même temps
  // ne font pas passer le temps deux fois.
  const actifs = taches.filter(t => t.actif)
    .map(t => [t.debutMin, t.finMin] as const)
    .sort((a, b) => a[0] - b[0])
  let occupeMin = 0
  let curDeb = -1
  let curFin = -1
  for (const [d, f] of actifs) {
    if (curFin < 0) { curDeb = d; curFin = f; continue }
    if (d <= curFin + EPS) { curFin = Math.max(curFin, f); continue }
    occupeMin += curFin - curDeb
    curDeb = d
    curFin = f
  }
  if (curFin >= 0) occupeMin += curFin - curDeb

  return { dureeMin, travailMin, occupeMin, attenteMin: Math.max(0, dureeMin - occupeMin) }
}

/**
 * La chaîne qui fixe la durée. On remonte depuis la fin en suivant, à chaque
 * pas, la tâche qui se termine exactement quand la suivante commence — qu'elle
 * la précède par recette ou parce qu'elle lui tenait le four.
 */
function cheminCritique(taches: TachePlanifiee[]): string[] {
  if (taches.length === 0) return []
  const fin = taches.reduce((m, t) => Math.max(m, t.finMin), 0)
  let courante = taches.find(t => Math.abs(t.finMin - fin) < EPS)
  const chaine: string[] = []
  const vus = new Set<string>()

  while (courante && !vus.has(courante.id)) {
    const ici = courante
    vus.add(ici.id)
    chaine.unshift(ici.id)
    if (ici.debutMin < EPS) break
    const partages = new Set(pools(ici))
    courante = taches.find(t =>
      t.id !== ici.id && Math.abs(t.finMin - ici.debutMin) < EPS &&
      (ici.dependDe.includes(t.id) || pools(t).some(p => partages.has(p))))
  }
  return chaine
}

/** Générateur semé : le même cycle donne toujours le même plan (D50). */
function semeur(graine: number): () => number {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function graineDe(texte: string): number {
  let h = 2166136261
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Priorité initiale : le plus long chemin restant jusqu'à la fin, d'abord.
 * C'est l'heuristique classique sur le graphe, et elle donne déjà un plan
 * raisonnable — la recherche locale ne fait que gratter les derniers pourcents.
 */
function prioriteInitiale(taches: Tache[]): string[] {
  const parId = new Map(taches.map(t => [t.id, t]))
  const successeurs = new Map<string, string[]>()
  for (const t of taches)
    for (const d of t.dependDe) {
      if (!successeurs.has(d)) successeurs.set(d, [])
      successeurs.get(d)!.push(t.id)
    }

  const reste = new Map<string, number>()
  const calcule = (id: string, pile: Set<string>): number => {
    const connu = reste.get(id)
    if (connu !== undefined) return connu
    if (pile.has(id)) return 0            // boucle : `ordonnance` la signalera
    pile.add(id)
    const suite = (successeurs.get(id) ?? [])
      .reduce((m, s) => Math.max(m, calcule(s, pile)), 0)
    pile.delete(id)
    const v = (parId.get(id)?.dureeMin ?? 0) + suite
    reste.set(id, v)
    return v
  }
  for (const t of taches) calcule(t.id, new Set())

  return [...taches]
    .sort((a, b) =>
      (reste.get(b.id) ?? 0) - (reste.get(a.id) ?? 0) ||
      b.dureeMin - a.dureeMin ||
      a.id.localeCompare(b.id))
    .map(t => t.id)
}

export type OptionsPlan = {
  /** Sème le tirage. Passer `cycle.id` : le plan devient reproductible. */
  graine?: string
  /** Budget de recherche. Au-delà, on rend le meilleur trouvé. */
  budgetMs?: number
  iterationsMax?: number
}

/**
 * Le point d'entrée. Rend le meilleur plan trouvé dans le budget, jamais un
 * plan infaisable, et le même plan pour la même graine.
 */
export function planifie(
  taches: Tache[], ressources: Ressources, options: OptionsPlan = {},
): Plan {
  if (taches.length === 0) {
    return { taches: [], dureeMin: 0, travailMin: 0, occupeMin: 0, attenteMin: 0, chemin: [] }
  }
  const { graine = 'batch', budgetMs = 60, iterationsMax = 2000 } = options

  let meilleureListe = prioriteInitiale(taches)
  let meilleur = ordonnance(taches, ressources, meilleureListe)

  const rnd = semeur(graineDe(graine))
  const depart = Date.now()
  for (let i = 0; i < iterationsMax; i++) {
    if (i % 32 === 0 && Date.now() - depart > budgetMs) break

    // Voisinage : on déplace UNE tâche ailleurs dans la liste. Déplacer plutôt
    // qu'échanger, parce que c'est ce qui débloque un goulot — remonter la
    // cuisson longue avant les six gestes qui l'attendent.
    const liste = [...meilleureListe]
    const de = Math.floor(rnd() * liste.length)
    const vers = Math.floor(rnd() * liste.length)
    if (de === vers) continue
    const [x] = liste.splice(de, 1)
    liste.splice(vers, 0, x)

    const essai = ordonnance(taches, ressources, liste)
    if (essai.dureeMin < meilleur.dureeMin - EPS ||
        (Math.abs(essai.dureeMin - meilleur.dureeMin) < EPS &&
         essai.attenteMin < meilleur.attenteMin - EPS)) {
      meilleur = essai
      meilleureListe = liste
    }
  }
  return meilleur
}
