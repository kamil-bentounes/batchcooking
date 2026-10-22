/**
 * Pas de cycle vivant n'est pas une panne.
 *
 * `current_cycle()` rend `null` pour un foyer neuf, pour un cycle clos ou interrompu. `ou()`
 * lève sur un `null` : la requête passait en erreur, TanStack la rejouait trois fois (1 s, 2 s,
 * 4 s) et l'accueil de la cuisine restait sur « Un instant… » pendant 7,5 secondes avant de
 * dire « Rien de prévu » (grand test, parcours « cuisine », 22/10/2026).
 */
import { describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../supabase.ts', async () => {
  const reel = await vi.importActual<typeof import('../supabase.ts')>('../supabase.ts')
  return { ...reel, supabase: { rpc, from: vi.fn() } }
})

import { lisLeCycle } from './cycle.ts'

describe('lisLeCycle', () => {
  it('rend null, sans lever, quand le foyer n’a aucun cycle vivant', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(lisLeCycle()).resolves.toBeNull()
  })

  it('lève toujours sur une vraie erreur', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(lisLeCycle()).rejects.toThrow('boom')
  })
})
