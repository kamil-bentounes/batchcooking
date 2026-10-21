/**
 * Le formulaire d'ajout d'une charge, rendu en chaîne : ce qu'il lit comme heure.
 *
 * L'état initial de « Elle court depuis » lisait `new Date()` au lieu de `maintenant()` :
 * le banc de la clôture, qui joue un 1er novembre par `maintenant()`, voyait le champ
 * ouvrir sur le vrai mois — et la charge posée commencer avant ou après celui qu'il jouait.
 * `maintenant()` est remplacée ici par une date que `new Date()` ne rendrait jamais.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/horloge.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/horloge.ts')>(),
  maintenant: () => new Date(2031, 2, 15, 10, 0, 0),
}))
// `route.ts` lit `window` au chargement : on ne teste pas la navigation ici.
vi.mock('../lib/route.ts', () => ({ useRoute: () => ({ va: () => {} }) }))

const { Ajout } = await import('./Charges.tsx')

const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()
const rends = (depart: Parameters<typeof Ajout>[0]['depart']) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <Ajout depart={depart} membres={[{ id: 'u1', display_name: 'Kamil' }]} moi="u1"
           foyerId="f1" comptes={[]} surFini={() => {}} />
  </QueryClientProvider>)

describe('Ajout — l’heure vient de maintenant(), pas de new Date()', () => {
  it('« Elle court depuis » ouvre sur le mois de maintenant(), et son plancher aussi', () => {
    const h = rends(null)
    expect(h).toMatch(/id="debut-charge"[^>]*value="2031-03"/)
    expect(h).toMatch(/id="debut-charge"[^>]*min="2030-01"/)
  })

  it('l’avertissement d’une charge annuelle posée après janvier suit l’année de maintenant()', () => {
    const h = rends({ libelle: 'Taxe foncière', periode: 'annuel', portee: 'commun',
                      precision: null, catalogueId: 'x' })
    expect(texte(h)).toContain('On ne mettra de côté qu’à partir de ce mois-là')
  })

  it('le bouton est éteint tant qu’il manque un montant', () => {
    const h = rends(null)
    const b = [...h.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)]
      .find(m => texte(m[2]) === 'Ajouter cette charge')
    expect(b && /\bdisabled(=|\s|$)/.test(b[1])).toBe(true)
  })
})
