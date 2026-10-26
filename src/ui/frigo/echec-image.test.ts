import { beforeEach, describe, expect, it } from 'vitest'
import { DELAI_ECHEC, echecRecent, noteUnEchec, oublieLesEchecs } from './echec-image.ts'

beforeEach(() => oublieLesEchecs())

describe('une photo qui a échoué est retentée plus tard (L7)', () => {
  it('une adresse qui n’a jamais échoué n’est pas en échec', () => {
    expect(echecRecent('https://x/p.jpg', 1000)).toBe(false)
  })
  it('juste après l’échec : en échec, pour ne pas la redemander à chaque carte', () => {
    noteUnEchec('https://x/p.jpg', 1000)
    expect(echecRecent('https://x/p.jpg', 1000 + DELAI_ECHEC - 1)).toBe(true)
  })
  it('passé le délai : on retente — un échec passager n’est pas définitif', () => {
    noteUnEchec('https://x/p.jpg', 1000)
    expect(echecRecent('https://x/p.jpg', 1000 + DELAI_ECHEC)).toBe(false)
    expect(echecRecent('https://x/p.jpg', 1000 + DELAI_ECHEC + 5)).toBe(false)
  })
  it('chaque adresse a son échec', () => {
    noteUnEchec('https://x/a.jpg', 1000)
    expect(echecRecent('https://x/b.jpg', 1001)).toBe(false)
  })
})
