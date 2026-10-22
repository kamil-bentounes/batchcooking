/**
 * Grand test, parcours « nouveau venu » (22/10) : « Changer mon mot de passe » (réglages)
 * ouvrait un écran SANS aucune sortie — ni barre, ni bouton de retour. Sur un téléphone
 * installé (iOS, pas de geste « retour »), on y restait. Mais l'écran du mot de passe
 * OBLIGATOIRE (arrivée, réinitialisation) ne doit, lui, offrir aucune échappatoire.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Password } from './Password.tsx'

// `route.ts` lit `window` au chargement : on ne teste pas la navigation ici.
vi.mock('../lib/route', () => ({ useRoute: () => ({ ici: '/', va: () => {} }) }))

describe('Password', () => {
  it('l’écran obligatoire n’offre aucune sortie', () => {
    const html = renderToStaticMarkup(<Password userId="u1" onDone={() => {}} />)
    expect(html).not.toContain('Réglages')
    expect(html).not.toContain('<a')
  })

  it('en le changeant depuis les réglages, on peut en sortir', () => {
    const html = renderToStaticMarkup(<Password userId="u1" onDone={() => {}} retour={() => {}} />)
    expect(html).toContain('Réglages')
  })
})
