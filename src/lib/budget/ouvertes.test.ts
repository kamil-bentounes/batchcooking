/**
 * Les catégories ouvertes, retenues par appareil (§ 3.1, point 10).
 *
 * Le stockage peut manquer (navigation privée, accès bloqué) ou contenir n'importe quoi :
 * l'écran doit marcher quand même, sans rien retenir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bascule, CLE_LOCALE, lisOuvertes, retiens } from './ouvertes.ts'

function faux(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) },
    removeItem: k => { m.delete(k) }, clear: () => m.clear(),
    key: i => [...m.keys()][i] ?? null, get length() { return m.size },
  }
}

describe('ouvertes', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', faux()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('ne retient rien au départ', () => {
    expect(lisOuvertes()).toEqual({})
  })

  it('retient chaque catégorie sans effacer les autres', () => {
    retiens('maison', true)
    retiens('auto', false)
    retiens('maison', false)
    expect(lisOuvertes()).toEqual({ maison: false, auto: false })
  })

  it('une valeur fermée se relit fermée : le choix de l’utilisateur prime sur l’ouverture d’office', () => {
    retiens('maison', false)
    expect(lisOuvertes().maison).toBe(false)
    expect(lisOuvertes().maison ?? true).toBe(false)
  })

  it('le geste bascule et retient : replié, il se relit replié au rechargement', () => {
    expect(bascule('maison', true)).toBe(false)
    expect(lisOuvertes().maison).toBe(false)
    expect(bascule('maison', false)).toBe(true)
    expect(lisOuvertes().maison).toBe(true)
  })

  it('le geste marche même sans stockage : l’état d’après est rendu, rien n’est retenu', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(bascule('maison', false)).toBe(true)
  })

  it('un contenu illisible vaut « rien retenu », sans lever', () => {
    localStorage.setItem(CLE_LOCALE, '{pas du json')
    expect(lisOuvertes()).toEqual({})
  })

  it('un contenu qui n’est pas un objet vaut « rien retenu »', () => {
    for (const mauvais of ['null', '42', '"texte"', '[true]']) {
      localStorage.setItem(CLE_LOCALE, mauvais)
      expect(lisOuvertes(), mauvais).toEqual({})
    }
  })

  it('ne garde que les booléens : une valeur étrangère ne ferme ni n’ouvre rien', () => {
    localStorage.setItem(CLE_LOCALE, JSON.stringify({ maison: 'oui', auto: true, sante: 0 }))
    expect(lisOuvertes()).toEqual({ auto: true })
  })

  it('un stockage bloqué (navigation privée) ne casse ni la lecture ni l’écriture', () => {
    const bloque = {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('QuotaExceededError') },
    }
    vi.stubGlobal('localStorage', bloque)
    expect(lisOuvertes()).toEqual({})
    expect(() => retiens('maison', true)).not.toThrow()
  })

  it('sans stockage du tout (rendu côté serveur, test) : rien retenu, rien levé', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(lisOuvertes()).toEqual({})
    expect(() => retiens('maison', true)).not.toThrow()
  })
})
