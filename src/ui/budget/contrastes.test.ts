/**
 * Les contrastes des briques de l'écran du mois (2.9 à 2.11), lus dans les jetons de
 * `src/index.css` plutôt que recopiés : si la charte bouge, le test suit.
 *
 * Seuils (WCAG) : 4,5:1 pour du texte, 3:1 pour un graphisme qui porte du sens (la
 * jauge, un anneau, une icône). Un texte sur la carte encre à `opacity-80` se mélange
 * d'abord à l'encre : on mesure la couleur mélangée, pas celle du jeton.
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATEGORIES } from '../../lib/budget/categories.ts'

const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

const jeton = (nom: string): string => {
  const m = css.match(new RegExp(`--color-${nom}:\\s*(#[0-9A-Fa-f]{6})`))
  if (!m) throw new Error(`jeton --color-${nom} introuvable`)
  return m[1]
}

type Rvb = [number, number, number]
const rvb = (hex: string): Rvb => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rvb
/** `devant` à l'opacité `alpha`, posé sur `derriere`. */
const melange = (devant: Rvb, derriere: Rvb, alpha: number): Rvb =>
  devant.map((c, i) => c * alpha + derriere[i] * (1 - alpha)) as Rvb

function luminance([r, g, b]: Rvb): number {
  const [R, G, B] = [r, g, b].map(c => c / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}
function contraste(a: Rvb, b: Rvb): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (clair + 0.05) / (sombre + 0.05)
}
const c = (nom: string) => rvb(jeton(nom))

describe('2.10 · la carte encre et les gestes', () => {
  it('le chiffre safran se lit sur l’encre', () => {
    expect(contraste(c('safran'), c('encre'))).toBeGreaterThanOrEqual(4.5)
  })

  it('le texte `fond` se lit sur l’encre, à pleine opacité comme à `opacity-80`', () => {
    expect(contraste(c('fond'), c('encre'))).toBeGreaterThanOrEqual(4.5)
    expect(contraste(melange(c('fond'), c('encre'), 0.8), c('encre'))).toBeGreaterThanOrEqual(4.5)
  })

  it('la pastille « sur X de revenus » (fond à 10 % sur l’encre) se lit encore', () => {
    const pastille = melange(c('fond'), c('encre'), 0.1)
    expect(contraste(c('fond'), pastille)).toBeGreaterThanOrEqual(4.5)
  })

  it('« Revenus » et « Déclarer » : l’encre sur le safran', () => {
    expect(contraste(c('encre'), c('safran'))).toBeGreaterThanOrEqual(4.5)
  })

  it('le pictogramme herbe sur la pastille surface d’un geste', () => {
    expect(contraste(c('herbe'), c('surface'))).toBeGreaterThanOrEqual(3)
  })

  it('chaque couleur « sombre » d’une catégorie se voit sur l’encre (barre, légende)', () => {
    for (const cat of CATEGORIES) {
      expect(contraste(rvb(cat.sombre), c('encre')), cat.cle).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('2.10 / 2.11 · le texte posé sur une carte surface', () => {
  it('le texte doux (les pourcentages, « N lignes », le rythme d’une mise de côté)', () => {
    expect(contraste(c('doux'), c('surface'))).toBeGreaterThanOrEqual(4.5)
  })

  it('l’ocre de « N montants à dire »', () => {
    expect(contraste(c('ocre'), c('surface'))).toBeGreaterThanOrEqual(4.5)
  })

  it('l’encre (montants, libellés)', () => {
    expect(contraste(c('encre'), c('surface'))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('2.11 · le filtre', () => {
  it('l’encre sur la piste : les sous-totaux du filtre repliés', () => {
    expect(contraste(c('encre'), c('piste'))).toBeGreaterThanOrEqual(4.5)
  })

  it('le choix de choix.md : le doux sur la piste est SOUS le seuil (c’est pourquoi on garde l’encre)', () => {
    expect(contraste(c('doux'), c('piste'))).toBeLessThan(4.5)
  })

  it('l’encre sur la surface : le choix actif', () => {
    expect(contraste(c('encre'), c('surface'))).toBeGreaterThanOrEqual(4.5)
  })
})

describe('2.9 · la jauge', () => {
  it('l’herbe et l’ocre se voient sur la piste (3:1, un graphisme qui porte du sens)', () => {
    expect(contraste(c('herbe'), c('piste'))).toBeGreaterThanOrEqual(3)
    expect(contraste(c('ocre'), c('piste'))).toBeGreaterThanOrEqual(3)
  })

  it('la piste se distingue de la surface qui la porte (une carte) : un trait, pas un trou', () => {
    expect(contraste(c('piste'), c('surface'))).toBeGreaterThanOrEqual(1.1)
  })
})
