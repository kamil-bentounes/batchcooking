/**
 * L'échelle d'un dessin à largeur fixe : 1 s'il tient, moins s'il ne tient pas.
 *
 * Le frigo fermé est dessiné à 302 px. Sur un écran de 320 px (moins les marges), il dépassait et la
 * colonne le rognait. On mesure la boîte qui le porte et on réduit le dessin à sa largeur, sans jamais
 * l'agrandir.
 */
import { useLayoutEffect, useRef, useState } from 'react'

export function echelleDe(disponible: number, largeur: number): number {
  if (!(disponible > 0)) return 1
  return Math.min(1, disponible / largeur)
}

export function useEchelle(largeur: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [echelle, setEchelle] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const mesure = () => setEchelle(echelleDe(el.clientWidth, largeur))
    mesure()
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(mesure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [largeur])
  return [ref, echelle] as const
}
