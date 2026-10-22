/**
 * « Reprendre la session interrompue » ne propose pas une session d'il y a un mois.
 *
 * `useCycleInterrompu` lisait la dernière session interrompue de n'importe quelle semaine, sans
 * date ; l'accueil la propose dès qu'il n'y a plus de cycle courant, donc une session de septembre
 * revenait à la fin de chaque cycle. On la borne à la semaine courante et à la dernière.
 */
import { describe, expect, it, vi } from 'vitest'

const faux = vi.hoisted(() => ({ appels: [] as [string, ...unknown[]][] }))

/* Une chaîne de requête qui note ce qu'on lui demande, et rend « rien trouvé ». */
vi.mock('../supabase.ts', async importOriginal => {
  const chaine: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'order', 'limit', 'maybeSingle']) {
    chaine[m] = (...a: unknown[]) => { faux.appels.push([m, ...a]); return chaine }
  }
  chaine.then = (ok: (r: unknown) => unknown) => ok({ data: null, error: null })
  return { ...await importOriginal<typeof import('../supabase.ts')>(),
           supabase: { from: () => chaine } }
})
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQuery: (o: unknown) => o,
}))

const { plancherDeReprise, useCycleInterrompu } = await import('./cycle.ts')

describe('plancherDeReprise : le lundi de la semaine dernière', () => {
  it.each([
    // mercredi 21/10/2026 : cette semaine commence le 19, la dernière le 12
    [new Date(2026, 9, 21), '2026-10-12'],
    // lundi, premier jour de la semaine
    [new Date(2026, 9, 19), '2026-10-12'],
    // dimanche, dernier jour de la semaine : toujours la semaine du 19
    [new Date(2026, 9, 25), '2026-10-12'],
    // passage de mois et d'année
    [new Date(2026, 10, 3), '2026-10-26'],
    [new Date(2027, 0, 5), '2026-12-28'],
  ])('le %s', (jour, attendu) => {
    expect(plancherDeReprise(jour)).toBe(attendu)
  })
})

describe('useCycleInterrompu : la requête est bornée par la date', () => {
  it('ne lit que les sessions interrompues dont la semaine est au plus la dernière', async () => {
    faux.appels.length = 0
    const o = useCycleInterrompu(true) as unknown as { queryFn: () => Promise<unknown> }
    await o.queryFn()
    const gte = faux.appels.find(a => a[0] === 'gte')
    expect(gte, 'la requête n’est pas bornée par une date').toBeDefined()
    expect(gte![1]).toBe('week_of')
    expect(gte![2]).toBe(plancherDeReprise())
    expect(faux.appels.find(a => a[0] === 'eq')).toEqual(['eq', 'state', 'interrompue'])
  })
})
