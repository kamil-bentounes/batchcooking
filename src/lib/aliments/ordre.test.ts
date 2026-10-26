/**
 * Nos aliments avant les repères : le repère « Yaourt » ne se glisse plus à côté du yaourt du foyer.
 */
import { describe, expect, it } from 'vitest'
import { REPERES, reperesDe } from '../reperes.ts'
import {
  nomComparable, nomDeComparaison, parNom, premierMot, remplace, repereProposePour, repereRemplace, sansLesRemplaces,
} from './ordre.ts'

describe('qui remplace qui : un choix explicite, plus de préfixe', () => {
  it('un aliment de même nom remplace le repère, sans tenir compte de la casse, des accents, des espaces ni du pluriel', () => {
    expect(remplace({ label: 'Yaourt' }, 'Yaourt')).toBe(true)
    expect(remplace({ label: '  YAOURT ' }, 'yaourt')).toBe(true)
    expect(remplace({ label: 'Yaourts' }, 'Yaourt')).toBe(true)
    expect(remplace({ label: 'Poignee d’amandes' }, 'Poignée d’amandes')).toBe(true)
    expect(remplace({ label: 'Poignée d\'amande' }, 'Poignée d’amandes')).toBe(true) // l'apostrophe droite, le singulier
  })

  it('« Yaourt dessert protéiné » ne remplace PLUS « Yaourt » tout seul : il faut le lui dire', () => {
    expect(remplace({ label: 'Yaourt dessert protéiné' }, 'Yaourt')).toBe(false)
    expect(remplace({ label: 'Yaourt dessert protéiné', remplace_repere: null }, 'Yaourt')).toBe(false)
    expect(remplace({ label: 'Yaourt dessert protéiné', remplace_repere: 'Yaourt' }, 'Yaourt')).toBe(true)
  })

  it('le repère nommé est comparé sans accents, casse ni pluriel ; il ne remplace que lui', () => {
    const a = { label: 'Amandes grillées', remplace_repere: 'poignee d’amande' }
    expect(remplace(a, 'Poignée d’amandes')).toBe(true)
    expect(remplace(a, 'Yaourt')).toBe(false)
    expect(remplace(a, 'Fruit')).toBe(false)
  })

  it('« Skyr Danone » ne cache pas « Skyr ou fromage blanc » ; nommé, il le cache', () => {
    expect(remplace({ label: 'Skyr Danone' }, 'Skyr ou fromage blanc')).toBe(false)
    expect(remplace({ label: 'Skyr Danone', remplace_repere: 'Skyr ou fromage blanc' }, 'Skyr ou fromage blanc')).toBe(true)
  })

  it('un mot qui commence pareil sans en être un, et l’inverse, ne remplacent rien', () => {
    expect(remplace({ label: 'Yaourt' }, 'Yaourt dessert protéiné')).toBe(false)
    expect(remplace({ label: 'Yaourtière' }, 'Yaourt')).toBe(false)
    expect(remplace({ label: 'Pizza' }, 'Pizza')).toBe(true)
  })

  it('un nom vide ne remplace rien, un repère nommé vide non plus', () => {
    expect(remplace({ label: 'Yaourt' }, '')).toBe(false)
    expect(remplace({ label: 'Yaourt', remplace_repere: '' }, 'Fruit')).toBe(false)
  })

  it('nomComparable défait accents, casse, apostrophes et espaces doubles ; nomDeComparaison le pluriel aussi', () => {
    expect(nomComparable('  Café   ET rien ')).toBe('cafe et rien')
    expect(nomDeComparaison('Poignées d’amandes')).toBe('poignee d\'amande')
    expect(nomDeComparaison('Riz')).toBe('riz')
    expect(nomDeComparaison('Pois')).toBe('pois')
  })
})

describe('le repère proposé pour un nom', () => {
  it('le premier mot, sans accents, casse ni pluriel : « Yaourt dessert protéiné » propose « Yaourt »', () => {
    expect(repereProposePour('Yaourt dessert protéiné', REPERES)?.label).toBe('Yaourt')
    expect(repereProposePour('YAOURTS à la grecque', REPERES)?.label).toBe('Yaourt')
    expect(repereProposePour('  skyr nature', REPERES)?.label).toBe('Skyr ou fromage blanc')
    expect(repereProposePour('Café au lait', REPERES)?.label).toBe('Café et rien')
  })

  it('rien quand le premier mot ne ressemble à aucun repère, ou quand le nom est vide', () => {
    expect(repereProposePour('Pain de seigle', REPERES)).toBeUndefined()
    expect(repereProposePour('', REPERES)).toBeUndefined()
    expect(repereProposePour('   ', REPERES)).toBeUndefined()
  })

  it('rien quand deux repères commencent pareil : on ne devine pas entre les deux', () => {
    expect(REPERES.filter(r => premierMot(r.label) === 'petit-dejeuner').length).toBeGreaterThan(1)
    expect(repereProposePour('Petit-déjeuner anglais', REPERES)).toBeUndefined()
  })

  it('c’est une proposition : l’écran peut la retirer, et alors rien n’est caché', () => {
    const a = { label: 'Yaourt dessert protéiné', remplace_repere: null }
    expect(sansLesRemplaces(REPERES, [a])).toEqual(REPERES)
  })
})

describe('la feuille « Autre chose » : les repères qui restent', () => {
  it('le repère « Yaourt » disparaît quand un aliment le nomme ; les autres restent, dans le même ordre', () => {
    const avant = reperesDe('collation')
    expect(avant.map(r => r.label)).toContain('Yaourt')
    const apres = sansLesRemplaces(avant, [{ label: 'Yaourt dessert protéiné', remplace_repere: 'Yaourt' }])
    expect(apres.map(r => r.label)).not.toContain('Yaourt')
    expect(apres.map(r => r.label)).toEqual(avant.map(r => r.label).filter(l => l !== 'Yaourt'))
  })

  it('sans choix, « Yaourt dessert protéiné » ne cache rien ; « Yaourts » (même nom) cache « Yaourt »', () => {
    const avant = reperesDe('collation')
    expect(sansLesRemplaces(avant, [{ label: 'Yaourt dessert protéiné' }])).toEqual(avant)
    expect(sansLesRemplaces(avant, [{ label: 'Yaourts' }]).map(r => r.label)).not.toContain('Yaourt')
  })

  it('sans aliment à nous, rien ne change : les repères génériques restent', () => {
    expect(sansLesRemplaces(REPERES, [])).toEqual(REPERES)
  })

  it('un aliment sans rapport ne retire aucun repère', () => {
    expect(sansLesRemplaces(REPERES, [{ label: 'Pain de seigle' }])).toEqual(REPERES)
  })

  it('les habitudes (« ce que vous reprenez souvent ») suivent la même règle', () => {
    const frequents = [{ label: 'Yaourt', kcal: 60 }, { label: 'Fruit', kcal: 80 }, { label: 'Yaourt grec', kcal: 90 }]
    /* Nommé : l'habitude « Yaourt » part ; « Yaourt grec » n'est nommée par personne, elle reste. */
    expect(sansLesRemplaces(frequents, [{ label: 'Yaourt dessert protéiné', remplace_repere: 'Yaourt' }]))
      .toEqual([{ label: 'Fruit', kcal: 80 }, { label: 'Yaourt grec', kcal: 90 }])
    /* Pas nommé : « Yaourt grec » (aliment) ne cache plus l'habitude « Yaourt ». */
    expect(sansLesRemplaces(frequents, [{ label: 'Yaourt grec' }])).toEqual([
      { label: 'Yaourt', kcal: 60 }, { label: 'Fruit', kcal: 80 },
    ])
  })

  it('l’écran sait dire quel repère l’aliment remplace', () => {
    expect(repereRemplace({ label: 'Yaourt dessert protéiné', remplace_repere: 'Yaourt' }, REPERES)?.label).toBe('Yaourt')
    expect(repereRemplace({ label: 'Yaourt dessert protéiné' }, REPERES)).toBeUndefined()
    expect(repereRemplace({ label: 'Pain de seigle' }, REPERES)).toBeUndefined()
  })
})

describe('l’ordre de nos aliments', () => {
  it('par nom, à la française : les accents et la casse ne comptent pas', () => {
    const noms = parNom([{ label: 'Yaourt' }, { label: 'éclair' }, { label: 'Abricot' }, { label: 'Skyr' }]).map(a => a.label)
    expect(noms).toEqual(['Abricot', 'éclair', 'Skyr', 'Yaourt'])
  })

  it('ne modifie pas la liste reçue', () => {
    const liste = [{ label: 'B' }, { label: 'A' }]
    parNom(liste)
    expect(liste.map(x => x.label)).toEqual(['B', 'A'])
  })
})
