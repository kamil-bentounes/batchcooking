/**
 * Les phrases du hub, sans base ni navigateur. Le mercredi 21 octobre 2026 à 10 h.
 */
import { describe, expect, it } from 'vitest'
import type { Case } from './donnees/barquettes.ts'
import {
  barreDuBudget, ceQuiVient, joursAvantLArrivee, momentDePeremption, noteDuPlat, pastilleASortir,
  pastilleDeSuite, pastilleDuCompteARebours, phraseDeLaSemaine, quandAujourdhui, quandDuRepas,
} from './hub.ts'

const MAINTENANT = new Date(2026, 9, 21, 10, 0, 0)

describe('phraseDeLaSemaine', () => {
  it('le geste, le compte, et ce qui est au frigo', () => {
    expect(phraseDeLaSemaine('La semaine tourne', [...Array(8).fill('frigo'), ...Array(22).fill('congelateur')]))
      .toBe('La semaine tourne : 30 barquettes, dont 8 au frigo.')
  })
  it('aucune, toutes au frigo, aucune au frigo, une seule', () => {
    expect(phraseDeLaSemaine('Rien de prévu', [])).toBe('Rien de prévu : aucune barquette.')
    expect(phraseDeLaSemaine('Tout est là', ['frigo', 'frigo'])).toBe('Tout est là : 2 barquettes, toutes au frigo.')
    expect(phraseDeLaSemaine('X', ['congelateur', 'congelateur'])).toBe('X : 2 barquettes, aucune au frigo.')
    expect(phraseDeLaSemaine('X', ['frigo'])).toBe('X : 1 barquette, au frigo.')
    expect(phraseDeLaSemaine('X', ['congelateur'])).toBe('X : 1 barquette, au congélateur.')
  })
})

describe('le moment d’un repas', () => {
  it('aujourd’hui : « Ce midi et ce soir », dans l’ordre de la journée', () => {
    expect(quandAujourdhui(['diner', 'dejeuner'])).toBe('Ce midi et ce soir')
    expect(quandAujourdhui(['diner'])).toBe('Ce soir')
  })
  it('demain, la semaine, au-delà', () => {
    expect(quandDuRepas('2026-10-22', ['dejeuner'], MAINTENANT)).toBe('Demain midi')
    expect(quandDuRepas('2026-10-22', ['diner', 'dejeuner'], MAINTENANT)).toBe('Demain, midi et soir')
    expect(quandDuRepas('2026-10-23', ['dejeuner', 'diner'], MAINTENANT)).toBe('Vendredi, midi et soir')
    expect(quandDuRepas('2026-10-30', ['dejeuner'], MAINTENANT)).toBe('Vendredi 30 midi')
    expect(quandDuRepas('2026-10-21', ['diner'], MAINTENANT)).toBe('Ce soir')
  })
})

describe('pastilleASortir', () => {
  it('le jour d’avant, nommé', () => {
    expect(pastilleASortir('2026-10-23', 'dejeuner', MAINTENANT)).toBe('à sortir jeudi')
    expect(pastilleASortir('2026-10-24', 'diner', MAINTENANT)).toBe('à sortir vendredi')
  })
  it('demain : dès l’heure où la part peut sortir, ou maintenant', () => {
    expect(pastilleASortir('2026-10-22', 'diner', MAINTENANT)).toBe('à sortir dès 19 h')
    expect(pastilleASortir('2026-10-22', 'dejeuner', new Date(2026, 9, 21, 13, 0))).toBe('à sortir maintenant')
  })
  it('aujourd’hui : maintenant', () => {
    expect(pastilleASortir('2026-10-21', 'diner', MAINTENANT)).toBe('à sortir maintenant')
  })
})

const cas = (id: string, day: string, meal: string, label: string, location = 'frigo', qui = 'u1', state = 'prevu') =>
  ({ id, day, meal, state, user_profile_id: qui,
     portion: { id: `p-${id}`, label, recipe_id: `r-${label}`, location }, extras: [] }) as unknown as Case

describe('ceQuiVient', () => {
  const semaine = [
    cas('1', '2026-10-21', 'dejeuner', 'Lasagnes'), cas('2', '2026-10-21', 'diner', 'Lasagnes'),
    cas('3', '2026-10-22', 'dejeuner', 'Lasagnes'), cas('4', '2026-10-22', 'diner', 'Pizza'),
    cas('5', '2026-10-23', 'dejeuner', 'Wraps', 'congelateur'), cas('6', '2026-10-23', 'diner', 'Wraps', 'congelateur'),
    cas('7', '2026-10-24', 'diner', 'Burger', 'congelateur'),
  ]
  it('une ligne par plat et par jour, trois au plus, la pastille sur le congélateur', () => {
    const l = ceQuiVient(semaine, 'u1', MAINTENANT, { exclus: new Set(['1', '2']) })
    expect(l.map(x => [x.quand, x.label, x.pastille])).toEqual([
      ['Demain midi', 'Lasagnes', null],
      ['Demain soir', 'Pizza', null],
      ['Vendredi, midi et soir', 'Wraps', 'à sortir jeudi'],
    ])
  })
  it('sans exclusion, les repas d’aujourd’hui comptent', () => {
    expect(ceQuiVient(semaine, 'u1', MAINTENANT)[0].quand).toBe('Ce midi et ce soir')
  })
  it('que MES repas, que ceux à venir, que ceux qui sont encore prévus', () => {
    const autres = [
      cas('8', '2026-10-22', 'dejeuner', 'Soupe', 'frigo', 'u2'),
      cas('9', '2026-10-20', 'diner', 'Passé'),
      cas('10', '2026-10-22', 'diner', 'Mangé', 'frigo', 'u1', 'mange'),
    ]
    expect(ceQuiVient(autres, 'u1', MAINTENANT)).toEqual([])
  })
  it('une case sans barquette ne se dit pas', () => {
    expect(ceQuiVient([{ ...cas('1', '2026-10-22', 'diner', 'X'), portion: null } as unknown as Case], 'u1', MAINTENANT)).toEqual([])
  })
})

describe('momentDePeremption', () => {
  it('ce soir, demain soir, jeudi soir, et le matin', () => {
    expect(momentDePeremption(new Date(2026, 9, 21, 19), MAINTENANT)).toBe('ce soir')
    expect(momentDePeremption(new Date(2026, 9, 22, 19), MAINTENANT)).toBe('demain soir')
    expect(momentDePeremption(new Date(2026, 9, 22, 8), MAINTENANT)).toBe('demain matin')
    expect(momentDePeremption(new Date(2026, 9, 22, 15), MAINTENANT)).toBe('demain après-midi')
    expect(momentDePeremption(new Date(2026, 9, 22, 19, 30), new Date(2026, 9, 20, 10))).toBe('jeudi soir')
  })
})

describe('noteDuPlat', () => {
  const vendredi = new Date(2026, 9, 23, 19).toISOString()
  const parts = ['a', 'b', 'c'].map(id => ({ id, expires_at: vendredi }))
  const reclame = (id: string, day: string, meal: string) =>
    ({ id: `r${id}`, day, meal, user_profile_id: 'u1', portion_id: id })

  it('les parts, la péremption, et le repas qui finit le plat', () => {
    expect(noteDuPlat(parts, [reclame('a', '2026-10-21', 'dejeuner'), reclame('b', '2026-10-21', 'diner'),
      reclame('c', '2026-10-22', 'dejeuner')], MAINTENANT))
      .toEqual({ debut: 'Au frigo, 3 parts. Elles périment ', fort: 'vendredi soir', fin: ' : demain midi finit le plat.' })
  })
  it('des parts que rien ne réclame : pas de « finit le plat »', () => {
    expect(noteDuPlat(parts, [reclame('a', '2026-10-21', 'dejeuner')], MAINTENANT)?.fin).toBe('.')
  })
  it('un dernier repas APRÈS la péremption ne finit pas le plat', () => {
    const t = noteDuPlat(parts.slice(0, 1), [reclame('a', '2026-10-24', 'dejeuner')], MAINTENANT)
    expect(t?.fin).toBe('.')
  })
  it('une part : « Elle périme »', () => {
    expect(noteDuPlat(parts.slice(0, 1), [], MAINTENANT)?.debut).toBe('Au frigo, 1 part. Elle périme ')
  })
  it('périmées : on le dit, sans date', () => {
    expect(noteDuPlat(parts, [], new Date(2026, 9, 24))).toEqual({ debut: 'Au frigo, 3 parts. Elles sont périmées.' })
    const mix = [{ id: 'a', expires_at: new Date(2026, 9, 20).toISOString() }, { id: 'b', expires_at: vendredi }]
    expect(noteDuPlat(mix, [], MAINTENANT)?.debut).toBe('Au frigo, 2 parts. 1 est périmée.')
  })
  it('aucune part : rien à dire', () => {
    expect(noteDuPlat([], [], MAINTENANT)).toBeNull()
  })
})

describe('le budget', () => {
  it('jours avant le premier jour du mois d’arrivée', () => {
    expect(joursAvantLArrivee('2026-11-01', '2026-10-27')).toBe(5)
    expect(joursAvantLArrivee('2026-11-15', '2026-10-27')).toBe(5)
    expect(joursAvantLArrivee('2026-11-01', '2026-10-31')).toBe(1)
    expect(joursAvantLArrivee('2027-01-01', '2026-12-30')).toBe(2)
  })
  it('la pastille du compte à rebours', () => {
    expect(pastilleDuCompteARebours(5)).toBe('Dans 5 jours')
    expect(pastilleDuCompteARebours(1)).toBe('Demain')
  })
  it('la barre : sans revenu, rien ; un manque ne se dessine pas ; deux segments sinon', () => {
    expect(barreDuBudget(3102_00, null)).toBeNull()
    expect(barreDuBudget(0, 0)).toBeNull()
    expect(barreDuBudget(3102_00, -102_00)).toEqual({ charges: 3102_00, reste: 0 })
    expect(barreDuBudget(3102_00, 699_00)).toEqual({ charges: 3102_00, reste: 699_00 })
  })
  it('la pastille de suite : la clôture d’abord, puis les montants à dire, sinon « À jour »', () => {
    const nomDuMois = (iso: string) => ({ '2026-09-01': 'septembre' })[iso] ?? '?'
    expect(pastilleDeSuite({ aCloturer: '2026-09-01', aDire: 2, nomDuMois })).toBe('Septembre à clôturer')
    expect(pastilleDeSuite({ aCloturer: null, aDire: 2, nomDuMois })).toBe('2 à dire')
    expect(pastilleDeSuite({ aCloturer: null, aDire: 0, nomDuMois })).toBe('À jour')
  })
})
