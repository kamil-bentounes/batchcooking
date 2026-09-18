import { describe, expect, it } from 'vitest'
import { PLAFOND, QUANTITE_REFERENCE_G, appareilDuCatalogue, dureeDe } from './duree.ts'

describe('la mise à l’échelle (D19)', () => {
  it('ne bouge pas pour une cuisson', () => {
    // Un gratin au four ne cuit pas plus longtemps parce qu'il y a six parts.
    expect(dureeDe(40, 'constant', 2000)).toBe(40)
    expect(dureeDe(40, 'constant', null)).toBe(40)
  })

  it('grandit avec la quantité pour un geste actif', () => {
    expect(dureeDe(4, 'lineaire_plafonne', QUANTITE_REFERENCE_G)).toBe(4)
    expect(dureeDe(4, 'lineaire_plafonne', 2 * QUANTITE_REFERENCE_G)).toBe(8)
  })

  it('plafonne : on prend le rythme', () => {
    const plafonnee = dureeDe(4, 'lineaire_plafonne', 100 * QUANTITE_REFERENCE_G)
    expect(plafonnee).toBe(4 * PLAFOND)
  })

  it('ne descend jamais sous la durée de base', () => {
    // Éplucher un seul oignon prend quand même le temps de sortir l'économe.
    expect(dureeDe(4, 'lineaire_plafonne', 20)).toBe(4)
  })

  it('ignore une quantité absurde plutôt que de rendre zéro', () => {
    expect(dureeDe(4, 'lineaire_plafonne', 0)).toBe(4)
    expect(dureeDe(4, 'lineaire_plafonne', -100)).toBe(4)
  })

  it('traite une échelle inconnue comme constante', () => {
    expect(dureeDe(7, null, 5000)).toBe(7)
  })
})

describe('les appareils', () => {
  it('ramène poêle et casserole aux plaques', () => {
    // On coche « plaques de cuisson », pas « poêle » : chacune occupe un feu,
    // et il y en a quatre. C'est le bon modèle de ressource.
    expect(appareilDuCatalogue('poele')).toBe('plaques')
    expect(appareilDuCatalogue('casserole')).toBe('plaques')
  })

  it('laisse passer les codes du catalogue', () => {
    for (const c of ['four', 'air_fryer', 'micro_ondes', 'autocuiseur', 'blender']) {
      expect(appareilDuCatalogue(c)).toBe(c)
    }
  })

  it('rend null pour un geste à la main', () => {
    expect(appareilDuCatalogue(null)).toBeNull()
  })
})
