/**
 * L'épargne avant que le solde soit lu : `monSolde` valait 0 tant que `solde_epargne` n'était pas
 * revenu (ou était en panne), et « Je retire » restait actif : un clic trop tôt répondait « Tu
 * n'as rien versé ici » à quelqu'un qui a 380 € dans la poche. Un solde pas lu ne se lit pas zéro
 * (même méthode que `carte-epargne-lecture.test.tsx` : cache rempli à la main, une clé absente
 * est une lecture pas revenue).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { CLE, type Poche } from '../lib/donnees/budget.ts'
import { CLE as CLE_FOYER, type Foyer } from '../lib/donnees/foyer.ts'
import { Epargne } from './Epargne.tsx'

// `route.ts` lit `window` au chargement : on ne teste pas la navigation ici.
vi.mock('../lib/route.ts', () => ({ useRoute: () => ({ va: () => {} }) }))

const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()
const poche = (p: Partial<Poche> = {}): Poche =>
  ({ id: 'p1', libelle: 'Urgence', genre: 'urgence', objectif_cents: 1000_00,
     echeance: null, cle: null, ...p })

function ecran(solde: 'absent' | 'panne' | { userId: string; cents: number }[]) {
  const qc = new QueryClient({ defaultOptions: { queries: {
    retry: false, retryOnMount: false, staleTime: Infinity } } })
  qc.setQueryData(CLE_FOYER.foyer, { id: 'f1', nom: 'Chez nous', plafondLlmEur: 0,
    membres: [{ id: 'u1', display_name: 'Kamil' }] } as unknown as Foyer)
  qc.setQueryData(CLE.poches, [poche()])
  if (solde === 'panne') {
    qc.getQueryCache().build(qc, { queryKey: CLE.soldes('p1') })
      .setState({ status: 'error', error: new Error('boom'), data: undefined, fetchStatus: 'idle' })
  } else if (solde !== 'absent') {
    qc.setQueryData(CLE.soldes('p1'), solde)
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}><Epargne userId="u1" retour={() => {}} /></QueryClientProvider>)
}

describe('Épargne — le solde pas encore lu', () => {
  /* Le geste (« Je retire » éteint tant que le solde n'est pas lu) se joue en navigateur : il faut
     un montant TAPÉ, que le rendu statique ne sait pas faire — `e2e/budget-grand-test.spec.ts`. */
  it('pas encore revenu : la poche ne dit pas « 0 € », elle dit « … »', () => {
    const h = ecran('absent')
    expect(texte(h)).toContain('Urgence')
    expect(texte(h)).not.toMatch(/(^|\s)0 €(\s|$)/)
    expect(texte(h)).toContain('…')
  })

  it('en panne : la panne se dit, et ce n’est pas zéro', () => {
    const h = ecran('panne')
    expect(texte(h)).toContain('boom')
    expect(texte(h)).not.toMatch(/(^|\s)0 €(\s|$)/)
  })

  it('lu : le solde s’affiche, chiffré', () => {
    expect(texte(ecran([{ userId: 'u1', cents: 380_00 }]))).toContain('380 €')
  })

  it('lu et vraiment vide : « 0 € » se dit', () => {
    expect(texte(ecran([]))).toMatch(/(^|\s)0 €(\s|$)/)
  })
})

describe('Épargne — la carte d’une poche', () => {
  it('une poche vide le dit, sans registre', () => {
    const t = texte(ecran([]))
    expect(t).toContain('Rien n’y est encore versé.')
    expect(t).not.toContain('Qui a versé quoi')
  })

  it('les chiffres en valeur : le versé, l’objectif, le pourcentage, la date', () => {
    const h = ecran([{ userId: 'u1', cents: 250_00 }])
    expect(texte(h)).toContain('250 € sur 1\u202f000 €')
    expect(texte(h)).toContain('25 %')
    expect(texte(h)).toContain('pas de date')
    expect(h).toContain('role="meter"')
    expect(h).toContain('aria-label="250 € sur 1\u202f000 €"')
    expect(h).toContain('aria-label="Qui a versé quoi"')
    expect(texte(h)).toContain('Kamil')
    expect(texte(h)).not.toContain('Rien n’y est encore versé.')
  })

  it('le titre est posé sur la photo, et la photo est celle de l’épargne', () => {
    const h = ecran([])
    expect(h).toContain('budget/epargne.jpg')
    expect(h).toContain('aria-label="Urgence"')
  })

  it('« Verser (€) », « Je verse » et « Je retire »', () => {
    const t = texte(ecran([{ userId: 'u1', cents: 10_00 }]))
    for (const mot of ['Verser (€)', 'Je verse', 'Je retire', 'Ouvrir une poche', 'Son nom', 'Objectif (€)']) {
      expect(t).toContain(mot)
    }
  })
})
