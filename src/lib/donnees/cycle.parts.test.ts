/**
 * Les parts optimistes de « Choisir » (`useChoisitRecette`) quand l'écriture échoue.
 *
 * Revue du 27/10 : réseau coupé, l'écriture échouait, la relecture aussi, et le cache gardait le chiffre optimiste.
 * L'écran disait 5, la base 4, et « 8 / 10 » mentait. Ici, aucune requête n'observe le cache : une relecture n'y
 * change rien, c'est le cas « la relecture échoue aussi ». Les mutations passent par le vrai cache de TanStack, avec
 * sa file (`scope`) : les appuis d'une rafale s'y suivent comme dans l'appli.
 */
import { QueryClient, type MutationOptions } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const faux = vi.hoisted(() => ({
  qc: null as unknown as QueryClient,
  /** La réponse de chaque écriture, dans l'ordre : `ok` ou `ko`. */
  reponses: [] as ('ok' | 'ko')[],
}))

vi.mock('../supabase.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../supabase.ts')>(),
  supabase: {
    rpc: async () => ({ data: 'h1', error: null }),
    from: () => ({
      upsert: (v: { recipe_id: string; servings: number }) => ({
        select: () => ({
          single: async () => {
            await new Promise(r => setTimeout(r, 5))
            return faux.reponses.shift() === 'ok'
              ? { data: { id: `cr-${v.recipe_id}`, ...v }, error: null }
              : { data: null, error: { message: 'Failed to fetch' } }
          },
        }),
      }),
    }),
  },
}))
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useMutation: (o: unknown) => o,
  useQueryClient: () => faux.qc,
}))

const { CLE, useChoisitRecette: optionsDesParts } = await import('./cycle.ts')

type Vars = { cycleId: string; recipeId: string; parts: number }
const cle = CLE.recettesDuCycle('c1')
const parts = (recipeId: string) =>
  faux.qc.getQueryData<{ recipe_id: string; servings: number }[]>(cle)?.find(r => r.recipe_id === recipeId)?.servings

/** Des appuis rapides : chacun part avant que le précédent ait répondu, comme deux « + » au doigt. */
async function appuie(...lesParts: [string, number][]) {
  /* Le hook sous un autre nom : appelé hors de tout composant, avec `useMutation` réduit à ses options. */
  const options = optionsDesParts() as unknown as MutationOptions<unknown, Error, Vars>
  const enVol = lesParts.map(([recipeId, p]) =>
    faux.qc.getMutationCache().build(faux.qc, options).execute({ cycleId: 'c1', recipeId, parts: p }).catch(() => {}))
  await Promise.all(enVol)
}

beforeEach(() => {
  faux.qc = new QueryClient()
  faux.qc.setQueryData(cle, [{ recipe_id: 'r1', servings: 4 }, { recipe_id: 'r2', servings: 2 }])
  faux.reponses = []
})

describe('les parts quand l’écriture échoue et que la relecture ne répare rien', () => {
  it('un appui refusé : le chiffre revient à celui de la base', async () => {
    faux.reponses = ['ko']
    await appuie(['r1', 5])
    expect(parts('r1')).toBe(4)
  })

  it('« + » accepté puis « + » refusé : le chiffre reste au dernier accepté', async () => {
    faux.reponses = ['ok', 'ko']
    await appuie(['r1', 5], ['r1', 6])
    expect(parts('r1')).toBe(5)
  })

  it('toute la rafale refusée : le chiffre revient à celui d’avant la rafale', async () => {
    faux.reponses = ['ko', 'ko', 'ko']
    await appuie(['r1', 5], ['r1', 6], ['r1', 7])
    expect(parts('r1')).toBe(4)
  })

  it('refusé au milieu puis accepté : le dernier appui gagne', async () => {
    faux.reponses = ['ok', 'ko', 'ok']
    await appuie(['r1', 5], ['r1', 6], ['r1', 7])
    expect(parts('r1')).toBe(7)
  })

  it('deux recettes dans la même rafale, toutes deux refusées : chacune revient à sa valeur', async () => {
    faux.reponses = ['ko', 'ko']
    await appuie(['r1', 5], ['r2', 3])
    expect([parts('r1'), parts('r2')]).toEqual([4, 2])
  })

  it('une rafale réussie ne laisse rien derrière elle pour la suivante', async () => {
    faux.reponses = ['ok']
    await appuie(['r1', 5])
    faux.reponses = ['ko']
    await appuie(['r1', 6])
    expect(parts('r1')).toBe(5)
  })
})
