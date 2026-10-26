/**
 * La carte Budget du hub, rendue en chaîne avec un cache REMPLI À LA MAIN (même méthode
 * que `budget.test.tsx`) : une lecture qu'on ne pose pas n'est pas revenue, une lecture
 * posée en erreur est un réseau qui tombe.
 *
 * Le hub est le premier écran de l'app. Calculé sur un morceau de ce qu'il lui faut, son
 * chiffre mentait : « Ajoute ton revenu » à qui l'avait posé (revenus pas revenus),
 * « Rien de posé » sur une panne du mois, le PRÉVU compté pour du déclaré sur une panne
 * des saisies. Comme l'écran du mois, il ne montre aucun chiffre avant d'avoir tout lu.
 *
 * L'heure : le 21 octobre 2026, donc le mois courant est octobre.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Cloture, Depense, Revenu, Saisie } from '../lib/donnees/budget.ts'
import { CLE } from '../lib/donnees/budget.ts'
import { CLE as CLE_FOYER, type Foyer } from '../lib/donnees/foyer.ts'
import { Hub } from './Hub.tsx'

const OCT = '2026-10-01'
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 21, 10, 0, 0))
})
afterEach(() => vi.useRealTimers())

const foyer = () => ({ id: 'f1', nom: 'Chez nous', plafondLlmEur: 0,
  membres: [{ id: 'u1', display_name: 'Kamil', objectif: { kcal: 2200 } }] }) as unknown as Foyer
const depense = (p: Partial<Depense> = {}): Depense => ({
  id: 'd1', charge_id: 'c1', libelle: 'Courses', mois: OCT, montant_cents: 800_00,
  montant_prevu_cents: 800_00, nature: 'estimee', source: 'charge', facon: 'au_fil',
  confirme_le: null, regularise_annee: null, regle_le: null, enveloppe_id: null, compte_id: null,
  parts: [{ user_profile_id: 'u1', part_cents: 800_00, part_bps: 10000 }], ...p,
})
/** Une ligne fixe de `cents`, toute à moi. */
const fixe = (cents: number) => depense({
  facon: 'fixe', montant_cents: cents, montant_prevu_cents: cents,
  parts: [{ user_profile_id: 'u1', part_cents: cents, part_bps: 10000 }] })
const revenu = (cents = 4325_00): Revenu =>
  ({ id: 'r-u1', user_profile_id: 'u1', net_mensuel_cents: cents, valid_from: '2026-01-01' })
const saisie = (cents: number): Saisie => ({
  id: `s${cents}`, depense_id: 'd1', fait_le: '2026-10-05', montant_cents: cents,
  saisi_par: 'u1', created_at: '2026-10-05T10:00:00Z',
})

type Lectures = { foyer?: Foyer | null; depenses?: Depense[]; saisies?: Saisie[]; revenus?: Revenu[]
                  clotures?: Cloture[] }
/** Ce qui est revenu de la base, et ce qui est en panne (`rate`). Une clé absente : pas revenue. */
function hub(lues: Lectures, rate: Partial<Record<keyof Lectures, unknown>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: {
    retry: false, retryOnMount: false, staleTime: Infinity } } })
  const clefs = {
    foyer: CLE_FOYER.foyer, depenses: CLE.mois(OCT), saisies: ['saisies', OCT], revenus: CLE.revenus,
    clotures: ['cloture'],
  } as const
  for (const k of Object.keys(clefs) as (keyof Lectures)[]) {
    if (k in rate) {
      qc.getQueryCache().build(qc, { queryKey: clefs[k] })
        .setState({ status: 'error', error: rate[k] as Error, data: undefined, fetchStatus: 'idle' })
    } else if (lues[k] !== undefined) qc.setQueryData(clefs[k], lues[k])
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}><Hub userId="u1" va={() => {}} /></QueryClientProvider>)
}
const tout = (p: Lectures = {}): Lectures => ({
  foyer: foyer(), depenses: [depense()], saisies: [], revenus: [revenu()], clotures: [],
  ...p,
})
/** Le texte de la carte Budget (le bouton qui porte le titre « Budget »). */
function carte(h: string): string {
  const boutons = [...h.matchAll(/<button\b[^>]*>(.*?)<\/button>/gs)].map(m => texte(m[1]))
  const c = boutons.find(b => b.startsWith('Budget'))
  if (!c) throw new Error(`pas de carte Budget dans ${texte(h)}`)
  return c
}

describe('Hub — la carte Budget', () => {
  it('tout est lu : « Il te reste » le chiffre de l’écran du mois', () => {
    const t = carte(hub(tout()))
    expect(t).toContain('Il te reste')
    expect(t).toContain('3 525 €')
  })

  it('les revenus pas encore revenus : « … », ni « Ajoute ton revenu » ni le bandeau du profil', () => {
    const h = hub(tout({ revenus: undefined }))
    expect(carte(h)).toContain('…')
    expect(carte(h)).not.toContain('Ajoute ton revenu')
    expect(texte(h)).not.toContain('Complète ton profil')
  })

  it('les revenus lus mais vides : « Ajoute ton revenu » et le bandeau, eux, se disent', () => {
    const h = hub(tout({ revenus: [] }))
    expect(carte(h)).toContain('Ajoute ton revenu')
    expect(texte(h)).toContain('Complète ton profil')
  })

  it('une panne des revenus ne dit ni « Ajoute ton revenu » ni le bandeau : elle se dit', () => {
    const h = hub(tout({ revenus: undefined }), { revenus: new Error('boom') })
    expect(carte(h)).not.toContain('Ajoute ton revenu')
    expect(carte(h)).toContain('Je n’ai pas pu lire le budget')
    expect(texte(h)).not.toContain('Complète ton profil')
  })

  it('revenu posé mais aucun objectif : « Fixe tes objectifs », sans rien sur le revenu', () => {
    const sans = { id: 'f1', nom: 'Chez nous', plafondLlmEur: 0,
                   membres: [{ id: 'u1', display_name: 'Kamil', objectif: null }] } as unknown as Foyer
    const t = texte(hub(tout({ foyer: sans })))
    expect(t).toContain('Fixe tes objectifs.')
    expect(t).toContain('tes barquettes sont dressées à parts égales')
    expect(t).not.toContain('Complète ton profil')
  })

  it('revenu ET objectifs posés : aucun bandeau', () => {
    const t = texte(hub(tout()))
    expect(t).not.toContain('Fixe tes objectifs')
    expect(t).not.toContain('Complète ton profil')
  })

  it('le foyer pas encore revenu ne fait pas dire « Complète ton profil »', () => {
    expect(texte(hub(tout({ foyer: undefined })))).not.toContain('Complète ton profil')
  })

  it('une panne du mois ne se lit pas « Rien de posé » : elle se dit, sans chiffre', () => {
    const h = hub(tout({ depenses: undefined }), { depenses: new Error('boom') })
    expect(carte(h)).not.toContain('Rien de posé')
    expect(carte(h)).toContain('Je n’ai pas pu lire le budget : boom')
    expect(carte(h)).not.toContain('Il te')
  })

  it('une panne des saisies ne fait pas compter le prévu pour du déclaré : aucun chiffre', () => {
    const h = hub(tout({ saisies: undefined }), { saisies: new Error('boom') })
    expect(carte(h)).toContain('Je n’ai pas pu lire le budget')
    expect(carte(h)).not.toContain('Il te reste')
    expect(carte(h)).not.toContain('Tout est à jour')
    expect(carte(h)).not.toContain('à dire')
  })

  it('la coupure se nomme', () => {
    const h = hub(tout({ depenses: undefined }), { depenses: new TypeError('Failed to fetch') })
    expect(carte(h)).toContain('tu n’as plus de connexion')
  })

  it('un mois sans ligne, tout lu : « Rien de posé »', () => {
    expect(carte(hub(tout({ depenses: [] })))).toContain('Rien de posé')
  })

  it('une saisie posée compte : le déclaré au-dessus du prévu fait baisser le reste', () => {
    const t = carte(hub(tout({ saisies: [saisie(900_00)] })))
    expect(t).toContain('3 425 €')
  })
})

describe('Hub — un manque que l’arrondi ferait disparaître se dit au centime', () => {
  it('−0,30 € : « Il te manque 0,30 € », jamais « 0 € »', () => {
    // 4 325,00 € de revenu, 4 325,30 € de charges.
    const t = carte(hub(tout({ depenses: [fixe(4325_30)] })))
    expect(t).toContain('Il te manque')
    expect(t).toContain('0,30 €')
    expect(t).not.toMatch(/(^|\s)0 €/)
  })

  it('−30 € reste en euros ronds : « 30 € »', () => {
    expect(carte(hub(tout({ depenses: [fixe(4355_00)] })))).toContain('Il te manque 30 €')
  })

  it('+0,30 € : « Il te reste 0,30 € », pas « 0 € »', () => {
    const t = carte(hub(tout({ depenses: [fixe(4324_70)] })))
    expect(t).toContain('Il te reste')
    expect(t).toContain('0,30 €')
  })

  it('0 € exactement : « Il te reste 0 € »', () => {
    expect(carte(hub(tout({ depenses: [fixe(4325_00)] })))).toContain('Il te reste 0 €')
  })
})

describe('Hub — « … est à clôturer » (3.8, § 3.6)', () => {
  const septembre = (): Cloture =>
    ({ id: 'cl1', mois: '2026-09-01', cloture_le: '2026-10-01T08:00:00Z', choix: [] })

  it('le mois d’avant, pas clôturé, avec un revenu : « Septembre est à clôturer »', () => {
    expect(carte(hub(tout()))).toContain('Septembre est à clôturer')
  })

  it('elle passe DEVANT les montants à dire', () => {
    // Une ligne au fil sans saisie : « 1 montant à dire » si la clôture ne passait pas devant.
    const t = carte(hub(tout()))
    expect(t).toContain('Septembre est à clôturer')
    expect(t).not.toContain('à dire')
  })

  it('septembre clôturé : les montants à dire reprennent la ligne', () => {
    const t = carte(hub(tout({ clotures: [septembre()] })))
    expect(t).not.toContain('à clôturer')
    expect(t).toContain('1 montant à dire : Courses')
  })

  it('septembre clôturé et rien à dire : « Tout est à jour »', () => {
    const t = carte(hub(tout({ clotures: [septembre()], depenses: [fixe(800_00)] })))
    expect(t).toContain('Tout est à jour')
  })

  it('sans revenu en septembre, rien ne se clôture : la ligne ne le propose pas', () => {
    const t = carte(hub(tout({ revenus: [{ ...revenu(), valid_from: '2026-10-01' }] })))
    expect(t).not.toContain('à clôturer')
  })

  it('les clôtures pas encore lues : ni « à clôturer » ni « Tout est à jour » (un faux « à jour » ment)', () => {
    const lues = tout({ depenses: [fixe(800_00)] })
    delete lues.clotures
    const t = carte(hub(lues))
    expect(t).toContain('Il te reste')
    expect(t).not.toContain('à clôturer')
    expect(t).not.toContain('Tout est à jour')
  })

  it('les clôtures en panne : pas de « à clôturer » inventé, pas de « Tout est à jour » non plus', () => {
    const lues = tout({ depenses: [fixe(800_00)] })
    delete lues.clotures
    const t = carte(hub(lues, { clotures: new Error('boom') }))
    expect(t).not.toContain('à clôturer')
    expect(t).not.toContain('Tout est à jour')
    expect(t).toContain('Il te reste')
  })
})
