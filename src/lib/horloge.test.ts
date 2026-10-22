import { afterEach, describe, expect, it, vi } from 'vitest'
import { aujourdhui, jourDeParis, maintenant, moisCourantDeParis } from './horloge.ts'

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

/**
 * Le jour et le mois du front sont ceux de la BASE : `mois_courant()` compte à Paris. Entre
 * minuit et 2 h à Paris, un téléphone resté à l'heure d'ailleurs (ou un navigateur en UTC)
 * voyait encore le mois d'avant : « Clôturer » proposé un mois trop tôt, et refusé par la base.
 * Les instants sont en UTC : le résultat ne dépend pas du fuseau de la machine du test.
 */
describe('le jour et le mois de Paris', () => {
  it('à minuit passé à Paris, c’est déjà le mois suivant, même si UTC dit encore le mois d’avant', () => {
    // 31/10 23:30 UTC = 01/11 00:30 à Paris (heure d'hiver, UTC+1).
    const d = new Date('2026-10-31T23:30:00Z')
    expect(jourDeParis(d)).toBe('2026-11-01')
    expect(moisCourantDeParis(d)).toBe('2026-11-01')
  })
  it('l’heure d’été : 30/06 22:30 UTC = 01/07 00:30 à Paris (UTC+2)', () => {
    expect(moisCourantDeParis(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07-01')
  })
  it('le passage d’année : 31/12 23:30 UTC est déjà le 1er janvier à Paris', () => {
    expect(jourDeParis(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01')
  })
  it('avant minuit à Paris, c’est encore le mois en cours', () => {
    expect(moisCourantDeParis(new Date('2026-10-31T22:30:00Z'))).toBe('2026-10-01')
    expect(jourDeParis(new Date('2026-10-31T22:30:00Z'))).toBe('2026-10-31')
  })
  it('le jour a toujours deux chiffres', () => {
    expect(jourDeParis(new Date('2026-03-05T10:00:00Z'))).toBe('2026-03-05')
  })
  it('sans argument, il suit l’horloge jouée du banc (`popote.maintenant`)', () => {
    vi.stubEnv('MODE', 'development')
    poseLeReglage('2026-11-30T23:30:00Z')
    expect(moisCourantDeParis()).toBe('2026-12-01')
    expect(jourDeParis()).toBe('2026-12-01')
  })
})
