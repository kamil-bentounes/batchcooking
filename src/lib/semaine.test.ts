import { describe, expect, it } from 'vitest'
import { bilanDuJour, extraCompte, jour, portionVivante } from './semaine.ts'
import type { CaseConsommee } from './semaine.ts'

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

describe('un repère planifié ne compte pas avant d’être mangé (revue du 26/10, M3)', () => {
  const resto = { kcal: 900, protein_g: 35, planifie: true }
  const yaourt = { kcal: 60, protein_g: 4, planifie: false }
  const J = '2026-09-18'
  it('choisi par la feuille, pas encore mangé : aujourd’hui ou plus tard, il ne compte pas et ne « renseigne » pas', () => {
    for (const aujourdhui of [J, '2026-09-17']) {
      const b = bilanDuJour([cas({ state: 'prevu', extras: [resto] })], 'k', J, aujourdhui)
      expect(b, `aujourd’hui = ${aujourdhui}`).toEqual({ kcal: 0, proteinG: 0, renseignes: 0, prevus: 1 })
    }
  })
  it('la case est mangée (« Je l’ai mangé ») : il compte', () => {
    const b = bilanDuJour([cas({ state: 'mange', extras: [resto] })], 'k', J, J)
    expect(b).toEqual({ kcal: 900, proteinG: 35, renseignes: 1, prevus: 1 })
  })
  it('le jour est passé et personne n’a rien noté : il compte, comme avant', () => {
    const b = bilanDuJour([cas({ state: 'prevu', extras: [resto] })], 'k', J, '2026-09-19')
    expect(b).toEqual({ kcal: 900, proteinG: 35, renseignes: 1, prevus: 1 })
  })
  it('un en-plus noté après coup compte toujours, même sur une case « prévue » d’un jour à venir', () => {
    const b = bilanDuJour([cas({ state: 'prevu', extras: [yaourt] })], 'k', J, '2026-09-17')
    expect(b).toEqual({ kcal: 60, proteinG: 4, renseignes: 1, prevus: 1 })
  })
  it('les deux ensemble : seul ce qui est noté compte avant le repas', () => {
    const b = bilanDuJour([cas({ state: 'prevu', extras: [resto, yaourt] })], 'k', J, J)
    expect(b.kcal).toBe(60)
  })
  it('extraCompte : l’ancien extra (sans la colonne) compte', () => {
    expect(extraCompte({}, { state: 'prevu', day: J }, J)).toBe(true)
    expect(extraCompte({ planifie: true }, { state: 'prevu', day: J }, J)).toBe(false)
    expect(extraCompte({ planifie: true }, { state: 'mange', day: J }, J)).toBe(true)
    expect(extraCompte({ planifie: true }, { state: 'prevu', day: '2026-09-17' }, J)).toBe(true)
  })
})

describe('portionVivante : la barquette qu’une case porte VRAIMENT (H2)', () => {
  const portion = (state: string) => ({ state, id: 'p' })
  it('une part jetée n’est plus portée, quelle que soit la case', () => {
    expect(portionVivante({ state: 'prevu', portion: portion('jetee') })).toBeNull()
    expect(portionVivante({ state: 'mange', portion: portion('jetee') })).toBeNull()
  })
  it('une part mangée par un AUTRE repas n’est plus portée par une case encore « prévue »', () => {
    expect(portionVivante({ state: 'prevu', portion: portion('mangee') })).toBeNull()
    expect(portionVivante({ state: 'saute', portion: portion('mangee') })).toBeNull()
  })
  it('la part qu’une case « mangée » a mangée reste là, comme celle d’une case prévue encore au frais', () => {
    expect(portionVivante({ state: 'mange', portion: portion('mangee') })).toEqual(portion('mangee'))
    expect(portionVivante({ state: 'prevu', portion: portion('au_frais') })).toEqual(portion('au_frais'))
    expect(portionVivante({ state: 'prevu', portion: portion('decongelee') })).toEqual(portion('decongelee'))
  })
  it('sans part : rien', () => {
    expect(portionVivante({ state: 'prevu', portion: null })).toBeNull()
  })
})
