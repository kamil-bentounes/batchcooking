import { describe, expect, it } from 'vitest'
import { parts } from './parts.ts'

describe('parts', () => {
  it('écrit le singulier jusqu’à 1, le pluriel au-delà', () => {
    expect(parts(1)).toBe('1 part')
    expect(parts(2)).toBe('2 parts')
    expect(parts(4)).toBe('4 parts')
    expect(parts(12)).toBe('12 parts')
  })

  it('met zéro au singulier, comme le français', () => {
    expect(parts(0)).toBe('0 part')
  })
})
