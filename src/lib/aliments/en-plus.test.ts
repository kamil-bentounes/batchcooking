/**
 * « En plus » : la saisie à la main (calories ET protéines obligatoires), la quantité de nos aliments (pots, grammes,
 * quantités récentes) et l'étiquette photographiée. Tout se calcule sans base ni navigateur.
 */
import { describe, expect, it } from 'vitest'
import {
  alimentDeMemeNom, auGramme, brouillonDeLAliment, calculEnDirect, choixDeLaQuantite, depuisLaLecture, etiquetteVide, extraDeLaQuantite,
  grammesDe, libelleDeLaQuantite, lisLEtiquette, lisLaSaisieAMain, lisLesGrammes, motDeLaPastille, phraseCourteDuCalcul,
  phraseDuCalcul, pluriel, premierChampRefuse, quantiteParDefaut, quantitesRecentes, valeursDeLaQuantite,
} from './en-plus.ts'

/** Le yaourt dessert de Kamil : 76 kcal et 10 g de protéines pour 100 g, le pot pèse 125 g. */
const YAOURT = {
  id: 'a-yaourt', label: 'Yaourt nature', kcal_100g: 76, protein_100g: 10, carb_100g: 5.6, fat_100g: 1.4, fiber_100g: 0, unite: 'pot', unite_g: 125,
}
/** Des céréales : on pèse. Pour 100 g, 380 kcal et 10 g de protéines. */
const CEREALES = {
  id: 'a-cereales', label: 'Céréales', kcal_100g: 380, protein_100g: 10, carb_100g: 70, fat_100g: 5, fiber_100g: 8, unite: 'g', unite_g: 100,
}

describe('la saisie à la main', () => {
  it('quoi, calories ET protéines : tout est lu', () => {
    expect(lisLaSaisieAMain({ label: 'Tiramisu', kcal: '320', prot: '5' })).toEqual({ ok: true, valeurs: { label: 'Tiramisu', kcal: 320, proteinG: 5 } })
  })
  it('la virgule française, les espaces de trop, un zéro permis', () => {
    expect(lisLaSaisieAMain({ label: '  Carré   de chocolat ', kcal: '55', prot: '0,8' }))
      .toEqual({ ok: true, valeurs: { label: 'Carré de chocolat', kcal: 55, proteinG: 0.8 } })
    expect(lisLaSaisieAMain({ label: 'Thé', kcal: '0', prot: '0' }).ok).toBe(true)
  })
  it('une case calories vide n’est PAS 0 kcal : « Il manque les calories. »', () => {
    const r = lisLaSaisieAMain({ label: 'Tiramisu', kcal: '', prot: '5' })
    expect(r).toEqual({ ok: false, erreurs: { kcal: 'Il manque les calories.' } })
  })
  it('chaque manque a son message, sous sa case', () => {
    expect(lisLaSaisieAMain({ label: 'Tiramisu', kcal: '320', prot: '' }))
      .toEqual({ ok: false, erreurs: { prot: 'Il manque les protéines.' } })
    expect(lisLaSaisieAMain({ label: '', kcal: '', prot: '  ' })).toEqual({
      ok: false, erreurs: { label: 'Dis ce que c’est.', kcal: 'Il manque les calories.', prot: 'Il manque les protéines.' },
    })
  })
  it('un nombre illisible ou négatif est refusé, par champ', () => {
    expect(lisLaSaisieAMain({ label: 'X', kcal: 'beaucoup', prot: '5' })).toEqual({ ok: false, erreurs: { kcal: 'Je ne lis pas ce nombre.' } })
    expect(lisLaSaisieAMain({ label: 'X', kcal: '12 kcal', prot: '5' })).toEqual({ ok: false, erreurs: { kcal: 'Je ne lis pas ce nombre.' } })
    expect(lisLaSaisieAMain({ label: 'X', kcal: '320', prot: '-3' })).toEqual({ ok: false, erreurs: { prot: 'Pas de valeur négative.' } })
    expect(lisLaSaisieAMain({ label: 'X', kcal: '-1', prot: '5' })).toEqual({ ok: false, erreurs: { kcal: 'Pas de valeur négative.' } })
  })
  it('une faute de frappe énorme est refusée (5 000 kcal, 500 g de protéines)', () => {
    expect(lisLaSaisieAMain({ label: 'X', kcal: '32000', prot: '5' }).ok).toBe(false)
    expect(lisLaSaisieAMain({ label: 'X', kcal: '320', prot: '5000' }).ok).toBe(false)
    expect(lisLaSaisieAMain({ label: 'X', kcal: '5000', prot: '500' }).ok).toBe(true)
  })
  it('un nom de plus de 80 caractères est refusé', () => {
    expect(lisLaSaisieAMain({ label: 'x'.repeat(81), kcal: '1', prot: '1' })).toEqual({ ok: false, erreurs: { label: '80 caractères au plus.' } })
  })
  it('le focus va au premier champ refusé, dans l’ordre de l’écran', () => {
    expect(premierChampRefuse({ prot: 'a', kcal: 'b' })).toBe('kcal')
    expect(premierChampRefuse({ label: 'x', prot: 'a' })).toBe('label')
    expect(premierChampRefuse({})).toBeNull()
  })
})

describe('la quantité : des unités', () => {
  it('2 pots de 125 g : 250 g, 190 kcal, 25 g de protéines', () => {
    const q = { mode: 'unites', n: 2 } as const
    expect(grammesDe(YAOURT, q)).toBe(250)
    expect(valeursDeLaQuantite(YAOURT, q)).toMatchObject({ kcal: 190, protein: 25 })
    expect(phraseDuCalcul(valeursDeLaQuantite(YAOURT, q)!)).toBe('190 kcal · 25 g de protéines')
  })
  it('la ligne dit la quantité : « Yaourt nature × 2 pots »', () => {
    expect(libelleDeLaQuantite(YAOURT, { mode: 'unites', n: 2 })).toBe('Yaourt nature × 2 pots')
    expect(libelleDeLaQuantite(YAOURT, { mode: 'unites', n: 1 })).toBe('Yaourt nature × 1 pot')
  })
  it('le pluriel : pots, parts ; un mot en s ne change pas', () => {
    expect(pluriel('pot', 2)).toBe('pots')
    expect(pluriel('pot', 1)).toBe('pot')
    expect(pluriel('part', 3)).toBe('parts')
    expect(pluriel('fois', 2)).toBe('fois')
    expect(pluriel('noix', 4)).toBe('noix')
  })
  it('l’extra est une COPIE des valeurs, avec les grammes et l’aliment', () => {
    expect(extraDeLaQuantite(YAOURT, { mode: 'unites', n: 2 })).toEqual({
      label: 'Yaourt nature × 2 pots', grammes: 250, kcal: 190, proteinG: 25, carbG: 14, fatG: 3.5, fiberG: 0, alimentId: 'a-yaourt',
    })
  })
  it('le même geste pour la feuille de choix (repère), avec l’aliment', () => {
    expect(choixDeLaQuantite(YAOURT, { mode: 'unites', n: 2 })).toEqual({
      type: 'repere', label: 'Yaourt nature × 2 pots', grams: 250, kcal: 190, protein_g: 25, carb_g: 14, fat_g: 3.5, fiber_g: 0, aliment_id: 'a-yaourt',
    })
  })
  it('le nom se coupe pour que la ligne tienne en 80 caractères (la base la refuse au-delà)', () => {
    const long = { ...YAOURT, label: 'Yaourt dessert protéiné à la vanille de Madagascar et aux éclats de caramel au beurre salé' }
    const l = libelleDeLaQuantite(long, { mode: 'unites', n: 12 })
    expect(l.length).toBeLessThanOrEqual(80)
    expect(l.endsWith(' × 12 pots')).toBe(true)
  })
})

describe('la quantité : des grammes', () => {
  it('30 g de céréales : 114 kcal, 3 g de protéines', () => {
    const q = { mode: 'grammes', g: 30 } as const
    expect(valeursDeLaQuantite(CEREALES, q)).toMatchObject({ kcal: 114, protein: 3 })
    expect(phraseDuCalcul(valeursDeLaQuantite(CEREALES, q)!)).toBe('114 kcal · 3 g de protéines')
    expect(libelleDeLaQuantite(CEREALES, q)).toBe('Céréales, 30 g')
    expect(extraDeLaQuantite(CEREALES, q)).toMatchObject({ label: 'Céréales, 30 g', grammes: 30, kcal: 114, alimentId: 'a-cereales' })
  })
  it('un aliment à l’unité se pèse aussi : « ou en grammes » (125 g de yaourt = 1 pot)', () => {
    const v = valeursDeLaQuantite(YAOURT, { mode: 'grammes', g: 125 })
    expect(v).toMatchObject({ kcal: 95, protein: 12.5 })
    expect(libelleDeLaQuantite(YAOURT, { mode: 'grammes', g: 125 })).toBe('Yaourt nature, 125 g')
  })
  it('des grammes pas encore dits : pas de valeurs, et l’extra refuse', () => {
    expect(valeursDeLaQuantite(CEREALES, { mode: 'grammes', g: null })).toBeNull()
    expect(() => extraDeLaQuantite(CEREALES, { mode: 'grammes', g: null })).toThrow()
  })
  it('qui est « au gramme » : l’unité est le gramme', () => {
    expect(auGramme({ unite: 'g' })).toBe(true)
    expect(auGramme({ unite: ' Grammes ' })).toBe(true)
    expect(auGramme({ unite: 'pot' })).toBe(false)
    expect(auGramme({ unite: 'part' })).toBe(false)
  })
  it('la pastille dit « pot », ou « 100 g »', () => {
    expect(motDeLaPastille(YAOURT)).toBe('pot')
    expect(motDeLaPastille(CEREALES)).toBe('100 g')
  })
  it('des grammes tapés : lus, ou refusés par une phrase', () => {
    expect(lisLesGrammes('30')).toEqual({ g: 30 })
    expect(lisLesGrammes('12,5')).toEqual({ g: 12.5 })
    expect(lisLesGrammes('')).toEqual({ erreur: 'Dis combien, en grammes.' })
    expect(lisLesGrammes('trente')).toEqual({ erreur: 'Je ne lis pas ce nombre.' })
    expect(lisLesGrammes('-5')).toEqual({ erreur: 'Pas de valeur négative.' })
    expect(lisLesGrammes('0')).toEqual({ erreur: 'Il faut au moins 0,1 g.' })
    expect(lisLesGrammes('5001')).toEqual({ erreur: 'Pas plus de 5 000 g.' })
    expect(lisLesGrammes('5000')).toEqual({ g: 5000 })
  })
  it('l’arrondi au dixième vient AVANT le refus de zéro : « 0,04 g » s’arrondit à 0 et est refusé, avec sa phrase', () => {
    for (const s of ['0,04', '0.049', '0,01', '0,0001']) {
      expect(lisLesGrammes(s), s).toEqual({ erreur: 'Il faut au moins 0,1 g.' })
    }
    expect(lisLesGrammes('0,05')).toEqual({ g: 0.1 })
    expect(lisLesGrammes('0,1')).toEqual({ g: 0.1 })
    expect(lisLesGrammes('12,34')).toEqual({ g: 12.3 })
  })
  it('jamais un poids que la base refuserait (grams > 0) : tout ce qui passe est au moins 0,1', () => {
    for (const s of ['0,04', '0,05', '0,1', '1', '0,0', '-0']) {
      const r = lisLesGrammes(s)
      if ('g' in r) expect(r.g, s).toBeGreaterThanOrEqual(0.1)
    }
  })
})

describe('les quantités récentes', () => {
  it('les deux ou trois dernières DIFFÉRENTES, de la plus récente à la plus ancienne', () => {
    expect(quantitesRecentes([30, 30, 60, 30, 45, 100])).toEqual([30, 60, 45])
    expect(quantitesRecentes([30, 30, 60, 30, 45, 100], 2)).toEqual([30, 60])
  })
  it('des textes numériques de la base (« 30 »), arrondis au dixième', () => {
    expect(quantitesRecentes(['30', '60.0', '12.34'])).toEqual([30, 60, 12.3])
  })
  it('sans historique : rien ; ce qui n’est pas un poids est ignoré', () => {
    expect(quantitesRecentes([])).toEqual([])
    expect(quantitesRecentes([null, '', 0, -5, 'abc', 6000, 30])).toEqual([30])
  })
})

describe('par où le panneau commence', () => {
  it('à l’unité : un pot', () => {
    expect(quantiteParDefaut(YAOURT, [])).toEqual({ mode: 'unites', n: 1 })
  })
  it('à l’unité, la dernière fois étant un nombre entier de pots : le même nombre (deux yaourts)', () => {
    expect(quantiteParDefaut(YAOURT, [250, 125])).toEqual({ mode: 'unites', n: 2 })
    expect(quantiteParDefaut(YAOURT, [125])).toEqual({ mode: 'unites', n: 1 })
  })
  it('à l’unité, la dernière quantité n’étant pas un nombre entier de pots : un pot', () => {
    expect(quantiteParDefaut(YAOURT, [100, 250])).toEqual({ mode: 'unites', n: 1 })
  })
  it('au-delà de vingt pots, un pot', () => {
    expect(quantiteParDefaut(YAOURT, [125 * 21])).toEqual({ mode: 'unites', n: 1 })
  })
  it('au gramme : la dernière quantité, ou rien (la personne tape)', () => {
    expect(quantiteParDefaut(CEREALES, [30, 60])).toEqual({ mode: 'grammes', g: 30 })
    expect(quantiteParDefaut(CEREALES, [])).toEqual({ mode: 'grammes', g: null })
  })
})

describe('l’étiquette photographiée', () => {
  /* Le skyr de la maquette : 64 kcal, 9,5 g de protéines pour 100 g, un pot de 150 g, mangé entier. */
  const SKYR = depuisLaLecture({
    label: 'Skyr vanille', kcal: '64', proteines: '9,5', glucides: '6,1', lipides: '0,2', fibres: '0', poids: '150', unite: 'pot',
  })
  it('« J’en ai mangé » commence au poids lu : le pot entier', () => {
    expect(SKYR.grammes).toBe('150')
    expect(depuisLaLecture({ label: 'Skyr' }).grammes).toBe('')
  })
  it('150 g de skyr : 96 kcal, 14,3 g de protéines (« 96 kcal · 14 g prot. » dit en court)', () => {
    expect(calculEnDirect(SKYR)).toEqual({ kcal: 96, protein: 14.3 })
    expect(phraseCourteDuCalcul(calculEnDirect(SKYR)!)).toBe('96 kcal · 14,3 g prot.')
  })
  it('le calcul en direct attend les chiffres : sans calories, sans protéines ou sans grammes, rien', () => {
    expect(calculEnDirect({ ...SKYR, kcal: '' })).toBeNull()
    expect(calculEnDirect({ ...SKYR, proteines: 'x' })).toBeNull()
    expect(calculEnDirect({ ...SKYR, grammes: '' })).toBeNull()
    expect(calculEnDirect({ ...SKYR, grammes: '0' })).toBeNull()
  })
  it('on l’ajoute : l’extra porte les grammes et les valeurs calculées, l’aliment à garder porte ses valeurs pour 100 g et son unité', () => {
    const r = lisLEtiquette(SKYR)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.extra).toEqual({ label: 'Skyr vanille, 150 g', grammes: 150, kcal: 96, proteinG: 14.3, carbG: 9.2, fatG: 0.3, fiberG: 0 })
    expect(r.aliment).toMatchObject({
      label: 'Skyr vanille', kcal_100g: 64, protein_100g: 9.5, carb_100g: 6.1, fat_100g: 0.2, unite: 'pot', unite_g: 150, source: 'etiquette',
    })
  })
  it('une quantité mangée différente du pot : l’aliment garde son pot, l’extra suit les grammes', () => {
    const r = lisLEtiquette({ ...SKYR, grammes: '75' })
    expect(r.ok && r.extra.grammes).toBe(75)
    expect(r.ok && r.extra.kcal).toBe(48)
    expect(r.ok && r.aliment.unite_g).toBe(150)
  })
  it('sans poids ni unité lus : un aliment AU GRAMME, pour 100 g (on tape la quantité à chaque fois)', () => {
    const e = { ...SKYR, poidsUnite: '', unite: '', grammes: '40' }
    expect(brouillonDeLAliment(e)).toMatchObject({ unite: 'g', poids: '100' })
    const r = lisLEtiquette(e)
    expect(r.ok && r.aliment).toMatchObject({ unite: 'g', unite_g: 100 })
  })
  it('un poids lu mais pas d’unité : « pot », comme le formulaire de nos aliments', () => {
    expect(brouillonDeLAliment({ ...SKYR, unite: '' })).toMatchObject({ unite: 'pot', poids: '150' })
  })
  it('les calories ET les protéines sont exigées, avec les messages du formulaire', () => {
    const r = lisLEtiquette({ ...SKYR, kcal: '', proteines: '' })
    expect(r).toMatchObject({ ok: false, erreurs: { kcal: 'Il manque les calories.', proteines: 'Il manque les protéines.' } })
  })
  it('« J’en ai mangé » est exigé : vide, illisible, négatif ou énorme est refusé', () => {
    expect(lisLEtiquette({ ...SKYR, grammes: '' })).toMatchObject({ ok: false, erreurs: { grammes: 'Dis combien, en grammes.' } })
    expect(lisLEtiquette({ ...SKYR, grammes: 'un pot' })).toMatchObject({ ok: false, erreurs: { grammes: 'Je ne lis pas ce nombre.' } })
    expect(lisLEtiquette({ ...SKYR, grammes: '-2' })).toMatchObject({ ok: false, erreurs: { grammes: 'Pas de valeur négative.' } })
    expect(lisLEtiquette({ ...SKYR, grammes: '9000' })).toMatchObject({ ok: false, erreurs: { grammes: 'Pas plus de 5 000 g.' } })
  })
  it('un nom vide est refusé ; les bornes de la base aussi (plus de 900 kcal pour 100 g)', () => {
    expect(lisLEtiquette({ ...SKYR, label: ' ' })).toMatchObject({ ok: false, erreurs: { label: 'Donne-lui un nom.' } })
    expect(lisLEtiquette({ ...SKYR, kcal: '1200' })).toMatchObject({ ok: false, erreurs: { kcal: expect.stringContaining('900') } })
  })
  it('des calories qui ne cadrent pas avec les macros (des kJ ?) bloquent, jusqu’à confirmation', () => {
    const kj = { ...SKYR, kcal: '268' }
    expect(lisLEtiquette(kj)).toMatchObject({ ok: false, erreurs: { energie: expect.stringContaining('kJ') } })
    expect(lisLEtiquette(kj, { energieJuste: true }).ok).toBe(true)
  })
  it('l’unité et son poids ne sont jamais refusés ici : la personne ne peut pas les corriger dans cette feuille', () => {
    const base = { ...etiquetteVide(), label: 'X', kcal: '100', proteines: '5', grammes: '30' }
    /* Un poids hors des bornes : on le laisse de côté (aliment au gramme), on ne refuse pas sans rien dire. */
    const r = lisLEtiquette({ ...base, poidsUnite: '99999', unite: 'pot' })
    expect(r.ok).toBe(true)
    expect(r.ok && r.aliment).toMatchObject({ unite: 'g', unite_g: 100 })
    /* Une unité trop longue : « pot », avec le poids lu. */
    const r2 = lisLEtiquette({ ...base, poidsUnite: '125', unite: 'x'.repeat(40) })
    expect(r2.ok).toBe(true)
    expect(r2.ok && r2.aliment).toMatchObject({ unite: 'pot', unite_g: 125 })
    /* Jamais un refus sans phrase : quand ça ne passe pas, une phrase au moins est dite. */
    for (const poidsUnite of ['0', '-3', 'abc', '99999', '']) {
      const x = lisLEtiquette({ ...base, poidsUnite, unite: 'x'.repeat(40) })
      expect(x.ok || Object.keys(x.erreurs).length > 0, poidsUnite).toBe(true)
    }
  })
})

describe('un nom déjà pris dans nos aliments', () => {
  const liste = [YAOURT, CEREALES, { id: 'a-skyr', label: 'Skyr Danone' }]
  it('se retrouve comme la base compare : accents, casse, apostrophes et espaces ne comptent pas', () => {
    expect(alimentDeMemeNom(liste, 'Céréales')?.id).toBe('a-cereales')
    expect(alimentDeMemeNom(liste, '  CEREALES ')?.id).toBe('a-cereales')
    expect(alimentDeMemeNom(liste, 'yaourt   nature')?.id).toBe('a-yaourt')
    expect(alimentDeMemeNom([{ id: 'x', label: 'L’œuf dur' }], 'L\'œuf dur')?.id).toBe('x')
  })
  it('un autre nom, ou un nom vide, ne trouve rien', () => {
    expect(alimentDeMemeNom(liste, 'Yaourt grec')).toBeNull()
    expect(alimentDeMemeNom(liste, '   ')).toBeNull()
    expect(alimentDeMemeNom([], 'Céréales')).toBeNull()
  })
})
