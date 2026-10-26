import { describe, expect, it } from 'vitest'
import {
  bilanDuFrigo, corrections, depuisLeChamp, ecritLaPrise, jourAbrege, jourEtHeure, lisLeReste,
  ordreDeRangement, phraseDuCongelo, phraseDuFrigo, plusDeJours, pourLeChamp, pourLeFoyer,
  propositionAuFrigo, puces, resteApres, resteAuFrigo,
} from './ranger.ts'
import type { LignePrise } from './ranger.ts'

/** Dimanche 25 octobre 2026, 21 h 26 : la session de Kamil. */
const RANGE = new Date(2026, 9, 25, 21, 26)

describe('propositionAuFrigo — quatre jours de dîners pour le foyer', () => {
  const plats = [
    { recipeId: 'lasagnes', total: 6 }, { recipeId: 'pizza', total: 2 },
    { recipeId: 'burger', total: 2 }, { recipeId: 'wrap', total: 20 },
  ]
  it('deux membres : huit barquettes au frigo, dans l’ordre du cycle, le reste au congélateur', () => {
    expect(propositionAuFrigo(plats, 2)).toEqual({ lasagnes: 6, pizza: 2, burger: 0, wrap: 0 })
  })
  it('une recette n’est coupée que si la place manque en cours de route', () => {
    expect(propositionAuFrigo([{ recipeId: 'a', total: 5 }, { recipeId: 'b', total: 5 }], 1))
      .toEqual({ a: 4, b: 0 })
    expect(propositionAuFrigo([{ recipeId: 'a', total: 3 }, { recipeId: 'b', total: 5 }], 1))
      .toEqual({ a: 3, b: 1 })
  })
  it('trois membres : douze places', () => {
    const r = propositionAuFrigo(plats, 3)
    expect(Object.values(r).reduce((s, n) => s + n, 0)).toBe(12)
  })
  it('petite session : tout tient au frigo', () => {
    expect(propositionAuFrigo([{ recipeId: 'a', total: 3 }], 2)).toEqual({ a: 3 })
  })
  it('sans membre, une place pour un', () => {
    expect(propositionAuFrigo([{ recipeId: 'a', total: 9 }], 0)).toEqual({ a: 4 })
  })
  it('rien à ranger : rien', () => expect(propositionAuFrigo([], 2)).toEqual({}))
})

describe('les dates, en mots', () => {
  it('un jour abrégé, comme la maquette', () => expect(jourAbrege(RANGE)).toBe('dim. 25 oct.'))
  it('le jour et l’heure du rangement', () => expect(jourEtHeure(RANGE)).toBe('dim. 25 oct. à 21 h 26'))
  it('les minutes gardent leur zéro', () => {
    expect(jourEtHeure(new Date(2026, 0, 3, 8, 5))).toBe('sam. 3 janv. à 8 h 05')
  })
  it('le frigo garde quatre jours : jeudi 29 octobre', () => {
    expect(phraseDuFrigo(8, RANGE)).toBe('à manger avant le jeu. 29 oct.')
    expect(phraseDuFrigo(0, RANGE)).toBe('rien au frais')
  })
  it('le congélateur garde 90 jours : samedi 23 janvier', () => {
    expect(phraseDuCongelo(22, RANGE)).toBe('se garde jusqu’au sam. 23 janv.')
    expect(phraseDuCongelo(0, RANGE)).toBe('rien au froid')
  })
  it('plusDeJours passe le changement d’heure sans glisser d’un jour', () => {
    // Le 25 octobre 2026 est le dernier dimanche d'octobre : le soir, la France recule d'une heure.
    expect(jourAbrege(plusDeJours(new Date(2026, 9, 24, 23, 30), 2))).toBe('lun. 26 oct.')
  })
})

describe('le champ date et heure', () => {
  it('se remplit en heure locale, à la minute', () => expect(pourLeChamp(RANGE)).toBe('2026-10-25T21:26'))
  it('se relit à l’identique', () => {
    expect(depuisLeChamp('2026-10-25T21:26')?.getTime()).toBe(RANGE.getTime())
  })
  it('vide, ou illisible, ou un jour qui n’existe pas : rien', () => {
    expect(depuisLeChamp('')).toBeNull()
    expect(depuisLeChamp('demain')).toBeNull()
    expect(depuisLeChamp('2026-02-31T10:00')).toBeNull()
  })
})

describe('bilanDuFrigo', () => {
  it('huit barquettes pour deux : quatre jours, rien à redire', () => {
    const b = bilanDuFrigo(8, 2, RANGE)
    expect(b.titre).toBe('8 barquettes au frigo')
    expect(b.texte).toBe('De quoi tenir 4 jours de dîners pour vous deux. Le frigo garde 4 jours.')
    expect(b.trop).toBe(false)
    expect(b.jours).toBe(4)
  })
  it('neuf pour deux : trop — et il dit quand ça périme', () => {
    const b = bilanDuFrigo(9, 2, RANGE)
    expect(b.trop).toBe(true)
    expect(b.texte).toBe('C’est plus de 4 jours de dîners pour vous deux : congèle-en quelques-unes, '
      + 'les dernières périmeront après le jeu. 29 oct.')
  })
  it('une barquette, un jour, le singulier', () => {
    expect(bilanDuFrigo(1, 1, RANGE).titre).toBe('1 barquette au frigo')
    expect(bilanDuFrigo(2, 2, RANGE).texte).toContain('1 jour de dîners')
  })
  it('rien au frigo : zéro jour, sans pluriel', () => {
    const b = bilanDuFrigo(0, 2, RANGE)
    expect(b.titre).toBe('0 barquette au frigo')
    expect(b.texte).toContain('0 jour de dîners')
  })
  it('seul, on le dit « toi »', () => expect(pourLeFoyer(1)).toBe('toi'))
  it('à cinq, « vous cinq » ; au-delà, un nombre', () => {
    expect(pourLeFoyer(5)).toBe('vous cinq')
    expect(pourLeFoyer(9)).toBe('vous 9')
  })
})

describe('ordreDeRangement — chacun son tour', () => {
  it('alterne : le frais ne va pas tout entier au premier', () => {
    expect(ordreDeRangement([{ userId: 'k', nombre: 3 }, { userId: 't', nombre: 3 }]))
      .toEqual(['k', 't', 'k', 't', 'k', 't'])
  })
  it('un nombre inégal : le plus servi finit seul', () => {
    expect(ordreDeRangement([{ userId: 'k', nombre: 3 }, { userId: 't', nombre: 1 }]))
      .toEqual(['k', 't', 'k', 'k'])
  })
  it('personne : rien', () => expect(ordreDeRangement([])).toEqual([]))
  it('la main passe : on peut commencer par la seconde personne', () => {
    const parts = [{ userId: 'k', nombre: 2 }, { userId: 't', nombre: 2 }]
    expect(ordreDeRangement(parts, 1)).toEqual(['t', 'k', 't', 'k'])
    expect(ordreDeRangement(parts, 2), 'un tour complet revient au début').toEqual(['k', 't', 'k', 't'])
  })
})

describe('ecritLaPrise', () => {
  it('les grammes passent en kilos au-delà de mille', () => {
    expect(ecritLaPrise(1500, 'g')).toBe('1,5 kg')
    expect(ecritLaPrise(2250, 'g')).toBe('2,25 kg')
    expect(ecritLaPrise(750, 'g')).toBe('750 g')
  })
  it('les ml restent en ml jusqu’au litre', () => {
    expect(ecritLaPrise(750, 'ml')).toBe('750 ml')
    expect(ecritLaPrise(1250, 'ml')).toBe('1,25 l')
  })
  it('à l’unité : le nombre seul', () => {
    expect(ecritLaPrise(20, null)).toBe('20')
    expect(ecritLaPrise(4, 'u')).toBe('4')
  })
})

describe('lisLeReste', () => {
  it('lit « 0 », « 1,5 » et « 300 »', () => {
    expect(lisLeReste('0')).toBe(0)
    expect(lisLeReste('1,5')).toBe(1.5)
    expect(lisLeReste(' 300 ')).toBe(300)
  })
  it('refuse le vide, le texte et le négatif', () => {
    expect(lisLeReste('')).toBeNull()
    expect(lisLeReste('un peu')).toBeNull()
    expect(lisLeReste('-2')).toBeNull()
  })
})

const ligne = (o: Partial<LignePrise> & { stock_item_id: string }): LignePrise => ({
  libelle: 'x', lieu: 'frigo', quantite: 1500, unite: 'g', prise: 1500, reste: 0, calculable: true, ...o,
})

describe('les puces et les corrections', () => {
  const poireaux = ligne({ stock_item_id: 'p', libelle: 'Poireaux' })
  const ail = ligne({ stock_item_id: 'a', libelle: 'Ail', quantite: null, prise: null, reste: null, calculable: false })
  const zero = ligne({ stock_item_id: 'z', prise: 0, reste: 1500 })
  const lait = ligne({ stock_item_id: 'l', quantite: 2000, unite: 'ml', prise: 750, reste: 1250 })

  it('seul ce qui est calculable et sort vraiment fait une puce', () => {
    expect(puces([poireaux, ail, zero, lait]).map(l => l.stock_item_id)).toEqual(['p', 'l'])
  })
  it('une correction l’emporte sur le calcul', () => {
    expect(corrections([poireaux, lait], { p: 400 })).toEqual({ p: 400 })
  })
  it('une correction qui retombe sur le calcul ne part pas', () => {
    expect(corrections([poireaux, lait], { p: 0, l: 1250 })).toEqual({})
  })
  it('bornée au stock, et jamais négative', () => {
    expect(corrections([poireaux], { p: 99_999 })).toEqual({ p: 1500 })
    expect(corrections([lait], { l: -3 })).toEqual({ l: 0 })
  })
  it('ne parle que de ce qui est affiché', () => {
    expect(corrections([poireaux], { ail: 3, inconnu: 1 })).toEqual({})
  })
  it('le reste affiché suit la correction', () => {
    expect(resteApres(poireaux, {})).toBe(0)
    expect(resteApres(poireaux, { p: 400 })).toBe(400)
    expect(resteApres(poireaux, { p: 1e9 })).toBe(1500)
  })
})

describe('resteAuFrigo', () => {
  const stock = [
    { id: 'p', label: 'Poireaux', location: 'frigo' },
    { id: 'y', label: 'Yaourts dessert protéinés', location: 'frigo' },
    { id: 'a', label: 'Ail', location: 'frigo' },
    { id: 'c', label: 'Petits pois', location: 'congelateur' },
  ]
  it('le frigo moins ce que la session prend, sans le congélateur', () => {
    const lignes = [
      ligne({ stock_item_id: 'p' }),
      ligne({ stock_item_id: 'a', quantite: null, prise: null, reste: null, calculable: false }),
    ]
    expect(resteAuFrigo(stock, lignes)).toEqual(['Yaourts dessert protéinés', 'Ail'])
  })
  it('aucune ligne prise : tout le frigo reste', () => {
    expect(resteAuFrigo(stock, [])).toEqual(['Poireaux', 'Yaourts dessert protéinés', 'Ail'])
  })
})
