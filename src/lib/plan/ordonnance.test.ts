/**
 * Ce que l'ordonnanceur doit garantir.
 *
 * Les invariants d'abord (aucun plan ne doit jamais les violer, quelle que soit
 * la recherche locale), les promesses produit ensuite : le four qui travaille
 * pendant qu'on épluche, deux personnes qui vont deux fois plus vite, et le
 * même plan sur les deux téléphones.
 */
import { describe, expect, it } from 'vitest'
import { ordonnance, planifie } from './ordonnance.ts'
import type { Plan, Ressources, Tache } from './types.ts'

const SEUL: Ressources = { cuisiniers: 1, appareils: { four: 1, plaque: 4, air_fryer: 1 } }

function tache(id: string, p: Partial<Tache> = {}): Tache {
  return {
    id,
    label: id,
    dureeMin: 10,
    actif: true,
    appareil: null,
    dependDe: [],
    recettes: ['r1'],
    verbe: null,
    quantiteG: null,
    echelle: null,
    dureeBaseMin: null,
    ...p,
  }
}

/** Aucune tâche ne commence avant que ses prédécesseurs soient finis. */
function precedencesTenues(plan: Plan): boolean {
  const parId = new Map(plan.taches.map(t => [t.id, t]))
  return plan.taches.every(t =>
    t.dependDe.every(d => (parId.get(d)?.finMin ?? 0) <= t.debutMin + 1e-9))
}

/** Le nombre maximal de tâches simultanées sur un pool donné. */
function pic(plan: Plan, retient: (t: Plan['taches'][number]) => boolean): number {
  const concernees = plan.taches.filter(retient)
  let max = 0
  for (const a of concernees) {
    const n = concernees.filter(b =>
      b.debutMin <= a.debutMin + 1e-9 && a.debutMin < b.finMin - 1e-9).length
    max = Math.max(max, n)
  }
  return max
}

describe('invariants', () => {
  it('respecte les précédences', () => {
    const taches = [
      tache('epluche', { dureeMin: 8 }),
      tache('coupe', { dureeMin: 6, dependDe: ['epluche'] }),
      tache('cuit', { dureeMin: 25, actif: false, appareil: 'four', dependDe: ['coupe'] }),
    ]
    const plan = planifie(taches, SEUL, { graine: 'p' })
    expect(precedencesTenues(plan)).toBe(true)
    expect(plan.dureeMin).toBe(39)
  })

  it('ne met jamais deux plats dans un four qui n en prend qu un', () => {
    const taches = Array.from({ length: 5 }, (_, i) =>
      tache(`gratin${i}`, { dureeMin: 20, actif: false, appareil: 'four' }))
    const plan = planifie(taches, SEUL, { graine: 'f' })
    expect(pic(plan, t => t.appareil === 'four')).toBe(1)
    expect(plan.dureeMin).toBe(100)
  })

  it('ne met jamais deux gestes dans les mains d une seule personne', () => {
    const taches = Array.from({ length: 4 }, (_, i) => tache(`geste${i}`, { dureeMin: 7 }))
    const plan = planifie(taches, SEUL, { graine: 'g' })
    expect(pic(plan, t => t.actif)).toBe(1)
    expect(plan.dureeMin).toBe(28)
  })

  it('refuse un graphe circulaire plutôt que d oublier des actions', () => {
    const taches = [
      tache('a', { dependDe: ['b'] }),
      tache('b', { dependDe: ['a'] }),
    ]
    expect(() => planifie(taches, SEUL)).toThrow(/circulaires/)
  })

  it('planifie toutes les tâches, une seule fois chacune', () => {
    const taches = Array.from({ length: 30 }, (_, i) =>
      tache(`t${i}`, {
        dureeMin: 3 + (i % 7),
        actif: i % 3 !== 0,
        appareil: i % 3 === 0 ? 'four' : null,
        dependDe: i > 2 ? [`t${i - 3}`] : [],
      }))
    const plan = planifie(taches, SEUL, { graine: 'tout' })
    expect(plan.taches).toHaveLength(30)
    expect(new Set(plan.taches.map(t => t.id)).size).toBe(30)
  })
})

describe('les promesses du produit', () => {
  it('fait travailler le four pendant qu on épluche (D30)', () => {
    // La cuisson n'occupe personne : les deux gestes doivent tenir dedans.
    const taches = [
      tache('enfourne', { dureeMin: 40, actif: false, appareil: 'four' }),
      tache('epluche', { dureeMin: 12 }),
      tache('emince', { dureeMin: 9 }),
    ]
    const plan = planifie(taches, SEUL, { graine: 'four' })
    expect(plan.dureeMin).toBe(40)
    expect(plan.travailMin).toBe(21)
    expect(plan.attenteMin).toBe(19)
  })

  it('compte l attente comme le temps où personne n a les mains prises (D31)', () => {
    const taches = [
      tache('a', { dureeMin: 10 }),
      tache('cuisson', { dureeMin: 30, actif: false, appareil: 'four', dependDe: ['a'] }),
      tache('b', { dureeMin: 5, dependDe: ['cuisson'] }),
    ]
    const plan = planifie(taches, SEUL, { graine: 'att' })
    expect(plan.dureeMin).toBe(45)
    expect(plan.occupeMin).toBe(15)   // 10 + 5, sans recouvrement
    expect(plan.attenteMin).toBe(30)  // exactement la cuisson
  })

  it('ne compte pas un repos au frigo comme du temps en cuisine', () => {
    // Un gratin qui repose trois heures ne retient personne. Un four qui tourne,
    // si : il faudra revenir le vider.
    const taches = [
      tache('prepare', { dureeMin: 20 }),
      tache('repos', { dureeMin: 210, actif: false, appareil: null, dependDe: ['prepare'] }),
    ]
    const plan = planifie(taches, SEUL, { graine: 'repos' })
    expect(plan.dureeMin, 'le repos doit rester dans la durée totale').toBe(230)
    expect(plan.finEnCuisineMin, 'le repos a retenu quelqu’un en cuisine').toBe(20)
    expect(plan.attenteMin).toBe(0)
  })

  it('compte en revanche un four qui tourne : il faudra le vider', () => {
    const taches = [
      tache('prepare', { dureeMin: 20 }),
      tache('cuit', { dureeMin: 40, actif: false, appareil: 'four', dependDe: ['prepare'] }),
    ]
    const plan = planifie(taches, SEUL, { graine: 'four2' })
    expect(plan.finEnCuisineMin).toBe(60)
    expect(plan.attenteMin).toBe(40)
  })

  it('deux personnes vont deux fois plus vite sur des gestes indépendants', () => {
    const taches = Array.from({ length: 6 }, (_, i) => tache(`g${i}`, { dureeMin: 10 }))
    const seul = planifie(taches, SEUL, { graine: 'duo' })
    const duo = planifie(taches, { ...SEUL, cuisiniers: 2 }, { graine: 'duo' })
    expect(seul.dureeMin).toBe(60)
    expect(duo.dureeMin).toBe(30)
    expect(duo.travailMin).toBe(60)   // le travail total ne diminue pas
  })

  it('répartit les gestes entre les deux cuisiniers', () => {
    const taches = Array.from({ length: 6 }, (_, i) => tache(`g${i}`, { dureeMin: 10 }))
    const plan = planifie(taches, { ...SEUL, cuisiniers: 2 }, { graine: 'rep' })
    const parPersonne = [0, 1].map(i =>
      plan.taches.filter(t => t.cuisinier === i).length)
    expect(parPersonne).toEqual([3, 3])
  })

  it('chiffre ce que coûte un four qui ne prend qu un plat (D5)', () => {
    // C'est l'arbitrage de l'écran : on montre les deux plans et l'écart.
    const taches = Array.from({ length: 3 }, (_, i) =>
      tache(`gratin${i}`, { dureeMin: 30, actif: false, appareil: 'four' }))
    const etroit = planifie(taches, SEUL, { graine: 'arb' })
    const large = planifie(taches, { ...SEUL, appareils: { ...SEUL.appareils, four: 3 } },
      { graine: 'arb' })
    expect(etroit.dureeMin).toBe(90)
    expect(large.dureeMin).toBe(30)
  })

  it('nomme la chaîne qui fixe la durée', () => {
    const taches = [
      tache('a', { dureeMin: 10 }),
      tache('b', { dureeMin: 20, dependDe: ['a'] }),
      tache('c', { dureeMin: 30, dependDe: ['b'] }),
      tache('parallele', { dureeMin: 2, actif: false, appareil: 'air_fryer' }),
    ]
    const plan = planifie(taches, SEUL, { graine: 'cc' })
    expect(plan.chemin).toEqual(['a', 'b', 'c'])
  })
})

describe('déterminisme et tenue en charge', () => {
  it('ne dépend jamais de l’horloge : même graine, même plan, dix fois', () => {
    // Le test qui a trouvé le défaut : s'arrêter au bout d'un budget en
    // millisecondes rendait un plan différent d'une exécution à l'autre.
    const taches = Array.from({ length: 26 }, (_, i) =>
      tache(`t${i}`, {
        dureeMin: 1 + (i % 17),
        actif: i % 3 !== 0,
        appareil: i % 3 === 0 ? 'four' : null,
        dependDe: i > 3 ? [`t${i - 4}`] : [],
      }))
    const reference = planifie(taches, SEUL, { graine: 'horloge' })
      .taches.map(t => [t.id, t.debutMin])
    for (let n = 0; n < 10; n++) {
      expect(planifie(taches, SEUL, { graine: 'horloge' }).taches.map(t => [t.id, t.debutMin]))
        .toEqual(reference)
    }
  })

  it('rend le même plan pour la même graine (D50)', () => {
    const taches = Array.from({ length: 25 }, (_, i) =>
      tache(`t${i}`, {
        dureeMin: 2 + (i % 11),
        actif: i % 4 !== 0,
        appareil: i % 4 === 0 ? 'four' : null,
        dependDe: i > 4 ? [`t${i - 5}`] : [],
      }))
    const a = planifie(taches, SEUL, { graine: 'cycle-abc' })
    const b = planifie(taches, SEUL, { graine: 'cycle-abc' })
    expect(b.taches.map(t => [t.id, t.debutMin])).toEqual(a.taches.map(t => [t.id, t.debutMin]))
  })

  it('ne rend jamais pire que l heuristique de départ', () => {
    const taches = Array.from({ length: 20 }, (_, i) =>
      tache(`t${i}`, {
        dureeMin: 1 + (i % 9),
        actif: i % 3 !== 0,
        appareil: i % 3 === 0 ? 'four' : null,
      }))
    const cherche = planifie(taches, SEUL, { graine: 'x', iterationsMax: 500 })
    const brut = ordonnance(taches, SEUL, taches.map(t => t.id))
    expect(cherche.dureeMin).toBeLessThanOrEqual(brut.dureeMin)
  })

  it('tient le budget sur une grosse session', () => {
    // 60 actions, c'est déjà beaucoup plus qu'un dimanche réel à cinq recettes.
    const taches = Array.from({ length: 60 }, (_, i) =>
      tache(`t${i}`, {
        dureeMin: 2 + (i % 13),
        actif: i % 3 !== 0,
        appareil: i % 3 === 0 ? (i % 6 === 0 ? 'four' : 'plaque') : null,
        dependDe: i > 5 ? [`t${i - 6}`] : [],
      }))
    const debut = performance.now()
    const plan = planifie(taches, SEUL, { graine: 'charge' })
    const ecoule = performance.now() - debut
    expect(plan.taches).toHaveLength(60)
    // Le coût est borné par la TAILLE, jamais par l'horloge : c'est ce qui rend
    // le plan identique sur les deux téléphones (D50).
    expect(ecoule).toBeLessThan(400)
  })
})
