import { describe, it, expect } from 'vitest'
import { analyser } from '../src/ingredient'

const a = (s: string) => analyser(s)

describe('analyse des lignes d\'ingrédients', () => {
  it('lit une masse', () => {
    const r = a('250 g de farine')
    expect(r).toMatchObject({ qte: 250, unite: 'g', aliment: 'farine', forme: 'masse' })
  })

  it('lit un volume', () => {
    expect(a('15 cl de lait de soja')).toMatchObject({ qte: 15, unite: 'cl', forme: 'volume' })
  })

  it('reconnaît les graphies de la cuillère', () => {
    for (const s of ['2 c. à soupe d\'huile', '2 cuillères à soupe d\'huile',
                     '2 c.à.s d\'huile', '2 càs d\'huile']) {
      const r = a(s)
      expect(r.unite, s).toBe('c. à soupe')
      expect(r.qte, s).toBe(2)
      expect(r.forme, s).toBe('cuillere')
    }
  })

  it('distingue cuillère à café et à soupe', () => {
    expect(a('1 c. à café de levure').unite).toBe('c. à café')
    expect(a('1 c. à soupe de levure').unite).toBe('c. à soupe')
  })

  it('lit un compte sans unité', () => {
    expect(a('3 œufs')).toMatchObject({ qte: 3, unite: null, aliment: 'œufs', forme: 'compte' })
    expect(a('2 gousses d\'ail')).toMatchObject({ qte: 2, unite: 'gousse', forme: 'cuillere' })
  })

  it('lit les fractions et les intervalles', () => {
    expect(a('1/2 oignon').qte).toBe(0.5)
    expect(a('½ citron').qte).toBe(0.5)
    expect(a('1 1/2 c. à café de sel').qte).toBe(1.5)
    expect(a('60 à 70 g d\'eau froide').qte).toBe(65)   // le milieu de l'intervalle
  })

  it('accepte la virgule décimale française', () => {
    expect(a('2,5 kg de pommes de terre')).toMatchObject({ qte: 2.5, unite: 'kg', forme: 'masse' })
  })

  // ⚠️ Les 16 % mesurés : ces lignes n'ont AUCUNE quantité et ne doivent pas en inventer.
  it('ne devine rien quand il n\'y a pas de quantité', () => {
    for (const s of ['sel, poivre', 'romaine (ou laitue)', 'bacon émietté', 'parmesan râpé']) {
      const r = a(s)
      expect(r.qte, s).toBeNull()
      expect(r.forme, s).toBe('aucune')
    }
  })

  it('reconnaît les intertitres de section', () => {
    for (const s of ['Pour la pâte :', 'Pour la frangipane :', 'Garniture :']) {
      expect(a(s).forme, s).toBe('section')
    }
    expect(a('250 g de farine').forme).not.toBe('section')
  })

  it('sépare la préparation du nom de l\'aliment', () => {
    const r = a('2 gousses d\'ail finement hachées')
    expect(r.aliment).toBe('ail')
    expect(r.preparation).toMatch(/hach/)
  })

  it('retire les alternatives entre parenthèses', () => {
    expect(a('1 oignon (ou 2 échalotes)').aliment).toBe('oignon')
  })

  it('garde le nom entier quand il contient un mot inconnu', () => {
    expect(a('400 g de tomates concassées').aliment).toMatch(/tomates/)
  })
})
