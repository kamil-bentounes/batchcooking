import { describe, it, expect } from 'vitest'
import { dateDeSource, ligneDeSource, miseEnGarde, typographie } from './aide.ts'
import { aLeBoutonDansSonEntete, ecranPourLAide, surCetEcran } from './suggestions.ts'

const NOW = new Date('2026-10-23T10:00:00')

describe('dateDeSource', () => {
  it('dit « 23 octobre » dans l’année, et l’année quand ce n’est pas la bonne', () => {
    expect(dateDeSource('2026-10-23', NOW)).toBe('23 octobre')
    expect(dateDeSource('2025-03-02', NOW)).toBe('2 mars 2025')
  })
  it('rend la date brute si elle ne se lit pas', () => {
    expect(dateDeSource('hier', NOW)).toBe('hier')
  })
})

describe('ligneDeSource', () => {
  it('une page, une date', () => {
    expect(ligneDeSource([{ id: 'a', titre: 'Inviter', verifie_le: '2026-10-23' }], NOW))
      .toBe('Source : manuel « Inviter », vérifié le 23 octobre.')
  })
  it('plusieurs pages, plusieurs dates : toutes dites', () => {
    expect(ligneDeSource([
      { id: 'a', titre: 'Inviter', verifie_le: '2026-10-23' },
      { id: 'b', titre: 'Profil', verifie_le: '2026-10-20' },
    ], NOW)).toBe('Source : manuel, pages « Inviter », « Profil », vérifiées le 23 octobre et le 20 octobre.')
  })
  it('aucune page, aucune ligne', () => {
    expect(ligneDeSource([], NOW)).toBeNull()
  })
})

describe('miseEnGarde', () => {
  const page = [{ id: 'a', titre: 'A', verifie_le: '2026-10-23' }]
  it('rien quand tout se confirme', () => {
    expect(miseEnGarde({ savoir: 'oui', a_verifier: [], sources: page })).toBeNull()
    expect(miseEnGarde({ savoir: 'non', a_verifier: [], sources: [] })).toBeNull()
  })
  it('dit ce qui n’a pas été confirmé', () => {
    expect(miseEnGarde({ savoir: 'partiel', a_verifier: ['90', '« Valider »'], sources: page }))
      .toBe('Je n’ai pas pu confirmer dans le manuel : 90, « Valider ». Vérifie avant de t’y fier.')
  })
  it('une réponse partielle sans source le dit autrement qu’une avec', () => {
    expect(miseEnGarde({ savoir: 'partiel', a_verifier: [], sources: [] })).toContain('aucune page')
    expect(miseEnGarde({ savoir: 'partiel', a_verifier: [], sources: page })).toContain('partielle')
  })
})

describe('typographie', () => {
  it('lie les guillemets et la ponctuation haute à leur mot', () => {
    expect(typographie('touche « Inviter » : puis ? oui !'))
      .toBe('touche «\u00A0Inviter\u00A0»\u00A0: puis\u00A0? oui\u00A0!')
  })
  it('ne touche ni aux retours à la ligne ni au reste', () => {
    expect(typographie('1. Ouvre.\n2. Saisis.')).toBe('1. Ouvre.\n2. Saisis.')
  })
})

describe('les écrans de l’aide', () => {
  it('les trois entrées portent le « ? » dans leur en-tête, le mois précis aussi', () => {
    for (const r of ['/', '/budget', '/cuisine-accueil', '/budget/2026-10']) expect(aLeBoutonDansSonEntete(r)).toBe(true)
    for (const r of ['/charges', '/reglages', '/profil', '/cloture/2026-09', '/budget-reglages']) expect(aLeBoutonDansSonEntete(r)).toBe(false)
  })
  it('un mois du budget compte pour le budget', () => {
    expect(ecranPourLAide('/budget/2026-10')).toBe('/budget')
    expect(surCetEcran('/budget/2026-10')).toEqual(surCetEcran('/budget'))
    expect(ecranPourLAide('/charges')).toBe('/charges')
  })
  it('un écran sans suggestion n’en invente pas', () => {
    expect(surCetEcran('/stock')).toEqual([])
  })
})
