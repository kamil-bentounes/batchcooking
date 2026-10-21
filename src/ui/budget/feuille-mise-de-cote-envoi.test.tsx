/**
 * Ce que la feuille « Facture mise de côté » ENVOIE (2.14), sans navigateur : `Feuille`
 * devient une boîte qui garde son contenu, les crochets de données des espions, puis on
 * appuie sur les boutons de l'arbre rendu. Retirer une facture se demande d'abord, et
 * un refus ne retire rien.
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Charge, Facture } from '../../lib/donnees/budget.ts'

const etat = vi.hoisted(() => ({
  contenu: null as unknown,
  retire: null as unknown as ReturnType<typeof vi.fn>,
  retraitEnCours: false,
  factures: [] as unknown[],
}))

vi.mock('./Feuille.tsx', () => ({
  Feuille: ({ children }: { children: ReactNode }) => { etat.contenu = children; return null },
}))
vi.mock('../../lib/donnees/budget.ts', async importOriginal => {
  const reponse = (data: unknown) => ({ data, error: null, isPending: false, mutate: vi.fn() })
  return {
    ...await importOriginal<typeof import('../../lib/donnees/budget.ts')>(),
    useEtatDeLAnnee: () => reponse({ b: 0, pl: 166_68, pose: 0, soldee: false, premier_mois_suivi: '2026-09-01' }),
    useFactures: () => reponse(etat.factures),
    usePaieFacture: () => reponse(undefined),
    useCorrigeLeReleve: () => reponse(undefined),
    useRetireFacture: () => ({ mutate: etat.retire, isPending: etat.retraitEnCours, error: null }),
  }
})

const { FeuilleMiseDeCote } = await import('./FeuilleMiseDeCote.tsx')

const charge = { id: 'c1', libelle: 'Entretien auto', montant_cents: 500_00, periodicite: 'annuel',
                 mode: 'mis_de_cote', categorie: 'auto' } as Charge
const facture: Facture = { id: 'f1', charge_id: 'c1', annee: 2026, paye_le: '2026-10-06',
                           montant_cents: 320_00, origine: 'saisie', saisi_par: null }

function trouve(n: ReactNode, ok: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(n)) { for (const x of n) { const r = trouve(x, ok); if (r) return r } return null }
  if (!isValidElement<Record<string, unknown>>(n)) return null
  if (ok(n)) return n
  return trouve(n.props.children as ReactNode, ok)
}
const corbeille = () => {
  renderToStaticMarkup(<FeuilleMiseDeCote charge={charge} fermer={() => {}} />)
  return trouve(etat.contenu as ReactNode, e => String(e.props['aria-label'] ?? '').startsWith('Retirer la facture'))!
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 21, 14, 0, 0))
  etat.retire = vi.fn(); etat.retraitEnCours = false; etat.factures = [facture]; etat.contenu = null
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('FeuilleMiseDeCote — retirer une facture', () => {
  it('demande d’abord, avec le montant, le jour et le mois où l’écart retombe', () => {
    const confirmer = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmer)
    ;(corbeille().props.onClick as () => void)()
    expect(confirmer).toHaveBeenCalledWith(
      'Retirer la facture de 320 € du Mar. 6 oct. ? L’écart se recalcule sur octobre.')
  })

  it('un refus ne retire RIEN', () => {
    vi.stubGlobal('confirm', () => false)
    ;(corbeille().props.onClick as () => void)()
    expect(etat.retire).not.toHaveBeenCalled()
  })

  it('un accord retire la bonne facture, une seule fois', () => {
    vi.stubGlobal('confirm', () => true)
    ;(corbeille().props.onClick as () => void)()
    expect(etat.retire).toHaveBeenCalledTimes(1)
    expect(etat.retire).toHaveBeenCalledWith('f1')
  })

  it('un retrait déjà en vol : on ne demande même pas, on ne retire pas deux fois', () => {
    const confirmer = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmer)
    etat.retraitEnCours = true
    ;(corbeille().props.onClick as () => void)()
    expect(confirmer).not.toHaveBeenCalled()
    expect(etat.retire).not.toHaveBeenCalled()
  })
})
