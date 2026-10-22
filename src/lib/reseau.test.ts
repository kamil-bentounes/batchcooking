import { describe, expect, it } from 'vitest'
import {
  PAS_DE_RESEAU, classeLaPanne, enFrancais, estUnePanneDeReseau, estUneSessionExpiree,
} from './reseau.ts'

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

describe('estUneSessionExpiree', () => {
  it('reconnaît « JWT expired » de PostgREST, par son code, son texte ou un 401', () => {
    expect(estUneSessionExpiree({ code: 'PGRST301', message: 'JWT expired' })).toBe(true)
    expect(estUneSessionExpiree({ code: 'PGRST303', message: 'JWT claims invalid' })).toBe(true)
    expect(estUneSessionExpiree({ message: 'Error: JWT expired' })).toBe(true)
    expect(estUneSessionExpiree({ message: 'x' }, 401)).toBe(true)
  })

  it('ne prend ni une panne ni un refus de droit pour une session expirée', () => {
    expect(estUneSessionExpiree(new TypeError('Failed to fetch'))).toBe(false)
    expect(estUneSessionExpiree({ code: '42501', message: 'permission denied' }, 403)).toBe(false)
    expect(estUneSessionExpiree({ code: '57014', message: 'canceling statement due to statement timeout' }, 500)).toBe(false)
    expect(estUneSessionExpiree(null)).toBe(false)
  })
})

describe('classeLaPanne : toute erreur de lecture est une panne, jamais « aucun foyer »', () => {
  it('session expirée → connexion', () => {
    expect(classeLaPanne({ code: 'PGRST301', message: 'JWT expired' })).toBe('expiree')
  })
  it('fetch raté → réseau', () => {
    expect(classeLaPanne(new TypeError('Failed to fetch'))).toBe('reseau')
    expect(classeLaPanne({ name: 'AuthRetryableFetchError', message: 'x' })).toBe('reseau')
  })
  it('502, 503, 504, délai dépassé, projet en pause → la base ne répond pas', () => {
    expect(classeLaPanne({ message: '<html>502 Bad Gateway</html>', code: '' }, 502)).toBe('base')
    expect(classeLaPanne({ message: 'Service Unavailable', code: '' }, 503)).toBe('base')
    expect(classeLaPanne({ message: 'Gateway Timeout', code: '' }, 504)).toBe('base')
    expect(classeLaPanne({ code: '57014', message: 'canceling statement due to statement timeout' }, 500)).toBe('base')
    expect(classeLaPanne({ message: '', code: '' }, 540)).toBe('base')
  })
})
