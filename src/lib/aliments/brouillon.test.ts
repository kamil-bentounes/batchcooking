/**
 * Les champs d'un aliment : lus, bornés comme la base le fait (0124), avec une phrase par champ refusé.
 */
import { describe, expect, it } from 'vitest'
import { brouillonVide, codeAChercher, depuisLaBase, lis, lisLeNombre, phraseDeLEcriture } from './brouillon.ts'
import type { Brouillon } from './brouillon.ts'

const yaourt = (o: Partial<Brouillon> = {}): Brouillon => ({
  ...brouillonVide(), label: 'Yaourt dessert protéiné', kcal: '76', proteines: '10', glucides: '5,6', lipides: '1,4', poids: '125', ...o,
})
const refus = (o: Partial<Brouillon>) => {
  const r = lis(yaourt(o))
  if (r.ok) throw new Error('aurait dû être refusé')
  return r.erreurs
}

describe('lire un nombre tapé', () => {
  it('à la française ou à l’anglaise, avec ou sans espaces', () => {
    expect(lisLeNombre('5,6')).toBe(5.6)
    expect(lisLeNombre('5.6')).toBe(5.6)
    expect(lisLeNombre(' 1 250 ')).toBe(1250)
    expect(lisLeNombre('0')).toBe(0)
  })
  it('vide : null ; illisible : NaN', () => {
    expect(lisLeNombre('')).toBeNull()
    expect(lisLeNombre('   ')).toBeNull()
    expect(lisLeNombre('douze')).toBeNaN()
    expect(lisLeNombre('1,2,3')).toBeNaN()
    expect(lisLeNombre('12 g')).toBeNaN()
  })
})

describe('un aliment complet', () => {
  it('le yaourt de la maquette : les valeurs à écrire', () => {
    const r = lis(yaourt())
    expect(r).toEqual({
      ok: true,
      valeurs: {
        label: 'Yaourt dessert protéiné', kcal_100g: 76, protein_100g: 10, carb_100g: 5.6, fat_100g: 1.4, fiber_100g: 0,
        unite: 'pot', unite_g: 125, code_barres: null, source: 'main',
      },
    })
  })

  it('glucides, lipides et fibres vides valent zéro ; kcal et protéines sont exigées', () => {
    const ok = lis(yaourt({ glucides: '', lipides: '', fibres: '' }))
    expect(ok.ok && [ok.valeurs.carb_100g, ok.valeurs.fat_100g, ok.valeurs.fiber_100g]).toEqual([0, 0, 0])
    expect(refus({ kcal: '' }).kcal).toBe('Il manque les calories.')
    expect(refus({ proteines: '' }).proteines).toBe('Il manque les protéines.')
  })

  it('zéro est une vraie valeur (de l’eau : 0 kcal, 0 g)', () => {
    expect(lis(yaourt({ kcal: '0', proteines: '0', glucides: '0', lipides: '0' })).ok).toBe(true)
  })

  it('le nom est rogné, la provenance et le code-barres sont gardés (espaces ôtés)', () => {
    const r = lis(yaourt({ label: '  Skyr  ', source: 'code_barres', codeBarres: '3033 4900 04743' }))
    expect(r.ok && r.valeurs).toMatchObject({ label: 'Skyr', source: 'code_barres', code_barres: '3033490004743' })
  })
})

describe('les refus, une phrase par champ', () => {
  it('le nom', () => {
    expect(refus({ label: '   ' }).label).toBe('Donne-lui un nom.')
    expect(refus({ label: 'x'.repeat(81) }).label).toBe('80 caractères au plus.')
  })

  it('les calories : pas au-delà de 900 pour 100 g — des kJ pris pour des kcal', () => {
    expect(refus({ kcal: '1050' }).kcal).toMatch(/kJ/)
    expect(refus({ kcal: '-5' }).kcal).toBe('Pas de valeur négative.')
    expect(refus({ kcal: 'beaucoup' }).kcal).toBe('Je ne lis pas ce nombre.')
    expect(lis(yaourt({ kcal: '900', proteines: '0', glucides: '0', lipides: '100' })).ok).toBe(true)
  })

  it('les macros : pas plus de 100 g chacune, ni 105 g à elles trois', () => {
    expect(refus({ proteines: '101' }).proteines).toBe('Pas plus de 100 g pour 100 g.')
    expect(refus({ fibres: '120' }).fibres).toBe('Pas plus de 100 g pour 100 g.')
    expect(refus({ proteines: '50', glucides: '50', lipides: '10' }).macros).toMatch(/plus de 100 g pour 100 g/)
  })

  it('le poids de l’unité : requis, entre 1 g et 5 kg', () => {
    expect(refus({ poids: '' }).poids).toBe('Dis combien pèse 1 pot.')
    expect(refus({ poids: '', unite: 'part' }).poids).toBe('Dis combien pèse 1 part.')
    expect(refus({ poids: '0' }).poids).toBe('Au moins 1 g.')
    expect(refus({ poids: '5001' }).poids).toBe('Pas plus de 5 000 g.')
    expect(refus({ poids: 'lourd' }).poids).toBe('Je ne lis pas ce nombre.')
  })

  it('le nom de l’unité', () => {
    expect(refus({ unite: ' ' }).unite).toMatch(/Donne un nom à l’unité/)
    expect(refus({ unite: 'x'.repeat(21) }).unite).toBe('20 caractères au plus.')
  })

  it('le code-barres : 8 à 14 chiffres, ou rien', () => {
    expect(refus({ codeBarres: '12345' }).codeBarres).toBe('Un code-barres a de 8 à 14 chiffres.')
    expect(lis(yaourt({ codeBarres: '' })).ok).toBe(true)
  })

  it('plusieurs refus d’un coup : un par champ, tous donnés', () => {
    const e = refus({ label: '', kcal: '', poids: '0' })
    expect(Object.keys(e).sort()).toEqual(['kcal', 'label', 'poids'])
  })
})

describe('un aliment déjà rangé', () => {
  it('revient dans les champs, virgule française, zéros écrits', () => {
    const b = depuisLaBase({
      label: 'Skyr Danone', kcal_100g: 57, protein_100g: 10, carb_100g: '3.9', fat_100g: 0.2, fiber_100g: 0,
      unite: 'pot', unite_g: 140, code_barres: '3033490004743', source: 'code_barres',
    })
    expect(b).toEqual({
      label: 'Skyr Danone', kcal: '57', proteines: '10', glucides: '3,9', lipides: '0,2', fibres: '0',
      unite: 'pot', poids: '140', codeBarres: '3033490004743', source: 'code_barres',
    })
  })

  it('et se relit à l’identique : lire ce qu’on vient de ranger redonne les mêmes valeurs', () => {
    const base = { label: 'Pain', kcal_100g: 265, protein_100g: 9, carb_100g: 49, fat_100g: 3.2, fiber_100g: 2.7, unite: 'tranche', unite_g: 30, code_barres: null, source: 'main' }
    const r = lis(depuisLaBase(base))
    expect(r.ok && r.valeurs).toEqual(base)
  })

  it('une provenance inconnue retombe sur « main »', () => {
    expect(depuisLaBase({ label: 'x', kcal_100g: 1, protein_100g: 0, carb_100g: 0, fat_100g: 0, fiber_100g: 0, unite: 'u', unite_g: 1, code_barres: null, source: '???' }).source).toBe('main')
  })
})

describe('le code à chercher et les pannes d’écriture', () => {
  it('ôte les espaces et dit si la clé est juste', () => {
    expect(codeAChercher('3033 4900 04743')).toEqual({ code: '3033490004743', valide: true })
    expect(codeAChercher('3033490004744').valide).toBe(false)
  })

  it('une contrainte de la base devient une phrase', () => {
    expect(phraseDeLEcriture('duplicate key value violates unique constraint "aliment_label_unique"')).toMatch(/porte déjà ce nom/)
    expect(phraseDeLEcriture('duplicate key … "aliment_code_barres_unique"')).toMatch(/code-barres est déjà/)
    expect(phraseDeLEcriture('autre chose')).toBe('autre chose')
  })
})
