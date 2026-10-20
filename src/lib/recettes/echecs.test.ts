import { describe, expect, it } from 'vitest'
import { messageEchec } from './echecs.ts'

describe('messageEchec', () => {
  it('dit le geste raté, en français, avec de quoi réessayer', () => {
    expect(messageEchec('retenir', new Error('new row violates row-level security policy')))
      .toBe('Je n’ai pas pu retenir cette recette. Réessaie dans un instant.')
    expect(messageEchec('retirer', new Error('boom')))
      .toBe('Je n’ai pas pu retirer cette recette. Réessaie dans un instant.')
    expect(messageEchec('parts', 'n’importe quoi'))
      .toBe('Je n’ai pas pu changer les parts. Réessaie dans un instant.')
    expect(messageEchec('cible', null))
      .toBe('Je n’ai pas pu changer les parts visées. Réessaie dans un instant.')
  })

  it('ne recopie jamais le message technique de la base', () => {
    expect(messageEchec('retenir', new Error('PGRST301 JWT expired'))).not.toMatch(/JWT|PGRST/)
  })

  it('reconnaît une coupure de réseau', () => {
    const dit = 'Je n’ai pas pu retenir cette recette. Tu n’as plus de connexion.'
    expect(messageEchec('retenir', new TypeError('Failed to fetch'))).toBe(dit)
    expect(messageEchec('retenir', new Error('NetworkError when attempting to fetch resource.'))).toBe(dit)
    expect(messageEchec('retenir', new Error('Load failed'))).toBe(dit)
    expect(messageEchec('retenir', new Error('boom'), false)).toBe(dit)
  })
})
