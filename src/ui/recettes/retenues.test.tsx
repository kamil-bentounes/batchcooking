/**
 * La carte encre grossissait de 150 px par recette retenue : à six, le catalogue sortait de
 * l'écran (grand test, parcours B). Au-delà de trois recettes, les plus anciennes se replient
 * derrière « + N autres » ; leurs parts restent réglables en dépliant.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RecetteChoisie } from '../../lib/donnees/cycle.ts'
import { Retenues } from './Retenues.tsx'
import { repliees } from '../../lib/recettes/parts.ts'

const choisie = (n: number): RecetteChoisie => ({
  id: `c${n}`, recipe_id: `r${n}`, servings: 2, position: 0,
  recipe: { id: `r${n}`, title: `Recette ${n}`, yield_servings: 4, total_time_min: 30,
            source_name: null, image_url: null },
}) as unknown as RecetteChoisie
const n = (k: number) => Array.from({ length: k }, (_, i) => choisie(i + 1))

const rend = (k: number) => renderToStaticMarkup(
  <Retenues cible={12} choisies={n(k)} surRefus={() => {}} surCible={() => {}}
            surParts={() => {}} surRetire={() => {}} />)
const champs = (h: string) => (h.match(/aria-label="Parts de [^"]+"/g) ?? [])

describe('repliees — ce qui reste visible', () => {
  it('trois recettes ou moins : tout se voit, rien ne se plie', () => {
    expect(repliees(n(3), false)).toEqual({ visibles: n(3), cachees: 0 })
    expect(repliees(n(0), false)).toEqual({ visibles: [], cachees: 0 })
  })
  it('au-delà de trois : les trois dernières retenues, et le nombre de celles qui se plient', () => {
    const r = repliees(n(6), false)
    expect(r.visibles.map(c => c.id)).toEqual(['c4', 'c5', 'c6'])
    expect(r.cachees).toBe(3)
  })
  it('dépliée : toutes, dans l’ordre', () => {
    const r = repliees(n(6), true)
    expect(r.visibles.map(c => c.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])
    expect(r.cachees).toBe(3)
  })
})

describe('la carte des retenues', () => {
  it('trois recettes : trois champs de parts, aucun « + N autres »', () => {
    const h = rend(3)
    expect(champs(h)).toHaveLength(3)
    expect(h).not.toMatch(/autres/)
  })
  it('six recettes : trois champs, et un bouton « + 3 autres » qui se déplie', () => {
    const h = rend(6)
    expect(champs(h)).toHaveLength(3)
    expect(h).toMatch(/<button[^>]*aria-expanded="false"[^>]*>[^<]*\+ 3 autres/)
    expect(h).toContain('Recette 6')
    expect(h).not.toContain('Recette 1<')
  })
})
