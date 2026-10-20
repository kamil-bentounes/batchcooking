/**
 * La relecture des pages (R3) ne force rien : ce banc fixe ce qu'est un refus,
 * et quand on laisse un site tranquille.
 */
import { describe, expect, it } from 'vitest'
import { abandonne, issueDe, robotsDe } from '../src/relecture.ts'

describe('l’issue d’une page relue', () => {
  it.each([
    [200, true, 'https://a.fr/p.jpg', 'photo'],
    [200, true, null, 'sans-photo'],
    [200, false, null, 'sans-recette'],
    [404, false, null, 'disparue'],
    [410, false, null, 'disparue'],
    [401, false, null, 'refusee'],
    [403, false, null, 'refusee'],
    [429, false, null, 'refusee'],
    [503, false, null, 'refusee'],
    [500, false, null, 'erreur'],
    [502, false, null, 'erreur'],
    [0, false, null, 'erreur'],
    // Les bornes : 2xx est une réponse, tout le reste hors listes est une erreur.
    [199, false, null, 'erreur'],
    [204, true, null, 'sans-photo'],
    [299, false, null, 'sans-recette'],
    [300, false, null, 'erreur'],
    [301, false, null, 'erreur'],
    [400, false, null, 'erreur'],
    [499, false, null, 'erreur'],
  ] as const)('statut %i, recette %s, photo %s → %s', (statut, recette, photo, attendu) => {
    expect(issueDe(statut, recette, photo)).toBe(attendu)
  })
})

describe('laisser un site tranquille', () => {
  it('abandonne après trois refus de suite', () => {
    expect(abandonne(['photo', 'refusee', 'sans-recette', 'refusee'])).toBe(true)
  })

  it('n’abandonne pas quand une page passe entre deux refus', () => {
    expect(abandonne(['refusee', 'refusee', 'photo', 'refusee'])).toBe(false)
  })

  it('n’abandonne pas pour des pages disparues', () => {
    expect(abandonne(['disparue', 'disparue', 'disparue'])).toBe(false)
  })

  it('n’abandonne pas avant trois pages', () => {
    expect(abandonne(['refusee', 'refusee'])).toBe(false)
  })

  it('abandonne après cinq erreurs de suite : un site en panne n’est pas martelé', () => {
    expect(abandonne(['photo', 'erreur', 'erreur', 'erreur', 'erreur', 'erreur'])).toBe(true)
  })

  it('n’abandonne pas après quatre erreurs de suite', () => {
    expect(abandonne(['erreur', 'erreur', 'erreur', 'erreur'])).toBe(false)
  })

  it('n’abandonne pas quand une page passe entre les erreurs', () => {
    expect(abandonne(['erreur', 'erreur', 'erreur', 'photo', 'erreur', 'erreur'])).toBe(false)
  })

  it('ne mélange pas refus et erreurs : deux refus et trois erreurs ne font pas un abandon', () => {
    expect(abandonne(['refusee', 'refusee', 'erreur', 'erreur', 'erreur'])).toBe(false)
    expect(abandonne(['erreur', 'erreur', 'erreur', 'refusee', 'refusee'])).toBe(false)
  })
})

describe('le robots.txt d’un domaine (RFC 9309)', () => {
  it.each([
    [200, 'lire'],
    [404, 'tout-permis'],
    [410, 'tout-permis'],
    [403, 'tout-permis'],
    [429, 'tout-permis'],
    [499, 'tout-permis'],
    [400, 'tout-permis'],
    [204, 'lire'],
    [299, 'lire'],
    [300, 'laisser'],
    [301, 'laisser'],
    [304, 'laisser'],
    [500, 'laisser'],
    [503, 'laisser'],
    [0, 'laisser'],
  ] as const)('statut %i → %s', (statut, attendu) => {
    expect(robotsDe(statut)).toBe(attendu)
  })
})
