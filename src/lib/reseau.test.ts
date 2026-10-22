import { describe, expect, it } from 'vitest'
import { PAS_DE_RESEAU, enFrancais, estUnePanneDeReseau } from './reseau.ts'

describe('estUnePanneDeReseau', () => {
  it('reconnaît les pannes de fetch des trois navigateurs et celle de supabase-js', () => {
    expect(estUnePanneDeReseau(new TypeError('Failed to fetch'))).toBe(true)
    expect(estUnePanneDeReseau(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true)
    expect(estUnePanneDeReseau(new TypeError('Load failed'))).toBe(true)
    expect(estUnePanneDeReseau({ name: 'AuthRetryableFetchError', message: 'x' })).toBe(true)
  })

  it('ne prend pas un mauvais mot de passe pour une panne', () => {
    expect(estUnePanneDeReseau({ name: 'AuthApiError', message: 'Invalid login credentials', status: 400 })).toBe(false)
    expect(estUnePanneDeReseau(null)).toBe(false)
    expect(estUnePanneDeReseau('Failed to fetch')).toBe(false)
  })
})

describe('enFrancais', () => {
  it('traduit « Failed to fetch » avec ou sans son préfixe, laisse le reste', () => {
    expect(enFrancais('TypeError: Failed to fetch')).toBe(PAS_DE_RESEAU)
    expect(enFrancais('Failed to fetch')).toBe(PAS_DE_RESEAU)
    expect(enFrancais('Cette personne est déjà dans ton foyer.')).toBe('Cette personne est déjà dans ton foyer.')
  })
})
