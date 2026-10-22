/**
 * Ce que « C'est ça » et « Valider » ENVOIENT à l'étape 1 de la clôture (3.3), sans
 * navigateur : on remplace le dessin par une boîte qui garde ses propriétés,
 * `useConfirmeFacture` par un espion, puis on appelle les gestes de la carte. Le
 * chiffre affiché et le chiffre envoyé doivent être le même.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Depense } from '../../lib/donnees/budget.ts'

type Vue = typeof import('./VueFacture.tsx').VueUneFacture
const etat = vi.hoisted(() => ({
  vues: [] as Parameters<Vue>[0][],
  mutate: null as unknown as ReturnType<typeof vi.fn>,
  enCours: false,
}))

vi.mock('./VueFacture.tsx', () => ({
  VueUneFacture: (p: Parameters<Vue>[0]) => { etat.vues.push(p); return null },
}))
vi.mock('../../lib/donnees/budget.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../../lib/donnees/budget.ts')>(),
  useConfirmeFacture: () => ({ mutate: etat.mutate, isPending: etat.enCours, error: null }),
}))

const { EtapeFactures } = await import('./EtapeFactures.tsx')

const ligne = (p: Partial<Depense> = {}): Depense => ({
  id: 'l1', charge_id: 'c1', libelle: 'Électricité', mois: '2026-09-01',
  montant_cents: 50_00, montant_prevu_cents: 50_00, nature: 'estimee', source: 'modele',
  facon: 'facture', confirme_le: null, regularise_annee: null, regle_le: null,
  enveloppe_id: null, compte_id: null, parts: [], ...p,
})
const monte = (...l: Depense[]) => { renderToStaticMarkup(<EtapeFactures lignes={l} />); return etat.vues }

beforeEach(() => { etat.mutate = vi.fn(); etat.enCours = false; etat.vues = [] })

describe('EtapeFactures — ce que « C’est ça » envoie', () => {
  it('le montant affiché : le prévu, pas un autre champ de la ligne', () => {
    monte(ligne({ montant_cents: 52_17, montant_prevu_cents: 50_01 }))
    etat.vues[0].cestca()
    expect(etat.mutate).toHaveBeenCalledTimes(1)
    expect(etat.mutate).toHaveBeenCalledWith({ depenseId: 'l1', cents: 50_01 })
  })

  it('chaque carte envoie SA ligne', () => {
    monte(ligne({ id: 'a', montant_prevu_cents: 10_01 }), ligne({ id: 'b', montant_prevu_cents: 20_02 }))
    etat.vues[1].cestca()
    expect(etat.mutate).toHaveBeenCalledWith({ depenseId: 'b', cents: 20_02 })
  })

  it('un envoi déjà en vol : un second toucher n’en lance pas un autre', () => {
    etat.enCours = true
    monte(ligne())
    etat.vues[0].cestca()
    expect(etat.mutate).not.toHaveBeenCalled()
  })

  it('la carte reçoit l’état d’envoi : ses boutons s’éteignent', () => {
    etat.enCours = true
    monte(ligne())
    expect(etat.vues[0].enCours).toBe(true)
  })
})

describe('EtapeFactures — « Valider »', () => {
  it('un champ vide ne confirme rien : le dessin reçoit un montant non lu, et le geste ne part pas', () => {
    monte(ligne())
    expect(etat.vues[0].montantTape.valide).toBe(false)
    etat.vues[0].valider()
    expect(etat.mutate).not.toHaveBeenCalled()
  })
})
