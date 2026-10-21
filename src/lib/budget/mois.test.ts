import { describe, expect, it } from 'vitest'
import { aDire, bandeau, barre, dansLeFiltre, dateCourte, joursProposes, joursRestants, ligneDuHub,
         maPart, maPartDesSoldes, montant, montantCompte, moisVoisin, nomDuMois, parCategorie,
         pourcentages, recapCloture, resteDuMois, revenuDuMois, totauxDuFiltre, type Ligne,
         type Saisie } from './mois.ts'

const K = 'kamil'
const T = 'thauba'

/** Une ligne du mois, prévue et partagée comme on le demande. */
function ligne(o: Omit<Partial<Ligne>, 'parts'> & { parts?: [string, number][] } = {}): Ligne {
  const { parts, ...reste } = o
  const montantCents = o.montant_cents ?? 80_000
  const liste = parts ?? [[K, montantCents]]
  const total = liste.reduce((t, [, c]) => t + c, 0)
  return {
    id: o.id ?? `l-${Math.random()}`, charge_id: o.charge_id ?? 'c', libelle: o.libelle ?? 'Courses',
    montant_cents: montantCents, montant_prevu_cents: o.montant_prevu_cents ?? montantCents,
    facon: o.facon === undefined ? 'au_fil' : o.facon, confirme_le: o.confirme_le ?? null,
    regularise_annee: o.regularise_annee ?? null,
    ...reste,
    // Les points de base, comme la base les fige : ils survivent à une ligne confirmée à 0 €.
    parts: liste.map(([user_profile_id, part_cents]) => ({
      user_profile_id, part_cents,
      part_bps: total === 0 ? Math.round(10_000 / liste.length)
                            : Math.round((part_cents * 10_000) / total) })),
  }
}
const saisie = (depense: string, cents: number, jour = '2026-10-03'): Saisie =>
  ({ id: `s-${Math.random()}`, depense_id: depense, fait_le: jour, montant_cents: cents,
     saisi_par: K })

describe('le montant compté au fil du mois', () => {
  it('vaut max(prévu, déclaré) tant que le mois est ouvert', () => {
    const l = ligne({ id: 'courses' })
    expect(montantCompte(l, [saisie('courses', 22_880)], false)).toBe(80_000)
    expect(montantCompte(l, [saisie('courses', 50_000), saisie('courses', 32_000)], false))
      .toBe(82_000)
  })
  it('vaut le montant en base sur un mois clôturé, et pour toute autre façon', () => {
    const l = ligne({ id: 'courses', montant_cents: 22_880, montant_prevu_cents: 80_000 })
    expect(montantCompte(l, [saisie('courses', 22_880)], true)).toBe(22_880)
    expect(montantCompte(ligne({ facon: 'fixe', montant_cents: 3_700 }), [], false)).toBe(3_700)
  })
  it('un mois rouvert revient au calcul d’un mois ouvert', () => {
    // Confirmée à 0 par « Rien dépensé », puis rouverte sans saisie : le prévu revient.
    const l = ligne({ id: 'sorties', montant_cents: 0, montant_prevu_cents: 10_000,
                      confirme_le: '2026-11-01T10:00:00Z', parts: [[K, 0]] })
    expect(montantCompte(l, [], false)).toBe(10_000)
    expect(maPart(l, K, [], false), 'des parts nulles effaçaient le prévu revenu').toBe(10_000)
  })
})

describe('« Il te reste »', () => {
  const revenus = [
    { user_profile_id: K, net_mensuel_cents: 370_000, valid_from: '2026-01-01' },
    { user_profile_id: T, net_mensuel_cents: 240_000, valid_from: '2026-01-01' },
  ]
  it('à deux, ne compte que mes parts', () => {
    const lignes = [
      ligne({ id: 'loyer', facon: 'fixe', montant_cents: 100_000, parts: [[K, 60_656], [T, 39_344]] }),
      ligne({ id: 'pharmacie', libelle: 'Pharmacie', montant_cents: 2_000, parts: [[T, 2_000]] }),
      ligne({ id: 'forfait', facon: 'fixe', montant_cents: 1_990, parts: [[K, 1_990]] }),
    ]
    expect(resteDuMois({ lignes, saisies: [], moi: K, revenus, mois: '2026-10-01', clos: false }))
      .toEqual({ revenu: 370_000, charges: 62_646, reste: 370_000 - 62_646 })
    expect(maPart(lignes[1], K, [], false), 'la Pharmacie de Thauba compte pour Kamil').toBe(0)
  })
  it('au fil du mois, ma part de max(prévu, déclaré)', () => {
    const l = ligne({ id: 'courses', parts: [[K, 48_525], [T, 31_475]] })
    expect(maPart(l, K, [saisie('courses', 90_000)], false)).toBe(Math.round(90_000 * 48_525 / 80_000))
  })
  it('sans revenu ce mois-là, il n’y a pas de reste', () => {
    expect(resteDuMois({ lignes: [ligne()], saisies: [], moi: K, revenus: [], mois: '2026-10-01',
                         clos: false }).reste).toBeNull()
  })
  it('le reste peut être négatif', () => {
    expect(resteDuMois({ lignes: [ligne({ montant_cents: 500_000 })], saisies: [], moi: K,
      revenus, mois: '2026-10-01', clos: false }).reste).toBe(-130_000)
  })
})

describe('le revenu du mois', () => {
  it('est celui en vigueur à la fin du mois, pas le dernier posé', () => {
    const revenus = [
      { user_profile_id: K, net_mensuel_cents: 432_500, valid_from: '2026-09-01' },
      { user_profile_id: K, net_mensuel_cents: 450_000, valid_from: '2027-01-01' },
    ]
    expect(revenuDuMois(revenus, K, '2026-12-01')).toBe(432_500)
    expect(revenuDuMois(revenus, K, '2027-01-01')).toBe(450_000)
    expect(revenuDuMois(revenus, K, '2026-08-01')).toBeNull()
  })
})

describe('les montants à l’écran', () => {
  it('sans « ,00 » quand ils sont ronds', () => {
    // L'espace des milliers est l'insécable fine (U+202F) que `toLocaleString('fr-FR')` produit.
    expect(montant(432_500)).toBe('4 325 €')
    expect(montant(42_680)).toBe('426,80 €')
    expect(montant(-16_668)).toBe('−166,68 €')
  })
})

const charges = new Map([
  ['loyer', { id: 'loyer', categorie: 'maison', commun: true }],
  ['courses', { id: 'courses', categorie: 'vie_courante', commun: true }],
  ['forfait', { id: 'forfait', categorie: 'abonnements', commun: false }],
  ['pharmacie', { id: 'pharmacie', categorie: 'sante', commun: false }],
  ['electricite', { id: 'electricite', categorie: 'maison', commun: true }],
])

describe('le filtre', () => {
  const lignes = [
    ligne({ id: 'l1', charge_id: 'loyer', facon: 'fixe', montant_cents: 100_000,
            parts: [[K, 60_656], [T, 39_344]] }),
    ligne({ id: 'l2', charge_id: 'forfait', facon: 'fixe', montant_cents: 1_990,
            parts: [[K, 1_990]] }),
    ligne({ id: 'l3', charge_id: 'pharmacie', montant_cents: 2_000, parts: [[T, 2_000]] }),
  ]
  it('« Tout » montre aussi les lignes perso de l’autre (D80)', () => {
    expect(lignes.filter(l => dansLeFiltre(l, charges, 'tout', K))).toHaveLength(3)
    expect(lignes.filter(l => dansLeFiltre(l, charges, 'commun', K)).map(l => l.id)).toEqual(['l1'])
    expect(lignes.filter(l => dansLeFiltre(l, charges, 'moi', K)).map(l => l.id)).toEqual(['l2'])
  })
  it('chaque filtre a son total', () => {
    expect(totauxDuFiltre(lignes, charges, [], K, false))
      .toEqual({ tout: 103_990, commun: 100_000, moi: 1_990 })
  })
})

describe('les catégories', () => {
  it('se trient par montant ; à montant égal, dans l’ordre de D74', () => {
    const lignes = [
      ligne({ id: 'a', charge_id: 'loyer', facon: 'fixe', montant_cents: 50_000 }),
      ligne({ id: 'b', charge_id: 'courses', montant_cents: 50_000 }),
      ligne({ id: 'c', charge_id: 'forfait', facon: 'fixe', montant_cents: 90_000 }),
    ]
    expect(parCategorie({ lignes, charges, saisies: [], filtre: 'tout', moi: K, clos: false })
      .map(c => c.cle)).toEqual(['abonnements', 'vie_courante', 'maison'])
  })
  it('les lignes d’une catégorie, de la plus lourde à la plus légère', () => {
    const lignes = [
      ligne({ id: 'e', charge_id: 'electricite', facon: 'facture', montant_cents: 5_000 }),
      ligne({ id: 'l', charge_id: 'loyer', facon: 'fixe', montant_cents: 58_000 }),
    ]
    expect(parCategorie({ lignes, charges, saisies: [], filtre: 'tout', moi: K, clos: false })[0]
      .lignes.map(l => l.id)).toEqual(['l', 'e'])
  })
})

describe('les montants à dire', () => {
  it('une ligne au fil du mois sans saisie ; pas une facture ; rien sur un mois clôturé', () => {
    const lignes = [
      ligne({ id: 'courses' }), ligne({ id: 'resto' }),
      ligne({ id: 'elec', facon: 'facture', montant_cents: 5_000 }),
    ]
    expect(aDire(lignes, [saisie('resto', 3_000)], false)).toBe(1)
    expect(aDire(lignes, [], true)).toBe(0)
  })
})

describe('les pourcentages', () => {
  it('font 100, au plus fort reste', () => {
    expect(pourcentages([1, 1, 1])).toEqual([34, 33, 33])
    for (const valeurs of [[3, 7, 11, 13], [100_000, 1], [5, 0, 5], [1, 2, 3, 4, 5, 6, 7]]) {
      expect(pourcentages(valeurs).reduce((t, x) => t + x, 0), String(valeurs)).toBe(100)
    }
    expect(pourcentages([0, 0])).toEqual([0, 0])
  })
})

describe('la barre du récap', () => {
  const lignes = [
    ligne({ id: 'a', charge_id: 'loyer', facon: 'fixe', montant_cents: 200_000 }),
    ligne({ id: 'b', charge_id: 'courses', montant_cents: 100_000 }),
  ]
  it('mes parts par catégorie, et le reste, en part du revenu', () => {
    const b = barre({ lignes, charges, saisies: [], moi: K, revenu: 400_000, clos: false })
    expect(b.map(s => [s.cle, s.pourcent])).toEqual([['maison', 50], ['vie_courante', 25],
                                                     ['reste', 25]])
  })
  it('quand il manque de l’argent : sur le total des charges, sans « Reste »', () => {
    const b = barre({ lignes, charges, saisies: [], moi: K, revenu: 250_000, clos: false })
    expect(b.map(s => [s.cle, s.pourcent])).toEqual([['maison', 67], ['vie_courante', 33]])
  })
  it('le segment « Reste » vaut « Il te reste », même quand une catégorie a une part nette négative', () => {
    // Auto : une provision de 4 167 et un ajustement de −16 668 (règlement d'un solde) :
    // −12 501 net. Filtrer la catégorie AVANT de calculer le reste le gonflait de 12 501.
    const l = [
      ligne({ id: 'm', charge_id: 'loyer', facon: 'fixe', montant_cents: 100_000 }),
      ligne({ id: 'p', charge_id: 'auto', facon: 'mis_de_cote', montant_cents: 4_167 }),
      ligne({ id: 'aj', charge_id: 'auto', facon: null, montant_cents: -16_668 }),
    ]
    const ch = new Map([...charges, ['auto', { id: 'auto', categorie: 'auto', commun: true }]])
    const b = barre({ lignes: l, charges: ch, saisies: [], moi: K, revenu: 400_000, clos: false })
    const attendu = resteDuMois({ lignes: l, saisies: [], moi: K, mois: '2026-10-01', clos: false,
      revenus: [{ user_profile_id: K, net_mensuel_cents: 400_000, valid_from: '2026-01-01' }] })
    expect(attendu.reste).toBe(312_501)
    expect(b.find(s => s.cle === 'reste')?.cents).toBe(312_501)
    expect(b.map(s => s.cle), 'la catégorie négative ne s’affiche pas').toEqual(['maison', 'reste'])
  })
})

describe('les dates', () => {
  it('courtes, à la française', () => {
    expect(dateCourte('2026-10-03')).toBe('Sam. 3 oct.')
    expect(dateCourte('2026-10-07')).toBe('Mer. 7 oct.')
    expect(dateCourte('2026-12-25')).toBe('Ven. 25 déc.')
  })
  it('le mois, ses voisins, ses jours restants', () => {
    expect(nomDuMois('2026-08-01')).toBe('août')
    expect(moisVoisin('2026-01-01', -1)).toBe('2025-12-01')
    expect(joursRestants('2026-10-01', '2026-10-01')).toBe(30)
    expect(joursRestants('2026-10-01', '2026-10-31')).toBe(0)
    expect(joursRestants('2026-09-01', '2026-10-05')).toBeNull()
  })
  it('les jours proposés tombent toujours dans le mois affiché', () => {
    expect(joursProposes('2026-10-01', '2026-10-19').choix.map(c => c.libelle))
      .toEqual(['Aujourd’hui', 'Hier'])
    expect(joursProposes('2026-10-01', '2026-10-01').choix.map(c => c.libelle),
      'le 1er, « Hier » est dans le mois d’avant').toEqual(['Aujourd’hui'])
    expect(joursProposes('2026-09-01', '2026-10-19'))
      .toEqual({ choix: [{ libelle: 'Mer. 30 sept.', date: '2026-09-30' }],
                 min: '2026-09-01', max: '2026-09-30' })
  })
})

describe('le bandeau', () => {
  const tout = { clos: () => false, aRevenu: () => true }
  it('avant le 27 : le rappel ; à partir du 27 : « se termine »', () => {
    expect(bandeau({ ...tout, clos: m => m === '2026-09-01', mois: '2026-10-01',
                     aujourdhui: '2026-10-19' })).toEqual({ genre: 'rappel', mois: '2026-10-01' })
    expect(bandeau({ ...tout, clos: m => m === '2026-09-01', mois: '2026-10-01',
                     aujourdhui: '2026-10-27' })).toEqual({ genre: 'bientot', mois: '2026-10-01' })
  })
  it('le mois précédent non clôturé passe devant, s’il a un revenu', () => {
    expect(bandeau({ ...tout, mois: '2026-10-01', aujourdhui: '2026-10-28' }))
      .toEqual({ genre: 'cloturer', mois: '2026-09-01' })
    expect(bandeau({ clos: () => false, aRevenu: m => m >= '2026-10-01', mois: '2026-10-01',
                     aujourdhui: '2026-10-05' })).toEqual({ genre: 'rappel', mois: '2026-10-01' })
  })
  it('un mois passé non clôturé, s’il a un revenu ; un mois clôturé, rien', () => {
    expect(bandeau({ ...tout, mois: '2026-08-01', aujourdhui: '2026-10-05' }))
      .toEqual({ genre: 'cloturer', mois: '2026-08-01' })
    expect(bandeau({ clos: () => false, aRevenu: () => false, mois: '2026-08-01',
                     aujourdhui: '2026-10-05' })).toBeNull()
    expect(bandeau({ clos: () => true, aRevenu: () => true, mois: '2026-10-01',
                     aujourdhui: '2026-10-05' })).toBeNull()
  })
})

describe('la carte du hub', () => {
  it('le mois à clôturer, puis les montants à dire, puis « Tout est à jour »', () => {
    expect(ligneDuHub({ aCloturer: '2026-09-01', aDire: 3 })).toBe('Septembre est à clôturer')
    expect(ligneDuHub({ aCloturer: null, aDire: 3 })).toBe('3 montants à dire')
    expect(ligneDuHub({ aCloturer: null, aDire: 1 })).toBe('1 montant à dire')
    expect(ligneDuHub({ aCloturer: null, aDire: 0 })).toBe('Tout est à jour')
  })
})

describe('le récap de la clôture', () => {
  it('X + Y fait le chiffre, avec un dépassement et une économie le même mois', () => {
    const lignes = [
      ligne({ id: 'courses', charge_id: 'courses', montant_cents: 80_000 }),
      ligne({ id: 'resto', charge_id: 'resto', montant_cents: 40_000 }),
      ligne({ id: 'sorties', charge_id: 'sorties', montant_cents: 10_000 }),
      ligne({ id: 'elec', charge_id: 'elec', facon: 'facture', montant_cents: 5_000 }),
      ligne({ id: 'internet', charge_id: 'internet', facon: 'fixe', montant_cents: 3_700 }),
    ]
    const saisies = [saisie('courses', 64_230), saisie('resto', 45_000)]
    const r = recapCloture({ revenu: 432_500, lignes, saisies, moi: K,
      factures: new Map([['elec', 6_200]]), rien: new Set(['sorties']), soldes: 0 })
    // Prévu : 80 000 + 40 000 + 10 000 + 6 200 + 3 700 = 139 900.
    expect(r.prevus).toBe(432_500 - 139_900)
    // Écart : +15 770 (courses) − 5 000 (resto) + 10 000 (sorties, rien dépensé).
    expect(r.ecart).toBe(20_770)
    expect(r.reste).toBe(r.prevus + r.ecart)
    expect(r.reste).toBe(432_500 - (64_230 + 45_000 + 0 + 6_200 + 3_700))
  })
  it('ma part des soldes que la clôture posera', () => {
    const lignes = [ligne({ id: 'e', charge_id: 'entretien', facon: 'mis_de_cote',
                            montant_cents: 4_167, parts: [[K, 2_084], [T, 2_083]] })]
    expect(maPartDesSoldes([{ charge: 'entretien', cents: -16_668 }], lignes, K))
      .toBe(Math.round(-16_668 * 2_084 / 4_167))
    expect(maPartDesSoldes([{ charge: 'autre', cents: -1_000 }], [], K)).toBe(-1_000)
  })
})
