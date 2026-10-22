/**
 * Un mois CLOS d'avant l'arrivée de la personne : Thauba, arrivée le 1er novembre, ouvre octobre,
 * clôturé par Kamil. Le récap lui lisait « Il t'est resté — » (revenu nul, tiret) puis « Calculé
 * sur tes parts », avec « Revenir dessus » : cela contredisait « jamais un tiret » (551de1e) et lui
 * offrait de rouvrir un mois qui n'est pas le sien. Elle lit une phrase honnête, et aucun geste.
 *
 * Même méthode que `budget-revenir-foyer.test.tsx` : le 3 novembre, un cache rempli à la main.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { OCT, cloture, ecranDeLaCloture, ecranDuMois, foyer, membre, texte, tout, depense, charge, revenu, poche } =
  await import('./budget-banc.tsx')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 10, 0, 0))
})
afterEach(() => vi.useRealTimers())

const choixDeKamil = { user_profile_id: 'u2', reste_cents: 1_728_30, mis_de_cote_cents: 0,
                       poche_id: null, versement_id: null }
const duo = (entree: string | null) => foyer([
  { ...membre('u1', 'Thauba'), entre_le: entree } as ReturnType<typeof membre>,
  membre('u2', 'Kamil'),
])
const octobreClosParKamil = { ...cloture(OCT), choix: [choixDeKamil] }

describe('le mois clos d’avant mon arrivée (Budget)', () => {
  const h = () => texte(ecranDuMois(tout({
    foyer: duo('2026-11-01'), revenus: [revenu('u2')], clotures: [octobreClosParKamil],
  }), { depart: OCT }))

  it('dit « Tu n’étais pas encore dans le foyer », sans tiret ni « Il t’est resté »', () => {
    expect(h()).toContain('Tu n’étais pas encore dans le foyer')
    expect(h()).not.toContain('Il t’est resté')
    expect(h()).not.toContain('—')
    expect(h()).not.toContain('Calculé sur tes parts')
  })

  it('n’offre pas « Revenir dessus » sur un mois qui n’est pas le sien', () => {
    expect(h()).not.toContain('Revenir dessus')
  })

  it('un mois clos où j’étais déjà là garde son récap et son geste (rien n’a changé pour lui)', () => {
    const t = texte(ecranDuMois(tout({
      foyer: duo('2026-01-01'), revenus: [revenu('u1'), revenu('u2')], clotures: [octobreClosParKamil],
    }), { depart: OCT }))
    expect(t).toContain('Il t’est resté')
    expect(t).toContain('Revenir dessus')
    expect(t).not.toContain('Tu n’étais pas encore dans le foyer')
  })
})

describe('la page de clôture d’un mois clos d’avant mon arrivée', () => {
  const lues = (entree: string | null) => ({
    foyer: duo(entree), depenses: [depense({ mois: OCT })], saisies: [], charges: [charge()],
    revenus: [revenu('u2')], poches: [poche()], apercu: [], clotures: [octobreClosParKamil],
  })

  it('« Tu n’étais pas encore dans le foyer », pas « Revenir dessus »', () => {
    const t = texte(ecranDeLaCloture(lues('2026-11-01'), { mois: OCT }))
    expect(t).toContain('Tu n’étais pas encore dans le foyer')
    expect(t).not.toContain('Revenir dessus')
  })

  it('arrivée connue avant le mois : la page de clôture se lit comme avant', () => {
    const t = texte(ecranDeLaCloture(lues('2026-01-01'), { mois: OCT }))
    expect(t).toContain('est clôturé')
    expect(t).toContain('Revenir dessus')
  })
})

describe('la page de clôture, le foyer pas encore lu', () => {
  /* `present` valait vrai tant que le foyer n'était pas lu : « Ajoute ton revenu de septembre »,
     un cul-de-sac pour qui arrive en octobre, s'affichait un instant — ou pour de bon si la lecture
     du foyer échouait. */
  const sansRevenu = { depenses: [depense({ mois: '2026-09-01' })], saisies: [], charges: [charge()],
                       revenus: [], poches: [poche()], apercu: [], clotures: [] }

  it('foyer pas revenu : ni « Ajoute ton revenu », ni rien de décidé', () => {
    const t = texte(ecranDeLaCloture({ ...sansRevenu }, { mois: '2026-09-01' }))
    expect(t).not.toContain('Ajoute ton revenu')
    expect(t).not.toContain('Clôturer Septembre')
  })

  it('foyer en panne : la panne se dit, avec de quoi réessayer, et jamais « Ajoute ton revenu »', () => {
    const h = ecranDeLaCloture({ ...sansRevenu }, { mois: '2026-09-01', rate: { foyer: 'la base ne répond pas' } })
    expect(texte(h)).toContain('la base ne répond pas')
    expect(texte(h)).toContain('Réessayer')
    expect(texte(h)).not.toContain('Ajoute ton revenu')
  })

  it('foyer lu, vraiment sans revenu : « Ajoute ton revenu » se dit, lui', () => {
    const t = texte(ecranDeLaCloture({ ...sansRevenu, foyer: duo('2026-01-01') }, { mois: '2026-09-01' }))
    expect(t).toContain('Ajoute ton revenu')
  })
})
