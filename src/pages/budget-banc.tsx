/**
 * Le banc du lot 3 pour l'écran du mois : le même principe que `budget.test.tsx`
 * (un cache de requêtes REMPLI À LA MAIN, rendu en chaîne), mais pour un mois
 * quelconque, avec ses clôtures, et sans refaire les fabriques à chaque fichier.
 *
 * Le 21 octobre 2026 à 10 h : le mois courant est octobre. Les montants portent
 * l'espace fine insécable (U+202F).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Charge, Cloture, Compte, Depense, Revenu, Saisie } from '../lib/donnees/budget.ts'
import { CLE } from '../lib/donnees/budget.ts'
import { CLE as CLE_FOYER, type Foyer } from '../lib/donnees/foyer.ts'
import type { Ouverte } from '../ui/budget/FeuillesDuMois.tsx'
import { Budget } from './Budget.tsx'

export const OCT = '2026-10-01'
export const SEPT = '2026-09-01'
export const FINE = ' '
export const texte = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()

export const membre = (id: string, nom: string) => ({ id, display_name: nom })
export const foyer = (membres = [membre('u1', 'Kamil')]) =>
  ({ id: 'f1', nom: 'Chez nous', plafondLlmEur: 0, membres }) as unknown as Foyer

export const charge = (p: Partial<Charge> = {}): Charge => ({
  id: 'c1', libelle: 'Courses', montant_cents: 800_00, commun: true, debut: '2026-01-01',
  modifie_par: null, periodicite: 'mensuel', mode: 'au_fil', categorie: 'vie_courante',
  catalogue_id: null, variable: false, cle: null, compte_id: null, enveloppe_id: null,
  archive_le: null, participants: ['u1'], ...p,
})
export const depense = (p: Partial<Depense> = {}): Depense => ({
  id: 'd1', charge_id: 'c1', libelle: 'Courses', mois: OCT, montant_cents: 800_00,
  montant_prevu_cents: 800_00, nature: 'estimee', source: 'charge', facon: 'au_fil',
  confirme_le: null, regularise_annee: null, regle_le: null, enveloppe_id: null, compte_id: null,
  parts: [{ user_profile_id: 'u1', part_cents: 800_00, part_bps: 10000 }], ...p,
})
export const saisie = (cents: number, mois = OCT): Saisie => ({
  id: `s${cents}`, depense_id: 'd1', fait_le: `${mois.slice(0, 7)}-05`, montant_cents: cents,
  saisi_par: 'u1', created_at: `${mois.slice(0, 7)}-05T10:00:00Z`,
})
export const revenu = (qui = 'u1', cents = 4325_00): Revenu =>
  ({ id: `r-${qui}`, user_profile_id: qui, net_mensuel_cents: cents, valid_from: '2026-01-01' })
export const compte = (): Compte => ({ id: 'k1', nom: 'Joint', genre: 'commun',
  titulaire_id: null, matelas_cents: 0, archive_le: null }) as unknown as Compte
export const cloture = (mois = OCT): Cloture => ({ id: 'cl1', mois,
  cloture_le: '2026-11-01T08:00:00Z', choix: [] })

export type Lectures = {
  foyer?: Foyer | null; depenses?: Depense[]; saisies?: Saisie[]; charges?: Charge[]
  revenus?: Revenu[]; clotures?: Cloture[]; comptes?: Compte[]
}

/** Tout est revenu, pour un foyer d'une personne avec ses courses. */
export const tout = (p: Lectures = {}): Lectures => ({
  foyer: foyer(), depenses: [depense()], saisies: [], charges: [charge()],
  revenus: [revenu()], clotures: [], comptes: [compte()], ...p,
})

/** L'écran du mois `mois` (le mois courant par défaut), avec ce qui est revenu de la base.
    `depart` : le mois qu'on passe à `<Budget mois=…>`, comme le fait `/budget/AAAA-MM`. */
export function ecranDuMois(lues: Lectures,
                            o: { mois?: string; depart?: string; ouverte?: Ouverte } = {}) {
  const mois = o.mois ?? OCT
  const qc = new QueryClient({ defaultOptions: { queries: {
    retry: false, retryOnMount: false, staleTime: Infinity } } })
  const clefs = {
    foyer: CLE_FOYER.foyer, depenses: CLE.mois(mois), saisies: ['saisies', mois],
    charges: CLE.charges, revenus: CLE.revenus, clotures: ['cloture'], comptes: CLE.comptes,
  } as const
  for (const k of Object.keys(clefs) as (keyof Lectures)[]) {
    if (k in lues) qc.setQueryData(clefs[k], lues[k])
  }
  qc.setQueryData(CLE.poches, [])
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <Budget userId="u1" va={() => {}} mois={o.depart} ouverteAuDepart={o.ouverte ?? null} />
    </QueryClientProvider>)
}
