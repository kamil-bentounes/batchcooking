import { describe, expect, it } from 'vitest'
import { cibleDuRepas, partsConseillees, repartit, SKYR } from './portions.ts'
import type { Plat } from './portions.ts'

/** 100 kcal et 12 g de protéines pour 100 g : un plat correctement protéiné. */
const EQUILIBRE: Plat = {
  grammes: 3900, kcal: 3900, proteinG: 468, fiberG: 78, carbG: 350, fatG: 100,
}

/** 100 kcal et 2 g de protéines pour 100 g : un gratin de pâtes. */
const PAUVRE: Plat = {
  grammes: 3900, kcal: 3900, proteinG: 78, fiberG: 39, carbG: 600, fatG: 110,
}

const KAMIL = { userId: 'k', kcal: 700, proteinG: 50 }
const THAUBA = { userId: 't', kcal: 595, proteinG: 42 }

describe('la découpe au prorata', () => {
  it('donne 54 / 46 pour 2 000 contre 1 700 kcal par jour', () => {
    const r = repartit(EQUILIBRE, [
      { cible: KAMIL, nombre: 3 }, { cible: THAUBA, nombre: 3 },
    ])
    const [k, t] = r.parts
    expect(Math.round((k.grammes / (k.grammes + t.grammes)) * 100)).toBe(54)
  })

  it('tient compte du nombre de parts, pas seulement des objectifs', () => {
    const r = repartit(EQUILIBRE, [
      { cible: KAMIL, nombre: 5 }, { cible: THAUBA, nombre: 2 },
    ])
    const total = r.parts.reduce((s, p) => s + p.grammes * p.nombre, 0)
    expect(total).toBeCloseTo(EQUILIBRE.grammes, -1)
  })

  it('fait suivre toutes les macros à la part', () => {
    const r = repartit(EQUILIBRE, [{ cible: KAMIL, nombre: 6 }])
    const [k] = r.parts
    expect(k.grammes).toBe(650)
    expect(k.kcal).toBe(650)
    expect(k.proteinG).toBe(78)
    expect(k.fiberG).toBe(13)
  })

  it('ne complète rien quand le plat suffit aux deux', () => {
    const r = repartit(EQUILIBRE, [
      { cible: KAMIL, nombre: 3 }, { cible: THAUBA, nombre: 3 },
    ])
    expect(r.complements).toEqual([])
    expect(r.parts.every(p => p.diagnostic === 'ok')).toBe(true)
    expect(r.explication).toMatch(/couvre les deux objectifs/)
  })
})

describe('le piège : plus de tout n est pas plus de protéines', () => {
  it('complète quand le compte est bon en calories mais pas en protéines', () => {
    const r = repartit(PAUVRE, [{ cible: KAMIL, nombre: 6 }])
    const [k] = r.parts
    expect(k.kcal).toBe(650)          // les calories tombent juste
    expect(k.diagnostic).toBe('complement')
    expect(r.complements).toHaveLength(1)
    expect(r.explication).toMatch(/agrandir la part/)
  })

  it('dose le complément sur le manque, pas au hasard', () => {
    const r = repartit(PAUVRE, [{ cible: KAMIL, nombre: 6 }])
    const [k] = r.parts
    const c = r.complements[0]
    expect(k.proteinG).toBe(13)
    expect(k.proteinG + c.proteinG).toBeGreaterThanOrEqual(KAMIL.proteinG * 0.9)
    expect(c.source).toBe(SKYR.nom)
  })

  it('arrondit le complément à quelque chose de pesable', () => {
    const r = repartit(PAUVRE, [{ cible: KAMIL, nombre: 6 }])
    expect(r.complements[0].grammes % 25).toBe(0)
  })

  it('accepte une autre source que le skyr, et en demande moins', () => {
    const poulet = repartit(PAUVRE, [{ cible: KAMIL, nombre: 6 }],
      { nom: 'blanc de poulet', proteinesPour100g: 29 })
    const skyr = repartit(PAUVRE, [{ cible: KAMIL, nombre: 6 }])
    expect(poulet.complements[0].source).toBe('blanc de poulet')
    expect(poulet.complements[0].grammes).toBeLessThan(skyr.complements[0].grammes)
  })

  it('ne complète personne quand l objectif protéique n est pas renseigné', () => {
    const r = repartit(PAUVRE, [
      { cible: { userId: 'k', kcal: 700, proteinG: 0 }, nombre: 6 },
    ])
    expect(r.complements).toEqual([])
    expect(r.parts[0].diagnostic).toBe('ok')
  })
})

describe('le plat mal dimensionné', () => {
  it('dit de cuisiner plus, pas d ajouter du skyr, quand la part est trop petite', () => {
    // Vingt barquettes dans un plat qui en fait six : chacune vaut 195 kcal.
    const r = repartit(PAUVRE, [{ cible: KAMIL, nombre: 20 }])
    expect(r.parts[0].diagnostic).toBe('insuffisant')
    expect(r.complements).toEqual([])
    expect(r.explication).toMatch(/trop petit pour ce nombre de barquettes/)
    expect(r.explication).toMatch(/n'y changerait rien/)
  })

  it('dit de faire une barquette de plus quand la part est trop grosse', () => {
    const r = repartit(EQUILIBRE, [{ cible: KAMIL, nombre: 1 }])
    expect(r.parts[0].diagnostic).toBe('excessif')
    expect(r.parts[0].ratioKcal).toBeGreaterThan(1.15)
    expect(r.explication).toMatch(/une barquette de plus/)
  })

  it('ne confond jamais les deux diagnostics', () => {
    const trop = repartit(PAUVRE, [{ cible: KAMIL, nombre: 20 }])
    const pauvre = repartit(PAUVRE, [{ cible: KAMIL, nombre: 6 }])
    expect(trop.parts[0].diagnostic).not.toBe(pauvre.parts[0].diagnostic)
  })
})

describe('les cas qui ne doivent pas casser', () => {
  it('ne divise pas par zéro sur un plat vide', () => {
    const r = repartit({ ...EQUILIBRE, grammes: 0 }, [{ cible: KAMIL, nombre: 1 }])
    expect(r.parts).toEqual([])
    expect(r.explication).toBeTruthy()
  })

  it('ignore une personne qui ne prend aucune part', () => {
    const r = repartit(EQUILIBRE, [
      { cible: KAMIL, nombre: 3 }, { cible: THAUBA, nombre: 0 },
    ])
    expect(r.parts.map(p => p.userId)).toEqual(['k'])
  })

  it('explique toujours sa découpe', () => {
    for (const plat of [EQUILIBRE, PAUVRE]) {
      for (const n of [1, 3, 10]) {
        const r = repartit(plat, [{ cible: KAMIL, nombre: n }, { cible: THAUBA, nombre: n }])
        expect(r.explication.length).toBeGreaterThan(20)
      }
    }
  })
})

describe('du jour au repas', () => {
  it('ramène un objectif journalier à un dîner', () => {
    const c = cibleDuRepas('k', 2000, 140, 'diner')
    expect(c.kcal).toBe(700)
    expect(c.proteinG).toBe(49)
  })

  it('donne moins à une collation qu à un déjeuner', () => {
    expect(cibleDuRepas('k', 2000, 140, 'collation').kcal)
      .toBeLessThan(cibleDuRepas('k', 2000, 140, 'dejeuner').kcal)
  })
})

describe('le conseil de l écran de choix', () => {
  it('propose le nombre de parts qui tombe juste', () => {
    expect(partsConseillees(EQUILIBRE, [KAMIL, THAUBA])).toBe(6)
  })

  it('ne propose jamais zéro part pour un plat qui existe', () => {
    expect(partsConseillees({ ...EQUILIBRE, kcal: 120 }, [KAMIL])).toBe(1)
  })

  it('rend zéro plutôt que l infini sur un objectif absent', () => {
    expect(partsConseillees(EQUILIBRE, [{ userId: 'k', kcal: 0, proteinG: 0 }])).toBe(0)
  })
})
