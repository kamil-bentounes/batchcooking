/**
 * Ce que les trois feuilles décident quand l'argent est en jeu (2.12 à 2.14) : le
 * montant tapé, le jour accepté, l'aperçu de ce que la base posera, le renvoi
 * d'une dépense. Tenu en pur pour que le test puisse le figer.
 *
 * Les montants s'écrivent avec l'espace fine insécable (U+202F) de `toLocaleString('fr-FR')`.
 */
import { describe, expect, it } from 'vitest'
import { enCentimes, type Charge, type EtatAnnee } from '../donnees/budget.ts'
import {
  apercuFacture, apercuReleve, depuisLe, envoiPermis, envoiPour, jourAccepte, lisLeMontant,
  anneePlausible, montantPropose, plancherDuJour, provisionParMois, questionDeRetrait, refusDuRetrait, saisiDe,
} from './feuilles.ts'
import type { Ligne } from './mois.ts'

const FINE = '\u202f'

const ligne = (p: Partial<Ligne> = {}): Ligne => ({
  id: 'l1', charge_id: 'c1', libelle: 'Électricité', montant_cents: 50_00,
  montant_prevu_cents: 50_00, facon: 'facture', confirme_le: null, regularise_annee: null,
  parts: [], ...p,
})
const etat = (p: Partial<EtatAnnee> = {}): EtatAnnee =>
  ({ b: 0, pl: 166_68, pose: 0, soldee: false, premier_mois_suivi: '2026-09-01', ...p })

describe('lisLeMontant — ce qu’on tape devient des centimes entiers', () => {
  it('« 47 » et « 47,90 » et « 47.9 » : la virgule et le point disent la même chose', () => {
    expect(lisLeMontant('47', { zeroOk: false })).toEqual({ valide: true, cents: 47_00, refus: null })
    expect(lisLeMontant('47,90', { zeroOk: false }).cents).toBe(47_90)
    expect(lisLeMontant('47.9', { zeroOk: false }).cents).toBe(47_90)
  })

  it('« 12,345 » ne s’arrondit pas en silence : il est refusé', () => {
    const m = lisLeMontant('12,345', { zeroOk: false })
    expect(m.valide).toBe(false)
    expect(m.cents).toBeNull()
    expect(m.refus).toMatch(/47 ou 47,90/)
  })

  it('un montant recopié de l’écran, avec son espace insécable, se lit', () => {
    expect(lisLeMontant(`1${FINE}234,56`, { zeroOk: false }).cents).toBe(123_456)
    expect(lisLeMontant('1 234,56', { zeroOk: false }).cents).toBe(123_456)
  })

  it('un champ vide ne refuse rien : on n’a pas encore tapé', () => {
    for (const vide of ['', '   ']) {
      expect(lisLeMontant(vide, { zeroOk: true })).toEqual({ valide: false, cents: null, refus: null })
    }
  })

  it('0 € : refusé pour une dépense, accepté pour un avoir', () => {
    const refuse = lisLeMontant('0', { zeroOk: false })
    expect(refuse.valide).toBe(false)
    expect(refuse.refus).toBe('Un montant au-dessus de 0 € : 47 ou 47,90.')
    // Les trois écritures de zéro valent la même chose.
    for (const zero of ['0', '0,00', '0.0']) {
      expect(lisLeMontant(zero, { zeroOk: true })).toEqual({ valide: true, cents: 0, refus: null })
    }
  })

  it('la borne de la base : 1 000 000 € passe, un centime de plus non', () => {
    expect(lisLeMontant('1000000', { zeroOk: false }).cents).toBe(100_000_000)
    for (const zeroOk of [false, true]) {
      const trop = lisLeMontant('1000000,01', { zeroOk })
      expect(trop.valide).toBe(false)
      expect(trop.cents).toBeNull()
      expect(trop.refus).toContain('1 000 000 €')
    }
  })

  it('ni négatif, ni notation scientifique, ni deux virgules, ni lettres', () => {
    for (const mauvais of ['-5', '1e3', '1,2,3', 'abc', '5 €', '--', ',']) {
      const m = lisLeMontant(mauvais, { zeroOk: true })
      expect(m.valide, mauvais).toBe(false)
      expect(m.refus, mauvais).toMatch(/^Un montant/)
    }
  })

  it('le message de l’avoir dit que 0 € passe', () => {
    expect(lisLeMontant('abc', { zeroOk: true }).refus)
      .toBe('Un montant, de 0 € à 1 000 000 € : 47 ou 47,90.')
    expect(lisLeMontant('abc', { zeroOk: false }).refus)
      .toBe('Un montant, au plus 1 000 000 € : 47 ou 47,90.')
  })
})

describe('saisiDe — le montant qu’on redonne à corriger', () => {
  it('un montant rond n’a pas de décimales, les autres en ont toujours deux', () => {
    expect(saisiDe(50_00)).toBe('50')
    expect(saisiDe(47_90)).toBe('47,90')
    expect(saisiDe(5)).toBe('0,05')
    expect(saisiDe(0)).toBe('0')
  })

  it('un négatif garde son signe : -5 centimes n’est pas « 0,05 »', () => {
    expect(saisiDe(-5)).toBe('-0,05')
    expect(saisiDe(-99)).toBe('-0,99')
    expect(saisiDe(-100)).toBe('-1')
    expect(saisiDe(-1234)).toBe('-12,34')
  })

  it('se relit à l’identique : aucun centime ne bouge entre l’écran et le champ', () => {
    for (const c of [0, 1, 9, 10, 99, 100, 1234, 123_456, 100_000_000, 1_999_99]) {
      expect(enCentimes(saisiDe(c)), String(c)).toBe(c)
    }
  })
})

describe('montantPropose — la feuille confirme ce qu’elle affiche', () => {
  it('avant confirmation : le prévu, celui qu’on lit sur la feuille', () => {
    expect(montantPropose(ligne({ montant_cents: 52_00, montant_prevu_cents: 50_00 }))).toBe(50_00)
    expect(montantPropose(ligne({ montant_prevu_cents: null, montant_cents: 61_00 }))).toBe(61_00)
  })

  it('après confirmation : le montant retenu, même s’il est de 0 € (un avoir)', () => {
    const l = ligne({ confirme_le: '2026-10-05T10:00:00Z', montant_cents: 0, montant_prevu_cents: 50_00 })
    expect(montantPropose(l)).toBe(0)
  })
})

describe('envoiPour — un renvoi garde son identifiant, une autre dépense non', () => {
  const ids = () => { let n = 0; return () => `id${++n}` }

  it('la première fois : un identifiant neuf', () => {
    expect(envoiPour(null, 'a', ids())).toEqual({ id: 'id1', cle: 'a' })
  })

  it('le même montant, le même jour, la même ligne : c’est le même envoi (coupure, double toucher)', () => {
    const neuf = ids()
    const un = envoiPour(null, 'l1|5000|2026-10-05', neuf)
    expect(envoiPour(un, 'l1|5000|2026-10-05', neuf).id).toBe('id1')
  })

  it('50 € refusé par le réseau, puis 30 € : 30 € ne se prennent pas pour un renvoi de 50 €', () => {
    // Sinon la base répondait 23505 (déjà là) et 30 € étaient perdus en silence.
    const neuf = ids()
    const cinquante = envoiPour(null, 'l1|5000|2026-10-05', neuf)
    const trente = envoiPour(cinquante, 'l1|3000|2026-10-05', neuf)
    expect(trente.id).not.toBe(cinquante.id)
  })

  it('le jour ou la ligne qui changent font aussi un envoi neuf', () => {
    const neuf = ids()
    const un = envoiPour(null, 'l1|5000|2026-10-05', neuf)
    expect(envoiPour(un, 'l1|5000|2026-10-04', neuf).id).not.toBe(un.id)
    expect(envoiPour(un, 'l2|5000|2026-10-05', neuf).id).not.toBe(un.id)
  })

  it('n’appelle le générateur que s’il en faut un', () => {
    let appels = 0
    const neuf = () => `id${++appels}`
    const un = envoiPour(null, 'k', neuf)
    envoiPour(un, 'k', neuf)
    envoiPour(un, 'k', neuf)
    expect(appels).toBe(1)
  })
})

describe('envoiPermis — pas de double envoi', () => {
  it('permis seulement si le montant est bon, le jour accepté, et rien n’est en vol', () => {
    expect(envoiPermis({ valide: true, enCours: false })).toBe(true)
    expect(envoiPermis({ valide: true, enCours: true })).toBe(false)
    expect(envoiPermis({ valide: false, enCours: false })).toBe(false)
    expect(envoiPermis({ valide: true, enCours: false, jourOk: false })).toBe(false)
    expect(envoiPermis({ valide: true, enCours: false, jourOk: true })).toBe(true)
  })
})

describe('jourAccepte — une date tapée à la main ne passe pas la borne du champ', () => {
  it('dans la fenêtre, bornes comprises', () => {
    expect(jourAccepte('2026-10-01', '2026-10-01', '2026-10-21')).toBe(true)
    expect(jourAccepte('2026-10-21', '2026-10-01', '2026-10-21')).toBe(true)
  })
  it('avant, après, vide, ou une date qui n’existe pas', () => {
    expect(jourAccepte('2026-09-30', '2026-10-01', '2026-10-21')).toBe(false)
    expect(jourAccepte('2026-10-22', '2026-10-01', '2026-10-21')).toBe(false)
    expect(jourAccepte('', '2026-10-01', '2026-10-21')).toBe(false)
    expect(jourAccepte('2026-02-31', '2026-01-01', '2026-12-31')).toBe(false)
    expect(jourAccepte('2026-10-5', '2026-10-01', '2026-10-21')).toBe(false)
  })
})

describe('provisionParMois — le même arrondi que la base', () => {
  const c = (montant_cents: number, periodicite: Charge['periodicite']) =>
    ({ montant_cents, periodicite }) as Pick<Charge, 'montant_cents' | 'periodicite'>
  it('annuel sur 12, trimestriel sur 3, mensuel tel quel', () => {
    expect(provisionParMois(c(500_00, 'annuel'))).toBe(41_67)
    expect(provisionParMois(c(100_00, 'trimestriel'))).toBe(33_33)
    expect(provisionParMois(c(65_00, 'mensuel'))).toBe(65_00)
  })
  it('un demi-centime s’arrondit vers le haut, comme `round()` de Postgres', () => {
    expect(provisionParMois(c(1_50, 'annuel'))).toBe(13) // 12,5
  })
})

describe('depuisLe — « depuis septembre » quand Popote n’a pas suivi toute l’année', () => {
  it('le premier mois suivi n’est pas janvier de cette année : on le dit', () => {
    expect(depuisLe('2026-09-01', 2026)).toBe(', depuis septembre')
  })
  it('janvier, une autre année, ou rien de suivi : rien à dire', () => {
    expect(depuisLe('2026-01-01', 2026)).toBe('')
    expect(depuisLe('2025-09-01', 2026)).toBe('')
    expect(depuisLe('2027-03-01', 2026)).toBe('')
    expect(depuisLe(null, 2026)).toBe('')
  })
})

describe('plancherDuJour — « Autre jour » ne remonte pas plus haut que la base ne l’accepte', () => {
  it('le 1er janvier de l’année précédente, ou le premier mois suivi s’il est plus récent', () => {
    expect(plancherDuJour('2026-10-21', null)).toBe('2025-01-01')
    expect(plancherDuJour('2026-10-21', '2024-03-01')).toBe('2025-01-01')
    expect(plancherDuJour('2026-10-21', '2026-09-01')).toBe('2026-09-01')
  })
})

describe('apercuFacture — la formule du § 4.4 appliquée au montant tapé', () => {
  it('au-delà du prévu : 320 € sur 166,68 € prévus, 153,32 € s’ajoutent à octobre', () => {
    expect(apercuFacture(etat(), 2026, 320_00, 'octobre'))
      .toBe('153,32 € de plus que les 166,68 € prévus pour 2026 : ils s’ajoutent à octobre.')
  })

  it('en dessous du prévu : 100 € sur 166,68 €, il reste 66,68 € de côté', () => {
    expect(apercuFacture(etat(), 2026, 100_00, 'octobre'))
      .toBe('Il restera 66,68 € de côté pour 2026.')
  })

  it('pile le prévu : il ne reste rien de côté, et rien ne s’ajoute', () => {
    expect(apercuFacture(etat(), 2026, 166_68, 'octobre')).toBe('Il restera 0 € de côté pour 2026.')
  })

  it('année soldée : toute la facture s’ajoute au mois, quel que soit le prévu', () => {
    const soldee = etat({ soldee: true, b: 1200_00, pl: 1200_00, pose: 0 })
    expect(apercuFacture(soldee, 2026, 320_00, 'octobre'))
      .toBe('2026 est soldée : les 320 € s’ajoutent à octobre.')
    // Même une petite facture : l'année est soldée, le prévu est figé.
    expect(apercuFacture(soldee, 2026, 10_00, 'octobre'))
      .toBe('2026 est soldée : les 10 € s’ajoutent à octobre.')
  })

  it('déjà au-dessus du prévu : seul le nouvel écart s’ajoute, et l’aperçu ne mélange pas les deux', () => {
    // 320 € déjà payés (153,32 € posés), on en ajoute 100 : 100 € de plus à octobre,
    // et non « 100 € de plus que les 166,68 € prévus » (c'est 253,32 € de plus).
    const t = apercuFacture(etat({ b: 320_00, pose: 153_32 }), 2026, 100_00, 'octobre')
    expect(t).toBe('100 € de plus s’ajoutent à octobre : 2026 dépasse déjà les 166,68 € prévus.')
  })

  it('entre les deux : le total passe le prévu, mais une partie est déjà posée', () => {
    // 100 € payés (rien de posé), puis 100 € : le total de 200 € dépasse de 33,32 € les 166,68 € prévus.
    expect(apercuFacture(etat({ b: 100_00, pose: 0 }), 2026, 100_00, 'octobre'))
      .toBe('33,32 € de plus que les 166,68 € prévus pour 2026 : ils s’ajoutent à octobre.')
  })

  it('un posé trop grand pour la cible : l’écart revient au mois', () => {
    // Un posé que le nouveau total ne justifie plus (ne devrait pas arriver, mais la base le rendrait).
    const t = apercuFacture(etat({ b: 0, pl: 100_00, pose: 30_00 }), 2026, 20_00, 'octobre')
    expect(t).toBe('30 € reviennent à octobre.')
  })

  it('dit les milliers avec l’espace fine, comme le reste de l’écran', () => {
    const t = apercuFacture(etat({ pl: 1200_00 }), 2026, 1500_00, 'octobre')
    expect(t).toBe(`300 € de plus que les 1${FINE}200 € prévus pour 2026 : ils s’ajoutent à octobre.`)
  })
})

describe('apercuReleve — corriger le total d’un relevé', () => {
  it('plus que le relevé : la différence s’ajoute au mois en cours', () => {
    expect(apercuReleve(1450_00, 1460_00, 'octobre'))
      .toBe('10 € de plus que le relevé : ils s’ajoutent à octobre.')
  })
  it('moins que le relevé : la différence revient au mois', () => {
    expect(apercuReleve(1450_00, 1449_96, 'octobre'))
      .toBe('0,04 € de moins que le relevé : ils reviennent à octobre.')
  })
  it('le même montant : rien ne change', () => {
    expect(apercuReleve(1450_00, 1450_00, 'octobre')).toBe('Rien ne change.')
  })
  it('un relevé corrigé à 0 € se rend en entier', () => {
    expect(apercuReleve(1200_00, 0, 'octobre'))
      .toBe(`1${FINE}200 € de moins que le relevé : ils reviennent à octobre.`)
  })
})

describe('questionDeRetrait — retirer une facture se demande, avec son montant et son jour', () => {
  it('dit la facture, et que l’écart se recalcule sur le mois en cours', () => {
    expect(questionDeRetrait(320_00, '2026-10-06', 'octobre'))
      .toBe('Retirer la facture de 320 € du Mar. 6 oct. ? L’écart se recalcule sur octobre.')
  })
  it('un montant à centimes et à milliers se lit comme à l’écran', () => {
    expect(questionDeRetrait(1450_04, '2026-03-02', 'octobre'))
      .toBe(`Retirer la facture de 1${FINE}450,04 € du Lun. 2 mars ? L’écart se recalcule sur octobre.`)
  })
})

describe('anneePlausible — la lecture d’une année ne part pas à chaque touche', () => {
  // Un <input type="date"> rend « 0002-10-21 » dès que l'année en est à son deuxième chiffre :
  // chaque frappe changeait `annee` et lançait deux requêtes (`etat_de_l_annee`, `factures`).
  it('l’année de la date du jour, et ±5 ans, passent', () => {
    expect(anneePlausible('2026-10-21', '2026-10-21')).toBe(true)
    expect(anneePlausible('2021-10-21', '2026-10-21')).toBe(true)
    expect(anneePlausible('2031-01-01', '2026-10-21')).toBe(true)
  })

  it('une année en cours de frappe ne passe pas', () => {
    for (const d of ['0002-10-21', '0020-10-21', '0202-10-21', '2-10-21', '', '202610-21']) {
      expect(anneePlausible(d, '2026-10-21'), d).toBe(false)
    }
  })

  it('au-delà de 5 ans, non', () => {
    expect(anneePlausible('2020-10-21', '2026-10-21')).toBe(false)
    expect(anneePlausible('2032-10-21', '2026-10-21')).toBe(false)
  })
})

describe('refusDuRetrait — on ne retire pas plus que ce qu\u2019on a versé', () => {
  it('un retrait dans la limite passe, jusqu\u2019au dernier centime', () => {
    expect(refusDuRetrait(30_00, 380_00)).toBeNull()
    expect(refusDuRetrait(380_00, 380_00)).toBeNull()
  })

  it('100 000 € sur 380 € est refusé, en disant combien il y a', () => {
    expect(refusDuRetrait(100_000_00, 380_00)).toBe(`Tu n\u2019as versé que 380 € ici : tu ne peux pas en retirer plus.`)
    expect(refusDuRetrait(380_01, 380_00)).not.toBeNull()
  })

  it('sans rien versé (ou un solde négatif hérité), il n\u2019y a rien à retirer', () => {
    expect(refusDuRetrait(1, 0)).toBe('Tu n\u2019as rien versé ici : il n\u2019y a rien à retirer.')
    expect(refusDuRetrait(1, -5_00)).toBe('Tu n\u2019as rien versé ici : il n\u2019y a rien à retirer.')
  })
})
