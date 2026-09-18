import { describe, expect, it } from 'vitest'
import { bilanDuJour, jour, repartitionAuto } from './semaine.ts'
import type { BarquetteRangeable, CaseConsommee } from './semaine.ts'

const KAMIL = { id: 'k' }
const THAUBA = { id: 't' }

let n = 0
function part(p: Partial<BarquetteRangeable> = {}): BarquetteRangeable {
  n++
  return {
    id: `p${n}`,
    expires_at: `2026-09-${String(20 + n).padStart(2, '0')}T12:00:00Z`,
    for_user_id: null,
    ...p,
  }
}

function cas(p: Partial<CaseConsommee> = {}): CaseConsommee {
  return {
    day: '2026-09-18',
    user_profile_id: 'k',
    state: 'prevu',
    portion: null,
    extras: [],
    ...p,
  }
}

describe('la date locale', () => {
  it('ne recule pas d’un jour le soir', () => {
    // 23 h 30 en France, c'est encore le 18 ; `toISOString()` dirait le 18 aussi
    // en hiver et le 18 en été seulement par chance. On ne passe jamais par UTC.
    expect(jour(new Date(2026, 8, 18, 23, 30))).toBe('2026-09-18')
    expect(jour(new Date(2026, 8, 18, 0, 15))).toBe('2026-09-18')
  })

  it('remplit les zéros', () => {
    expect(jour(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('la répartition proposée (D39)', () => {
  it('place une barquette par jour, à partir de la date donnée', () => {
    const cases = repartitionAuto(
      [part(), part(), part()], [KAMIL], new Date(2026, 8, 21))
    expect(cases.map(c => c.jour)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23'])
  })

  it('rend à chacun les parts qui lui sont destinées', () => {
    const cases = repartitionAuto([
      part({ for_user_id: 'k' }), part({ for_user_id: 't' }), part({ for_user_id: 'k' }),
    ], [KAMIL, THAUBA], new Date(2026, 8, 21))
    const parQui = new Map<string, number>()
    for (const c of cases) parQui.set(c.userId, (parQui.get(c.userId) ?? 0) + 1)
    expect(parQui.get('k')).toBe(2)
    expect(parQui.get('t')).toBe(1)
  })

  it('donne les parts sans destinataire au moins servi', () => {
    const cases = repartitionAuto([
      part({ for_user_id: 'k' }), part({ for_user_id: 'k' }), part(), part(),
    ], [KAMIL, THAUBA], new Date(2026, 8, 21))
    const parQui = new Map<string, number>()
    for (const c of cases) parQui.set(c.userId, (parQui.get(c.userId) ?? 0) + 1)
    expect(parQui.get('t'), 'une personne est restée sans rien').toBe(2)
    expect(parQui.get('k')).toBe(2)
  })

  it('mange les plus pressées d’abord', () => {
    const tard = part({ expires_at: '2026-12-01T12:00:00Z' })
    const tot = part({ expires_at: '2026-09-22T12:00:00Z' })
    const cases = repartitionAuto([tard, tot], [KAMIL], new Date(2026, 8, 21))
    expect(cases[0].portionId, 'la part la plus pressée n’est pas la première')
      .toBe(tot.id)
  })

  it('ne propose rien sans personne à qui proposer', () => {
    expect(repartitionAuto([part()], [], new Date())).toEqual([])
  })

  it('ne propose rien sans barquette', () => {
    expect(repartitionAuto([], [KAMIL], new Date())).toEqual([])
  })

  it('ignore un destinataire qui n’est plus du foyer', () => {
    const cases = repartitionAuto(
      [part({ for_user_id: 'parti' })], [KAMIL], new Date(2026, 8, 21))
    expect(cases).toHaveLength(1)
    expect(cases[0].userId).toBe('k')
  })

  it('ne modifie pas le tableau qu’on lui donne', () => {
    const liste = [part({ id: 'b' }), part({ id: 'a' })]
    repartitionAuto(liste, [KAMIL], new Date())
    expect(liste.map(b => b.id)).toEqual(['b', 'a'])
  })
})

describe('le bilan du jour (D33)', () => {
  it('ne compte que ce qui a été mangé', () => {
    const b = bilanDuJour([
      cas({ state: 'mange', portion: { kcal: 520, protein_g: 28 } }),
      cas({ state: 'prevu', portion: { kcal: 600, protein_g: 30 } }),
    ], 'k', '2026-09-18')
    expect(b.kcal).toBe(520)
    expect(b.proteinG).toBe(28)
  })

  it('ajoute le carré de chocolat', () => {
    const b = bilanDuJour([
      cas({
        state: 'mange',
        portion: { kcal: 520, protein_g: 28 },
        extras: [{ kcal: 55, protein_g: 0.6 }, { kcal: 90, protein_g: 10 }],
      }),
    ], 'k', '2026-09-18')
    expect(b.kcal).toBe(665)
    expect(b.proteinG).toBe(39)
  })

  it('compte un repas sauté comme renseigné, pas comme absent', () => {
    // C'est toute la différence entre « rien mangé » et « on ne sait pas ».
    const b = bilanDuJour([
      cas({ state: 'saute' }),
      cas({ state: 'prevu' }),
    ], 'k', '2026-09-18')
    expect(b.renseignes).toBe(1)
    expect(b.prevus).toBe(2)
    expect(b.kcal).toBe(0)
  })

  it('ne mélange ni les jours ni les personnes', () => {
    const cases = [
      cas({ state: 'mange', portion: { kcal: 500, protein_g: 20 } }),
      cas({ state: 'mange', user_profile_id: 't', portion: { kcal: 400, protein_g: 18 } }),
      cas({ state: 'mange', day: '2026-09-19', portion: { kcal: 300, protein_g: 12 } }),
    ]
    expect(bilanDuJour(cases, 'k', '2026-09-18').kcal).toBe(500)
    expect(bilanDuJour(cases, 't', '2026-09-18').kcal).toBe(400)
    expect(bilanDuJour(cases, 'k', '2026-09-19').kcal).toBe(300)
  })

  it('rend zéro et zéro prévu sur un jour vide', () => {
    expect(bilanDuJour([], 'k', '2026-09-18'))
      .toEqual({ kcal: 0, proteinG: 0, renseignes: 0, prevus: 0 })
  })

  it('accepte des nombres rendus en texte par PostgREST', () => {
    const b = bilanDuJour([
      cas({ state: 'mange', portion: { kcal: '520.4', protein_g: '28.2' } }),
    ], 'k', '2026-09-18')
    expect(b.kcal).toBe(520)
    expect(b.proteinG).toBe(28)
  })
})
