import { describe, expect, it } from 'vitest'
import { QUANTITE_MAX, ecritQuantite, lireQuantite } from './quantite.ts'

describe('lireQuantite', () => {
  it('rend rien pour un champ vide : la quantité est facultative', () => {
    expect(lireQuantite('')).toEqual({ etat: 'vide' })
    expect(lireQuantite('   ')).toEqual({ etat: 'vide' })
  })

  it('accepte les fractions, point ou virgule : une demi-courgette existe', () => {
    expect(lireQuantite('0.5')).toEqual({ etat: 'ok', valeur: 0.5 })
    expect(lireQuantite('1,5')).toEqual({ etat: 'ok', valeur: 1.5 })
    expect(lireQuantite('250')).toEqual({ etat: 'ok', valeur: 250 })
  })

  it('refuse zéro et le négatif en français (la base répond « violates check constraint »)', () => {
    expect(lireQuantite('0')).toEqual({ etat: 'refus', message: 'Une quantité est plus grande que zéro.' })
    expect(lireQuantite('-2')).toEqual({ etat: 'refus', message: 'Une quantité est plus grande que zéro.' })
  })

  it('refuse l’illisible et l’énorme', () => {
    expect(lireQuantite('abc').etat).toBe('refus')
    expect(lireQuantite('1e400').etat).toBe('refus')
    expect(lireQuantite(String(QUANTITE_MAX + 1))).toEqual({
      etat: 'refus', message: `Pas plus de ${QUANTITE_MAX.toLocaleString('fr-FR')}.` })
    expect(lireQuantite(String(QUANTITE_MAX))).toEqual({ etat: 'ok', valeur: QUANTITE_MAX })
  })
})

describe('ecritQuantite', () => {
  it('arrondit au nombre entier à partir de dix, garde deux décimales dessous', () => {
    expect(ecritQuantite(182.99999999999997)).toBe('183')
    expect(ecritQuantite(31.4166)).toBe('31')
    expect(ecritQuantite(0.5)).toBe('0,5')
    expect(ecritQuantite(0.25)).toBe('0,25')
    expect(ecritQuantite(4)).toBe('4')
    expect(ecritQuantite(1.5)).toBe('1,5')
  })

  it('ne rend jamais « 0 » pour une quantité positive', () => {
    expect(ecritQuantite(0.004)).toBe('moins de 0,01')
  })

  it('sépare les milliers d’une espace insécable', () => {
    expect(ecritQuantite(1200)).toBe('1 200')
  })
})
