import { describe, expect, it } from 'vitest'
import { ceuxDuFoyer } from './foyer.ts'

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
