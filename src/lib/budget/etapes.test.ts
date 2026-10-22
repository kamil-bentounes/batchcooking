/**
 * Ce que les trois étapes de la clôture décident quand l'argent est en jeu (3.3, 3.4).
 * Pur : les centimes impairs (le 0,01 € qui fait basculer un arrondi) sont là exprès.
 * Les montants portent l'espace fine insécable (U+202F) de `toLocaleString('fr-FR')`.
 */
import { describe, expect, it } from 'vitest'
import type { Poche } from '../donnees/budget.ts'
import {
  envoiDuReste, leReste, phraseDeLaPoche, phraseDeLEcart, phraseDesPrevus, phraseDuSolde,
  pocheDuChoix, pocheParDefaut, voisinDuChoix, type ChoixDuReste,
} from './etapes.ts'

const FINE = '\u202f'

const poche = (p: Partial<Poche> = {}): Poche => ({
  id: 'p1', libelle: 'Urgence', genre: 'urgence', objectif_cents: 4_000_00, echeance: null,
  cle: null, ...p,
})
const projet = poche({ id: 'p2', libelle: 'Vacances', genre: 'projet', objectif_cents: null })
const choix = (c: Partial<ChoixDuReste> = {}): ChoixDuReste =>
  ({ garder: false, poche: 'p1', combien: null, ...c })

describe('phraseDeLEcart — le Y de l’étape 2', () => {
  it('de moins, de plus, ou pile', () => {
    expect(phraseDeLEcart(366_60)).toBe('Tu as dépensé 366,60 € de moins que prévu.')
    expect(phraseDeLEcart(-15_05)).toBe('Tu as dépensé 15,05 € de plus que prévu.')
    expect(phraseDeLEcart(0)).toBe('Tu as dépensé ce qui était prévu.')
  })

  it('un seul centime se dit : « 0,01 € », jamais « 0 € »', () => {
    expect(phraseDeLEcart(1)).toBe('Tu as dépensé 0,01 € de moins que prévu.')
    expect(phraseDeLEcart(-1)).toBe('Tu as dépensé 0,01 € de plus que prévu.')
  })

  it('les milliers portent l’espace fine, comme ailleurs', () => {
    expect(phraseDeLEcart(1_234_57)).toBe(`Tu as dépensé 1${FINE}234,57 € de moins que prévu.`)
  })
})

describe('phraseDesPrevus — « X prévus, plus Y dépensés en moins »', () => {
  it('écart positif : « plus Y dépensés en moins »', () => {
    expect(phraseDesPrevus({ prevus: 426_80, ecart: 366_60, reste: 793_40 }))
      .toBe('426,80 € prévus, plus 366,60 € dépensés en moins')
  })

  it('écart négatif : « moins Y dépensés en plus »', () => {
    expect(phraseDesPrevus({ prevus: 426_80, ecart: -15_05, reste: 411_75 }))
      .toBe('426,80 € prévus, moins 15,05 € dépensés en plus')
  })

  it('écart nul : rien à ajouter, plutôt que « plus 0 € dépensés en moins »', () => {
    expect(phraseDesPrevus({ prevus: 426_81, ecart: 0, reste: 426_81 })).toBe('426,81 € prévus')
  })

  it('des prévus négatifs gardent leur signe (le revenu ne couvre pas)', () => {
    expect(phraseDesPrevus({ prevus: -123_45, ecart: 200_01, reste: 76_56 }))
      .toBe('−123,45 € prévus, plus 200,01 € dépensés en moins')
  })
})

describe('phraseDuSolde — l’année que la clôture solde (§ 3.5)', () => {
  const solde = (cents: number, annee = 2026) =>
    ({ charge: 'c1', libelle: 'Entretien auto', annee, cents })

  it('un solde négatif : ce qui n’a pas servi revient', () => {
    expect(phraseDuSolde(solde(-166_68)))
      .toBe('Entretien auto : 166,68 € non dépensés en 2026 reviennent.')
  })

  it('un solde positif : plus que prévu', () => {
    expect(phraseDuSolde(solde(83_34)))
      .toBe('Entretien auto : 83,34 € de plus que prévu en 2026.')
  })

  it('un solde à 0 ne dit rien : une ligne « 0 € reviennent » serait du bruit', () => {
    expect(phraseDuSolde(solde(0))).toBeNull()
  })

  it('un centime se dit, des deux côtés', () => {
    expect(phraseDuSolde(solde(-1))).toBe('Entretien auto : 0,01 € non dépensés en 2026 reviennent.')
    expect(phraseDuSolde(solde(1))).toBe('Entretien auto : 0,01 € de plus que prévu en 2026.')
  })
})

describe('pocheParDefaut / pocheDuChoix', () => {
  it('l’urgence d’abord, sinon la première', () => {
    expect(pocheParDefaut([projet, poche()])?.id).toBe('p1')
    expect(pocheParDefaut([projet])?.id).toBe('p2')
    expect(pocheParDefaut([])).toBeNull()
  })

  it('une poche choisie qui n’existe plus retombe sur la défaut, pas sur un identifiant fantôme', () => {
    expect(pocheDuChoix([poche(), projet], 'p2')?.id).toBe('p2')
    expect(pocheDuChoix([poche(), projet], 'disparue')?.id).toBe('p1')
    expect(pocheDuChoix([poche(), projet], null)?.id).toBe('p1')
    expect(pocheDuChoix([], 'p1')).toBeNull()
  })
})

describe('leReste — ce que « Le mettre de côté » permet', () => {
  it('par défaut : tout ce qui reste, sur la poche d’urgence', () => {
    const r = leReste({ reste: 793_39, poches: [projet, poche()], choix: choix({ poche: null }) })
    expect(r).toMatchObject({ possible: true, mettre: true, mis: 793_39, rogne: false, raison: null })
    expect(r.poche?.id).toBe('p1')
  })

  it('sans poche : grisé, et rien ne part', () => {
    const r = leReste({ reste: 793_39, poches: [], choix: choix() })
    expect(r).toMatchObject({ possible: false, mettre: false, mis: 0, poche: null })
    expect(r.raison).toMatch(/poche/)
  })

  it('un reste négatif : grisé, rien ne part — jamais une mise de côté de −0,01 €', () => {
    const r = leReste({ reste: -1, poches: [poche()], choix: choix() })
    expect(r).toMatchObject({ possible: false, mettre: false, mis: 0 })
    expect(r.raison).toMatch(/rien/i)
  })

  it('un reste de 0 : grisé aussi', () => {
    expect(leReste({ reste: 0, poches: [poche()], choix: choix() }).possible).toBe(false)
  })

  it('« Le garder sur le compte » : 0, quelle que soit la saisie', () => {
    const r = leReste({ reste: 793_39, poches: [poche()], choix: choix({ garder: true, combien: '12' }) })
    expect(r).toMatchObject({ possible: true, mettre: false, mis: 0, poche: null, tape: null })
  })

  it('un montant tapé s’entend au centime : « 316,80 » → 31 680', () => {
    const r = leReste({ reste: 793_39, poches: [poche()], choix: choix({ combien: '316,80' }) })
    expect(r.mis).toBe(316_80)
    expect(r.rogne).toBe(false)
  })

  it('tapé au-delà de ce qui reste : ramené au reste, et dit', () => {
    const r = leReste({ reste: 793_39, poches: [poche()], choix: choix({ combien: '793,40' }) })
    expect(r).toMatchObject({ mis: 793_39, rogne: true })
  })

  it('tapé pile au reste, centime impair compris : pas rogné', () => {
    const r = leReste({ reste: 793_39, poches: [poche()], choix: choix({ combien: '793,39' }) })
    expect(r).toMatchObject({ mis: 793_39, rogne: false })
  })

  it('un champ vide ou illisible : mis null — la phrase de la poche ne dit alors aucun chiffre', () => {
    for (const combien of ['', 'abc', '1,2,3', '1e3']) {
      const r = leReste({ reste: 793_39, poches: [poche()], choix: choix({ combien }) })
      expect(r.mis, combien).toBeNull()
    }
  })

  it('un champ vide ne reproche rien (pas de refus) mais dit pourquoi « Clôturer » attend ; un texte illisible dit ce qu’il attend', () => {
    const vide = leReste({ reste: 793_39, poches: [poche()], choix: choix({ combien: '' }) })
    expect(vide.tape?.refus).toBeNull()
    expect(vide.vide).toBe(true)
    expect(leReste({ reste: 793_39, poches: [poche()], choix: choix({ combien: '  ' }) }).vide).toBe(true)
    for (const combien of [null, '0', '12', 'abc']) {
      expect(leReste({ reste: 793_39, poches: [poche()], choix: choix({ combien }) }).vide, String(combien))
        .toBe(false)
    }
    const faux = leReste({ reste: 793_39, poches: [poche()], choix: choix({ combien: 'abc' }) })
    expect(faux.tape?.refus).toMatch(/montant/)
  })

  it('0 € tapé est permis : on peut ne rien mettre aujourd’hui', () => {
    const r = leReste({ reste: 793_39, poches: [poche()], choix: choix({ combien: '0' }) })
    expect(r.mis).toBe(0)
  })
})

describe('envoiDuReste — ce que la page envoie à cloture_le_mois', () => {
  const envoi = (reste: number, poches: Poche[], c: ChoixDuReste) =>
    envoiDuReste({ reste, poches, choix: c })

  it('« Tout ce qui reste » part tel quel : null, la base met de côté son propre reste', () => {
    expect(envoi(793_39, [poche()], choix())).toEqual({ valide: true, misDeCote: null, poche: 'p1' })
  })

  it('le garder : 0 et pas de poche', () => {
    expect(envoi(793_39, [poche()], choix({ garder: true })))
      .toEqual({ valide: true, misDeCote: 0, poche: null })
  })

  it('sans poche, ou sans reste : 0, la clôture ne bloque jamais', () => {
    expect(envoi(793_39, [], choix())).toEqual({ valide: true, misDeCote: 0, poche: null })
    expect(envoi(-5_00, [poche()], choix())).toEqual({ valide: true, misDeCote: 0, poche: null })
  })

  it('une saisie : les centimes tapés, que la base ramènera à son reste', () => {
    expect(envoi(793_39, [poche()], choix({ combien: '300' })))
      .toEqual({ valide: true, misDeCote: 300_00, poche: 'p1' })
    /* 793,40 > 793,39 de l'écran : on n'envoie pas 793,39, la base juge à son propre centime. */
    expect(envoi(793_39, [poche()], choix({ combien: '793,40' })))
      .toEqual({ valide: true, misDeCote: 793_40, poche: 'p1' })
  })

  it('une saisie illisible bloque l’envoi — mais pas quand on garde l’argent', () => {
    expect(envoi(793_39, [poche()], choix({ combien: 'abc' })).valide).toBe(false)
    expect(envoi(793_39, [poche()], choix({ combien: '' })).valide).toBe(false)
    expect(envoi(793_39, [poche()], choix({ combien: 'abc', garder: true })).valide).toBe(true)
    expect(envoi(-5_00, [poche()], choix({ combien: 'abc' })).valide).toBe(true)
  })

  it('la poche choisie qui n’existe plus : la poche défaut part, jamais l’identifiant fantôme', () => {
    expect(envoi(793_39, [poche(), projet], choix({ poche: 'disparue' })).poche).toBe('p1')
  })
})

describe('phraseDeLaPoche', () => {
  it('l’urgence se dit « Ton épargne d’urgence », avec son objectif', () => {
    expect(phraseDeLaPoche(poche(), 0, 793_40))
      .toBe('Ton épargne d’urgence passe à 793,40 € sur 4' + FINE + '000 €.')
  })

  it('une autre poche garde son nom, et sans objectif ne dit pas « sur »', () => {
    expect(phraseDeLaPoche(projet, 120_01, 79_33)).toBe('Vacances passe à 199,34 €.')
  })

  it('un cumul négatif se dit avec son signe', () => {
    expect(phraseDeLaPoche(poche({ objectif_cents: null }), -200_00, 79_33))
      .toBe('Ton épargne d’urgence passe à −120,67 €.')
  })
})

describe('voisinDuChoix — les flèches d’un radiogroup', () => {
  it('→ et ↓ vont au suivant, ← et ↑ au précédent, en boucle', () => {
    expect(voisinDuChoix(0, 'ArrowRight', [true, true, true])).toBe(1)
    expect(voisinDuChoix(2, 'ArrowDown', [true, true, true])).toBe(0)
    expect(voisinDuChoix(0, 'ArrowLeft', [true, true, true])).toBe(2)
    expect(voisinDuChoix(1, 'ArrowUp', [true, true, true])).toBe(0)
  })

  it('saute ce qui est grisé', () => {
    expect(voisinDuChoix(1, 'ArrowLeft', [false, true])).toBeNull()
    expect(voisinDuChoix(0, 'ArrowRight', [true, false, true])).toBe(2)
  })

  it('toute autre touche reste au navigateur', () => {
    for (const t of ['Tab', 'Enter', ' ', 'a']) expect(voisinDuChoix(0, t, [true, true])).toBeNull()
  })

  it('un seul choix permis : pas de voisin', () => {
    expect(voisinDuChoix(0, 'ArrowRight', [true])).toBeNull()
  })
})
