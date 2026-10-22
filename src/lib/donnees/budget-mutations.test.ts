/**
 * Chaque mutation du budget ATTEND ses relectures avant de se dire finie.
 *
 * `onSuccess: () => qc.invalidateQueries(…)` sans `return` termine la mutation AVANT la fin
 * des relectures : `FeuilleDeclarer` vidait son champ et rallumait « Ajouter » pendant que
 * la jauge montrait encore l'ancien chiffre. Sur réseau lent, on croyait l'ajout perdu et on
 * le retapait — avec un identifiant neuf, donc compté deux fois.
 *
 * Le dépôt n'a ni jsdom ni Testing Library : on remplace `useMutation` par l'identité (le
 * hook rend ses options), `useQueryClient` par un faux client dont chaque
 * `invalidateQueries` reste en attente jusqu'à ce que le test la libère, et on appelle
 * `onSuccess` de chaque hook exporté du fichier. Aucune liste écrite à la main : une
 * mutation ajoutée demain est éprouvée sans qu'on y pense.
 */
import { describe, expect, it, vi } from 'vitest'

const faux = vi.hoisted(() => ({ qc: null as unknown }))

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useMutation: (o: unknown) => o,
  useQuery: (o: unknown) => o,
  useQueryClient: () => faux.qc,
}))

const budget = await import('./budget.ts')
const { relisLeBudget } = budget

type Options = {
  mutationFn?: unknown
  onSuccess?: (d: unknown, v: unknown, c?: unknown) => unknown
  onSettled?: (d: unknown, e: unknown, v: unknown, c?: unknown) => unknown
}

/** Un client dont les relectures ne finissent que quand on les libère. */
function clientEnAttente() {
  const enAttente: (() => void)[] = []
  const invalidateQueries = vi.fn(() => new Promise<void>(fin => { enAttente.push(fin) }))
  /* `setQueryData` : la clôture et sa réouverture posent ce qu'elle n'a pas pu solder. */
  return { qc: { invalidateQueries, setQueryData: vi.fn() }, invalidateQueries, libere: () => enAttente.splice(0).forEach(f => f()) }
}
/** Laisse passer toutes les microtâches en attente. */
const tour = () => new Promise<void>(r => setTimeout(r, 0))
/** Des variables de mutation — et un résultat de la base — qui répondent n'importe quoi
    (`p.pocheId`, `v.id`, `r.non_soldees`…). */
const variables = new Proxy({}, { get: () => 'x' })

/** Ce que TanStack fait d'une mutation : `onSuccess` (attendu) puis `onSettled` (attendu), et
    seulement après la mutation est finie. En erreur, `onSuccess` ne part pas. */
async function finDeLaMutation(o: Options, erreur: unknown = null) {
  if (!erreur) await o.onSuccess?.(variables, variables)
  await o.onSettled?.(erreur ? undefined : variables, erreur, variables)
}

/** Toutes les mutations exportées : on appelle chaque `use…` et on garde ceux qui rendent un `mutationFn`. */
function mutations(): { nom: string; options: Options; client: ReturnType<typeof clientEnAttente> }[] {
  const trouvees = []
  for (const [nom, valeur] of Object.entries(budget)) {
    if (!nom.startsWith('use') || typeof valeur !== 'function') continue
    const client = clientEnAttente()
    faux.qc = client.qc
    const options = (valeur as (...a: unknown[]) => Options)('x', 'y')
    if (options && typeof options.mutationFn === 'function') trouvees.push({ nom, options, client })
  }
  return trouvees
}

describe('relisLeBudget', () => {
  it('rend une promesse qui ne se résout qu’une fois TOUTES les relectures finies', async () => {
    const { qc, invalidateQueries, libere } = clientEnAttente()
    let fini = false
    const r = relisLeBudget(qc as never)
    void Promise.resolve(r).then(() => { fini = true })
    await tour()
    expect(invalidateQueries.mock.calls.length).toBeGreaterThan(5)
    expect(fini).toBe(false)
    libere()
    await tour()
    expect(fini).toBe(true)
  })
})

describe('les mutations du budget attendent leurs relectures', () => {
  const toutes = mutations()

  it('on en éprouve bien beaucoup (le test ne dort pas)', () => {
    expect(toutes.length).toBeGreaterThanOrEqual(20)
  })

  it.each(toutes.map(m => [m.nom, m] as const))('%s : ses rappels rendent les relectures, la mutation ne finit pas avant', async (_nom, m) => {
    expect(m.options.onSuccess ?? m.options.onSettled, 'une mutation sans rappel ne relit rien')
      .toBeTypeOf('function')
    let fini = false
    void finDeLaMutation(m.options).then(() => { fini = true })
    await tour()
    expect(m.client.invalidateQueries.mock.calls.length).toBeGreaterThan(0)
    expect(fini, 'la mutation a fini avant la fin des relectures').toBe(false)
    m.client.libere()
    await tour()
    expect(fini).toBe(true)
  })
})

/**
 * Une clôture (ou une réouverture) dont la RÉPONSE se perd — le réseau coupe après que la base a
 * validé — finit en erreur côté page, alors que le mois EST clos. Sans relecture, `['cloture']`
 * restait périmé (30 s, pas de relecture au retour d'onglet) et chaque clic répondait
 * « Septembre est déjà clôturé ». La relecture ne peut donc pas dépendre de `onSuccess`.
 */
describe('une clôture ou une réouverture qui échoue relit quand même', () => {
  const cas = [['useClotureLeMois', 'la clôture'], ['useRouvreLeMois', 'la réouverture']] as const
  const clefsRelues = (c: ReturnType<typeof clientEnAttente>) =>
    c.invalidateQueries.mock.calls.map(a => ((a as unknown[])[0] as { queryKey: string[] }).queryKey[0])

  it.each(cas)('%s : en erreur, `cloture` et ce que l’argent touche sont relus (%s)', async nom => {
    const client = clientEnAttente()
    faux.qc = client.qc
    const options = (budget[nom] as () => Options)()
    const r = finDeLaMutation(options, new Error('Failed to fetch'))
    await tour()
    client.libere()
    await r
    expect(clefsRelues(client)).toContain('cloture')
    expect(clefsRelues(client)).toContain('budget-mois')
  })

  it.each(cas)('%s : en erreur, la mutation n’est finie qu’après les relectures (%s)', async nom => {
    const client = clientEnAttente()
    faux.qc = client.qc
    const options = (budget[nom] as () => Options)()
    let fini = false
    void finDeLaMutation(options, new Error('déjà clôturé')).then(() => { fini = true })
    await tour()
    expect(fini).toBe(false)
    client.libere()
    await tour()
    expect(fini).toBe(true)
  })

  it('une clôture réussie relit une seule fois (pas de double relecture onSuccess + onSettled)', async () => {
    const client = clientEnAttente()
    faux.qc = client.qc
    const options = (budget.useClotureLeMois as () => Options)()
    const r = finDeLaMutation(options)
    await tour()
    client.libere()
    await r
    expect(clefsRelues(client).filter(k => k === 'cloture')).toHaveLength(1)
  })
})
