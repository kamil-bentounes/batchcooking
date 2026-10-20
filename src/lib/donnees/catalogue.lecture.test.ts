/**
 * La lecture du catalogue, des faisables et du déjà-fait, tranche par tranche.
 *
 * PostgREST plafonne une réponse à mille lignes : on lit donc par tranches. Une
 * lecture par `.range()` (décalage) se trompe quand la table bouge entre deux
 * tranches — une insertion donne un doublon, une suppression saute une ligne.
 * On lit par CLÉ (`id > dernier id vu`), et ces tests rejouent la base : un faux
 * serveur qui plafonne à mille lignes et qu'on modifie entre deux requêtes.
 */
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'

type Ligne = Record<string, unknown> & { id: string }
type Banc = {
  lignes: Ligne[]
  /** Numéro (à partir de 1) de la requête qui échoue. */
  echecA?: number
  /** Appelé APRÈS la réponse n : c'est là que la table bouge. */
  apres?: (n: number, lignes: Ligne[]) => void
}

let banc: Banc
let requetes = 0
let filtresVus: string[] = []
const PLAFOND = 1000

/** Un faux constructeur de requête PostgREST : filtres, tri, limite, plafond. */
/** `nu` : une RPC `setof uuid` rend des identifiants nus, pas des lignes. */
function requete(nu = false): Record<string, unknown> {
  let apresId: string | null = null
  const exclus: [string, unknown][] = []
  let limite = PLAFOND
  let plage: [number, number] | null = null
  const q: Record<string, unknown> = {
    select: () => q,
    not: () => q,
    eq: () => q,
    in: () => q,
    order: () => q,
    neq: (col: string, v: unknown) => { filtresVus.push(`neq:${col}`); exclus.push([col, v]); return q },
    gt: (col: string, v: string) => { filtresVus.push(`gt:${col}`); apresId = v; return q },
    limit: (n: number) => { limite = n; return q },
    range: (de: number, a: number) => { plage = [de, a]; return q },
    then: (ok: (r: unknown) => unknown, ko: (e: unknown) => unknown) => {
      requetes++
      const n = requetes
      if (banc.echecA === n) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(ok, ko)
      let l = [...banc.lignes].sort((x, y) => x.id.localeCompare(y.id))
      if (apresId !== null) l = l.filter(x => x.id > apresId!)
      for (const [col, v] of exclus) l = l.filter(x => x[col] !== v)
      const tranche = plage
        ? l.slice(plage[0], Math.min(plage[1] + 1, plage[0] + PLAFOND))
        : l.slice(0, Math.min(limite, PLAFOND))
      const reponse = { data: nu ? tranche.map(x => x.id) : tranche, error: null }
      banc.apres?.(n, banc.lignes)
      return Promise.resolve(reponse).then(ok, ko)
    },
  }
  return q
}

vi.mock('../supabase.ts', () => ({
  ou: ({ data, error }: { data: unknown; error: { message: string } | null }) => {
    if (error) throw new Error(error.message)
    if (data === null) throw new Error('La base n’a rien rendu.')
    return data
  },
  supabase: {
    from: () => requete(),
    rpc: (nom: string) => nom === 'recettes_faisables' ? requete(true) : Promise.resolve({ data: null, error: null }),
  },
}))
// On n'éprouve pas React : on rend les options de la requête, `queryFn` en tête.
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-query')>()),
  useQuery: (o: unknown) => o,
}))

const { useCatalogue: optionsCatalogue, useFaisables: optionsFaisables, useDejaFaites: optionsDejaFaites, useManques: optionsManques } = await import('./catalogue.ts')

// Les hooks sont remplacés par leurs options (`useQuery` les rend telles quelles) : on les type à la main.
type Options = {
  queryKey: unknown[]
  enabled?: boolean
  queryFn: () => Promise<any>
  placeholderData?: any
}
const options = (o: unknown) => o as Options

const id = (i: number) => String(i).padStart(6, '0')
const recettes = (n: number): Ligne[] => Array.from({ length: n }, (_, i) => ({
  id: id(i * 2 + 1), title: `t${i}`, image_url: null, yield_servings: 1, total_time_min: 1,
  active_time_min: 1, appliances: null, freezable: null, owner_household_id: null,
  created_by: null, recipe_nutrition: null,
}))
const nouveauBanc = (b: Banc) => { banc = b; requetes = 0; filtresVus = [] }

describe('le catalogue, par clé', () => {
  it.each([
    [0, 1], [999, 1], [1000, 2], [1001, 2], [2000, 3], [2001, 3],
  ])('rend les %i lignes, en %i requêtes, sans doublon', async (n, appels) => {
    nouveauBanc({ lignes: recettes(n) })
    const r = await options(optionsCatalogue()).queryFn()
    expect(r).toHaveLength(n)
    expect(new Set(r.map((x: { id: string }) => x.id)).size).toBe(n)
    expect(requetes).toBe(appels)
  })

  it('lit par clé, pas par décalage', async () => {
    nouveauBanc({ lignes: recettes(1500) })
    await options(optionsCatalogue()).queryFn()
    expect(filtresVus).toContain('gt:id')
  })

  it('ne double aucune ligne quand une recette arrive entre deux tranches', async () => {
    const lignes = recettes(1500)
    nouveauBanc({
      lignes,
      // Une recette dont l'id tombe AVANT la frontière de la première tranche.
      apres: (n, l) => { if (n === 1) l.push({ ...l[0], id: '000000', title: 'nouvelle' }) },
    })
    const r = await options(optionsCatalogue()).queryFn()
    const ids = r.map((x: { id: string }) => x.id)
    expect(ids).toHaveLength(1500)
    expect(new Set(ids).size).toBe(1500)
  })

  it('ne saute aucune ligne quand une recette disparaît entre deux tranches', async () => {
    const lignes = recettes(1500)
    const attendus = lignes.map(l => l.id)
    nouveauBanc({
      lignes,
      apres: (n, l) => { if (n === 1) l.splice(0, 1) },
    })
    const r = await options(optionsCatalogue()).queryFn()
    // La supprimée a déjà été lue ; aucune des suivantes ne manque.
    expect(r.map((x: { id: string }) => x.id).sort()).toEqual(attendus)
  })

  it('REJETTE si la deuxième tranche échoue : jamais un catalogue tronqué en silence', async () => {
    nouveauBanc({ lignes: recettes(1500), echecA: 2 })
    await expect(options(optionsCatalogue()).queryFn()).rejects.toThrow('boom')
  })
})

describe('les faisables, par décalage dédoublonné', () => {
  // `.gt` n'existe pas sur le résultat d'une RPC : on garde `.range`, et on dédoublonne.
  const ids = (n: number): Ligne[] => Array.from({ length: n }, (_, i) => ({ id: id(i) }))
  const lire = () => options(optionsFaisables(true, new Set(['x']))).queryFn()

  it.each([[0, 1], [1000, 2], [1001, 2], [2000, 3]])('rend %i identifiants en %i requêtes', async (n, appels) => {
    nouveauBanc({ lignes: ids(n) })
    const s = await lire()
    expect(s.size).toBe(n)
    expect(requetes).toBe(appels)
  })

  it('ne compte qu’une fois un identifiant lu dans deux tranches', async () => {
    nouveauBanc({
      lignes: ids(1500),
      // Une insertion avant la frontière décale tout : le dernier de la tranche 1 revient.
      apres: (n, l) => { if (n === 1) l.push({ id: '-' }) },
    })
    const s = await lire()
    expect(s.size).toBe(1500)
  })

  it('REJETTE si la deuxième tranche échoue', async () => {
    nouveauBanc({ lignes: ids(1500), echecA: 2 })
    await expect(lire()).rejects.toThrow('boom')
  })
})

describe('le déjà-fait', () => {
  const faites = (n: number, cycle = 'B'): Ligne[] =>
    Array.from({ length: n }, (_, i) => ({ id: id(i), recipe_id: `r${i}`, cycle_id: cycle }))

  it('exclut le cycle en cours', async () => {
    nouveauBanc({ lignes: [
      { id: '1', recipe_id: 'ancienne', cycle_id: 'B' },
      { id: '2', recipe_id: 'retenue', cycle_id: 'A' },
    ] })
    const s = await options(optionsDejaFaites(true, 'A')).queryFn()
    expect([...s]).toEqual(['ancienne'])
    expect(filtresVus).toContain('neq:cycle_id')
  })

  it('sans cycle ouvert (null), lit tous les cycles', async () => {
    nouveauBanc({ lignes: [
      { id: '1', recipe_id: 'ancienne', cycle_id: 'B' },
      { id: '2', recipe_id: 'autre', cycle_id: 'A' },
    ] })
    const s = await options(optionsDejaFaites(true, null)).queryFn()
    expect([...s].sort()).toEqual(['ancienne', 'autre'])
    expect(filtresVus).not.toContain('neq:cycle_id')
  })

  it('attend le cycle tant qu’il se charge (undefined) : requête éteinte', () => {
    // Sans cela, « Jamais essayée » cacherait un instant des recettes retenues
    // dans le cycle en cours, faute de pouvoir l'exclure.
    expect(options(optionsDejaFaites(true, undefined)).enabled).toBe(false)
  })

  it('s’allume dès que le cycle est connu, ouvert ou non', () => {
    expect(options(optionsDejaFaites(true, 'A')).enabled).toBe(true)
    expect(options(optionsDejaFaites(true, null)).enabled).toBe(true)
    expect(options(optionsDejaFaites(false, 'A')).enabled).toBe(false)
  })

  it('donne trois clés distinctes aux trois états', () => {
    const cles = [undefined, null, 'A'].map(c =>
      JSON.stringify(options(optionsDejaFaites(true, c)).queryKey))
    expect(new Set(cles).size).toBe(3)
  })

  it.each([[0], [1000], [1001], [2000]])('lit %i lignes sans doublon ni trou', async (n) => {
    nouveauBanc({ lignes: faites(n) })
    const s = await options(optionsDejaFaites(true, 'A')).queryFn()
    expect(s.size).toBe(n)
  })

  it('REJETTE si la deuxième tranche échoue', async () => {
    nouveauBanc({ lignes: faites(1500), echecA: 2 })
    await expect(options(optionsDejaFaites(true, 'A')).queryFn()).rejects.toThrow('boom')
  })
})

describe('les manques', () => {
  /** Un observateur réel : c'est lui qui décide ce que l'écran voit. */
  const observe = (o: Options, valeur: string) => new QueryObserver(new QueryClient(), {
    queryKey: o.queryKey, enabled: o.enabled, queryFn: async () => valeur,
    placeholderData: o.placeholderData,
  })

  it('ne montrent rien quand le placard se vide, pas l’ancien « il manque »', async () => {
    const obs = observe(options(optionsManques(['r1'], new Set(['x']))), 'ANCIEN')
    const fin = obs.subscribe(() => {})
    await new Promise(r => setTimeout(r, 20))
    expect(obs.getCurrentResult().data).toBe('ANCIEN')

    const vide = options(optionsManques(['r1'], new Set()))
    expect(vide.enabled).toBe(false)
    obs.setOptions({
      queryKey: vide.queryKey, enabled: vide.enabled, queryFn: async () => 'NOUVEAU',
      placeholderData: vide.placeholderData,
    })
    expect(obs.getCurrentResult().data).toBeUndefined()
    fin()
  })

  it('garde l’ancien résultat pendant un changement de page (pas de clignotement)', async () => {
    const obs = observe(options(optionsManques(['r1'], new Set(['x']))), 'ANCIEN')
    const fin = obs.subscribe(() => {})
    await new Promise(r => setTimeout(r, 20))

    const suite = options(optionsManques(['r2'], new Set(['x'])))
    obs.setOptions({
      queryKey: suite.queryKey, enabled: suite.enabled,
      queryFn: () => new Promise(() => {}), placeholderData: suite.placeholderData,
    })
    expect(obs.getCurrentResult().data).toBe('ANCIEN')
    expect(obs.getCurrentResult().isPlaceholderData).toBe(true)
    fin()
  })
})
