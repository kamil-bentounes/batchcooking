/**
 * Ce que l'écran du mois décide avant de montrer un chiffre (2.15) : a-t-il TOUT lu ?
 */
import { describe, expect, it } from 'vitest'
import { etatDeLEcran, messageDeLecture, videDuMois, type Lecture } from './ecran.ts'

const lu: Lecture = { data: [], error: null }
const attend: Lecture = { data: undefined, error: null }
const rate = (e: unknown = new Error('boum')): Lecture => ({ data: undefined, error: e })

describe('etatDeLEcran', () => {
  it('prêt quand tout est lu — y compris une lecture qui rend null (pas de foyer)', () => {
    expect(etatDeLEcran([lu, { data: null, error: null }])).toBe('pret')
  })

  it('chargement dès qu’UNE lecture manque : aucun chiffre ne se calcule sur un morceau', () => {
    for (let i = 0; i < 5; i++) {
      const l = [lu, lu, lu, lu, lu]
      l[i] = attend
      expect(etatDeLEcran(l)).toBe('chargement')
    }
  })

  it('erreur quand une lecture a échoué sans rien rendre, même si une autre attend encore', () => {
    expect(etatDeLEcran([lu, attend, rate()])).toBe('erreur')
  })

  it('une lecture qui échoue AU RAFRAÎCHISSEMENT garde ses données : on les montre', () => {
    expect(etatDeLEcran([lu, { data: [], error: new Error('coupure') }])).toBe('pret')
  })
})

describe('messageDeLecture', () => {
  it('dit la coupure de réseau, quel que soit le texte du navigateur', () => {
    for (const t of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed']) {
      expect(messageDeLecture(new TypeError(t), true))
        .toBe('Je n’ai pas pu lire le budget : tu n’as plus de connexion.')
    }
  })

  it('dit la coupure quand le navigateur se sait hors ligne', () => {
    expect(messageDeLecture(new Error('autre chose'), false))
      .toBe('Je n’ai pas pu lire le budget : tu n’as plus de connexion.')
  })

  it('laisse parler la base, dont les messages sont déjà en français', () => {
    expect(messageDeLecture(new Error('Le foyer est introuvable.'), true))
      .toBe('Je n’ai pas pu lire le budget : Le foyer est introuvable.')
  })

  it('une erreur sans texte ne laisse pas un message vide', () => {
    expect(messageDeLecture(undefined, true)).toBe('Je n’ai pas pu lire le budget.')
  })
})

describe('videDuMois', () => {
  const OCT = '2026-10-01'

  it('mois courant, sans compte : on commence par les revenus et les comptes', () => {
    expect(videDuMois({ mois: OCT, courant: OCT, nComptes: 0 }))
      .toMatchObject({ titre: 'Rien de posé', porte: 'revenus' })
  })

  it('mois courant, avec des comptes : on pose les charges', () => {
    expect(videDuMois({ mois: OCT, courant: OCT, nComptes: 2 })).toMatchObject({ porte: 'charges' })
  })

  it('comptes pas encore lus : aucune porte, pour ne pas en proposer une fausse', () => {
    expect(videDuMois({ mois: OCT, courant: OCT, nComptes: null })).toMatchObject({ porte: null })
  })

  it('un mois PASSÉ vide ne dit pas « on commence par là » : rien n’y était posé', () => {
    const v = videDuMois({ mois: '2026-03-01', courant: OCT, nComptes: 0 })
    expect(v.porte).toBeNull()
    expect(v.texte).toBe('Aucune charge n’était posée ce mois-là.')
  })

  it('un mois futur n’est pas ouvert : il le sera avec le mois', () => {
    const v = videDuMois({ mois: '2026-12-01', courant: OCT, nComptes: 2 })
    expect(v.porte).toBeNull()
    expect(v.titre).toBe('Pas encore ouvert')
  })
})
