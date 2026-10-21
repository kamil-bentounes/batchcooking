/**
 * Toucher le fond ferme la feuille — mais PAS un glisser qui a commencé dans la feuille.
 *
 * Quand on tape un montant et que le doigt dérape de la feuille vers le fond, le navigateur
 * envoie un `click` dont la cible est le `<dialog>` (l'ancêtre commun) : la feuille se
 * fermait et la saisie était perdue. On ne ferme que si le `pointerdown` ET le `click` visent
 * le fond.
 *
 * Le dépôt n'a pas de jsdom : `useRef` rend une boîte, `useEffect` ne fait rien, et on appelle
 * `Feuille` comme une fonction pour lire les gestionnaires de son `<dialog>`.
 */
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: (valeur: unknown) => ({ current: valeur }),
  useEffect: () => {},
}))

const { Feuille } = await import('./Feuille.tsx')

type Gestionnaires = {
  ref: { current: unknown }
  onPointerDown: (e: { target: unknown }) => void
  onClick: (e: { target: unknown }) => void
}

function monte() {
  const fermer = vi.fn()
  const dialog = { nom: 'dialog' }
  const dedans = { nom: 'champ du montant' }
  const el = Feuille({ fermer, titre: 'Courses', children: null }) as ReactElement<Gestionnaires>
  el.props.ref.current = dialog
  return { fermer, dialog, dedans, ...el.props }
}

describe('Feuille — toucher le fond', () => {
  it('un toucher franc sur le fond (appui ET clic sur le fond) ferme', () => {
    const f = monte()
    f.onPointerDown({ target: f.dialog })
    f.onClick({ target: f.dialog })
    expect(f.fermer).toHaveBeenCalledTimes(1)
  })

  it('un glisser qui COMMENCE dans la feuille et finit sur le fond ne ferme pas : la saisie reste', () => {
    const f = monte()
    f.onPointerDown({ target: f.dedans })
    f.onClick({ target: f.dialog })
    expect(f.fermer).not.toHaveBeenCalled()
  })

  it('un toucher dans la feuille ne ferme pas', () => {
    const f = monte()
    f.onPointerDown({ target: f.dedans })
    f.onClick({ target: f.dedans })
    expect(f.fermer).not.toHaveBeenCalled()
  })

  it('un clic sans appui préalable sur le fond ne ferme pas', () => {
    const f = monte()
    f.onClick({ target: f.dialog })
    expect(f.fermer).not.toHaveBeenCalled()
  })

  it('l’appui d’un toucher n’autorise pas le clic suivant : chaque toucher vaut pour lui seul', () => {
    const f = monte()
    f.onPointerDown({ target: f.dialog })
    f.onClick({ target: f.dialog })
    f.onClick({ target: f.dialog })
    expect(f.fermer).toHaveBeenCalledTimes(1)
  })

  it('un glisser raté (appui sur le fond, clic ailleurs) ne laisse pas l’appui armé', () => {
    const f = monte()
    f.onPointerDown({ target: f.dialog })
    f.onClick({ target: f.dedans })
    f.onClick({ target: f.dialog })
    expect(f.fermer).not.toHaveBeenCalled()
  })
})
