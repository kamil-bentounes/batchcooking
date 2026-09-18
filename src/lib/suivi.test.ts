/**
 * Le suivi, et la seule règle qui décide s'il est honnête : **un jour non
 * renseigné n'est pas un jour à zéro** (D33).
 *
 * L'erreur est silencieuse et elle ment TOUJOURS dans le même sens — vers le
 * bas. On croirait manquer de protéines un mois durant parce qu'on a oublié de
 * cocher deux dimanches, et on mangerait davantage pour rien.
 */
import { describe, expect, it } from 'vitest'
import { budget, joursEntre, moisEnArriere, serie } from './suivi.ts'
import type { Repas } from './suivi.ts'

const JOURS = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']
const repas = (p: Partial<Repas>): Repas => ({
  day: '2026-09-01', user_profile_id: 'moi', state: 'mange',
  kcal: 600, protein_g: 40, kcalExtra: 0, proteinExtra: 0, ...p,
})

describe('un jour non renseigné', () => {
  it('vaut null, jamais zéro', () => {
    const s = serie(JOURS, [repas({ day: '2026-09-01' })], 'moi')
    expect(s.jours.map(j => j.kcal)).toEqual([600, null, null, null])
  })

  it('ne tire pas la moyenne vers le bas', () => {
    // Un jour à 600 kcal et trois jours sans saisie font une moyenne de 600,
    // pas de 150. C'est toute la règle.
    const s = serie(JOURS, [repas({})], 'moi')
    expect(s.kcalMoyen).toBe(600)
    expect(s.renseignes).toBe(1)
    expect(s.total).toBe(4)
  })

  it('n’est pas confondu avec un repas sauté', () => {
    // Sauter un repas est une information : ce jour-là est renseigné, et il
    // compte dans la moyenne, à sa vraie valeur.
    const s = serie(JOURS, [
      repas({ day: '2026-09-01' }),
      repas({ day: '2026-09-02', state: 'saute', kcal: 0, protein_g: 0 }),
    ], 'moi')
    expect(s.jours[1].kcal, 'un repas sauté a été traité comme non renseigné').toBe(0)
    expect(s.renseignes).toBe(2)
    expect(s.kcalMoyen).toBe(300)
  })

  it('ne compte pas un repas seulement PRÉVU', () => {
    // Prévu n'est pas mangé : le dimanche soir ne renseigne pas le mercredi.
    const s = serie(JOURS, [repas({ state: 'prevu' })], 'moi')
    expect(s.jours[0].kcal).toBeNull()
    expect(s.renseignes).toBe(0)
    expect(s.kcalMoyen).toBeNull()
  })
})

describe('un repas pris HORS barquette', () => {
  /*
   * Le cas de D26 : un déjeuner au restaurant n'a pas de barquette, donc sa
   * case reste « prévue ». Exiger « mangée » revenait à ne jamais le compter —
   * c'est-à-dire à écrire la saisie, à la documenter, et à ce qu'elle ne serve
   * à rien. Ces trois tests ont échoué avant le correctif.
   */
  it('renseigne la journée, même sur une case restée « prévue »', () => {
    const s = serie(JOURS, [
      repas({ state: 'prevu', kcal: 0, protein_g: 0, kcalExtra: 900, proteinExtra: 35 }),
    ], 'moi')
    expect(s.renseignes, 'le jour est resté un trou').toBe(1)
    expect(s.jours[0].kcal).toBe(900)
    expect(s.kcalMoyen).toBe(900)
  })

  it('s’ajoute à la barquette quand les deux existent', () => {
    const s = serie(JOURS, [
      repas({ kcal: 620, protein_g: 34, kcalExtra: 180, proteinExtra: 6 }),
    ], 'moi')
    expect(s.jours[0].kcal).toBe(800)
    expect(s.jours[0].protein).toBe(40)
  })

  it('compte même si la barquette prévue n’a PAS été mangée', () => {
    // On avait prévu un dahl, on a mangé une pizza dehors : la pizza compte,
    // le dahl non.
    const s = serie(JOURS, [
      repas({ state: 'prevu', kcal: 620, protein_g: 34, kcalExtra: 850, proteinExtra: 34 }),
    ], 'moi')
    expect(s.jours[0].kcal, 'la barquette non mangée a été comptée').toBe(850)
  })
})

describe('les repas d’une journée', () => {
  it('s’additionnent', () => {
    const s = serie(JOURS, [
      repas({ kcal: 400, protein_g: 20 }),
      repas({ kcal: 700, protein_g: 45 }),
    ], 'moi')
    expect(s.jours[0].kcal).toBe(1100)
    expect(s.jours[0].protein).toBe(65)
  })

  it('ne mélangent pas deux personnes', () => {
    const s = serie(JOURS, [
      repas({ user_profile_id: 'moi', kcal: 600 }),
      repas({ user_profile_id: 'elle', kcal: 1800 }),
    ], 'moi')
    expect(s.jours[0].kcal, 'les repas de quelqu’un d’autre ont été comptés').toBe(600)
  })
})

describe('les cibles ne se lisent pas dans le même sens', () => {
  const quatreJours = [
    repas({ day: '2026-09-01', kcal: 1800, protein_g: 160 }),
    repas({ day: '2026-09-02', kcal: 2400, protein_g: 120 }),
    repas({ day: '2026-09-03', kcal: 1900, protein_g: 155 }),
  ]

  it('compte les protéines comme un PLANCHER', () => {
    const s = serie(JOURS, quatreJours, 'moi', { kcal: null, protein: 150 })
    expect(s.joursProteineTenue, '150 g atteints deux jours sur trois').toBe(2)
  })

  it('compte les calories comme un PLAFOND', () => {
    const s = serie(JOURS, quatreJours, 'moi', { kcal: 2000, protein: null })
    expect(s.joursKcalTenue, '2 000 kcal respectées deux jours sur trois').toBe(2)
  })

  it('se tait quand aucune cible n’est posée', () => {
    const s = serie(JOURS, quatreJours, 'moi')
    expect(s.joursProteineTenue).toBeNull()
    expect(s.joursKcalTenue).toBeNull()
  })

  it('ne compte les jours tenus que parmi les jours RENSEIGNÉS', () => {
    // Sinon un mois à moitié saisi afficherait « 12 jours sur 30 » et
    // ressemblerait à un échec là où il n'y a qu'une absence de données.
    const s = serie(JOURS, quatreJours, 'moi', { kcal: 5000, protein: 0 })
    expect(s.joursKcalTenue).toBe(3)
    expect(s.renseignes).toBe(3)
  })
})

describe('le budget', () => {
  const articles = [
    { est_price_eur: 6, paid_price_eur: 6.49 },
    { est_price_eur: 4, paid_price_eur: 3.99 },
    { est_price_eur: 5, paid_price_eur: null },
  ]
  /** Le total IMPRIMÉ du ticket : 10,48 € d'articles rattachés à la liste, plus
      3,20 € de sacs poubelle que le rapprochement laisse volontairement libres. */
  const TICKET = 13.68

  it('ne mélange pas le payé et l’estimé', () => {
    // Additionner les deux et appeler cela « dépensé » serait un mensonge : la
    // moitié du chiffre serait une supposition.
    const b = budget(articles, TICKET, 10, 320)
    expect(b.paye).toBe(13.68)
    expect(b.estimeRestant).toBe(5)
  })

  it('compte TOUT le ticket, pas seulement ce qui est rattaché', () => {
    // La jauge ne se remplissait que des lignes rapprochées : un ticket dont
    // cinq lignes sur douze ne sont sur aucune liste disparaissait à moitié du
    // budget, alors que l'argent est bien sorti du compte.
    expect(budget(articles, TICKET, 10, 320).paye).toBeGreaterThan(10.48)
  })

  it('ne remplit la jauge qu’avec ce qui est vraiment sorti', () => {
    expect(budget(articles, TICKET, 10, 320).part).toBeCloseTo(13.68 / 320, 4)
  })

  it('rapporte un budget MENSUEL à la période affichée', () => {
    // Sans cela, l'onglet « 3 mois » d'un foyer à 300 €/mois — donc SOUS son
    // budget de 320 € — affichait « 580 € au-dessus du budget », et l'onglet
    // « 7 jours » une jauge éternellement au quart pleine.
    const trimestre = budget([], 900, 30, 320, 91)
    expect(trimestre.plafond, 'le plafond n’a pas suivi la période').toBeCloseTo(956.6, 0)
    expect(trimestre.part, 'un foyer sous son budget est annoncé au-dessus')
      .toBeLessThan(1)

    const semaine = budget([], 70, 10, 320, 7)
    expect(semaine.plafond).toBeCloseTo(73.6, 0)
    expect(semaine.part).toBeLessThan(1)
  })

  it('ne rapporte rien quand aucun budget n’est fixé', () => {
    expect(budget([], 900, 30, null, 91).plafond).toBeNull()
  })

  it('n’a pas de jauge sans budget fixé', () => {
    // Ne pas se fixer de budget est un choix légitime : on n'en invente pas un.
    expect(budget(articles, TICKET, 10, null).part).toBeNull()
  })

  it('donne le coût d’une part', () => {
    expect(budget(articles, 10.48, 8, null).parPortion).toBe(1.31)
  })

  it('se tait plutôt que de diviser par zéro portion', () => {
    expect(budget(articles, TICKET, 0, null).parPortion).toBeNull()
  })

  it('se tait aussi quand aucun ticket n’a été enregistré', () => {
    // Zéro euro la part serait faux, là où « on ne sait pas encore » est vrai.
    const sansTicket = [{ est_price_eur: 40, paid_price_eur: null }]
    expect(budget(sansTicket, 0, 10, 320).parPortion).toBeNull()
    expect(budget(sansTicket, 0, 10, 320).paye).toBe(0)
  })
})

describe('les périodes', () => {
  it('énumère les jours, bornes comprises', () => {
    const j = joursEntre(new Date(2026, 8, 1), new Date(2026, 8, 4))
    expect(j).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'])
  })

  it('tient sur un changement de mois', () => {
    const j = joursEntre(new Date(2026, 8, 29), new Date(2026, 9, 2))
    expect(j).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
  })

  it('remonte les mois sans déborder', () => {
    // Le 31 janvier moins un mois ne doit pas retomber en mars.
    expect(moisEnArriere(1, new Date(2027, 0, 31))).toEqual(new Date(2026, 11, 1))
    expect(moisEnArriere(3, new Date(2026, 8, 18))).toEqual(new Date(2026, 5, 1))
  })
})
