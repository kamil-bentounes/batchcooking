/**
 * Nos aliments avant les repères : le repère « Yaourt » ne se glisse plus à côté du yaourt du foyer.
 */
import { describe, expect, it } from 'vitest'
import { REPERES, reperesDe } from '../reperes.ts'
import { nomComparable, parNom, remplace, repereRemplace, sansLesRemplaces } from './ordre.ts'

describe('qui remplace qui', () => {
  it('un aliment de même nom remplace le repère, sans tenir compte de la casse, des accents ni des espaces', () => {
    expect(remplace('Yaourt', 'Yaourt')).toBe(true)
    expect(remplace('  YAOURT ', 'yaourt')).toBe(true)
    expect(remplace('Poignee d’amandes', 'Poignée d’amandes')).toBe(true)
    expect(remplace('Poignée d\'amandes', 'Poignée d’amandes')).toBe(true) // l'apostrophe droite
  })

  it('« Yaourt dessert protéiné » remplace « Yaourt » : il le prolonge d’un mot', () => {
    expect(remplace('Yaourt dessert protéiné', 'Yaourt')).toBe(true)
  })

  it('mais pas l’inverse, ni un mot qui commence pareil sans en être un', () => {
    expect(remplace('Yaourt', 'Yaourt dessert protéiné')).toBe(false)
    expect(remplace('Yaourtière', 'Yaourt')).toBe(false)
    expect(remplace('Skyr', 'Skyr ou fromage blanc')).toBe(false)
    expect(remplace('Skyr Danone', 'Skyr ou fromage blanc')).toBe(false)
    expect(remplace('Pizza', 'Pizza')).toBe(true)
  })

  it('un nom vide ne remplace rien', () => {
    expect(remplace('Yaourt', '')).toBe(false)
  })

  it('nomComparable défait accents, casse, apostrophes et espaces doubles', () => {
    expect(nomComparable('  Café   ET rien ')).toBe('cafe et rien')
  })
})

describe('la feuille « Autre chose » : les repères qui restent', () => {
  it('le repère « Yaourt » disparaît quand le foyer a son yaourt ; les autres restent, dans le même ordre', () => {
    const avant = reperesDe('collation')
    expect(avant.map(r => r.label)).toContain('Yaourt')
    const apres = sansLesRemplaces(avant, [{ label: 'Yaourt dessert protéiné' }])
    expect(apres.map(r => r.label)).not.toContain('Yaourt')
    expect(apres.map(r => r.label)).toEqual(avant.map(r => r.label).filter(l => l !== 'Yaourt'))
  })

  it('sans aliment à nous, rien ne change : les repères génériques restent', () => {
    expect(sansLesRemplaces(REPERES, [])).toEqual(REPERES)
  })

  it('un aliment sans rapport ne retire aucun repère', () => {
    expect(sansLesRemplaces(REPERES, [{ label: 'Pain de seigle' }])).toEqual(REPERES)
  })

  it('les habitudes (« ce que tu reprends souvent ») suivent la même règle', () => {
    const frequents = [{ label: 'Yaourt', kcal: 60 }, { label: 'Fruit', kcal: 80 }]
    expect(sansLesRemplaces(frequents, [{ label: 'Yaourt grec' }])).toEqual([{ label: 'Fruit', kcal: 80 }])
  })

  it('l’écran sait dire quel repère l’aliment remplace', () => {
    expect(repereRemplace('Yaourt dessert protéiné', REPERES)?.label).toBe('Yaourt')
    expect(repereRemplace('Pain de seigle', REPERES)).toBeUndefined()
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
