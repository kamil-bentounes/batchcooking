/**
 * La carte encre grossissait de 150 px par recette retenue : à six, le catalogue sortait de
 * l'écran (grand test, parcours B). Depuis la refonte du 26/10, chaque recette est une petite
 * carte de photo dans une BANDE qui défile de côté : la carte garde sa hauteur, et toutes les
 * recettes y sont — plus de « + N autres ».
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RecetteChoisie } from '../../lib/donnees/cycle.ts'
import { Retenues } from './Retenues.tsx'

const choisie = (n: number): RecetteChoisie => ({
  id: `c${n}`, recipe_id: `r${n}`, servings: 2, position: 0,
  recipe: { id: `r${n}`, title: `Recette ${n}`, yield_servings: 4, total_time_min: 30,
            source_name: null, image_url: null },
}) as unknown as RecetteChoisie
const n = (k: number) => Array.from({ length: k }, (_, i) => choisie(i + 1))

const rend = (k: number, cible = 12) => renderToStaticMarkup(
  <Retenues cible={cible} choisies={n(k)} surRefus={() => {}} surCible={() => {}}
            surParts={() => {}} surRetire={() => {}} />)
const champs = (h: string) => (h.match(/aria-label="Parts de [^"]+"/g) ?? [])

describe('la carte des retenues', () => {
  it('trois recettes : trois champs de parts, trois « − » et « + », trois « Retirer »', () => {
    const h = rend(3)
    expect(champs(h)).toHaveLength(3)
    expect(h.match(/aria-label="Une part de moins, /g)).toHaveLength(3)
    expect(h.match(/aria-label="Une part de plus, /g)).toHaveLength(3)
    expect(h.match(/aria-label="Retirer Recette/g)).toHaveLength(3)
    expect(h).not.toMatch(/autres/)
  })
  it('six recettes : les six sont dans la bande, aucune ne se plie', () => {
    const h = rend(6)
    expect(champs(h)).toHaveLength(6)
    for (const k of [1, 2, 3, 4, 5, 6]) expect(h).toContain(`Recette ${k}<`)
    expect(h).not.toMatch(/autres|aria-expanded="false"[^>]*>[^<]*\+ \d/)
  })
  it('aucune recette : pas de bande', () => {
    expect(rend(0)).not.toContain('Recettes retenues')
  })
  it('une part ne descend pas sous 1', () => {
    const h = renderToStaticMarkup(
      <Retenues cible={12} choisies={[{ ...choisie(1), servings: 1 }]} surRefus={() => {}}
                surCible={() => {}} surParts={() => {}} surRetire={() => {}} />)
    expect(h).toMatch(/<button[^>]*aria-label="Une part de moins, Recette 1"[^>]*disabled/)
  })
  it('la piste : les parts retenues, et ce qui dépasse la cible', () => {
    expect(rend(3, 12)).toContain('aria-label="6 parts retenues sur 12 prévues"')
    expect(rend(8, 8)).toContain('aria-label="16 parts retenues sur 8 prévues"')
  })
})
