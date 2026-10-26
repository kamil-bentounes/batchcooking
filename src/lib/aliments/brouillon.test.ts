/**
 * Les champs d'un aliment : lus, bornés comme la base le fait (0124), avec une phrase par champ refusé.
 */
import { describe, expect, it } from 'vitest'
import {
  brouillonVide, codeAChercher, depuisLaBase, douteSurLEnergie, empreinteDesValeurs, energieAttendue, lis, lisLeNombre,
  phraseDeLEcriture, phraseDuDoute,
} from './brouillon.ts'
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
        unite: 'pot', unite_g: 125, code_barres: null, remplace_repere: null, source: 'main',
      },
    })
  })

  it('glucides, lipides et fibres vides valent zéro ; kcal et protéines sont exigées', () => {
    const ok = lis(yaourt({ glucides: '', lipides: '', fibres: '', kcal: '40' }))
    expect(ok.ok && [ok.valeurs.carb_100g, ok.valeurs.fat_100g, ok.valeurs.fiber_100g]).toEqual([0, 0, 0])
    expect(refus({ kcal: '' }).kcal).toBe('Il manque les calories.')
    expect(refus({ proteines: '' }).proteines).toBe('Il manque les protéines.')
  })

  it('zéro est une vraie valeur (de l’eau : 0 kcal, 0 g)', () => {
    expect(lis(yaourt({ kcal: '0', proteines: '0', glucides: '0', lipides: '0' })).ok).toBe(true)
  })

  it('le repère remplacé est celui qu’on a choisi, ou rien', () => {
    const r = lis(yaourt({ remplaceRepere: ' Yaourt ' }))
    expect(r.ok && r.valeurs.remplace_repere).toBe('Yaourt')
    const sans = lis(yaourt({ remplaceRepere: '' }))
    expect(sans.ok && sans.valeurs.remplace_repere).toBeNull()
  })

  it('les blancs de trop du nom (espaces doubles, tabulation) sont réduits, comme la base les compare', () => {
    const r = lis(yaourt({ label: ' Crème \t  brûlée ' }))
    expect(r.ok && r.valeurs.label).toBe('Crème brûlée')
  })

  it('le nom est rogné, la provenance et le code-barres sont gardés (espaces ôtés)', () => {
    const r = lis(yaourt({ label: '  Skyr  ', source: 'code_barres', codeBarres: '3033 4900 04743' }))
    expect(r.ok && r.valeurs).toMatchObject({ label: 'Skyr', source: 'code_barres', code_barres: '3033490004743' })
  })
})

describe('les refus, une phrase par champ', () => {
  it('le nom', () => {
    expect(refus({ label: '   ' }).label).toBe('Donne-lui un nom.')
    expect(refus({ label: '\t\u00a0 ' }).label, 'des blancs seulement (tabulation, insécable)').toBe('Donne-lui un nom.')
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

  it('le code-barres : 8, 12, 13 ou 14 chiffres, la clé juste — ou rien', () => {
    expect(refus({ codeBarres: '12345' }).codeBarres).toBe('Un code-barres a 8, 12, 13 ou 14 chiffres.')
    expect(refus({ codeBarres: '1234567890' }).codeBarres, '10 chiffres : la base le refuserait').toBe('Un code-barres a 8, 12, 13 ou 14 chiffres.')
    expect(refus({ codeBarres: '3033490004744' }).codeBarres).toMatch(/un chiffre doit être faux/)
    expect(lis(yaourt({ codeBarres: '' })).ok).toBe(true)
    for (const bon of ['96385074', '036000291452', '3033490004743', '03033490004743']) {
      expect(lis(yaourt({ codeBarres: bon })).ok, bon).toBe(true)
    }
  })

  it('un code déjà rangé avec l’aliment n’est pas revérifié (sa clé), tant qu’on n’y touche pas', () => {
    expect(lis(yaourt({ codeBarres: '3033490004744' }), { codeDejaRange: '3033490004744' }).ok).toBe(true)
    expect(lis(yaourt({ codeBarres: '3033490004745' }), { codeDejaRange: '3033490004744' }).ok).toBe(false)
    expect(lis(yaourt({ codeBarres: '12345' }), { codeDejaRange: '12345' }).ok, 'mais la longueur reste exigée').toBe(false)
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
      unite: 'pot', unite_g: 140, code_barres: '3033490004743', remplace_repere: 'Skyr ou fromage blanc', source: 'code_barres',
    })
    expect(b).toEqual({
      label: 'Skyr Danone', kcal: '57', proteines: '10', glucides: '3,9', lipides: '0,2', fibres: '0',
      unite: 'pot', poids: '140', codeBarres: '3033490004743', remplaceRepere: 'Skyr ou fromage blanc', source: 'code_barres',
    })
  })

  it('et se relit à l’identique : lire ce qu’on vient de ranger redonne les mêmes valeurs', () => {
    const base = { label: 'Pain', kcal_100g: 265, protein_100g: 9, carb_100g: 49, fat_100g: 3.2, fiber_100g: 2.7, unite: 'tranche', unite_g: 30, code_barres: null, remplace_repere: null, source: 'main' }
    const r = lis(depuisLaBase(base))
    expect(r.ok && r.valeurs).toEqual(base)
  })

  it('une provenance inconnue retombe sur « main »', () => {
    expect(depuisLaBase({ label: 'x', kcal_100g: 1, protein_100g: 0, carb_100g: 0, fat_100g: 0, fiber_100g: 0, unite: 'u', unite_g: 1, code_barres: null, source: '???' }).source).toBe('main')
  })
})

describe('des calories qui ne cadrent pas avec les macros (des kJ pris pour des kcal)', () => {
  const doute = (o: Partial<Brouillon>) => douteSurLEnergie(yaourt(o))

  it('l’énergie attendue : 4 par g de protéines et de glucides, 9 de lipides, 2 de fibres', () => {
    expect(energieAttendue(10, 5.6, 1.4, 0)).toBeCloseTo(75, 5)
    expect(energieAttendue(0, 0, 100, 0)).toBe(900)
    expect(energieAttendue(10, 20, 5, 3)).toBe(171)
  })

  it('le yaourt de la maquette (76 kcal pour 75 attendues) ne doute de rien', () => {
    expect(doute({})).toBeNull()
  })

  it('318 pour 100 g avec ces macros : des kJ ? 318 kJ = 76 kcal — la phrase de la consigne, mot pour mot', () => {
    const d = doute({ kcal: '318' })!
    expect(d).toMatchObject({ kcal: 318, trop: true, enKcal: 76 })
    expect(d.attendue).toBeCloseTo(75, 5)
    expect(phraseDuDoute(d)).toBe('318 kcal pour 100 g, c’est beaucoup pour ces macros : ce serait des kJ ? 318 kJ = 76 kcal.')
  })

  it('les bornes sont [0,6 ; 1,5] fois l’attendu : 45 et 112,5 passent, 44 et 113 non', () => {
    // Attendu : 75 kcal.
    expect(doute({ kcal: '45' })).toBeNull()
    expect(doute({ kcal: '112,5' })).toBeNull()
    expect(doute({ kcal: '44' })).toMatchObject({ trop: false, enKcal: null })
    expect(doute({ kcal: '113' })).toMatchObject({ trop: true })
  })

  it('trop peu : une phrase qui dit l’attendu, sans proposer de kJ', () => {
    const d = doute({ kcal: '30' })!
    expect(d).toMatchObject({ trop: false, enKcal: null })
    expect(phraseDuDoute(d)).toBe('30 kcal pour 100 g, c’est peu pour ces macros (elles font environ 75 kcal) : un chiffre est-il faux ?')
  })

  it('trop, mais les kJ ne cadrent pas non plus : pas de correction proposée', () => {
    const d = doute({ kcal: '800' })!
    expect(d).toMatchObject({ trop: true, enKcal: null })
    expect(phraseDuDoute(d)).toBe('800 kcal pour 100 g, c’est beaucoup pour ces macros (elles font environ 75 kcal) : un chiffre est-il faux ?')
  })

  it('l’eau, le café, tout ce qui attend 20 kcal ou moins : rien à comparer', () => {
    expect(doute({ kcal: '200', proteines: '2', glucides: '2', lipides: '0' })).toBeNull() // 16 attendues
    expect(doute({ kcal: '30', proteines: '1', glucides: '1', lipides: '1' })).toBeNull() // 17
  })

  it('les fibres comptent pour 2 kcal le gramme', () => {
    // 4×1 + 4×1 + 9×0 + 2×10 = 28 attendues : 60 kcal, c'est trop ; 28, non.
    expect(doute({ kcal: '60', proteines: '1', glucides: '1', lipides: '0', fibres: '10' })).toMatchObject({ trop: true })
    expect(doute({ kcal: '28', proteines: '1', glucides: '1', lipides: '0', fibres: '10' })).toBeNull()
  })

  it('glucides ou lipides absents : l’attendu n’est qu’un minimum — « trop » ne prouve rien, « trop peu » si', () => {
    expect(doute({ kcal: '318', glucides: '', lipides: '' }), '318 kcal avec 10 g de protéines et le reste inconnu').toBeNull()
    expect(doute({ kcal: '318', lipides: '' })).toBeNull()
    expect(doute({ kcal: '20', glucides: '', lipides: '' }), '20 kcal pour 10 g de protéines (40 kcal au moins)').toMatchObject({ trop: false })
  })

  it('un champ illisible ou négatif n’a pas de doute à porter : il a déjà son erreur', () => {
    expect(doute({ proteines: 'dix', kcal: '318' })).toBeNull()
    expect(doute({ kcal: '-3' })).toBeNull()
    expect(doute({ kcal: '' })).toBeNull()
    expect(doute({ proteines: '' })).toBeNull()
  })

  it('`lis` refuse tant que les valeurs ne sont pas dites justes, et le dit dans `energie`', () => {
    const r = lis(yaourt({ kcal: '318' }))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erreurs.energie).toBe('318 kcal pour 100 g, c’est beaucoup pour ces macros : ce serait des kJ ? 318 kJ = 76 kcal.')
    expect(!r.ok && Object.keys(r.erreurs)).toEqual(['energie'])
  })

  it('« Les valeurs sont justes » laisse passer, avec les chiffres tels quels', () => {
    const r = lis(yaourt({ kcal: '318' }), { energieJuste: true })
    expect(r.ok && r.valeurs.kcal_100g).toBe(318)
  })

  it('corriger en 76 kcal redonne un aliment qui passe sans confirmation', () => {
    const d = douteSurLEnergie(yaourt({ kcal: '318' }))!
    expect(lis(yaourt({ kcal: String(d.enKcal) })).ok).toBe(true)
  })

  it('les trois chemins remplissent les mêmes champs, donc passent par le même contrôle', () => {
    /* À la main, étiquette (`champsDeLEtiquette`) et Open Food Facts (`lisLaReponse`) écrivent dans `Brouillon` : le
       contrôle lit le `Brouillon`, jamais la provenance. */
    for (const source of ['main', 'etiquette', 'code_barres'] as const) {
      expect(lis(yaourt({ kcal: '318', source })).ok, source).toBe(false)
    }
  })

  it('une erreur de champ (900 kcal dépassés) passe avant le doute : une seule chose à corriger à la fois', () => {
    const r = lis(yaourt({ kcal: '1050' }))
    expect(!r.ok && Object.keys(r.erreurs)).toEqual(['kcal'])
  })

  it('l’empreinte des valeurs change dès qu’un des cinq chiffres change (la confirmation ne survit pas)', () => {
    const base = empreinteDesValeurs(yaourt({ kcal: '318' }))
    expect(empreinteDesValeurs(yaourt({ kcal: '318 ' }))).toBe(base)
    for (const o of [{ kcal: '319' }, { proteines: '11' }, { glucides: '5' }, { lipides: '2' }, { fibres: '1' }]) {
      expect(empreinteDesValeurs(yaourt({ kcal: '318', ...o })), JSON.stringify(o)).not.toBe(base)
    }
    expect(empreinteDesValeurs(yaourt({ kcal: '318', label: 'Autre', poids: '200' })), 'le nom et le poids ne comptent pas').toBe(base)
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
  })

  it('une ligne retirée entre-temps (« Cannot coerce… ») se dit en français', () => {
    const anglais = 'Cannot coerce the result to a single JSON object'
    expect(phraseDeLEcriture(anglais)).toBe('Cet aliment a été retiré entre-temps.')
    expect(phraseDeLEcriture('JSON object requested, multiple (or no) rows returned')).toBe('Cet aliment a été retiré entre-temps.')
  })

  it('TOUTES les contraintes de la table ont leur phrase française : jamais le nom d’un index, jamais de l’anglais', () => {
    const noms = [
      'aliment_label_unique', 'aliment_code_barres_unique', 'aliment_label_check', 'aliment_kcal_100g_check',
      'aliment_protein_100g_check', 'aliment_carb_100g_check', 'aliment_fat_100g_check', 'aliment_fiber_100g_check',
      'aliment_macros_plausibles', 'aliment_unite_g_check', 'aliment_unite_check', 'aliment_code_barres_check',
      'aliment_remplace_repere_check', 'aliment_source_check',
    ]
    const phrases = new Set<string>()
    for (const nom of noms) {
      const message = `new row for relation "aliment" violates check constraint "${nom}"`
      const phrase = phraseDeLEcriture(message)
      expect(phrase, nom).not.toContain('aliment_')
      expect(phrase, nom).not.toMatch(/violates|constraint|relation|row/i)
      expect(phrase, nom).toMatch(/[éèàêô’]|^[A-Z]/)
      phrases.add(phrase)
    }
    /* Une phrase par contrainte (aucune n'en masque une autre). */
    expect(phrases.size).toBe(noms.length - 0)
  })

  it('une panne inconnue, en anglais, devient une phrase neutre ; une panne de réseau garde la sienne', () => {
    expect(phraseDeLEcriture('permission denied for table aliment')).toBe('L’enregistrement a échoué : réessaie dans un instant.')
    expect(phraseDeLEcriture('TypeError: Failed to fetch')).toMatch(/Pas de réseau/)
    expect(phraseDeLEcriture('new row violates row-level security policy for table "aliment"')).toMatch(/reconnecte-toi/)
  })
})
