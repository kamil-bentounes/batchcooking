/**
 * D'où l'on arrive sur « Nos aliments », et où le retour mène : la feuille de la semaine rouverte, ou les réglages.
 */
import { describe, expect, it } from 'vitest'
import { ouvreLaCreation, retourDe } from './retour.ts'

describe('le retour de « Nos aliments »', () => {
  it('depuis les réglages (ou sans rien) : les réglages', () => {
    expect(retourDe('')).toEqual({ vers: '/reglages', texte: 'Réglages' })
    expect(retourDe('?nouveau=1')).toEqual({ vers: '/reglages', texte: 'Réglages' })
  })

  it('depuis la feuille de choix : la semaine, au même jour et au même repas, la feuille rouverte', () => {
    expect(retourDe('?depuis=semaine&jour=2026-10-27&repas=diner'))
      .toEqual({ vers: '/semaine?jour=2026-10-27&repas=diner', texte: 'La semaine' })
  })

  it('un jour ou un repas illisible : la semaine, sans feuille', () => {
    expect(retourDe('?depuis=semaine').vers).toBe('/semaine')
    expect(retourDe('?depuis=semaine&jour=demain&repas=diner').vers).toBe('/semaine')
    expect(retourDe('?depuis=semaine&jour=2026-10-27&repas=collation').vers).toBe('/semaine')
    expect(retourDe('?depuis=ailleurs&jour=2026-10-27&repas=diner').vers).toBe('/reglages')
  })

  it('`?nouveau=1` ouvre la création', () => {
    expect(ouvreLaCreation('?nouveau=1')).toBe(true)
    expect(ouvreLaCreation('?depuis=semaine&nouveau=1')).toBe(true)
    expect(ouvreLaCreation('')).toBe(false)
    expect(ouvreLaCreation('?nouveau=0')).toBe(false)
  })
})
