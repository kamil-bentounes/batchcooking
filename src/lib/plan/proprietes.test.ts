/**
 * L'ordonnanceur, éprouvé sur 500 sessions tirées au hasard.
 *
 * Les tests d'exemple disent qu'un cas précis marche. Ils ne disent rien du cas
 * qu'on n'a pas imaginé — et un RCPSP en produit sans arrêt : trois cuissons
 * qui se libèrent au même instant, un four de capacité 2 avec cinq plats, une
 * tâche de durée nulle au milieu d'une chaîne, un repos qui ne retient personne.
 *
 * On tire donc des sessions ALÉATOIRES, et on vérifie sur chacune ce qui doit
 * être vrai de TOUT plan. Ce sont des propriétés, pas des attentes :
 *
 *   · aucune tâche ne commence avant que ses prédécesseurs soient finis ;
 *   · aucune ressource n'est utilisée au-delà de sa capacité, à AUCUN instant ;
 *   · personne n'est à deux endroits à la fois ;
 *   · rien n'est perdu et rien n'est inventé ;
 *   · les chiffres affichés sont cohérents entre eux ;
 *   · et deux téléphones voient le même plan (D50).
 *
 * Le tirage est SEMÉ : un échec se rejoue à l'identique, et le message dit avec
 * quelle graine.
 */
import { describe, expect, it } from 'vitest'
import { ordonnance, planifie } from './ordonnance.ts'
import type { Plan, Ressources, Tache, TachePlanifiee } from './types.ts'

/** Les durées sont des flottants : on ne compare jamais deux réels à l'égalité. */
const EPS = 1e-6

// ── Le tirage ───────────────────────────────────────────────────────────────

function alea(graine: number): () => number {
  let a = graine >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const APPAREILS = ['four', 'plaques', 'air_fryer', 'autocuiseur', 'blender']

type Session = { taches: Tache[]; ressources: Ressources }

/**
 * Une session plausible, et volontairement méchante.
 *
 * On tire aussi les cas qu'un test écrit à la main n'aurait pas : durée nulle,
 * repos sans appareil, appareil saturé, chaîne de dépendances profonde.
 */
function sessionAleatoire(rnd: () => number): Session {
  const n = 1 + Math.floor(rnd() * 24)
  const taches: Tache[] = []

  for (let i = 0; i < n; i++) {
    // Une tâche ne peut dépendre que de tâches DÉJÀ tirées : c'est ce qui
    // garantit un graphe sans boucle, et la boucle a son propre test.
    const dependDe: string[] = []
    for (let j = 0; j < i; j++) if (rnd() < 0.18) dependDe.push(`t${j}`)

    const actif = rnd() < 0.55
    // Un repos au frigo : ni geste, ni appareil. C'est le cas qui distingue
    // `dureeMin` de `finEnCuisineMin`, et il est facile à perdre.
    const avecAppareil = rnd() < (actif ? 0.35 : 0.7)

    taches.push({
      id: `t${i}`,
      label: `tâche ${i}`,
      // La durée nulle existe : une étape mesurée à zéro ne doit pas tout casser.
      dureeMin: rnd() < 0.07 ? 0 : Math.round(rnd() * 90 * 10) / 10,
      actif,
      appareil: avecAppareil ? APPAREILS[Math.floor(rnd() * APPAREILS.length)] : null,
      dependDe,
      recettes: ['r1'],
      verbe: null,
      quantiteG: null,
      echelle: null,
      dureeBaseMin: null,
    })
  }

  // Des capacités serrées : c'est sous contrainte que les bugs sortent.
  const appareils: Record<string, number> = {}
  for (const a of APPAREILS) if (rnd() < 0.8) appareils[a] = 1 + Math.floor(rnd() * 2)

  return { taches, ressources: { cuisiniers: 1 + Math.floor(rnd() * 3), appareils } }
}

// ── Les propriétés ──────────────────────────────────────────────────────────

/** Les pools qu'une tâche occupe, tels que l'ordonnanceur les voit. */
function pools(t: TachePlanifiee, r: Ressources): { nom: string; cap: number }[] {
  const p: { nom: string; cap: number }[] = []
  if (t.actif) p.push({ nom: '#cuisinier', cap: Math.max(1, r.cuisiniers) })
  // ⚠️ Un appareil absent de la session compte pour UN, pas pour l'infini :
  //    c'est la règle de `capacite()`, et l'oublier rendrait le test complaisant.
  if (t.appareil) p.push({ nom: t.appareil, cap: r.appareils[t.appareil] ?? 1 })
  return p
}

/** Ce qui doit être vrai de tout plan. Rend la liste des manquements. */
function manquements(plan: Plan, s: Session): string[] {
  const dits: string[] = []
  const dire = (m: string) => { if (!dits.includes(m)) dits.push(m) }

  // ── Rien de perdu, rien d'inventé ──────────────────────────────────────
  if (plan.taches.length !== s.taches.length) {
    dire(`${plan.taches.length} tâches planifiées pour ${s.taches.length} données`)
  }
  const vus = new Set(plan.taches.map(t => t.id))
  if (vus.size !== plan.taches.length) dire('une tâche apparaît deux fois')
  for (const t of s.taches) if (!vus.has(t.id)) dire(`${t.id} a été oubliée`)

  const parId = new Map(plan.taches.map(t => [t.id, t]))

  for (const t of plan.taches) {
    // ── Les chiffres eux-mêmes ───────────────────────────────────────────
    if (!Number.isFinite(t.debutMin) || !Number.isFinite(t.finMin)) {
      dire(`${t.id} porte un instant non fini`)
    }
    if (t.debutMin < -EPS) dire(`${t.id} commence avant le début`)
    if (Math.abs(t.finMin - (t.debutMin + t.dureeMin)) > EPS) {
      dire(`${t.id} : fin ≠ début + durée`)
    }

    // ── Les précédences ──────────────────────────────────────────────────
    for (const d of t.dependDe) {
      const avant = parId.get(d)
      if (!avant) { dire(`${t.id} dépend de ${d}, absente du plan`); continue }
      if (t.debutMin < avant.finMin - EPS) {
        dire(`${t.id} commence avant la fin de ${d}`)
      }
    }

    // ── Le cuisinier ─────────────────────────────────────────────────────
    if (t.actif && t.cuisinier === null) dire(`${t.id} est active sans cuisinier`)
    if (!t.actif && t.cuisinier !== null) dire(`${t.id} est passive avec un cuisinier`)
    if (t.cuisinier !== null &&
        (t.cuisinier < 0 || t.cuisinier >= Math.max(1, s.ressources.cuisiniers))) {
      dire(`${t.id} attribuée à un cuisinier qui n'existe pas`)
    }
  }

  // ── Les capacités, à CHAQUE instant où le compte peut changer ──────────
  // On balaie les débuts : entre deux débuts, le nombre d'occupants ne peut que
  // baisser. Une tâche de durée nulle n'occupe rien et ne compte pas.
  const instants = [...new Set(plan.taches.map(t => t.debutMin))].sort((a, b) => a - b)
  const capacites = new Map<string, number>()
  for (const t of plan.taches) for (const p of pools(t, s.ressources)) capacites.set(p.nom, p.cap)

  for (const [nom, cap] of capacites) {
    for (const i of instants) {
      const n = plan.taches.filter(t =>
        pools(t, s.ressources).some(p => p.nom === nom) &&
        t.dureeMin > EPS &&
        t.debutMin <= i + EPS && i < t.finMin - EPS).length
      if (n > cap) dire(`${nom} : ${n} occupants pour ${cap} place(s) à ${i} min`)
    }
  }

  // ── Personne à deux endroits à la fois ─────────────────────────────────
  const actives = plan.taches.filter(t => t.actif && t.dureeMin > EPS)
  for (let i = 0; i < actives.length; i++) {
    for (let j = i + 1; j < actives.length; j++) {
      const a = actives[i]
      const b = actives[j]
      if (a.cuisinier !== b.cuisinier) continue
      if (a.debutMin < b.finMin - EPS && b.debutMin < a.finMin - EPS) {
        dire(`le cuisinier ${a.cuisinier} fait ${a.id} et ${b.id} en même temps`)
      }
    }
  }

  // ── Les chiffres affichés, cohérents entre eux ─────────────────────────
  const finReelle = plan.taches.reduce((m, t) => Math.max(m, t.finMin), 0)
  if (Math.abs(plan.dureeMin - finReelle) > EPS) dire('dureeMin ne vaut pas la dernière fin')
  if (plan.finEnCuisineMin > plan.dureeMin + EPS) dire('on quitte la cuisine après la fin')
  if (plan.attenteMin < -EPS) dire('attente négative')
  if (plan.occupeMin > plan.travailMin + EPS) {
    dire('plus de temps occupé que de travail : l’union des intervalles est fausse')
  }
  if (plan.occupeMin > plan.finEnCuisineMin + EPS) {
    dire('plus de temps occupé que de temps en cuisine')
  }
  const travail = s.taches.reduce((s2, t) => s2 + (t.actif ? t.dureeMin : 0), 0)
  if (Math.abs(plan.travailMin - travail) > EPS) dire('travailMin ne somme pas les actions')

  // ── Le chemin critique ─────────────────────────────────────────────────
  for (const id of plan.chemin) if (!parId.has(id)) dire(`chemin : ${id} n'est pas du plan`)
  if (new Set(plan.chemin).size !== plan.chemin.length) dire('chemin : une boucle')
  if (plan.taches.length > 0 && plan.chemin.length === 0) dire('aucun chemin critique')

  return dits
}

// ── Les tests ───────────────────────────────────────────────────────────────

describe('500 sessions tirées au hasard', () => {
  // La vérification est plus coûteuse que l'ordonnancement lui-même : elle
  // compare chaque tâche à chaque autre, à chaque instant. C'est voulu — un
  // vérificateur qui partagerait les astuces du code vérifié ne vérifierait rien.
  it('rendent toutes un plan FAISABLE', { timeout: 120_000 }, () => {
    for (let graine = 1; graine <= 500; graine++) {
      const rnd = alea(graine)
      const s = sessionAleatoire(rnd)
      const plan = planifie(s.taches, s.ressources, { graine: `g${graine}` })
      const fautes = manquements(plan, s)
      expect(fautes, `graine ${graine} · ${s.taches.length} tâches · `
        + `${s.ressources.cuisiniers} cuisinier(s) · ${JSON.stringify(s.ressources.appareils)}`)
        .toEqual([])
    }
  })

  it('rendent le MÊME plan pour la même graine (D50)', () => {
    // Deux téléphones, deux vitesses, le même plan. C'est la raison pour
    // laquelle la recherche locale ne s'arrête jamais à l'horloge.
    for (let graine = 1; graine <= 60; graine++) {
      const s = sessionAleatoire(alea(graine))
      const a = planifie(s.taches, s.ressources, { graine: 'cycle-42' })
      const b = planifie(s.taches, s.ressources, { graine: 'cycle-42' })
      expect(JSON.stringify(b), `graine ${graine} : deux plans différents`)
        .toBe(JSON.stringify(a))
    }
  })

  it('ne rendent jamais un plan PIRE que l’heuristique de départ', () => {
    // La recherche locale ne garde un voisin que s'il est meilleur. Si cette
    // propriété tombe, c'est que la comparaison a été inversée quelque part.
    for (let graine = 1; graine <= 120; graine++) {
      const s = sessionAleatoire(alea(graine))
      const sans = planifie(s.taches, s.ressources, { graine: 'x', iterationsMax: 0 })
      const avec = planifie(s.taches, s.ressources, { graine: 'x' })
      expect(avec.finEnCuisineMin, `graine ${graine} : la recherche a dégradé le plan`)
        .toBeLessThanOrEqual(sans.finEnCuisineMin + EPS)
    }
  })

  it('donnent le même plan quelle que soit la PERMUTATION d’entrée', () => {
    // L'ordre dans lequel les tâches arrivent est un détail de requête : deux
    // téléphones peuvent les recevoir dans un ordre différent (PostgREST ne
    // garantit rien sans `order`). Le plan, lui, ne doit pas en dépendre.
    for (let graine = 1; graine <= 60; graine++) {
      const rnd = alea(graine)
      const s = sessionAleatoire(rnd)
      const melange = [...s.taches]
      for (let i = melange.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [melange[i], melange[j]] = [melange[j], melange[i]]
      }
      const a = planifie(s.taches, s.ressources, { graine: 'cycle-7' })
      const b = planifie(melange, s.ressources, { graine: 'cycle-7' })
      expect(b.finEnCuisineMin, `graine ${graine} : l’ordre d’entrée change le plan`)
        .toBeCloseTo(a.finEnCuisineMin, 6)
    }
  })

  it('restent faisables avec UNE seule place partout', { timeout: 60_000 }, () => {
    // Le cas le plus contraint : un cuisinier, un four, une plaque. C'est celui
    // où une capacité mal comptée se voit tout de suite.
    for (let graine = 1; graine <= 120; graine++) {
      const s = sessionAleatoire(alea(graine))
      const serre: Ressources = {
        cuisiniers: 1,
        appareils: Object.fromEntries(APPAREILS.map(a => [a, 1])),
      }
      const plan = planifie(s.taches, serre, { graine: `s${graine}` })
      expect(manquements(plan, { taches: s.taches, ressources: serre }),
        `graine ${graine}, tout à une place`).toEqual([])
    }
  })
})

describe('ce qui doit échouer', () => {
  it('refuse un graphe qui boucle plutôt que d’oublier des tâches', () => {
    const boucle: Tache[] = ['a', 'b'].map((id, i) => ({
      id, label: id, dureeMin: 10, actif: true, appareil: null,
      dependDe: [i === 0 ? 'b' : 'a'],
      recettes: [], verbe: null, quantiteG: null, echelle: null, dureeBaseMin: null,
    }))
    expect(() => ordonnance(boucle, { cuisiniers: 1, appareils: {} }, ['a', 'b']))
      .toThrow(/circulaire/)
  })

  it('rend un plan vide, et pas une erreur, pour zéro tâche', () => {
    const p = planifie([], { cuisiniers: 2, appareils: {} })
    expect(p.taches).toEqual([])
    expect(p.dureeMin).toBe(0)
    expect(p.chemin).toEqual([])
  })
})
