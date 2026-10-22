/**
 * Les trois appels de la clôture à la base : ce qu'ils ENVOIENT et ce qu'ils LISENT.
 *
 * Le défaut que ce fichier garde : `mis_de_cote_cents: null` ne dit pas « tout ce qui reste », il
 * dit « null » à la base — qui n'applique alors pas son défaut. La clé doit être ABSENTE du corps
 * (`undefined` : `JSON.stringify` la jette) ; et un 0 (« garder sur le compte ») doit partir, lui,
 * comme un 0. `supabase.rpc` est remplacé : on lit le corps tel qu'il partirait.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const faux = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../supabase.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../supabase.ts')>(),
  supabase: { rpc: faux.rpc },
}))

const { clotureLeMois, lisApercuDesSoldes, rouvreLeMois } = await import('./budget.ts')

beforeEach(() => faux.rpc.mockReset())

/** Le corps JSON que PostgREST recevrait pour les arguments donnés à `rpc`. */
const corps = () => JSON.parse(JSON.stringify(faux.rpc.mock.calls[0][1]))

describe('clotureLeMois', () => {
  const reponse = { cloture: 'k1', non_soldees: [] }

  it('« tout ce qui reste », aucune poche : les deux clés sont absentes du corps, pas null', async () => {
    faux.rpc.mockResolvedValue({ data: reponse, error: null })
    await clotureLeMois({ mois: '2026-09-01', rien: ['c2'], misDeCote: null, poche: null })
    expect(faux.rpc.mock.calls[0][0]).toBe('cloture_le_mois')
    expect(corps()).toEqual({ le_mois: '2026-09-01', factures: [], rien: ['c2'] })
    expect(Object.values(faux.rpc.mock.calls[0][1]).includes(null)).toBe(false)
  })

  it('un montant et une poche partent tels quels, en centimes entiers', async () => {
    faux.rpc.mockResolvedValue({ data: reponse, error: null })
    await clotureLeMois({ mois: '2026-09-01', rien: [], misDeCote: 316_80, poche: 'p1' })
    expect(corps()).toEqual({ le_mois: '2026-09-01', factures: [], rien: [],
                              mis_de_cote_cents: 316_80, la_poche: 'p1' })
  })

  it('0 (« garder sur le compte ») part comme 0 : ce n’est pas « tout ce qui reste »', async () => {
    faux.rpc.mockResolvedValue({ data: reponse, error: null })
    await clotureLeMois({ mois: '2026-09-01', rien: [], misDeCote: 0, poche: null })
    expect(corps().mis_de_cote_cents).toBe(0)
    expect('la_poche' in corps()).toBe(false)
  })

  it('aucune facture n’est jointe : la base confirme le reste à son montant', async () => {
    faux.rpc.mockResolvedValue({ data: reponse, error: null })
    await clotureLeMois({ mois: '2026-09-01', rien: [], misDeCote: null, poche: null })
    expect(corps().factures).toEqual([])
  })

  it('rend ce que la base a répondu, années non soldées comprises', async () => {
    const r = { cloture: 'k9', non_soldees: [{ charge: 'c1', libelle: 'Entretien auto', annee: 2026,
                                               raison: 'pas le même sens' }] }
    faux.rpc.mockResolvedValue({ data: r, error: null })
    expect(await clotureLeMois({ mois: '2026-12-01', rien: [], misDeCote: null, poche: null })).toEqual(r)
  })

  it('la base refuse : une erreur, avec son message', async () => {
    faux.rpc.mockResolvedValue({ data: null, error: { message: 'Septembre est déjà clôturé.' } })
    await expect(clotureLeMois({ mois: '2026-09-01', rien: [], misDeCote: null, poche: null }))
      .rejects.toThrow('Septembre est déjà clôturé.')
  })
})

describe('rouvreLeMois', () => {
  it('appelle rouvre_le_mois avec le mois', async () => {
    faux.rpc.mockResolvedValue({ data: null, error: null })
    await rouvreLeMois('2026-09-01')
    expect(faux.rpc).toHaveBeenCalledWith('rouvre_le_mois', { le_mois: '2026-09-01' })
  })

  it('la base refuse : une erreur, avec son message', async () => {
    faux.rpc.mockResolvedValue({ data: null, error: { message: 'Septembre n’est pas clôturé.' } })
    await expect(rouvreLeMois('2026-09-01')).rejects.toThrow('Septembre n’est pas clôturé.')
  })
})

describe('lisApercuDesSoldes', () => {
  it('demande l’aperçu du mois et rend les soldes tels que la base les rend', async () => {
    const soldes = [{ charge: 'c1', libelle: 'Entretien auto', annee: 2026, cents: -166_68 }]
    faux.rpc.mockResolvedValue({ data: soldes, error: null })
    expect(await lisApercuDesSoldes('2026-12-01')).toEqual(soldes)
    expect(faux.rpc).toHaveBeenCalledWith('apercu_des_soldes', { le_mois: '2026-12-01' })
  })

  it('aucun solde : une liste vide, pas null', async () => {
    faux.rpc.mockResolvedValue({ data: [], error: null })
    expect(await lisApercuDesSoldes('2026-09-01')).toEqual([])
  })

  it('la base refuse : une erreur', async () => {
    faux.rpc.mockResolvedValue({ data: null, error: { message: 'non autorisé' } })
    await expect(lisApercuDesSoldes('2026-09-01')).rejects.toThrow()
  })
})
