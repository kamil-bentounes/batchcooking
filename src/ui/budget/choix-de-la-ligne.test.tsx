/**
 * « Déclarer », depuis les gestes (2.15) : la liste des lignes au fil du mois.
 * Rendu en chaîne ; les montants portent l'espace fine insécable (U+202F).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Depense, Saisie } from '../../lib/donnees/budget.ts'
import { ChoixDeLaLigne } from './ChoixDeLaLigne.tsx'

const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()

const ligne = (p: Partial<Depense> = {}): Depense => ({
  id: 'l1', charge_id: null, libelle: 'Courses', mois: '2026-10-01',
  montant_cents: 800_00, montant_prevu_cents: 800_00, nature: 'estimee', source: 'charge',
  facon: 'au_fil', confirme_le: null, regularise_annee: null, regle_le: null,
  enveloppe_id: null, compte_id: null, parts: [], ...p,
})
const saisie = (cents: number): Saisie => ({
  id: `s${cents}`, depense_id: 'l1', fait_le: '2026-10-05', montant_cents: cents,
  saisi_par: null, created_at: '2026-10-05T10:00:00Z',
})
const rends = (etat: 'chargement' | 'erreur' | 'pret', lignes: Depense[], saisies: Saisie[] = []) =>
  texte(renderToStaticMarkup(
    <ChoixDeLaLigne etat={etat} lignes={lignes} saisies={saisies}
                    choisir={() => {}} fermer={() => {}} />))

describe('ChoixDeLaLigne', () => {
  it('liste les lignes avec ce qui est déjà dit sur ce qui est prévu', () => {
    const t = rends('pret', [ligne()], [saisie(120_50)])
    expect(t).toContain('Pour quelle ligne ?')
    expect(t).toContain('Courses 120,50 € sur 800 €')
  })

  it('sans ligne au fil du mois, dit où en créer une', () => {
    expect(rends('pret', [])).toContain('Aucune ligne ne se dépense au fil du mois.')
  })

  it('touché avant la réponse de la base, il attend : il n’affirme pas « aucune ligne »', () => {
    const t = rends('chargement', [])
    expect(t).toContain('Un instant…')
    expect(t).not.toContain('Aucune ligne')
  })

  it('si la lecture a échoué, il le dit au lieu d’annoncer « aucune ligne »', () => {
    const t = rends('erreur', [])
    expect(t).toContain('Je n’ai pas pu lire les lignes du mois.')
    expect(t).not.toContain('Aucune ligne')
  })
})
