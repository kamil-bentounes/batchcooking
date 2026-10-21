/**
 * L'écran du mois (2.15), rendu en chaîne avec un cache de requêtes REMPLI À LA MAIN.
 *
 * Le dépôt n'a ni jsdom ni Testing Library : on pose chaque lecture dans le cache de
 * TanStack Query (ce que l'écran verrait une fois la base répondue), et on lit le HTML.
 * Une lecture qu'on ne pose pas, c'est une lecture qui n'est pas revenue ; une lecture
 * posée en erreur, c'est un réseau qui tombe. Le but : l'écran ne montre JAMAIS un chiffre
 * calculé sur un morceau de ce qu'il lui faut (le défaut « ⚠️ isPending » est déjà arrivé).
 *
 * L'heure : le 21 octobre 2026, donc le mois courant est octobre. Les montants portent
 * l'espace fine insécable (U+202F) de `toLocaleString('fr-FR')`.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Charge, Cloture, Compte, Depense, Revenu, Saisie } from '../lib/donnees/budget.ts'
import { CLE } from '../lib/donnees/budget.ts'
import { CLE as CLE_FOYER, type Foyer } from '../lib/donnees/foyer.ts'
import { Budget } from './Budget.tsx'

const OCT = '2026-10-01'
const FINE = '\u202f'
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 21, 10, 0, 0))
})
afterEach(() => vi.useRealTimers())

const membre = (id: string, nom: string) => ({ id, display_name: nom })
const foyer = (membres = [membre('u1', 'Kamil')]) =>
  ({ id: 'f1', nom: 'Chez nous', plafondLlmEur: 0, membres }) as unknown as Foyer

const charge = (p: Partial<Charge> = {}): Charge => ({
  id: 'c1', libelle: 'Courses', montant_cents: 800_00, commun: true, debut: '2026-01-01',
  modifie_par: null, periodicite: 'mensuel', mode: 'au_fil', categorie: 'vie_courante',
  catalogue_id: null, variable: false, cle: null, compte_id: null, enveloppe_id: null,
  archive_le: null, participants: ['u1'], ...p,
})
const depense = (p: Partial<Depense> = {}): Depense => ({
  id: 'd1', charge_id: 'c1', libelle: 'Courses', mois: OCT, montant_cents: 800_00,
  montant_prevu_cents: 800_00, nature: 'estimee', source: 'charge', facon: 'au_fil',
  confirme_le: null, regularise_annee: null, regle_le: null, enveloppe_id: null, compte_id: null,
  parts: [{ user_profile_id: 'u1', part_cents: 800_00, part_bps: 10000 }], ...p,
})
const saisie = (cents: number): Saisie => ({
  id: `s${cents}`, depense_id: 'd1', fait_le: '2026-10-05', montant_cents: cents,
  saisi_par: 'u1', created_at: '2026-10-05T10:00:00Z',
})
const revenu = (qui = 'u1', cents = 4325_00): Revenu =>
  ({ id: `r-${qui}`, user_profile_id: qui, net_mensuel_cents: cents, valid_from: '2026-01-01' })
const compte = (): Compte => ({ id: 'k1', nom: 'Joint', genre: 'commun', titulaire_id: null,
                                 matelas_cents: 0, archive_le: null }) as unknown as Compte
const cloture = (mois = OCT): Cloture => ({ id: 'cl1', mois, cloture_le: '2026-11-01T08:00:00Z',
                                            choix: [] })

type Lectures = {
  foyer?: Foyer | null; depenses?: Depense[]; saisies?: Saisie[]; charges?: Charge[]
  revenus?: Revenu[]; clotures?: Cloture[]; comptes?: Compte[]
}
/** Ce qui est revenu de la base, et ce qui est en panne (`rate`). Une clé absente : pas revenue. */
function ecran(lues: Lectures, rate: Partial<Record<keyof Lectures, unknown>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: {
    retry: false, retryOnMount: false, staleTime: Infinity } } })
  const clefs = {
    foyer: CLE_FOYER.foyer, depenses: CLE.mois(OCT), saisies: ['saisies', OCT],
    charges: CLE.charges, revenus: CLE.revenus, clotures: ['cloture'], comptes: CLE.comptes,
  } as const
  for (const k of Object.keys(clefs) as (keyof Lectures)[]) {
    if (k in rate) {
      qc.getQueryCache().build(qc, { queryKey: clefs[k] })
        .setState({ status: 'error', error: rate[k] as Error, data: undefined, fetchStatus: 'idle' })
    } else if (k in lues) qc.setQueryData(clefs[k], lues[k])
  }
  qc.setQueryData(CLE.poches, [])
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}><Budget userId="u1" va={() => {}} /></QueryClientProvider>)
}
/** Tout est revenu, pour un foyer d'une personne avec ses courses. */
const tout = (p: Lectures = {}): Lectures => ({
  foyer: foyer(), depenses: [depense()], saisies: [], charges: [charge()],
  revenus: [revenu()], clotures: [], comptes: [compte()], ...p,
})
const total = (html: string) => Number(/data-total="(-?\d+)"/.exec(html)?.[1])

describe('Budget — tout est lu', () => {
  it('ouvre sur ce qui reste : le revenu moins les charges, par catégorie', () => {
    const h = ecran(tout())
    expect(h).toContain('Octobre')
    expect(texte(h)).toContain('Il te reste')
    expect(texte(h)).toContain(`4${FINE}325 € de revenus`)
    expect(texte(h)).toContain(`3${FINE}525 €`)
    expect(texte(h)).toContain(`après 800 € de charges prévues`)
    expect(h).toContain('Catégorie Vie courante')
    expect(texte(h)).not.toContain('Un instant')
  })

  it('compte les jours, et le dernier jour se dit', () => {
    expect(texte(ecran(tout()))).toContain('Il reste 10 jours.')
  })

  it('ne propose jamais le mois suivant sur le mois courant (l’avenir n’est pas ouvert)', () => {
    const h = ecran(tout())
    expect(h).not.toContain('Mois suivant')
    expect(h).toContain('Mois précédent : septembre')
  })

  it('la porte vers « Mes charges » est toujours là, même sans virement à faire', () => {
    expect(ecran(tout())).toContain('Mes charges')
    expect(ecran(tout({ depenses: [], comptes: [] }))).toContain('Mes charges')
  })

  it('une ligne au fil du mois pèse le plus grand du prévu et du déclaré, tant que le mois est ouvert', () => {
    expect(total(ecran(tout({ saisies: [saisie(900_00)] })))).toBe(900_00)
    expect(total(ecran(tout({ saisies: [saisie(300_00)] })))).toBe(800_00)
  })

  it('un mois CLÔTURÉ se lit tel que la clôture l’a laissé : les montants de la base', () => {
    const h = ecran(tout({ clotures: [cloture()], depenses: [depense({ montant_cents: 850_00 })],
                           saisies: [saisie(900_00)] }))
    expect(total(h)).toBe(850_00)
    expect(h).not.toContain('Déclarer pour Courses')
  })
})

describe('Budget — la ligne sans revenu', () => {
  it('seul, sans revenu : « Ajoute ton revenu », sans chiffre ni avertissement de partage', () => {
    const h = ecran(tout({ revenus: [] }))
    expect(texte(h)).toContain('Ajoute ton revenu pour voir ce qu’il te reste.')
    expect(texte(h)).not.toContain('parts égales')
    expect(h).not.toContain('NaN')
  })

  it('à deux, quand l’un n’a pas dit son revenu : le partage à parts égales se dit', () => {
    const h = ecran(tout({ foyer: foyer([membre('u1', 'Kamil'), membre('u2', 'Thauba')]),
                           revenus: [revenu('u1')] }))
    expect(texte(h)).toContain('Thauba n’a pas encore dit son revenu : tant qu’il manque, le partage se fait à parts égales.')
  })

  it('à deux, sans aucun revenu : le dit une seule fois, pour tout le foyer', () => {
    const h = ecran(tout({ foyer: foyer([membre('u1', 'Kamil'), membre('u2', 'Thauba')]),
                           revenus: [] }))
    expect(texte(h)).toContain('Aucun revenu n’est posé : le partage se fait à parts égales.')
  })

  it('un revenu posé APRÈS le mois ne compte pas pour lui', () => {
    const futur: Revenu = { ...revenu(), valid_from: '2026-11-01' }
    expect(texte(ecran(tout({ revenus: [futur] })))).toContain('Ajoute ton revenu')
  })
})

describe('Budget — chargement : aucun faux chiffre', () => {
  const MANQUE: (keyof Lectures)[] = ['foyer', 'depenses', 'saisies', 'charges', 'revenus', 'clotures']

  for (const k of MANQUE) {
    it(`sans « ${k} », l’écran attend : ni « Il te reste », ni « Ajoute ton revenu », ni « Rien de posé »`, () => {
      const lues = tout()
      delete lues[k]
      const t = texte(ecran(lues))
      expect(t).toContain('Un instant…')
      for (const faux of ['Il te reste', 'Il te manque', 'Ajoute ton revenu', 'Rien de posé',
                          'de charges prévues', 'Par catégorie', 'parts égales']) {
        expect(t, faux).not.toContain(faux)
      }
    })
  }

  it('garde l’en-tête et les gestes pendant qu’il attend : on peut déjà quitter l’écran', () => {
    const h = ecran({})
    expect(h).toContain('Octobre')
    expect(h).toContain('Mes charges')
  })
})

describe('Budget — une lecture rate', () => {
  it('la coupure de réseau se dit, sans aucun chiffre, avec de quoi réessayer', () => {
    const h = ecran(tout(), { depenses: new TypeError('Failed to fetch') })
    const t = texte(h)
    expect(t).toContain('Je n’ai pas pu lire le budget : tu n’as plus de connexion.')
    expect(h).toContain('role="alert"')
    expect(t).toContain('Réessayer')
    for (const faux of ['Il te reste', 'Rien de posé', 'Ajoute ton revenu', 'Un instant']) {
      expect(t, faux).not.toContain(faux)
    }
  })

  it('les revenus qui ratent ne font PAS dire « Ajoute ton revenu »', () => {
    const t = texte(ecran(tout(), { revenus: new Error('permission denied') }))
    expect(t).toContain('Je n’ai pas pu lire le budget : permission denied')
    expect(t).not.toContain('Ajoute ton revenu')
  })

  it('les clôtures qui ratent ne font PAS recompter un mois clos comme un mois ouvert', () => {
    const t = texte(ecran(tout(), { clotures: new Error('boum') }))
    expect(t).toContain('Je n’ai pas pu lire le budget')
    expect(t).not.toContain('Il te reste')
  })

  it('un échec passe devant l’attente des autres lectures', () => {
    const lues = tout()
    delete lues.saisies
    const t = texte(ecran(lues, { charges: new Error('boum') }))
    expect(t).toContain('Je n’ai pas pu lire le budget')
    expect(t).not.toContain('Un instant')
  })
})

describe('Budget — le mois vide', () => {
  it('sans compte : on commence par les revenus et les comptes', () => {
    const t = texte(ecran(tout({ depenses: [], comptes: [] })))
    expect(t).toContain('Rien de posé')
    expect(t).toContain('Commencer par les revenus et les comptes')
    expect(t).not.toContain('Il te reste')
  })

  it('avec un compte : on pose les charges', () => {
    const t = texte(ecran(tout({ depenses: [] })))
    expect(t).toContain('Poser les charges')
    expect(t).not.toContain('Commencer par les revenus')
  })

  it('les comptes pas encore lus ne font proposer AUCUNE porte (ni la mauvaise)', () => {
    const lues = tout({ depenses: [] })
    delete lues.comptes
    const t = texte(ecran(lues))
    expect(t).toContain('Rien de posé')
    expect(t).not.toContain('Poser les charges')
    expect(t).not.toContain('Commencer par les revenus')
  })

  it('les comptes qui ratent ne cachent pas le mois', () => {
    const t = texte(ecran(tout(), { comptes: new Error('boum') }))
    expect(t).toContain('Il te reste')
  })
})
