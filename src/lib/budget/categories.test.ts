import { describe, expect, it } from 'vitest'
import { CATEGORIES, categorieDeLArticle, infoCategorie, modeDeLArticle } from './categories.ts'

describe('les catégories', () => {
  it('l’ordre de repli de D74', () => {
    expect(CATEGORIES.map(c => c.cle)).toEqual(['vie_courante', 'maison', 'credits', 'auto',
      'abonnements', 'sante', 'impots', 'autre'])
  })
  it('deux couleurs : sur fond clair, et dans la carte encre', () => {
    expect(infoCategorie('maison')).toMatchObject({ nom: 'Maison', clair: '#2F5D45',
                                                    sombre: '#86C29F' })
    expect(infoCategorie('inconnue').cle).toBe('autre')
  })
  it('la catégorie d’un article : sa section, sauf la résidence', () => {
    expect(categorieDeLArticle({ section: 'Santé', libelle: 'Pharmacie' })).toBe('sante')
    expect(categorieDeLArticle({ section: 'Crédits',
      libelle: 'Crédit immobilier — résidence' })).toBe('maison')
    expect(categorieDeLArticle({ section: 'Crédits',
      libelle: 'Crédit immobilier — locatif' })).toBe('credits')
    expect(categorieDeLArticle({ section: 'Ailleurs', libelle: 'X' })).toBe('autre')
  })
  it('la façon d’un article', () => {
    expect(modeDeLArticle({ periode: 'annuel', plafond_ordre: null, libelle: 'Taxe foncière' }))
      .toBe('mis_de_cote')
    expect(modeDeLArticle({ periode: 'mensuel', plafond_ordre: 1, libelle: 'Courses' }))
      .toBe('au_fil')
    expect(modeDeLArticle({ periode: 'mensuel', plafond_ordre: null, libelle: 'Électricité' }))
      .toBe('facture')
    expect(modeDeLArticle({ periode: 'mensuel', plafond_ordre: null, libelle: 'Internet' }))
      .toBe('fixe')
  })
})
