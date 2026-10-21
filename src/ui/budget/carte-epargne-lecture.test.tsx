/**
 * La carte d'épargne avant que le solde soit lu : « 0 € mis de côté », « 0 % » et une
 * jauge vide disaient à quelqu'un qui a 800 € de côté qu'il n'a rien. Un solde pas encore
 * revenu, ou en panne, ne se lit pas zéro (même méthode que `gestes-recap-epargne.test.tsx` :
 * cache de requêtes rempli à la main, une clé absente est une lecture pas revenue).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { CLE, type Poche } from '../../lib/donnees/budget.ts'
import { CarteEpargne } from './CarteEpargne.tsx'

const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()
const poche = (p: Partial<Poche> = {}): Poche =>
  ({ id: 'p1', libelle: 'Vacances', genre: 'projet', objectif_cents: 1000_00,
     echeance: null, cle: null, ...p })

function carte(solde: 'absent' | 'panne' | number[]) {
  const qc = new QueryClient({ defaultOptions: { queries: {
    retry: false, retryOnMount: false, staleTime: Infinity } } })
  qc.setQueryData(CLE.poches, [poche()])
  if (solde === 'panne') {
    qc.getQueryCache().build(qc, { queryKey: CLE.soldes('p1') })
      .setState({ status: 'error', error: new Error('boom'), data: undefined, fetchStatus: 'idle' })
  } else if (solde !== 'absent') {
    qc.setQueryData(CLE.soldes('p1'), solde.map((cents, i) => ({ userId: `u${i}`, cents })))
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}><CarteEpargne va={() => {}} /></QueryClientProvider>)
}

describe('CarteEpargne — le solde pas encore lu', () => {
  it('pas encore revenu : « … », ni « 0 € mis de côté », ni « 0 % », ni jauge', () => {
    const h = carte('absent')
    expect(texte(h)).toContain('Vacances')
    expect(texte(h)).toContain('…')
    expect(texte(h)).not.toContain('mis de côté')
    expect(texte(h)).not.toContain('0 %')
    expect(h).not.toContain('role="meter"')
  })

  it('en panne : le solde n’est pas lu, et ce n’est pas zéro', () => {
    const h = carte('panne')
    expect(texte(h)).toContain('Vacances')
    expect(texte(h)).not.toContain('mis de côté')
    expect(texte(h)).not.toContain('0 %')
    expect(h).not.toContain('role="meter"')
    expect(texte(h)).toContain('Solde illisible')
  })

  it('lu et vraiment vide : « 0 € mis de côté » se dit, lui, avec sa jauge', () => {
    const h = carte([])
    expect(texte(h)).toContain('0 € mis de côté sur 1')
    expect(texte(h)).toContain('0 %')
    expect(h).toContain('role="meter"')
  })
})
