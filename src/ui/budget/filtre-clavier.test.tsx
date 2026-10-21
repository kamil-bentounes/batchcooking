/**
 * Le filtre Tout / Commun / Moi se manie au clavier comme un vrai `radiogroup` : un seul
 * bouton dans l'ordre de tabulation (celui qui est coché), les flèches déplacent ET cochent.
 * Sans cela, `role="radio"` promettait un comportement que les lecteurs d'écran annoncent et
 * que les boutons ne tenaient pas : Tab traversait les trois, les flèches ne faisaient rien.
 *
 * `FiltreDuMois` n'a pas d'état : on l'appelle comme une fonction et on lit son arbre.
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Filtre } from '../../lib/budget/mois.ts'
import { FiltreDuMois, filtreVoisin } from './Filtre.tsx'

const totaux: Record<Filtre, number> = { tout: 100_00, commun: 60_00, moi: 40_00 }
type Props = Record<string, unknown>

function radios(n: ReactNode, trouves: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (Array.isArray(n)) { n.forEach(x => radios(x, trouves)); return trouves }
  if (!isValidElement<Props>(n)) return trouves
  if (n.props.role === 'radio') trouves.push(n)
  radios(n.props.children as ReactNode, trouves)
  return trouves
}

function monte(filtre: Filtre) {
  const choisir = vi.fn()
  const arbre = FiltreDuMois({ filtre, totaux, choisir })
  return { choisir, boutons: radios(arbre), arbre }
}

/** Un `keydown` : la touche, et de quoi observer `preventDefault` et le focus déplacé. */
function appuie(b: ReactElement<Props>, key: string, freres: { focus: () => void }[]) {
  const preventDefault = vi.fn()
  const e = { key, preventDefault, currentTarget: { parentElement: { children: freres } } }
  ;(b.props.onKeyDown as (e: unknown) => void)(e)
  return preventDefault
}

describe('filtreVoisin', () => {
  it('→ et ↓ vont au suivant, ← et ↑ au précédent, en boucle', () => {
    expect(filtreVoisin('tout', 'ArrowRight')).toBe('commun')
    expect(filtreVoisin('commun', 'ArrowDown')).toBe('moi')
    expect(filtreVoisin('moi', 'ArrowRight')).toBe('tout')
    expect(filtreVoisin('moi', 'ArrowLeft')).toBe('commun')
    expect(filtreVoisin('commun', 'ArrowUp')).toBe('tout')
    expect(filtreVoisin('tout', 'ArrowLeft')).toBe('moi')
  })

  it('les autres touches ne font rien (Tab, Entrée, lettres : le navigateur garde la main)', () => {
    for (const k of ['Tab', 'Enter', ' ', 'a', 'Home']) expect(filtreVoisin('tout', k)).toBeNull()
  })
})

describe('FiltreDuMois — tabulation itinérante', () => {
  it('seul le bouton coché est dans l’ordre de tabulation', () => {
    const h = renderToStaticMarkup(<FiltreDuMois filtre="commun" totaux={totaux} choisir={() => {}} />)
    const tabs = [...h.matchAll(/<button\b[^>]*role="radio"[^>]*>/g)].map(m => /tabindex="(-?\d)"/.exec(m[0])?.[1])
    expect(tabs).toEqual(['-1', '0', '-1'])
  })

  it('le coché suit le filtre : « Moi » coché, c’est « Moi » qui prend le Tab', () => {
    const { boutons } = monte('moi')
    expect(boutons.map(b => b.props.tabIndex)).toEqual([-1, -1, 0])
  })
})

describe('FiltreDuMois — les flèches', () => {
  it('→ coche le suivant, déplace le focus dessus et retient la touche (pas de défilement)', () => {
    const { boutons, choisir } = monte('tout')
    const freres = boutons.map(() => ({ focus: vi.fn() }))
    const preventDefault = appuie(boutons[0], 'ArrowRight', freres)
    expect(choisir).toHaveBeenCalledWith('commun')
    expect(freres[1].focus).toHaveBeenCalled()
    expect(freres[0].focus).not.toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalled()
  })

  it('← depuis le premier boucle sur le dernier ; ↑ et ↓ valent ← et →', () => {
    const { boutons, choisir } = monte('tout')
    const freres = boutons.map(() => ({ focus: vi.fn() }))
    appuie(boutons[0], 'ArrowLeft', freres)
    expect(choisir).toHaveBeenLastCalledWith('moi')
    expect(freres[2].focus).toHaveBeenCalled()
    appuie(boutons[0], 'ArrowDown', freres)
    expect(choisir).toHaveBeenLastCalledWith('commun')
    appuie(boutons[0], 'ArrowUp', freres)
    expect(choisir).toHaveBeenLastCalledWith('moi')
  })

  it('une autre touche ne coche rien et ne retient rien', () => {
    const { boutons, choisir } = monte('tout')
    const preventDefault = appuie(boutons[0], 'Tab', boutons.map(() => ({ focus: vi.fn() })))
    expect(choisir).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
