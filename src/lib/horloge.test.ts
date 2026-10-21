import { describe, expect, it } from 'vitest'
import { aujourdhui, maintenant } from './horloge.ts'

describe('l’heure du front', () => {
  it('est l’heure vraie hors du mode development', () => {
    expect(Math.abs(maintenant().getTime() - Date.now())).toBeLessThan(1_000)
  })
  it('écrit le jour en heure locale', () => {
    expect(aujourdhui(new Date(2026, 9, 3, 0, 30))).toBe('2026-10-03')
  })
})
