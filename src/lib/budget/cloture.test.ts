/**
 * Ce que la page de clôture décide AVANT de montrer ou d'envoyer quoi que ce soit (3.5) :
 * quelle porte elle ouvre, ce qu'elle envoie, et comment elle refuse un double clic.
 * Pur : l'écran n'a pas de banc de composants, c'est ici que les règles se figent.
 */
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Choix, Cloture, Depense, Poche } from '../donnees/budget.ts'
import {
  choixAFermer, deMois, envoiDeLaCloture, misDeCoteDuFoyer, porteDeLaCloture, questionPourRevenir, rienDOffice,
  rienEffectif, revenirSiConfirme, unSeulEnvoi, cloreUneFois, type AppelDeCloture,
} from './cloture.ts'
import { oublieNonSoldees, retientNonSoldees } from './non-soldees.ts'
import type { Saisie } from './mois.ts'

const FINE = ' '
const SEPT = '2026-09-01'
const OCT = '2026-10-01'

const lu = <T,>(data: T) => ({ data, error: null as unknown })
const attend = { data: undefined, error: null as unknown }
const rate = { data: undefined, error: new Error('panne') as unknown }
const k = (mois = SEPT): Cloture => ({ id: 'k1', mois, cloture_le: '2026-10-01T08:00:00Z', choix: [] })

const pret = { clotures: lu<Cloture[]>([]), lectures: [lu([]), lu([]), lu([])], revenu: 4000_00 }
const porte = (p: Partial<Parameters<typeof porteDeLaCloture>[0]> = {}) =>
  porteDeLaCloture({ mois: SEPT, courant: OCT, ...pret, ...p }).porte

describe('porteDeLaCloture — ce que la page ouvre', () => {
  it('un mois passé, tout lu, un revenu : on clôture', () => {
    expect(porte()).toBe('a-clore')
  })

  it('le mois en cours, et un mois futur : trop tôt, sans rien lire (octobre ne se clôture pas le 27)', () => {
    expect(porte({ mois: OCT })).toBe('trop-tot')
    expect(porte({ mois: '2026-11-01' })).toBe('trop-tot')
    /* Même si rien n'est encore lu : la garde ne dépend d'aucune lecture. */
    expect(porte({ mois: OCT, clotures: attend, lectures: [attend] })).toBe('trop-tot')
  })

  it('sans revenu : on le dit, on ne clôture pas', () => {
    expect(porte({ revenu: null })).toBe('sans-revenu')
  })

  it('un revenu de 0 € est un revenu', () => {
    expect(porte({ revenu: 0 })).toBe('a-clore')
  })

  it('déjà clôturé : la page se lit, et « Revenir dessus » est le seul geste', () => {
    const r = porteDeLaCloture({ mois: SEPT, courant: OCT, ...pret, clotures: lu([k()]) })
    expect(r.porte).toBe('close')
    expect(r.fermee?.mois).toBe(SEPT)
  })

  it('une autre clôture que celle du mois ne le ferme pas', () => {
    const r = porteDeLaCloture({ mois: SEPT, courant: OCT, ...pret, clotures: lu([k('2026-08-01')]) })
    expect(r.porte).toBe('a-clore')
    expect(r.fermee).toBeNull()
  })

  it('les clôtures pas lues : « Un instant », jamais un formulaire (le mois pourrait être clos)', () => {
    expect(porte({ clotures: attend })).toBe('chargement')
  })

  it('les clôtures en panne : la panne, et surtout pas « à clore » — la base le refuserait', () => {
    expect(porte({ clotures: rate })).toBe('erreur')
  })

  it('un mois déjà clôturé se lit même si le reste n’est pas revenu', () => {
    expect(porteDeLaCloture({ mois: SEPT, courant: OCT, clotures: lu([k()]),
                              lectures: [attend, rate], revenu: null }).porte).toBe('close')
  })

  it('une lecture manquante (lignes, saisies ou revenus) : on attend, on ne conclut pas « sans revenu »', () => {
    expect(porte({ lectures: [attend, lu([]), lu([])], revenu: null })).toBe('chargement')
    expect(porte({ lectures: [lu([]), attend, lu([])] })).toBe('chargement')
    expect(porte({ lectures: [lu([]), lu([]), attend], revenu: null })).toBe('chargement')
  })

  it('une lecture en panne passe devant l’attente des autres', () => {
    expect(porte({ lectures: [attend, rate, lu([])] })).toBe('erreur')
  })

  it('une relecture qui rate garde ses données : la page reste', () => {
    const garde = { data: [], error: new Error('coupure') as unknown }
    expect(porte({ lectures: [garde, lu([]), lu([])] })).toBe('a-clore')
  })
})

describe('deMois — « d’octobre », « de mars »', () => {
  it.each([
    ['2026-10-01', 'd’octobre'], ['2026-03-01', 'de mars'], ['2026-08-01', 'd’août'],
    ['2026-04-01', 'd’avril'], ['2026-02-01', 'de février'], ['2026-12-01', 'de décembre'],
    ['2026-06-01', 'de juin'],
  ])('%s', (mois, attendu) => expect(deMois(mois)).toBe(attendu))

  it('avec le mois courant : l’année dès qu’elle n’est pas la courante', () => {
    expect(deMois('2025-09-01', '2026-10-01')).toBe('de septembre 2025')
    expect(deMois('2025-10-01', '2026-10-01')).toBe('d’octobre 2025')
    expect(deMois('2026-09-01', '2026-10-01')).toBe('de septembre')
  })
})

const ligne = (p: Partial<Depense> = {}): Depense => ({
  id: 'd1', charge_id: 'c1', libelle: 'Courses', mois: SEPT, montant_cents: 800_00,
  montant_prevu_cents: 800_00, nature: 'estimee', source: 'charge', facon: 'au_fil',
  confirme_le: null, regularise_annee: null, regle_le: null, enveloppe_id: null, compte_id: null,
  parts: [{ user_profile_id: 'u1', part_cents: 800_00, part_bps: 10000 }], ...p,
})
const saisie = (depense: string, cents = 10_00): Saisie => ({
  id: `s-${depense}-${cents}`, depense_id: depense, fait_le: '2026-09-05', montant_cents: cents,
  saisi_par: 'u1',
})

describe('« Rien dépensé » — ce que la page envoie', () => {
  it('une ligne déjà confirmée à 0 €, sans saisie, arrive basculée (une reclôture)', () => {
    const l = ligne({ confirme_le: '2026-10-01T00:00:00Z', montant_cents: 0 })
    expect([...rienDOffice([l], [])]).toEqual(['c1'])
  })

  it('pas basculée d’office : non confirmée, confirmée à autre chose que 0, avec saisie, ou pas au fil', () => {
    expect(rienDOffice([ligne({ montant_cents: 0 })], []).size).toBe(0)
    expect(rienDOffice([ligne({ confirme_le: 'x', montant_cents: 5_00 })], []).size).toBe(0)
    expect(rienDOffice([ligne({ confirme_le: 'x', montant_cents: 0 })], [saisie('d1')]).size).toBe(0)
    expect(rienDOffice([ligne({ confirme_le: 'x', montant_cents: 0, facon: 'facture' })], []).size).toBe(0)
    expect(rienDOffice([ligne({ confirme_le: 'x', montant_cents: 0, charge_id: null })], []).size).toBe(0)
  })

  it('tant qu’on n’a rien touché, c’est l’état d’office ; dès qu’on a touché, c’est le choix', () => {
    const l = ligne({ confirme_le: 'x', montant_cents: 0 })
    expect([...rienEffectif([l], [], null)]).toEqual(['c1'])
    expect(rienEffectif([l], [], new Set()).size).toBe(0)
  })

  it('une ligne basculée puis déclarée ne part plus en « Rien dépensé » : les saisies priment', () => {
    /* Sans cela, « Rien dépensé » allumé, puis 47,90 € déclarés par la feuille : le
       bouton disparaît, mais la charge restait envoyée dans `rien`. */
    const l = ligne()
    expect([...rienEffectif([l], [saisie('d1')], new Set(['c1']))]).toEqual([])
    expect([...rienEffectif([l], [], new Set(['c1']))]).toEqual(['c1'])
  })

  it('une charge qui n’est plus dans les lignes ne part pas non plus', () => {
    expect(rienEffectif([ligne()], [], new Set(['fantome'])).size).toBe(0)
  })
})

const poche = (p: Partial<Poche> = {}): Poche => ({
  id: 'p1', libelle: 'Urgence', genre: 'urgence', objectif_cents: 4_000_00, echeance: null,
  cle: null, ...p,
})

describe('envoiDeLaCloture — l’appel de cloture_le_mois', () => {
  const ch = (c: Partial<{ garder: boolean; poche: string | null; combien: string | null }> = {}) =>
    ({ garder: false, poche: 'p1', combien: null, ...c })

  it('« Tout ce qui reste » part tel quel (null) : la base met de côté son propre reste', () => {
    expect(envoiDeLaCloture({ mois: SEPT, reste: 793_40, poches: [poche()], choix: ch(),
                              rien: new Set(['c2']) }))
      .toEqual({ valide: true, appel: { mois: SEPT, rien: ['c2'], misDeCote: null, poche: 'p1' } })
  })

  it('garder : 0 et aucune poche', () => {
    expect(envoiDeLaCloture({ mois: SEPT, reste: 793_40, poches: [poche()], choix: ch({ garder: true }),
                              rien: new Set() }).appel)
      .toMatchObject({ misDeCote: 0, poche: null })
  })

  it('rien à mettre de côté (reste négatif) : 0 — la clôture ne bloque jamais', () => {
    const e = envoiDeLaCloture({ mois: SEPT, reste: -10_00, poches: [poche()], choix: ch(), rien: new Set() })
    expect(e.valide).toBe(true)
    expect(e.appel).toMatchObject({ misDeCote: 0, poche: null })
  })

  it('une saisie lisible part telle quelle, en centimes', () => {
    expect(envoiDeLaCloture({ mois: SEPT, reste: 793_40, poches: [poche()],
                              choix: ch({ combien: '100,5' }), rien: new Set() }).appel)
      .toMatchObject({ misDeCote: 100_50, poche: 'p1' })
  })

  it('une saisie illisible bloque : rien ne part', () => {
    const e = envoiDeLaCloture({ mois: SEPT, reste: 793_40, poches: [poche()],
                                 choix: ch({ combien: '12e3' }), rien: new Set() })
    expect(e.valide).toBe(false)
    expect(e.appel).toBeNull()
  })

  it('une poche retirée entre-temps : la poche par défaut part, pas un identifiant mort', () => {
    expect(envoiDeLaCloture({ mois: SEPT, reste: 50_00, poches: [poche({ id: 'p9' })],
                              choix: ch({ poche: 'disparue' }), rien: new Set() }).appel)
      .toMatchObject({ poche: 'p9' })
  })
})

describe('misDeCoteDuFoyer — ce que « Revenir dessus » retire de l’épargne', () => {
  const c = (qui: string, cents: number): Choix =>
    ({ user_profile_id: qui, reste_cents: 1000_00, mis_de_cote_cents: cents, poche_id: null, versement_id: null })

  it('la base rouvre pour TOUT le foyer : le total, pas ma part seule', () => {
    expect(misDeCoteDuFoyer([c('u1', 300_00), c('u2', 120_50)], ['u1', 'u2'])).toBe(420_50)
  })

  it('le foyer pas lu : null — on ne sait pas qui est parti, donc on n’annonce aucun total', () => {
    expect(misDeCoteDuFoyer([c('u1', 300_00), c('parti', 120_50)], undefined)).toBeNull()
    expect(misDeCoteDuFoyer([], undefined)).toBeNull()
  })

  it('un membre parti garde son versement dans la poche : il ne compte pas', () => {
    expect(misDeCoteDuFoyer([c('u1', 300_00), c('parti', 120_50)], ['u1', 'u2'])).toBe(300_00)
  })

  it('aucun choix : 0', () => {
    expect(misDeCoteDuFoyer([], ['u1'])).toBe(0)
  })
})

describe('questionPourRevenir', () => {
  it('avec de l’argent mis de côté : on dit combien repart de l’épargne', () => {
    expect(questionPourRevenir(OCT, 1_234_00))
      .toBe(`Revenir sur octobre ? Les 1${FINE}234 € mis de côté seront retirés de l’épargne.`)
  })

  it('sans rien mis de côté : la question seule', () => {
    expect(questionPourRevenir(OCT, 0)).toBe('Revenir sur octobre ?')
  })
})

describe('unSeulEnvoi — le double clic', () => {
  it('le second appel, avant la réponse du premier, est refusé', () => {
    const garde = unSeulEnvoi()
    expect(garde.prends()).toBe(true)
    expect(garde.prends()).toBe(false)
    expect(garde.prends()).toBe(false)
  })

  it('après un échec, on peut renvoyer', () => {
    const garde = unSeulEnvoi()
    garde.prends()
    garde.rends()
    expect(garde.prends()).toBe(true)
  })
})

describe('ce qu’une clôture n’a pas pu solder', () => {
  const qc = () => new QueryClient()
  const n = { charge: 'c1', libelle: 'Taxe', annee: 2025, raison: 'x' }

  it('se retient sous le mois clôturé, et rien d’autre', () => {
    const q = qc()
    retientNonSoldees(q, SEPT, [n])
    expect(q.getQueryData(['non-soldees', SEPT])).toEqual([n])
    expect(q.getQueryData(['non-soldees', OCT])).toBeUndefined()
  })

  it('un mois rouvert l’oublie TOUT DE SUITE, pour qui le regarde déjà', () => {
    const q = qc()
    retientNonSoldees(q, SEPT, [n])
    oublieNonSoldees(q, SEPT)
    expect(q.getQueryData(['non-soldees', SEPT])).toEqual([])
  })
})

/** Laisse passer les microtâches : le `then` de la promesse rendue. */
const tour = () => new Promise<void>(r => setTimeout(r, 0))

describe('revenirSiConfirme — « Revenir dessus »', () => {
  const monter = (reponse = true) => {
    const garde = unSeulEnvoi()
    const confirmer = vi.fn(() => reponse)
    const rouvrir = vi.fn(() => Promise.resolve())
    const apres = vi.fn()
    const clic = () => revenirSiConfirme({ garde, question: 'Revenir sur octobre ?', confirmer, rouvrir, apres })
    return { garde, confirmer, rouvrir, apres, clic }
  }

  it('pose la question telle quelle, puis rouvre, puis rend la main', async () => {
    const t = monter()
    t.clic()
    expect(t.confirmer).toHaveBeenCalledWith('Revenir sur octobre ?')
    expect(t.rouvrir).toHaveBeenCalledTimes(1)
    await tour()
    expect(t.apres).toHaveBeenCalledTimes(1)
  })

  it('refusée : rien n’est rouvert, et on peut recliquer', () => {
    const t = monter(false)
    t.clic()
    expect(t.rouvrir).not.toHaveBeenCalled()
    t.clic()
    expect(t.confirmer).toHaveBeenCalledTimes(2)
  })

  it('un double clic ne pose qu’une question et ne rouvre qu’une fois', () => {
    const t = monter()
    t.clic(); t.clic(); t.clic()
    expect(t.confirmer).toHaveBeenCalledTimes(1)
    expect(t.rouvrir).toHaveBeenCalledTimes(1)
  })

  it('échouée : pas de « apres », et on peut recommencer', async () => {
    const garde = unSeulEnvoi()
    const rouvrir = vi.fn(() => Promise.reject(new Error('refusé')))
    const apres = vi.fn()
    const clic = () => revenirSiConfirme({ garde, question: 'q', confirmer: () => true, rouvrir, apres })
    clic()
    await tour()
    expect(apres).not.toHaveBeenCalled()
    clic()
    expect(rouvrir).toHaveBeenCalledTimes(2)
  })
})

describe('cloreUneFois — « Clôturer septembre »', () => {
  const appel: AppelDeCloture = { mois: SEPT, rien: [], misDeCote: null, poche: 'p1' }
  const monter = (envoi = { valide: true, appel } as { valide: boolean; appel: AppelDeCloture | null },
                  reponse: () => Promise<unknown> = () => Promise.resolve()) => {
    const garde = unSeulEnvoi()
    const cloturer = vi.fn(reponse)
    const apres = vi.fn()
    return { cloturer, apres, clic: () => cloreUneFois({ garde, envoi, cloturer, apres }) }
  }

  it('envoie l’appel tel que composé, puis va au mois', async () => {
    const t = monter()
    t.clic()
    expect(t.cloturer).toHaveBeenCalledWith(appel)
    await tour()
    expect(t.apres).toHaveBeenCalledTimes(1)
  })

  it('un double clic n’envoie QU’UNE clôture (la seconde ferait verser le reste deux fois)', () => {
    const t = monter()
    t.clic(); t.clic()
    expect(t.cloturer).toHaveBeenCalledTimes(1)
  })

  it('une saisie illisible n’envoie rien — et ne verrouille pas le bouton', () => {
    const t = monter({ valide: false, appel: null })
    t.clic(); t.clic()
    expect(t.cloturer).not.toHaveBeenCalled()
  })

  it('refusée par la base : pas d’aller au mois, et on peut renvoyer', async () => {
    const t = monter(undefined, () => Promise.reject(new Error('Septembre est déjà clôturé.')))
    t.clic()
    await tour()
    expect(t.apres).not.toHaveBeenCalled()
    t.clic()
    expect(t.cloturer).toHaveBeenCalledTimes(2)
  })
})

describe('choixAFermer — la feuille « choix » ouverte quand le mois se clôt', () => {
  it('le mois se clôt, la feuille « choix » est ouverte : à fermer (et rendre le focus)', () => {
    expect(choixAFermer({ geste: 'choix' }, true)).toBe(true)
  })
  it('mois ouvert : la feuille reste', () => {
    expect(choixAFermer({ geste: 'choix' }, false)).toBe(false)
  })
  it('une autre feuille (déclarer…) ou aucune : rien à fermer — elles se lisent seulement sur un mois clos', () => {
    expect(choixAFermer({ geste: 'declarer' }, true)).toBe(false)
    expect(choixAFermer(null, true)).toBe(false)
  })
})
