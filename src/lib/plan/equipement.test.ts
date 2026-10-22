/** L'équipement du jour part de la dernière session du foyer, pas des huit appareils du catalogue. */
import { describe, expect, it } from 'vitest'
import { equipementInitial } from './equipement.ts'

const catalogue = [
  { code: 'four', default_capacity: 1 },
  { code: 'plaques', default_capacity: 4 },
  { code: 'cocotte', default_capacity: 1 },
  { code: 'robot', default_capacity: 1 },
]

describe('equipementInitial', () => {
  it('reprend les appareils et les capacités de la dernière session', () => {
    expect(equipementInitial({ propres: {}, derniere: { four: 2, plaques: 3 }, catalogue }))
      .toEqual({ four: 2, plaques: 3 })
  })

  it('sans session précédente, le catalogue entier comme avant', () => {
    expect(equipementInitial({ propres: {}, derniere: {}, catalogue }))
      .toEqual({ four: 1, plaques: 4, cocotte: 1, robot: 1 })
  })

  it('ce que cette session a déjà choisi passe avant tout', () => {
    expect(equipementInitial({ propres: { robot: 1 }, derniere: { four: 2 }, catalogue }))
      .toEqual({ robot: 1 })
  })

  it('ignore un appareil que le catalogue n’a plus', () => {
    expect(equipementInitial({ propres: {}, derniere: { four: 2, grille_pain: 1 }, catalogue }))
      .toEqual({ four: 2 })
  })

  it('si plus rien ne reste de la dernière session, retombe sur le catalogue', () => {
    expect(equipementInitial({ propres: {}, derniere: { grille_pain: 1 }, catalogue }))
      .toEqual({ four: 1, plaques: 4, cocotte: 1, robot: 1 })
  })
})
