/**
 * La lecture d'une réponse Open Food Facts. L'exemple est une VRAIE réponse, enregistrée le 26/10/2026
 * (`fixtures/off-skyr-danone.json` : le Skyr de Danone, code 3033490004743) ; l'« introuvable » aussi
 * (`fixtures/off-introuvable.json`). Aucun test n'appelle le réseau : `cherche` reçoit un faux `fetch`.
 */
import { describe, expect, it, vi } from 'vitest'
import skyr from './fixtures/off-skyr-danone.json'
import introuvable from './fixtures/off-introuvable.json'
import { cherche, codeBarresValide, ErreurOpenFoodFacts, lisLaReponse, urlDuProduit } from './openfoodfacts.ts'

describe('la vraie réponse du Skyr de Danone', () => {
  it('donne le nom avec sa marque, les valeurs pour 100 g et le poids de la portion', () => {
    const l = lisLaReponse(skyr)
    expect(l).toEqual({
      etat: 'ok',
      produit: { label: 'Skyr Danone', kcal: 57, protein: 10, carb: 3.9, fat: 0.2, fiber: 0, uniteG: 140 },
    })
  })

  it('les kcal sont celles de `energy-kcal_100g`, pas les kJ de `energy_100g` (243,7)', () => {
    const l = lisLaReponse(skyr)
    expect(l.etat === 'ok' && l.produit.kcal).toBe(57)
  })

  it('un produit que la base ne connaît pas : « introuvable »', () => {
    expect(lisLaReponse(introuvable)).toEqual({ etat: 'introuvable' })
  })
})

describe('les réponses moins nettes', () => {
  const produit = (p: object) => ({ status: 1, product: p })

  it('sans kcal mais avec des kJ : convertis (243,7 kJ → 58 kcal)', () => {
    const l = lisLaReponse(produit({ product_name: 'Sans kcal', nutriments: { 'energy-kj_100g': 243.7, proteins_100g: 10 } }))
    expect(l.etat === 'ok' && l.produit.kcal).toBe(58)
  })

  it('`energy_100g` seul est en kJ aussi', () => {
    const l = lisLaReponse(produit({ product_name: 'x', nutriments: { energy_100g: 418.4 } }))
    expect(l.etat === 'ok' && l.produit.kcal).toBe(100)
  })

  it('ni kcal ni kJ : connu, mais rien à remplir', () => {
    expect(lisLaReponse(produit({ product_name: 'Vide', nutriments: { proteins_100g: 10 } }))).toEqual({ etat: 'sans_valeurs', label: 'Vide' })
    expect(lisLaReponse(produit({ product_name: 'Rien' }))).toEqual({ etat: 'sans_valeurs', label: 'Rien' })
  })

  it('des nombres en texte (« 125 », « 5,6 ») sont lus', () => {
    const l = lisLaReponse(produit({
      product_name: 'Texte', serving_quantity: '125', nutriments: { 'energy-kcal_100g': '76', proteins_100g: '10', carbohydrates_100g: '5,6' },
    }))
    expect(l.etat === 'ok' && l.produit).toMatchObject({ kcal: 76, protein: 10, carb: 5.6, uniteG: 125 })
  })

  it('pas de portion annoncée : le poids de l’unité reste à dire (`null`), il n’est pas inventé', () => {
    const l = lisLaReponse(produit({ product_name: 'Sans portion', quantity: '500 g', nutriments: { 'energy-kcal_100g': 76, proteins_100g: 10 } }))
    expect(l.etat === 'ok' && l.produit.uniteG).toBeNull()
  })

  it('des chiffres qui ne tiennent pas (1 200 kcal, ou 130 g de macros) : incohérent, rien n’est repris', () => {
    expect(lisLaReponse(produit({ product_name: 'Faux', nutriments: { 'energy-kcal_100g': 1200 } }))).toEqual({ etat: 'incoherent', label: 'Faux' })
    expect(lisLaReponse(produit({ product_name: 'Faux', nutriments: { 'energy-kcal_100g': 400, proteins_100g: 60, carbohydrates_100g: 60, fat_100g: 10 } })).etat).toBe('incoherent')
  })

  it('la marque n’est pas répétée quand le nom la dit déjà, et seule la première est gardée', () => {
    const a = lisLaReponse(produit({ product_name: 'Skyr Danone nature', brands: 'Danone,Autre', nutriments: { 'energy-kcal_100g': 57 } }))
    expect(a.etat === 'ok' && a.produit.label).toBe('Skyr Danone nature')
    const b = lisLaReponse(produit({ product_name: 'Skyr', brands: 'Marque A,Marque B', nutriments: { 'energy-kcal_100g': 57 } }))
    expect(b.etat === 'ok' && b.produit.label).toBe('Skyr Marque A')
  })

  it('ne lève jamais, même sur n’importe quoi', () => {
    for (const x of [null, undefined, 42, 'texte', [], {}, { product: 'non' }, { status: 1, product: { nutriments: 3 } }]) {
      expect(() => lisLaReponse(x)).not.toThrow()
    }
    expect(lisLaReponse(null)).toEqual({ etat: 'introuvable' })
  })
})

describe('le code-barres', () => {
  it('reconnaît un vrai code (clé GS1 juste) : EAN-13, EAN-8, UPC-A', () => {
    expect(codeBarresValide('3033490004743')).toBe(true) // le Skyr de la fixture
    expect(codeBarresValide('96385074')).toBe(true) // EAN-8
    expect(codeBarresValide('036000291452')).toBe(true) // UPC-A
  })

  it('refuse un chiffre faux, une mauvaise longueur, des lettres', () => {
    expect(codeBarresValide('3033490004744')).toBe(false)
    expect(codeBarresValide('303349000474')).toBe(false)
    expect(codeBarresValide('30334900047AB')).toBe(false)
    expect(codeBarresValide('')).toBe(false)
  })

  it('l’adresse interrogée porte le code, et seulement les champs utiles', () => {
    const u = urlDuProduit('3033490004743')
    expect(u).toMatch(/^https:\/\/world\.openfoodfacts\.org\/api\/v2\/product\/3033490004743\.json\?fields=/)
    expect(u).toContain('serving_quantity')
    expect(u).toContain('nutriments')
  })
})

describe('l’appel (avec un faux fetch : aucun réseau)', () => {
  const reponse = (corps: unknown, statut = 200) => vi.fn(async () => new Response(JSON.stringify(corps), { status: statut })) as unknown as typeof fetch

  it('lit la vraie réponse du Skyr', async () => {
    const lit = reponse(skyr)
    const l = await cherche('3033490004743', lit)
    expect(l.etat).toBe('ok')
    expect(lit).toHaveBeenCalledTimes(1)
    expect((lit as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(urlDuProduit('3033490004743'))
  })

  it('un code faux n’appelle même pas Open Food Facts', async () => {
    const lit = reponse(skyr)
    await expect(cherche('3033490004744', lit)).rejects.toThrow(/ne ressemble pas à un code-barres/)
    expect(lit).not.toHaveBeenCalled()
  })

  it('un produit inconnu (corps « product not found », ou 404)', async () => {
    expect(await cherche('3033491267499', reponse(introuvable))).toEqual({ etat: 'introuvable' })
    expect(await cherche('3033491267499', reponse({}, 404))).toEqual({ etat: 'introuvable' })
  })

  it('une panne se dit en français, jamais « Failed to fetch »', async () => {
    const coupe = vi.fn(async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    await expect(cherche('3033490004743', coupe)).rejects.toThrow(/ne répond pas/)
    await expect(cherche('3033490004743', reponse({}, 503))).rejects.toThrow(/indisponible/)
    await expect(cherche('3033490004743', reponse({}, 429))).rejects.toBeInstanceOf(ErreurOpenFoodFacts)
    const illisible = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    await expect(cherche('3033490004743', illisible)).rejects.toThrow(/illisible/)
  })
})
