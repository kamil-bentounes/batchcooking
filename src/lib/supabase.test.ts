/**
 * `callFunction` sans session : une panne de réseau n'est pas une session perdue.
 *
 * Jeton de plus d'une heure + réseau coupé : auth-js ne peut pas le rafraîchir, et `getSession`
 * rend `session: null` AVEC une erreur de réseau (`AuthRetryableFetchError`). `callFunction`
 * émettait alors `SESSION_PERDUE` (« Ta session a expiré ») et répondait « Connecte-toi d'abord »,
 * à quelqu'un dont la session est intacte.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const faux = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getSession: faux.getSession } }),
}))

const evenements: string[] = []
beforeEach(() => {
  faux.getSession.mockReset()
  evenements.length = 0
  ;(globalThis as { window?: unknown }).window = {
    location: { hash: '' },
    dispatchEvent: (e: Event) => { evenements.push(e.type); return true },
  }
})

const { callFunction, ErreurDeFonction } = await import('./supabase.ts')
const { PAS_DE_RESEAU } = await import('./reseau.ts')
const { SESSION_PERDUE } = await import('./session-perdue.ts')

describe('callFunction sans session', () => {
  it('une panne de réseau au rafraîchissement : « Pas de réseau », jamais « session perdue »', async () => {
    faux.getSession.mockResolvedValue({ data: { session: null },
      error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } })
    const e = await callFunction('x', {}).catch(x => x) as InstanceType<typeof ErreurDeFonction>
    expect(e).toBeInstanceOf(ErreurDeFonction)
    expect(e.message).toBe(PAS_DE_RESEAU)
    expect(e.code).toBe('reseau')
    expect(evenements).not.toContain(SESSION_PERDUE)
  })

  it('vraiment pas de session (aucune erreur) : la session est perdue, et on le dit', async () => {
    faux.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(callFunction('x', {})).rejects.toThrow('Connecte-toi d’abord.')
    expect(evenements).toContain(SESSION_PERDUE)
  })

  it('un refus d’auth-js qui n’est pas une panne (jeton de rafraîchissement refusé) : session perdue', async () => {
    faux.getSession.mockResolvedValue({ data: { session: null },
      error: { name: 'AuthApiError', message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 } })
    await expect(callFunction('x', {})).rejects.toThrow('Connecte-toi d’abord.')
    expect(evenements).toContain(SESSION_PERDUE)
  })
})
