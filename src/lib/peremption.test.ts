import { describe, expect, it } from 'vitest'
import { parUrgence, urgence } from './peremption.ts'

const T0 = new Date('2026-09-18T12:00:00Z')
const dans = (heures: number) => new Date(T0.getTime() + heures * 3_600_000)

describe('le frigo', () => {
  it('passe au rouge le jour même', () => {
    const u = urgence(dans(6), 'frigo', T0)
    expect(u.niveau).toBe('urgent')
    expect(u.mot).toBe("à manger aujourd'hui")
  })

  it('passe à l orange la veille', () => {
    const u = urgence(dans(36), 'frigo', T0)
    expect(u.niveau).toBe('bientot')
    expect(u.mot).toBe('demain dernier délai')
  })

  it('reste neutre au-delà de deux jours', () => {
    expect(urgence(dans(72), 'frigo', T0).niveau).toBe('ok')
  })

  it('dit périmée quand la date est passée', () => {
    const u = urgence(dans(-1), 'frigo', T0)
    expect(u.niveau).toBe('perime')
    expect(u.mot).toBe('périmée')
  })
})

describe('le congélateur', () => {
  it('prévient une semaine avant, jamais en rouge', () => {
    const u = urgence(dans(24 * 5), 'congelateur', T0)
    expect(u.niveau).toBe('bientot')
    expect(u.mot).toMatch(/à sortir sous/)
  })

  it('ne dit rien d une part congelée le mois dernier', () => {
    expect(urgence(dans(24 * 60), 'congelateur', T0).niveau).toBe('ok')
  })

  it('a des seuils absolus, pas un pourcentage de la durée de vie', () => {
    // Même échéance, même message : trois mois de congélation ne changent rien
    // à ce que « il reste cinq jours » veut dire.
    const a = urgence(dans(24 * 5), 'congelateur', T0)
    const b = urgence(dans(24 * 5), 'congelateur', T0)
    expect(a.mot).toBe(b.mot)
  })
})

describe('la règle qui rend l app lisible', () => {
  it('donne toujours un mot, à tous les niveaux', () => {
    for (const h of [-5, 3, 30, 100, 24 * 200]) {
      for (const lieu of ['frigo', 'congelateur'] as const) {
        expect(urgence(dans(h), lieu, T0).mot.length).toBeGreaterThan(3)
      }
    }
  })

  it('ne donne pas la même couleur au mot et à la pastille', () => {
    // Un mot exige 4,5:1 de contraste, un aplat 3:1. Deux seuils, deux oranges.
    const u = urgence(dans(36), 'frigo', T0)
    expect(u.encre).not.toBe(u.pastille)
    expect(u.encre).toBe('#8F5A0D')
    expect(u.pastille).toBe('#B8791A')
  })

  it('accepte une date au format ISO comme la base la rend', () => {
    expect(urgence(dans(6).toISOString(), 'frigo', T0).niveau).toBe('urgent')
  })
})

describe('l ordre de l inventaire', () => {
  it('met le plus pressé en tête, tous lieux confondus', () => {
    const items = [
      { id: 'congele', expires_at: dans(24 * 40).toISOString(), location: 'congelateur' as const },
      { id: 'dahl', expires_at: dans(20).toISOString(), location: 'frigo' as const },
      { id: 'soupe', expires_at: dans(60).toISOString(), location: 'frigo' as const },
    ]
    expect(parUrgence(items, T0).map(i => i.id)).toEqual(['dahl', 'soupe', 'congele'])
  })

  it('ne modifie pas le tableau qu on lui donne', () => {
    const items = [
      { id: 'b', expires_at: dans(50).toISOString(), location: 'frigo' as const },
      { id: 'a', expires_at: dans(10).toISOString(), location: 'frigo' as const },
    ]
    parUrgence(items, T0)
    expect(items.map(i => i.id)).toEqual(['b', 'a'])
  })
})
