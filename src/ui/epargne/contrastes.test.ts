/**
 * Les contrastes de l'épargne, lus dans les jetons de `src/index.css`.
 * Le titre blanc posé sur la photo : la maquette n'y tenait pas l'AA (voile à 62 % seulement en bas, et le titre
 * est plus haut). On mesure le pire cas, une photo entièrement blanche sous le voile.
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VOILE_ARRETS, VOILE_RVB } from '../../lib/budget/epargne-lecture.ts'

const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')
type Rvb = [number, number, number]
const jeton = (nom: string): Rvb => {
  const m = css.match(new RegExp(`--color-${nom}:\\s*(#[0-9A-Fa-f]{6})`))
  if (!m) throw new Error(`jeton --color-${nom} introuvable`)
  return [1, 3, 5].map(i => parseInt(m[1].slice(i, i + 2), 16)) as Rvb
}
const melange = (devant: Rvb, derriere: Rvb, alpha: number): Rvb =>
  devant.map((c, i) => c * alpha + derriere[i] * (1 - alpha)) as Rvb
const luminance = ([r, g, b]: Rvb) => {
  const [R, G, B] = [r, g, b].map(c => c / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}
const contraste = (a: Rvb, b: Rvb) => {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (clair + 0.05) / (sombre + 0.05)
}
const BLANC: Rvb = [255, 255, 255]

describe('épargne : le titre sur la photo', () => {
  it('à mi-hauteur de la photo, là où commence le titre, le voile tient le blanc à 4,5:1 même sur une photo toute blanche', () => {
    const arret = VOILE_ARRETS.find(a => a.place === 50)!
    const fond = melange([...VOILE_RVB] as Rvb, BLANC, arret.alpha)
    expect(contraste(BLANC, fond)).toBeGreaterThanOrEqual(4.5)
  })

  it('le voile ne s’éclaircit jamais en descendant', () => {
    const alphas = VOILE_ARRETS.map(a => a.alpha)
    expect(alphas).toEqual([...alphas].sort((a, b) => a - b))
  })
})

describe('épargne : le reste de la carte', () => {
  it('la pastille « Fonds d’urgence » : herbe sur surface', () => {
    expect(contraste(jeton('herbe'), jeton('surface'))).toBeGreaterThanOrEqual(4.5)
  })
  it('le prénom doux sur la tuile fond, et la date douce sur la surface', () => {
    expect(contraste(jeton('doux'), jeton('fond'))).toBeGreaterThanOrEqual(4.5)
    expect(contraste(jeton('doux'), jeton('surface'))).toBeGreaterThanOrEqual(4.5)
  })
  it('les pastilles de personnes : fond sur herbe, encre sur safran', () => {
    expect(contraste(jeton('fond'), jeton('herbe'))).toBeGreaterThanOrEqual(4.5)
    expect(contraste(jeton('encre'), jeton('safran'))).toBeGreaterThanOrEqual(4.5)
  })
  it('l’ocre se lit sur le sable (les « 255 € ») et sur la surface (le refus)', () => {
    expect(contraste(jeton('ocre'), jeton('sable'))).toBeGreaterThanOrEqual(4.5)
    expect(contraste(jeton('ocre'), jeton('surface'))).toBeGreaterThanOrEqual(4.5)
  })
  it('les boutons éteints restent lisibles : doux sur surface', () => {
    expect(contraste(jeton('doux'), jeton('surface'))).toBeGreaterThanOrEqual(4.5)
  })
  it('la barre de progression : herbe sur piste, 3:1', () => {
    expect(contraste(jeton('herbe'), jeton('piste'))).toBeGreaterThanOrEqual(3)
  })
})
