/**
 * Le solde que l'étape 3 lit (3.4), sans navigateur : `useSolde` est un espion, le
 * dessin une boîte qui garde ses propriétés. Trois choses se jouent ici : on lit la
 * poche que la clôture VISERA (pas l'identifiant d'un choix périmé), on ne lit rien
 * quand on garde l'argent, et un solde pas encore lu n'est jamais un solde nul.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Poche } from '../../lib/donnees/budget.ts'
import type { ChoixDuReste } from '../../lib/budget/etapes.ts'

type Vue = typeof import('./VueReste.tsx').VueReste
const etat = vi.hoisted(() => ({
  vues: [] as Parameters<Vue>[0][],
  lu: vi.fn(),
  retour: { data: undefined as unknown, error: null as unknown },
}))

vi.mock('./VueReste.tsx', () => ({
  VueReste: (p: Parameters<Vue>[0]) => { etat.vues.push(p); return null },
}))
vi.mock('../../lib/donnees/budget.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../../lib/donnees/budget.ts')>(),
  useSolde: (id: string | undefined) => { etat.lu(id); return etat.retour },
}))

const { EtapeReste } = await import('./EtapeReste.tsx')

const urgence: Poche = { id: 'p1', libelle: 'Urgence', genre: 'urgence', objectif_cents: 4_000_00,
                         echeance: null, cle: null }
const vacances: Poche = { id: 'p2', libelle: 'Vacances', genre: 'projet', objectif_cents: null,
                          echeance: null, cle: null }
const choix = (c: Partial<ChoixDuReste> = {}): ChoixDuReste =>
  ({ garder: false, poche: 'p1', combien: null, ...c })

type Props = Parameters<typeof EtapeReste>[0]
const monte = (p: Partial<Props> = {}) => {
  renderToStaticMarkup(<EtapeReste recap={{ prevus: 100_00, ecart: 5, reste: 100_05 }} soldes={[]}
                                   mois="2026-10-01" poches={[urgence, vacances]} choix={choix()}
                                   changer={() => {}} {...p} />)
  return etat.vues[0]
}

beforeEach(() => {
  etat.vues = []; etat.lu = vi.fn(); etat.retour = { data: undefined, error: null }
})

describe('EtapeReste — quelle poche se lit', () => {
  it('la poche choisie', () => {
    monte({ choix: choix({ poche: 'p2' }) })
    expect(etat.lu).toHaveBeenCalledWith('p2')
  })

  it('une poche choisie qui n’existe plus : la poche que la clôture visera — la défaut', () => {
    monte({ choix: choix({ poche: 'disparue' }) })
    expect(etat.lu).toHaveBeenCalledWith('p1')
  })

  it('« Le garder » : rien ne se lit', () => {
    monte({ choix: choix({ garder: true }) })
    expect(etat.lu).toHaveBeenCalledWith(undefined)
  })

  it('sans poche, ou sans reste : rien ne se lit', () => {
    monte({ poches: [] })
    monte({ recap: { prevus: 0, ecart: 0, reste: -1 } })
    expect(etat.lu.mock.calls).toEqual([[undefined], [undefined]])
  })

  it('poches ou récap pas encore lus : rien ne se lit', () => {
    monte({ poches: undefined })
    monte({ recap: null })
    expect(etat.lu.mock.calls).toEqual([[undefined], [undefined]])
  })
})

describe('EtapeReste — ce que le dessin reçoit du solde', () => {
  it('le cumul de tous : la somme des lignes, centimes impairs compris', () => {
    etat.retour = { data: [{ userId: 'u1', cents: 300_01 }, { userId: 'u2', cents: 500_00 }], error: null }
    expect(monte().dessus).toBe(800_01)
  })

  it('un cumul négatif est un cumul', () => {
    etat.retour = { data: [{ userId: 'u1', cents: -120_05 }, { userId: 'u2', cents: 20_00 }], error: null }
    expect(monte().dessus).toBe(-100_05)
  })

  it('aucune ligne : 0 — une poche vide, bel et bien lue', () => {
    etat.retour = { data: [], error: null }
    expect(monte().dessus).toBe(0)
  })

  it('pas encore lu : « chargement », jamais 0', () => {
    expect(monte().dessus).toBe('chargement')
  })

  it('lecture en panne : « illisible », jamais 0', () => {
    etat.retour = { data: undefined, error: new Error('permission denied') }
    expect(monte().dessus).toBe('illisible')
  })

  it('une panne au rafraîchissement garde le dernier cumul lu', () => {
    etat.retour = { data: [{ userId: 'u1', cents: 800_00 }], error: new Error('coupure') }
    expect(monte().dessus).toBe(800_00)
  })

  it('le reste des propriétés passe tel quel, panne comprise', () => {
    const p = monte({ panne: new Error('x'), mois: '2026-12-01' })
    expect(p.mois).toBe('2026-12-01')
    expect(p.panne).toBeInstanceOf(Error)
    expect(p.poches).toEqual([urgence, vacances])
  })
})
