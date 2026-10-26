import { describe, expect, it } from 'vitest'
import { aDesObjectifs, bandeauDuProfil, ceuxDuFoyer, phraseSansObjectifs } from './foyer.ts'

describe('ceuxDuFoyer — la ligne des réglages qui dit qui est là', () => {
  it('les prénoms, séparés par des virgules', () => {
    expect(ceuxDuFoyer([{ display_name: 'Kamil' }, { display_name: 'Thauba' }]))
      .toBe('Dans le foyer : Kamil, Thauba')
  })
  it('seul : son prénom', () => {
    expect(ceuxDuFoyer([{ display_name: 'Kamil' }])).toBe('Dans le foyer : Kamil')
  })
  it('un prénom pas encore posé se lit « Sans prénom », jamais un vide', () => {
    expect(ceuxDuFoyer([{ display_name: 'Kamil' }, { display_name: ' ' }]))
      .toBe('Dans le foyer : Kamil, Sans prénom')
  })
  it('foyer pas lu ou vide : aucune ligne', () => {
    expect(ceuxDuFoyer(undefined)).toBeNull()
    expect(ceuxDuFoyer([])).toBeNull()
  })
})

describe('aDesObjectifs — l’arrivante n’en a pas encore', () => {
  it('un objectif en kcal, c’est oui', () => {
    expect(aDesObjectifs({ objectif: { kcal: 2200 } })).toBe(true)
  })
  it('aucun objectif, ou 0 kcal : non', () => {
    expect(aDesObjectifs({ objectif: null })).toBe(false)
    expect(aDesObjectifs({})).toBe(false)
    expect(aDesObjectifs({ objectif: { kcal: 0 } })).toBe(false)
  })
})

describe('bandeauDuProfil — ce qui manque à MON profil', () => {
  it('rien ne manque : pas de bandeau', () => {
    expect(bandeauDuProfil({ prenom: true, revenu: true, objectifs: true })).toBeNull()
  })
  it('le revenu seul manque : le bandeau d’avant, au mot près', () => {
    expect(bandeauDuProfil({ prenom: true, revenu: false, objectifs: true })).toEqual({
      titre: 'Complète ton profil.', vers: '/profil',
      texte: 'Sans ton revenu, le partage se fait à parts égales.' })
  })
  it('les objectifs seuls manquent : « Fixe tes objectifs », vers leur écran', () => {
    const b = bandeauDuProfil({ prenom: true, revenu: true, objectifs: false })
    expect(b?.titre).toBe('Fixe tes objectifs.')
    expect(b?.texte).toContain('tes barquettes sont dressées à parts égales')
    expect(b?.vers).toBe('/objectifs')
  })
  it('le revenu ET les objectifs manquent : une seule phrase les dit tous les deux, vers le profil', () => {
    const b = bandeauDuProfil({ prenom: false, revenu: false, objectifs: false })
    expect(b?.titre).toBe('Complète ton profil.')
    expect(b?.texte).toContain('le partage se fait à parts égales')
    expect(b?.texte).toContain('tes barquettes sont dressées à parts égales')
    expect(b?.vers).toBe('/profil')
  })
})

describe('phraseSansObjectifs — le dressage dit qui est dressé à parts égales', () => {
  it('personne ne manque : rien', () => expect(phraseSansObjectifs([])).toBeNull())
  it('une personne', () => {
    expect(phraseSansObjectifs(['Thauba']))
      .toBe('Thauba n’a pas encore fixé ses objectifs : ses barquettes sont dressées à parts égales.')
  })
  it('plusieurs', () => {
    expect(phraseSansObjectifs(['Thauba', 'Camille']))
      .toBe('Thauba et Camille n’ont pas encore fixé leurs objectifs : leurs barquettes sont dressées à parts égales.')
  })
})
