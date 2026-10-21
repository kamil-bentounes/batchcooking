/**
 * Ce que « C'est ça » ENVOIE (2.13), sans navigateur : on remplace `Feuille` par une
 * boîte qui garde son contenu, `useConfirmeFacture` par un espion, puis on appuie sur
 * le bouton de l'arbre rendu. Le dessin ne suffit pas : le chiffre affiché et le
 * chiffre envoyé doivent être le même.
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Depense } from '../../lib/donnees/budget.ts'

const etat = vi.hoisted(() => ({
  contenu: null as unknown,
  mutate: null as unknown as ReturnType<typeof vi.fn>,
  enCours: false,
}))

vi.mock('./Feuille.tsx', () => ({
  Feuille: ({ children }: { children: ReactNode }) => { etat.contenu = children; return null },
}))
vi.mock('../../lib/donnees/budget.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../../lib/donnees/budget.ts')>(),
  useConfirmeFacture: () => ({ mutate: etat.mutate, isPending: etat.enCours, error: null }),
}))

const { FeuilleFactureMois } = await import('./FeuilleFactureMois.tsx')

const ligne = (p: Partial<Depense> = {}): Depense => ({
  id: 'l1', charge_id: 'c1', libelle: 'Électricité', montant_cents: 50_00,
  montant_prevu_cents: 50_00, nature: 'estimee', source: 'modele', mois: '2026-10-01',
  facon: 'facture', confirme_le: null, regularise_annee: null, regle_le: null,
  enveloppe_id: null, compte_id: null, parts: [], ...p,
})

function trouve(n: ReactNode, ok: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(n)) { for (const x of n) { const r = trouve(x, ok); if (r) return r } return null }
  if (!isValidElement<Record<string, unknown>>(n)) return null
  if (ok(n)) return n
  return trouve(n.props.children as ReactNode, ok)
}
const monte = (l: Depense) =>
  renderToStaticMarkup(<FeuilleFactureMois ligne={l} categorie="maison" fermer={() => {}} />)
const appuie = (classe: string) => {
  const b = trouve(etat.contenu as ReactNode, e => e.type === 'button'
    && typeof e.props.className === 'string' && e.props.className.includes(classe))
  if (!b) throw new Error(`pas de bouton « ${classe} »`)
  ;(b.props.onClick as () => void)()
}

beforeEach(() => { etat.mutate = vi.fn(); etat.enCours = false; etat.contenu = null })

describe('FeuilleFactureMois — ce que « C’est ça » envoie', () => {
  it('le montant affiché : le prévu, pas un autre champ de la ligne', () => {
    monte(ligne({ montant_cents: 52_00, montant_prevu_cents: 50_00 }))
    appuie('bg-herbe')
    expect(etat.mutate).toHaveBeenCalledTimes(1)
    expect(etat.mutate).toHaveBeenCalledWith({ depenseId: 'l1', cents: 50_00 })
  })

  it('sans prévu connu : le montant de la ligne', () => {
    monte(ligne({ montant_cents: 61_20, montant_prevu_cents: null }))
    appuie('bg-herbe')
    expect(etat.mutate).toHaveBeenCalledWith({ depenseId: 'l1', cents: 61_20 })
  })

  it('un envoi déjà en vol : un second toucher n’en lance pas un autre', () => {
    etat.enCours = true
    monte(ligne())
    appuie('bg-herbe')
    expect(etat.mutate).not.toHaveBeenCalled()
  })
})
