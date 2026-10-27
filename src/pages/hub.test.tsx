/**
 * Le hub « ma journée » : la tuile Budget, la carte du jour, « Ce qui vient » et le frigo, rendus en chaîne avec un cache REMPLI À LA MAIN (même méthode
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
import type { Charge, Cloture, Depense, Revenu, Saisie } from '../lib/donnees/budget.ts'
import { CLE } from '../lib/donnees/budget.ts'
import { CLE as CLE_FOYER, type Foyer } from '../lib/donnees/foyer.ts'
import { CLE as CLE_CYCLE } from '../lib/donnees/cycle.ts'
import type { Cycle } from '../lib/donnees/cycle.ts'
import type { Barquette, Case } from '../lib/donnees/barquettes.ts'
import { CLE_FRIGO } from '../lib/donnees/frigo.ts'
import type { Prevu } from '../lib/frigo.ts'
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
                  clotures?: Cloture[]
                  /** Le cycle (`null` : pas de cycle vivant), la session interrompue, les barquettes, les cases de
                      la semaine, les repas posés, les recettes des plats (par identifiant), les charges et les
                      parts du foyer (le mois type de qui n'est pas encore arrivé). */
                  cycle?: Cycle | null; interrompu?: Cycle | null; barquettes?: Barquette[]; cases?: Case[]
                  prevus?: Prevu[]; recettes?: Map<string, { image_url: string | null }>
                  charges?: Charge[] }
/** Ce qui est revenu de la base, et ce qui est en panne (`rate`). Une clé absente : pas revenue. */
function hub(lues: Lectures, rate: Partial<Record<keyof Lectures, unknown>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: {
    retry: false, retryOnMount: false, staleTime: Infinity } } })
  const clefs = {
    foyer: CLE_FOYER.foyer, depenses: CLE.mois(OCT), saisies: ['saisies', OCT], revenus: CLE.revenus,
    clotures: ['cloture'], cycle: CLE_CYCLE.cycle, interrompu: [...CLE_CYCLE.cycle, 'interrompu'],
    barquettes: ['barquettes', false], cases: ['semaine', jourDe(0), jourDe(6)], prevus: CLE_FRIGO.prevus,
    charges: CLE.charges,
  } as const
  for (const k of Object.keys(clefs) as (keyof typeof clefs)[]) {
    if (k in rate) {
      qc.getQueryCache().build(qc, { queryKey: clefs[k] })
        .setState({ status: 'error', error: rate[k] as Error, data: undefined, fetchStatus: 'idle' })
    } else if (lues[k] !== undefined) qc.setQueryData(clefs[k], lues[k])
  }
  if (lues.recettes) {
    qc.setQueryData(CLE_FRIGO.recettes([...lues.recettes.keys()]), lues.recettes)
  }
  /* Le mois type de l'arrivée (novembre) : les parts, et la règle du partage. */
  qc.setQueryData(['parts-du-foyer', '2026-11-01'],
    { foyer: { u1: 10000 }, prorata: { u1: 10000 }, moitie: { u1: 10000 } })
  qc.setQueryData(['regle-partage'], 'prorata')
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}><Hub userId="u1" va={() => {}} /></QueryClientProvider>)
}
const tout = (p: Lectures = {}): Lectures => ({
  foyer: foyer(), depenses: [depense()], saisies: [], revenus: [revenu()], clotures: [],
  ...p,
})
/** Le texte de la tuile Budget. */
function carte(h: string): string {
  const m = h.match(/<section\b[^>]*data-tuile="budget"[^>]*>(.*?)<\/section>/s)
  if (!m) throw new Error(`pas de tuile Budget dans ${texte(h)}`)
  return texte(m[1])
}
/** Le texte d'un morceau du hub repéré par un de ses attributs `data-…`. */
function morceau(h: string, attribut: string): string {
  const m = h.match(new RegExp(`<section\\b[^>]*${attribut}[^>]*>(.*?)</section>`, 's'))
  if (!m) throw new Error(`pas de « ${attribut} » dans ${texte(h)}`)
  return texte(m[1])
}
/** Le jour local, `n` jours après l'horloge jouée. */
function jourDe(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

/* ── Le jour : la carte sombre, ce qui vient, le frigo ─────────────────────────────────────────────────────────
   Le mercredi 21 octobre 2026, 10 h. Deux personnes ; six lasagnes au frigo (midi et soir aujourd'hui pour vous
   deux, demain midi : le plat finit là), deux pizzas, quatre wraps au congélateur (vendredi midi et soir). */
const LASAGNES = 'Lasagnes au saumon-poireaux'
const PIZZA = 'Pizza vietnamienne protéinée'
const WRAP = 'Wrap'
const AVEC_ELLE = () => ({ id: 'f1', nom: 'Chez nous', plafondLlmEur: 0, membres: [
  { id: 'u1', display_name: 'Kamil', objectif: { kcal: 2200 } },
  { id: 'u2', display_name: 'Thauba', objectif: { kcal: 1800 } }] }) as unknown as Foyer
const cycle = (state: string) => ({ id: 'cy1', state, week_of: '2026-10-19' }) as unknown as Cycle
const part = (id: string, label: string, recipe: string, location: 'frigo' | 'congelateur', expire: Date) =>
  ({ id, label, recipe_id: recipe, location, state: 'au_frais', expires_at: expire.toISOString(),
     prepared_at: '2026-10-19T10:00:00Z', frozen_at: null, grams: 400, kcal: 600, protein_g: 40 }) as unknown as Barquette
const vendredi = new Date(2026, 9, 23, 19, 0, 0)
const janvier = new Date(2027, 0, 15, 12, 0, 0)
const barquettes = (): Barquette[] => [
  ...['L1', 'L2', 'L3', 'L4', 'L5', 'L6'].map(id => part(id, LASAGNES, 'r-las', 'frigo', vendredi)),
  ...['P1', 'P2'].map(id => part(id, PIZZA, 'r-piz', 'frigo', vendredi)),
  ...['W1', 'W2', 'W3', 'W4'].map(id => part(id, WRAP, 'r-wrap', 'congelateur', janvier)),
]
const casDe = (id: string, jours: number, meal: string, qui: string, p: Barquette): Case =>
  ({ id, day: jourDe(jours), meal, user_profile_id: qui, state: 'prevu', portion: p, extras: [] }) as unknown as Case
const SEMAINE = () => {
  const b = Object.fromEntries(barquettes().map(x => [x.id, x]))
  return [
    casDe('c1', 0, 'dejeuner', 'u1', b.L1), casDe('c2', 0, 'dejeuner', 'u2', b.L2),
    casDe('c3', 0, 'diner', 'u1', b.L3), casDe('c4', 0, 'diner', 'u2', b.L4),
    casDe('c5', 1, 'dejeuner', 'u1', b.L5), casDe('c6', 1, 'dejeuner', 'u2', b.L6),
    casDe('c7', 1, 'diner', 'u1', b.P1), casDe('c8', 1, 'diner', 'u2', b.P2),
    casDe('c9', 2, 'dejeuner', 'u1', b.W1), casDe('c10', 2, 'dejeuner', 'u2', b.W2),
    casDe('c11', 2, 'diner', 'u1', b.W3), casDe('c12', 2, 'diner', 'u2', b.W4),
  ]
}
const PREVUS = (): Prevu[] => SEMAINE().map(c => ({
  id: c.id, day: c.day, meal: c.meal, user_profile_id: c.user_profile_id, portion_id: c.portion!.id }))
const journee = (p: Lectures = {}): Lectures => tout({
  foyer: AVEC_ELLE(), cycle: cycle('semaine'), barquettes: barquettes(), cases: SEMAINE(), prevus: PREVUS(),
  recettes: new Map<string, { image_url: string | null }>([
    ['r-las', { image_url: 'https://exemple.fr/lasagnes.webp' }], ['r-piz', { image_url: null }], ['r-wrap', { image_url: null }]]),
  ...p,
})
const boutons = (h: string) => [...h.matchAll(/<button\b[^>]*>(.*?)<\/button>/gs)].map(m => texte(m[1]))
const titres = (h: string) => [...h.matchAll(/<h[12]\b[^>]*>(.*?)<\/h[12]>/gs)].map(m => texte(m[1]))

describe('Hub — la date et la phrase de la semaine', () => {
  it('la date du jour en grand, et la phrase tirée du cycle et des barquettes', () => {
    const h = hub(journee())
    expect(titres(h)).toContain('Mercredi 21 octobre')
    expect(texte(h)).toContain('La semaine tourne : 12 barquettes, dont 8 au frigo.')
  })

  it('rien n’est lu : ni date de phrase, ni « aucune barquette »', () => {
    const t = texte(hub({}))
    expect(t).toContain('Mercredi 21 octobre')
    expect(t).not.toContain('barquette')
    expect(t).not.toContain('Rien de prévu')
  })
})

describe('Hub — la carte du jour en semaine, avec un repas posé', () => {
  /* Rendu DANS le test : l'horloge jouée (`beforeEach`) n'existe pas encore à la collecte. */
  const h = () => hub(journee())
  const carteDuJour = () => morceau(h(), 'data-carte="repas"')

  it('dit quand, pour qui, et le nom entier du plat', () => {
    expect(carteDuJour()).toContain('Ce midi et ce soir, pour vous deux')
    expect(carteDuJour()).toContain(LASAGNES)
  })

  it('note les parts et leur péremption, et quel repas finit le plat', () => {
    expect(carteDuJour()).toContain('Au frigo, 6 parts. Elles périment vendredi soir : demain midi finit le plat.')
  })

  it('offre « Je l’ai mangé » et « Changer », et la porte « Cuisine »', () => {
    expect(carteDuJour()).toContain('Je l’ai mangé')
    expect(carteDuJour()).toContain('Changer')
    expect(boutons(h()).filter(b => /^Cuisine/.test(b))).toEqual(['Cuisine ›'])
  })

  it('montre la photo du plat quand la recette en a une', () => {
    expect(h()).toContain('https://exemple.fr/lasagnes.webp')
  })

  it('une part au congélateur : « Je les sors », pas « Je l’ai mangé »', () => {
    const b = barquettes().map(x => x.id === 'L1' || x.id === 'L2' ? { ...x, location: 'congelateur' } : x) as Barquette[]
    const cases = SEMAINE().map(c => ({ ...c, portion: b.find(x => x.id === c.portion!.id)! }))
    const t = morceau(hub(journee({ barquettes: b, cases })), 'data-carte="repas"')
    expect(t).toContain('Je les sors')
    expect(t).toContain('Il est au congélateur')
    expect(t).not.toContain('Je l’ai mangé')
  })

  it('sans les repas posés lus, la note ne dit pas « finit le plat »', () => {
    const t = morceau(hub(journee({ prevus: undefined })), 'data-carte="repas"')
    expect(t).not.toContain('finit le plat')
    expect(t).not.toContain('Au frigo, 6 parts')
  })
})

describe('Hub — « Ce qui vient »', () => {
  const lignes = () => morceau(hub(journee()), 'data-section="a-venir"')

  it('les prochains repas après celui du jour, trois lignes', () => {
    const t = lignes()
    expect(t).toContain(`Demain midi ${LASAGNES}`)
    expect(t).toContain(`Demain soir ${PIZZA}`)
    expect(t).toContain('Vendredi, midi et soir Wrap')
    expect(t).not.toContain('Ce midi')
  })

  it('la pastille « à sortir jeudi » sur ce qui dort au congélateur, et elle seule', () => {
    const t = lignes()
    expect(t).toContain('à sortir jeudi')
    expect(t.match(/à sortir/g)).toHaveLength(1)
  })

  it('mène à la semaine', () => {
    expect(lignes()).toContain('La semaine')
  })

  it('rien à venir : une phrase et le lien, pas de liste vide', () => {
    const h = hub(journee({ cases: SEMAINE().filter(c => c.day === jourDe(0)) }))
    const vient = morceau(h, 'data-section="a-venir"')
    expect(vient).toContain('Rien n’est posé pour la suite de la semaine.')
    expect(vient).toContain('La semaine')
    expect(h).not.toMatch(/<ul/)
  })

  it('la semaine pas encore lue : « … », jamais « Rien n’est posé »', () => {
    const h = hub(journee({ cases: undefined }))
    expect(morceau(h, 'data-section="a-venir"')).not.toContain('Rien n’est posé')
    expect(morceau(h, 'data-section="a-venir"')).toContain('…')
  })

  it('la semaine en panne : la panne se dit', () => {
    const h = hub(journee({ cases: undefined }), { cases: new Error('boom') })
    expect(morceau(h, 'data-section="a-venir"')).toContain('boom')
  })
})

describe('Hub — le frigo', () => {
  it('les deux chiffres, et la porte', () => {
    const h = hub(journee())
    const t = morceau(h, 'data-tuile="frigo"')
    expect(t).toContain('8 parts au frigo')
    expect(t).toContain('4 au congélateur')
    expect(h).toContain('aria-label="Ouvrir le frigo"')
  })

  it('barquettes pas lues : « … », jamais « 0 part »', () => {
    const t = morceau(hub(journee({ barquettes: undefined })), 'data-tuile="frigo"')
    expect(t).toContain('…')
    expect(t).not.toMatch(/\b0 part/)
  })

  it('barquettes en panne : la panne se dit', () => {
    const t = morceau(hub(journee({ barquettes: undefined }), { barquettes: new Error('boom') }), 'data-tuile="frigo"')
    expect(t).toContain('boom')
  })
})

describe('Hub — hors semaine, la carte dit le geste du moment', () => {
  it('les courses : le geste et son bouton, pas « Je l’ai mangé »', () => {
    const h = hub(journee({ cycle: cycle('courses') }))
    const t = morceau(h, 'data-carte="geste"')
    expect(t).toContain('Votre liste est prête')
    expect(t).toContain('Je pars faire les courses')
    expect(texte(h)).not.toContain('Je l’ai mangé')
    expect(boutons(h).filter(b => /^Cuisine/.test(b))).toHaveLength(1)
  })

  it('aucun cycle ni session interrompue : « Rien de prévu », une fois lu', () => {
    const t = morceau(hub(journee({ cycle: null, interrompu: null })), 'data-carte="geste"')
    expect(t).toContain('Rien de prévu')
    expect(t).toContain('Choisir les recettes')
  })

  it('une session interrompue passe devant « Rien de prévu »', () => {
    const t = morceau(hub(journee({ cycle: null, interrompu: cycle('interrompue') })), 'data-carte="geste"')
    expect(t).toContain('Session interrompue')
    expect(t).toContain('Reprendre la session interrompue')
    expect(t).toContain('Choisir de nouvelles recettes')
    expect(t).not.toContain('Rien de prévu')
  })

  it('en semaine mais rien de posé aujourd’hui : le geste de la semaine, et la phrase qui le dit', () => {
    const t = morceau(hub(journee({ cases: [] })), 'data-carte="geste"')
    expect(t).toContain('La semaine tourne')
    expect(t).toContain('Rien n’est posé pour aujourd’hui.')
    expect(t).toContain('Voir la semaine')
  })

  it('la semaine pas encore lue : « … », ni repas ni « Rien n’est posé »', () => {
    const t = morceau(hub(journee({ cases: undefined })), 'data-carte="geste"')
    expect(t).toContain('…')
    expect(t).not.toContain('Rien n’est posé')
    expect(t).not.toContain('Voir la semaine')
  })

  it('un repas posé aujourd’hui reste dit dans « Ce qui vient » quand la carte dit un geste', () => {
    const t = morceau(hub(journee({ cycle: cycle('courses') })), 'data-section="a-venir"')
    expect(t).toContain(`Ce midi et ce soir ${LASAGNES}`)
  })
})

describe('Hub — au chargement, rien ne s’affirme', () => {
  it('aucune lecture revenue : « … » partout, aucun « Rien de … », aucun « 0 »', () => {
    const h = hub({})
    const t = texte(h)
    for (const faux of ['Rien de prévu', 'Rien de posé', 'Rien n’est posé', 'aucune barquette', 'Ajoute ton revenu',
                        'Je l’ai mangé', 'Voir la semaine', 'Il te reste']) {
      expect(t, faux).not.toContain(faux)
    }
    expect(t).not.toMatch(/\b0 part/)
    expect(morceau(h, 'data-carte="geste"')).toContain('…')
    expect(carte(h)).toContain('…')
    expect(morceau(h, 'data-tuile="frigo"')).toContain('…')
  })

  it('même chargé, les deux entrées restent là : « Cuisine » et « Budget »', () => {
    const b = boutons(hub({}))
    expect(b.filter(x => /^Cuisine/.test(x))).toHaveLength(1)
    expect(hub({})).toContain('aria-label="Budget, ouvrir"')
  })

  it('le cycle en panne : ni « Rien de prévu » ni geste inventé', () => {
    const h = hub(journee({ cycle: undefined }), { cycle: new Error('boom') })
    expect(texte(h)).not.toContain('Rien de prévu')
  })
})

describe('Hub — le budget d’avant l’arrivée : le mois type et le compte à rebours', () => {
  /* Le mardi 27 octobre : arrivée le 1er novembre. 3 102 € de charges, 3 801 € de revenu : il reste 699 €. */
  beforeEach(() => { vi.setSystemTime(new Date(2026, 9, 27, 10, 0, 0)) })
  const arrivant = () => ({ id: 'f1', nom: 'Chez nous', plafondLlmEur: 0, membres: [
    { id: 'u1', display_name: 'Kamil', objectif: { kcal: 2200 }, entre_le: '2026-11-01' }] }) as unknown as Foyer
  const loyer = (): Charge => ({
    id: 'c1', libelle: 'Loyer', montant_cents: 3102_00, commun: true, debut: '2026-01-01', modifie_par: null,
    periodicite: 'mensuel', mode: 'fixe', categorie: 'logement', catalogue_id: null, variable: false, cle: null,
    compte_id: null, enveloppe_id: null, archive_le: null, participants: ['u1'] }) as unknown as Charge
  const avant = (p: Lectures = {}) => hub(tout({
    foyer: arrivant(), depenses: [], revenus: [revenu(3801_00)], charges: [loyer()], ...p }))

  it('le chiffre, la légende et le compte à rebours en jours', () => {
    const t = carte(avant())
    expect(t).toContain('Ton mois type, chaque mois')
    expect(t).toContain('699 € pour toi')
    expect(t).toContain('Charges 3 102 €')
    expect(t).toContain('Il te reste 699 €')
    expect(t).toContain('5 jours avant ton premier mois, le 1 er novembre.')  // le « er » est une <sup> : le texte aplati le sépare
    expect(t).toContain('Dans 5 jours')
  })

  it('la barre pèse les charges contre le reste', () => {
    expect(avant()).toMatch(/data-barre="budget"[^>]*><i class="bg-safran" style="flex:310200"><\/i><i class="bg-herbe" style="flex:69900">/)
  })

  it('ni « Il te reste … en octobre », ni « Rien de posé », ni « Ajoute ton revenu »', () => {
    const t = carte(avant())
    expect(t).not.toMatch(/en octobre/)
    expect(t).not.toContain('Rien de posé')
    expect(t).not.toContain('Ajoute ton revenu')
  })

  it('le mois type pas encore lu : « … », pas « rien n’est à poser »', () => {
    const t = carte(avant({ charges: undefined }))
    expect(t).toContain('…')
    expect(t).not.toContain('rien n’est à poser')
    expect(t).not.toContain('jours avant')
  })

  it('aucune charge posée : « Commence en novembre » et le compte à rebours, sans barre', () => {
    const h = avant({ charges: [] })
    const t = carte(h)
    expect(t).toContain('Commence en novembre')
    expect(t).toContain('rien n’est à poser avant')
    expect(t).toContain('5 jours avant ton premier mois')
    expect(h).not.toContain('data-barre="budget"')
  })

  it('le lendemain de l’arrivée-veille : « Demain » et « 1 jour »', () => {
    vi.setSystemTime(new Date(2026, 9, 31, 10, 0, 0))
    const t = carte(avant())
    expect(t).toContain('Demain')
    expect(t).toContain('1 jour avant ton premier mois')
  })

  it('un revenu qui ne couvre pas : « Il te manque », barre pleine de charges', () => {
    const h = avant({ revenus: [revenu(3000_00)] })
    const t = carte(h)
    expect(t).toContain('Il te manque 102 €')
    expect(t).not.toContain('Il te reste')
    expect(h).not.toMatch(/class="bg-herbe" style/)
  })
})

describe('Hub — la tuile Budget, le reste du mois (barre et légende)', () => {
  it('les charges et le reste, tirés du même calcul que l’écran du mois', () => {
    const h = hub(tout({ depenses: [fixe(1000_00)] }))
    const t = carte(h)
    expect(t).toContain('Charges 1 000 €')
    expect(t).toContain('Il te reste 3 325 €')
    expect(h).toMatch(/style="flex:100000"/)
  })

  it('« Ajoute ton revenu » : pas de barre', () => {
    const h = hub(tout({ revenus: [] }))
    expect(carte(h)).toContain('Ajoute ton revenu')
    expect(h).not.toContain('data-barre="budget"')
  })

  it('rien de posé : pas de barre, pas de légende', () => {
    const h = hub(tout({ depenses: [] }))
    expect(carte(h)).toContain('Rien de posé')
    expect(h).not.toContain('data-barre="budget"')
  })

  it('la ligne de suite au bureau, la pastille au téléphone', () => {
    const t = carte(hub(tout()))
    expect(t).toContain('Septembre est à clôturer')
    expect(t).toContain('Septembre à clôturer')
  })
})

describe('Hub — les raccourcis', () => {
  it('« Noter une dépense » et « Envie spéciale »', () => {
    const b = boutons(hub(tout()))
    expect(b).toContain('Noter une dépense')
    expect(b).toContain('Envie spéciale')
  })
})
