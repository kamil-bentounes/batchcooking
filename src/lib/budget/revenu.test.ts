/** Un revenu de 0,50 € par mois se demande deux fois : c'est presque toujours une virgule ratée. */
import { describe, expect, it } from 'vitest'
import { questionRevenu, revenuAConfirmer } from './revenu.ts'

describe('revenuAConfirmer', () => {
  it.each([
    [null, false],        // illisible : le champ le dit déjà
    [0, false],           // zéro garde son comportement actuel (refusé par le bouton)
    [1, true],            // 0,01 €
    [50, true],           // 0,50 €
    [9_999, true],        // 99,99 €
    [10_000, false],      // 100 € : s'enregistre sans question
    [240_000, false],     // 2 400 €
  ])('%s centimes → %s', (cents, attendu) => {
    expect(revenuAConfirmer(cents)).toBe(attendu)
  })
})

describe('questionRevenu', () => {
  it('redit le montant tel que l’écran l’écrit', () => {
    expect(questionRevenu(50)).toBe('Tu déclares 0,50 € par mois. C’est bien ça ?')
    expect(questionRevenu(9_900)).toBe('Tu déclares 99,00 € par mois. C’est bien ça ?')
  })
})
