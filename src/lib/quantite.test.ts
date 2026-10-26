import { describe, expect, it } from 'vitest'
import { QUANTITE_MAX, ecritQuantite, ecritQuantiteEtUnite, lireQuantite, uniteAccordee } from './quantite.ts'

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

describe('l’unité accordée avec la quantité', () => {
  it('« 3 pot » devient « 3 pots » ; un pot reste un pot', () => {
    expect(ecritQuantiteEtUnite(3, 'pot')).toBe('3 pots')
    expect(ecritQuantiteEtUnite(1, 'pot')).toBe('1 pot')
    expect(ecritQuantiteEtUnite(1.5, 'pot')).toBe('1,5 pot')
    expect(ecritQuantiteEtUnite(0.5, 'boîte')).toBe('0,5 boîte')
    expect(ecritQuantiteEtUnite(12, 'boîte')).toBe('12 boîtes')
  })
  it('les symboles ne bougent pas', () => {
    for (const u of ['g', 'kg', 'ml', 'cl', 'l', 'u']) expect(uniteAccordee(u, 500)).toBe(u)
    expect(ecritQuantiteEtUnite(500, 'g')).toBe('500 g')
  })
  it('s, x, z : inchangés ; -al : -aux ; l’unité composée n’accorde que son premier mot', () => {
    expect(uniteAccordee('tranches', 4)).toBe('tranches')
    expect(uniteAccordee('bocal', 2)).toBe('bocaux')
    expect(uniteAccordee('cuillère à soupe', 3)).toBe('cuillères à soupe')
  })
  it('sans unité : la quantité seule ; sans quantité : rien d’ajouté', () => {
    expect(ecritQuantiteEtUnite(4, null)).toBe('4')
    expect(uniteAccordee(null, 3)).toBe('')
  })
})
