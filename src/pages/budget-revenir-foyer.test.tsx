/**
 * « Revenir dessus » annonce ce que la base retirera VRAIMENT de l'épargne : `rouvre_le_mois`
 * efface le versement de chaque membre encore dans le foyer, pas seulement le mien. Annoncer
 * « Les 300 € mis de côté » quand 420,50 € repartent, c'est laisser l'autre découvrir
 * son épargne amputée. Le bouton est remplacé par une sonde qui écrit le montant reçu.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../ui/budget/RevenirDessus.tsx', () => ({
  RevenirDessus: ({ misDeCote }: { misDeCote: number }) => <i data-sonde={misDeCote} />,
}))

const { OCT, cloture, ecranDeLaCloture, ecranDuMois, foyer, membre, tout, depense, charge, revenu, poche } =
  await import('./budget-banc.tsx')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3, 10, 0, 0))
})
afterEach(() => vi.useRealTimers())

const choix = (qui: string, reste: number, mis: number) => ({
  user_profile_id: qui, reste_cents: reste, mis_de_cote_cents: mis, poche_id: null, versement_id: null,
})
const sondes = (h: string) => [...h.matchAll(/data-sonde="(\d+)"/g)].map(m => Number(m[1]))
const deux = foyer([membre('u1', 'Kamil'), membre('u2', 'Thauba')])

describe('« Revenir dessus » annonce le total du foyer', () => {
  const k = (...c: ReturnType<typeof choix>[]) => ({ ...cloture(OCT), choix: c })

  it('le mois : la carte encre annonce les deux versements, et « dont » reste le mien', () => {
    const h = ecranDuMois(tout({ foyer: deux,
      clotures: [k(choix('u1', 1000_00, 300_00), choix('u2', 900_00, 120_50))] }), { depart: OCT })
    expect(sondes(h)).toEqual([420_50])
    expect(h).toContain('dont 300 € mis de côté')
  })

  it('la feuille en lecture seule annonce le même total que la carte', () => {
    const h = ecranDuMois(tout({ foyer: deux,
      clotures: [k(choix('u1', 1000_00, 300_00), choix('u2', 900_00, 120_50))] }),
      { depart: OCT, ouverte: { geste: 'declarer', id: 'd1' } })
    expect(sondes(h)).toEqual([420_50, 420_50])
  })

  it('un membre parti garde son versement dans la poche : il n’est pas annoncé', () => {
    const h = ecranDuMois(tout({ foyer: deux,
      clotures: [k(choix('u1', 1000_00, 300_00), choix('parti', 900_00, 120_50))] }),
      { depart: OCT })
    expect(sondes(h)).toEqual([300_00])
  })

  it('le foyer pas encore lu : le mois attend, sans annoncer un total sur un morceau', () => {
    const h = ecranDuMois(tout({ foyer: undefined,
      clotures: [k(choix('u1', 1000_00, 300_00), choix('u2', 900_00, 120_50))] }),
      { depart: OCT })
    expect(sondes(h)).toEqual([])
  })

  it('la page de clôture d’un mois clos annonce le même total', () => {
    const h = ecranDeLaCloture({
      foyer: deux, depenses: [depense({ mois: '2026-10-01' })], saisies: [], charges: [charge()],
      revenus: [revenu()], poches: [poche()], apercu: [],
      clotures: [k(choix('u1', 1000_00, 300_00), choix('u2', 900_00, 120_50))],
    }, { mois: OCT })
    expect(sondes(h)).toEqual([420_50])
  })
})
