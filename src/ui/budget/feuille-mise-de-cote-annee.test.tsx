/**
 * La feuille « Facture mise de côté » ne lit pas une année qu'on est en train de taper.
 *
 * Un `<input type="date">` rend « 0002-10-21 » dès que l'année en est à son deuxième
 * chiffre : chaque frappe changeait l'année et lançait `etat_de_l_annee` et `factures`.
 * `Feuille` devient une boîte, les crochets de données des espions, et `useState` rend
 * le jour qu'on veut pour la date payée : c'est la seule façon de « taper » dans un rendu
 * en chaîne.
 */
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Charge } from '../../lib/donnees/budget.ts'

const etat = vi.hoisted(() => ({
  payeLe: null as string | null,
  lectureEtat: null as unknown as ReturnType<typeof vi.fn>,
  lectureFactures: null as unknown as ReturnType<typeof vi.fn>,
}))

vi.mock('react', async importOriginal => {
  const r = await importOriginal<typeof import('react')>()
  return {
    ...r,
    useState: (init: unknown) =>
      etat.payeLe !== null && init === '2026-10-21'
        ? [etat.payeLe, () => {}] : r.useState(init),
  }
})
vi.mock('./Feuille.tsx', () => ({ Feuille: ({ children }: { children: ReactNode }) => children }))
vi.mock('../../lib/donnees/budget.ts', async importOriginal => {
  const reponse = (data: unknown) => ({ data, error: null, isPending: false, mutate: vi.fn() })
  return {
    ...await importOriginal<typeof import('../../lib/donnees/budget.ts')>(),
    useEtatDeLAnnee: (...a: unknown[]) => etat.lectureEtat(...a),
    useFactures: (...a: unknown[]) => etat.lectureFactures(...a),
    usePaieFacture: () => reponse(undefined),
    useCorrigeLeReleve: () => reponse(undefined),
    useRetireFacture: () => reponse(undefined),
  }
})

const { FeuilleMiseDeCote } = await import('./FeuilleMiseDeCote.tsx')

const charge = { id: 'c1', libelle: 'Entretien auto', montant_cents: 500_00, periodicite: 'annuel',
                 mode: 'mis_de_cote', categorie: 'auto' } as Charge
const rends = () => renderToStaticMarkup(<FeuilleMiseDeCote charge={charge} fermer={() => {}} />)

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 21, 14, 0, 0))
  etat.payeLe = null
  etat.lectureEtat = vi.fn(() => ({ data: undefined, error: null, isPending: true }))
  etat.lectureFactures = vi.fn(() => ({ data: undefined, error: null, isPending: true }))
})
afterEach(() => { vi.useRealTimers() })

describe('FeuilleMiseDeCote — la lecture suit une année plausible', () => {
  it('l’année du jour : les deux lectures sont actives', () => {
    rends()
    expect(etat.lectureEtat).toHaveBeenCalledWith('c1', 2026, true)
    expect(etat.lectureFactures).toHaveBeenCalledWith('c1', 2026, true)
  })

  it.each(['0002-10-21', '0020-10-21', '0202-10-21'])(
    'une année en cours de frappe (%s) ne lance AUCUNE lecture', jour => {
      etat.payeLe = jour
      rends()
      expect(etat.lectureEtat.mock.calls.every(a => a[2] === false)).toBe(true)
      expect(etat.lectureFactures.mock.calls.every(a => a[2] === false)).toBe(true)
    })

  it('l’année de la veille de l’an passé reste lue', () => {
    etat.payeLe = '2025-12-31'
    rends()
    expect(etat.lectureEtat).toHaveBeenCalledWith('c1', 2025, true)
  })
})
