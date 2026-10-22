/**
 * « Reprendre la session interrompue » : la base décide laquelle (`cycle_a_reprendre`, 0117).
 *
 * L'écran bornait sa lecture par une date calculée avec l'horloge du téléphone
 * (`plancherDeReprise`) : un téléphone mal réglé proposait ou cachait la mauvaise session.
 * Il ne calcule plus aucune date : il demande, la base répond avec la sienne.
 */
import { describe, expect, it, vi } from 'vitest'

const faux = vi.hoisted(() => ({
  appels: [] as [string, ...unknown[]][],
  idARendre: null as string | null,
}))

/* Une chaîne de requête qui note ce qu'on lui demande, et rend la ligne du cycle. */
vi.mock('../supabase.ts', async importOriginal => {
  const chaine: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'order', 'limit', 'maybeSingle']) {
    chaine[m] = (...a: unknown[]) => { faux.appels.push([m, ...a]); return chaine }
  }
  chaine.then = (ok: (r: unknown) => unknown) => ok({ data: { id: faux.idARendre }, error: null })
  return { ...await importOriginal<typeof import('../supabase.ts')>(),
           supabase: {
             from: (t: string) => { faux.appels.push(['from', t]); return chaine },
             rpc: async (f: string) => { faux.appels.push(['rpc', f]); return { data: faux.idARendre, error: null } },
           } }
})
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQuery: (o: unknown) => o,
}))

const cycle = await import('./cycle.ts')
const { useCycleInterrompu } = cycle

const lance = () => (useCycleInterrompu(true) as unknown as { queryFn: () => Promise<unknown> }).queryFn()

describe('useCycleInterrompu : la base choisit', () => {
  it('demande cycle_a_reprendre, sans borne de date côté client', async () => {
    faux.appels.length = 0
    faux.idARendre = 'c-1'
    await lance()
    expect(faux.appels).toContainEqual(['rpc', 'cycle_a_reprendre'])
    expect(faux.appels.find(a => a[0] === 'gte'), 'une date calculée côté client est revenue').toBeUndefined()
    expect(faux.appels).toContainEqual(['eq', 'id', 'c-1'])
  })

  it('ne lit rien d’autre quand la base ne propose aucune session', async () => {
    faux.appels.length = 0
    faux.idARendre = null
    expect(await lance()).toBeNull()
    expect(faux.appels.find(a => a[0] === 'from'), 'une lecture inutile a été lancée').toBeUndefined()
  })

  it('ne garde plus de calcul de date côté client pour la reprise', () => {
    expect('plancherDeReprise' in cycle).toBe(false)
  })
})
