/**
 * Grand test, parcours « nouveau venu » (22/10) : chaque ouverture de « Peser » envoyait
 * `GET /weighing?food_id=eq.` et la base répondait 400 (« invalid input syntax for type
 * uuid: "" ») — l'écran appelle `usePesees('')` tant qu'aucun aliment n'est ouvert.
 * Même méthode que `budget-mutations.test.ts` : `useQuery` rend ses options.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQuery: (o: unknown) => o,
  useQueryClient: () => ({}),
}))

const { usePesees } = await import('./pesee.ts')
type Options = { enabled?: boolean }

describe('usePesees', () => {
  it('ne lit rien tant qu’aucun aliment n’est choisi', () => {
    expect((usePesees('') as unknown as Options).enabled).toBe(false)
  })
  it('lit les pesées d’un aliment choisi', () => {
    expect((usePesees('0b0e0a16-0000-4000-8000-000000000000') as unknown as Options).enabled).toBe(true)
  })
})
