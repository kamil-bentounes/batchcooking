/**
 * L'anneau de focus sur la carte encre.
 *
 * Le `:focus-visible` global est `herbe` : 1,9:1 sur `encre`, très en dessous des
 * 3:1 qu'un indicateur de focus doit atteindre. Les champs de parts, « Retirer » et
 * la pastille « N repas à couvrir » vivent sur l'encre : leur anneau y était
 * invisible. On lit les jetons dans `index.css` plutôt que de recopier des
 * couleurs ici, pour que le test suive la charte.
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
const retenues = readFileSync(new URL('./Retenues.tsx', import.meta.url), 'utf8')

const jeton = (nom: string): string => {
  const m = css.match(new RegExp(`--color-${nom}:\\s*(#[0-9A-Fa-f]{6})`))
  if (!m) throw new Error(`jeton --color-${nom} introuvable`)
  return m[1]
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (clair + 0.05) / (sombre + 0.05)
}

describe('l’anneau de focus sur l’encre', () => {
  it('le global (herbe) ne se voit pas sur l’encre', () => {
    expect(contraste(jeton('herbe'), jeton('encre'))).toBeLessThan(3)
  })

  it('le fond, lui, s’y voit', () => {
    expect(contraste(jeton('fond'), jeton('encre'))).toBeGreaterThanOrEqual(3)
  })

  it('une règle repeint l’anneau en `fond` à l’intérieur de `.sur-encre`', () => {
    const regle = css.match(/\.sur-encre\s+:focus-visible\s*\{([^}]*)\}/)
    expect(regle, 'pas de règle `.sur-encre :focus-visible`').not.toBeNull()
    expect(regle![1]).toMatch(/outline-color:\s*var\(--color-fond\)/)
    // Un seul anneau : on change sa couleur, on n'en ajoute pas un second.
    expect(regle![1]).not.toMatch(/box-shadow|ring/)
  })

  it('la carte des retenues porte cette classe', () => {
    expect(retenues).toMatch(/<section[^>]*className="[^"]*\bsur-encre\b/s)
  })
})
