/**
 * `Erreur` dit les pannes en français (grand test, parcours « budget », 22/10).
 *
 * Réseau coupé pendant « Ajouter 9 € » : la feuille Déclarer affichait « TypeError: Failed to fetch »
 * — la panne de `fetch` d'une écriture du budget (`throw new Error(error.message)`, vingt fois dans
 * `donnees/budget.ts`) arrivait telle quelle à l'écran. Un seul endroit les montre toutes : `Erreur`.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PAS_DE_RESEAU } from '../lib/reseau.ts'
import { Erreur } from './coque.tsx'

describe('Erreur', () => {
  it('dit « Pas de réseau » pour une panne de fetch, jamais le message anglais', () => {
    const h = renderToStaticMarkup(<Erreur de={new TypeError('Failed to fetch')} />)
    expect(h).toContain(PAS_DE_RESEAU)
    expect(h).not.toContain('Failed to fetch')
  })

  it('laisse intact le refus de la base, déjà en français', () => {
    const h = renderToStaticMarkup(<Erreur de={new Error('Ce mois est clôturé.')} />)
    expect(h).toContain('Ce mois est clôturé.')
  })

  it('ne rend rien sans erreur', () => {
    expect(renderToStaticMarkup(<Erreur de={null} />)).toBe('')
  })
})
