import { afterEach, describe, expect, it, vi } from 'vitest'
import { aujourdhui, maintenant } from './horloge.ts'

/** Un `localStorage` qui ne contient que `popote.maintenant`. */
function poseLeReglage(valeur: string | null) {
  vi.stubGlobal('localStorage', {
    getItem: (cle: string) => (cle === 'popote.maintenant' ? valeur : null),
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('l’heure du front', () => {
  it('est l’heure vraie hors du mode development', () => {
    expect(Math.abs(maintenant().getTime() - Date.now())).toBeLessThan(1_000)
  })
  it('écrit le jour en heure locale', () => {
    expect(aujourdhui(new Date(2026, 9, 3, 0, 30))).toBe('2026-10-03')
  })

  describe('le réglage `popote.maintenant`', () => {
    // La porte du mode : un réglage posé par un banc ne doit JAMAIS fausser l'heure d'un
    // paquet de production, ni d'un test qui se croirait en développement.
    for (const mode of ['test', 'production']) {
      it(`est ignoré en mode ${mode}`, () => {
        vi.stubEnv('MODE', mode)
        poseLeReglage('2030-01-01T10:00:00Z')
        expect(Math.abs(maintenant().getTime() - Date.now())).toBeLessThan(1_000)
      })
    }
    it('est lu en mode development', () => {
      vi.stubEnv('MODE', 'development')
      poseLeReglage('2026-11-01T10:00:00Z')
      expect(maintenant().toISOString()).toBe('2026-11-01T10:00:00.000Z')
    })
    it('illisible, laisse l’heure vraie au lieu d’un « Invalid Date »', () => {
      vi.stubEnv('MODE', 'development')
      poseLeReglage('pas une date')
      const d = maintenant()
      expect(Number.isNaN(d.getTime())).toBe(false)
      expect(Math.abs(d.getTime() - Date.now())).toBeLessThan(1_000)
      expect(aujourdhui()).not.toContain('NaN')
    })
    it('absent ou stockage bloqué, laisse l’heure vraie', () => {
      vi.stubEnv('MODE', 'development')
      poseLeReglage(null)
      expect(Math.abs(maintenant().getTime() - Date.now())).toBeLessThan(1_000)
      vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqué') } })
      expect(Math.abs(maintenant().getTime() - Date.now())).toBeLessThan(1_000)
    })
  })
})
