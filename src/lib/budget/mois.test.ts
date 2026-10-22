import { describe, expect, it } from 'vitest'
import { aDire, bandeau, barre, dansLeFiltre, dateCourte, joursProposes, joursRestants, ligneDuHub,
         maPart, partDesSoldes, montant, montantCompte, moisDemande, moisVoisin, nomDuMois, nomDuMoisDate, parCategorie,
         partSur, pourcentages, recapCloture, resteDuMois, revenuDuMois, sousLEuro, totauxDuFiltre, type Ligne,
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

describe('ma part sur un mois clôturé', () => {
  it('une ligne au fil du mois vaut sa part en base, pas un recalcul sur les saisies', () => {
    const l = ligne({ id: 'courses', montant_cents: 22_880, montant_prevu_cents: 80_000,
                      parts: [[K, 13_728], [T, 9_152]] })
    const saisies = [saisie('courses', 90_000)]
    expect(maPart(l, K, saisies, true)).toBe(13_728)
    expect(maPart(l, K, saisies, false), 'ouvert : max(prévu, déclaré)')
      .toBe(Math.round(90_000 * 13_728 / 22_880))
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
  it('posé le dernier jour du mois, il vaut ce mois ; le lendemain, le suivant', () => {
    const revenus = [
      { user_profile_id: K, net_mensuel_cents: 400_000, valid_from: '2026-01-01' },
      { user_profile_id: K, net_mensuel_cents: 450_000, valid_from: '2026-10-31' },
      { user_profile_id: K, net_mensuel_cents: 500_000, valid_from: '2026-11-01' },
      { user_profile_id: T, net_mensuel_cents: 999_999, valid_from: '2026-10-01' },
    ]
    expect(revenuDuMois(revenus, K, '2026-10-01')).toBe(450_000)
    expect(revenuDuMois(revenus, K, '2026-11-01')).toBe(500_000)
    expect(revenuDuMois(revenus, K, '2026-09-01')).toBe(400_000)
    // Février d'une année bissextile : son dernier jour est le 29.
    expect(revenuDuMois([{ user_profile_id: K, net_mensuel_cents: 1, valid_from: '2028-02-29' }],
                        K, '2028-02-01')).toBe(1)
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

describe('les totaux du filtre avec des saisies', () => {
  it('comptent max(prévu, déclaré) des lignes au fil du mois, dans chaque filtre', () => {
    const lignes = [
      ligne({ id: 'courses', charge_id: 'courses', montant_cents: 80_000 }),
      ligne({ id: 'forfait', charge_id: 'forfait', montant_cents: 5_000 }),
    ]
    const saisies = [saisie('courses', 50_000), saisie('courses', 40_000),
                     saisie('forfait', 1_000)]
    expect(totauxDuFiltre(lignes, charges, saisies, K, false))
      .toEqual({ tout: 95_000, commun: 90_000, moi: 5_000 })
    expect(totauxDuFiltre(lignes, charges, saisies, K, true))
      .toEqual({ tout: 85_000, commun: 80_000, moi: 5_000 })
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
  it('à poids égal, les lignes se rangent par libellé, à la française', () => {
    const lignes = [
      ligne({ id: '1', libelle: 'Resto', charge_id: 'courses', montant_cents: 10_000 }),
      ligne({ id: '2', libelle: 'Fruits', charge_id: 'courses', montant_cents: 10_000 }),
      ligne({ id: '3', libelle: 'Épicerie', charge_id: 'courses', montant_cents: 10_000 }),
    ]
    expect(parCategorie({ lignes, charges, saisies: [], filtre: 'tout', moi: K, clos: false })[0]
      .lignes.map(l => l.libelle)).toEqual(['Épicerie', 'Fruits', 'Resto'])
  })
  it('compte les montants à dire de chaque catégorie', () => {
    const lignes = [
      ligne({ id: 'a', charge_id: 'courses' }), ligne({ id: 'b', charge_id: 'courses' }),
      ligne({ id: 'c', charge_id: 'pharmacie' }),
      ligne({ id: 'd', charge_id: 'loyer', facon: 'fixe', montant_cents: 90_000 }),
    ]
    const saisies = [saisie('b', 1_000)]
    const dires = (clos: boolean) => Object.fromEntries(
      parCategorie({ lignes, charges, saisies, filtre: 'tout', moi: K, clos })
        .map(c => [c.cle, c.aDire]))
    expect(dires(false)).toEqual({ maison: 0, vie_courante: 1, sante: 1 })
    expect(dires(true)).toEqual({ maison: 0, vie_courante: 0, sante: 0 })
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
  it('une valeur négative vaut 0 et ne pèse pas dans le total', () => {
    expect(pourcentages([-10, 1, 3])).toEqual([0, 25, 75])
    expect(pourcentages([-5, -5])).toEqual([0, 0])
  })
  it('le point en trop va au plus fort reste, pas au premier', () => {
    // 33,33 et 66,67 : le reste de 2/3 l'emporte, 33 + 67.
    expect(pourcentages([1, 2])).toEqual([33, 67])
    expect(pourcentages([2, 1, 0])).toEqual([67, 33, 0])
    // À reste égal, le premier de la liste.
    expect(pourcentages([1, 1, 1, 0])).toEqual([34, 33, 33, 0])
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

describe('la barre, aux bords', () => {
  const ch = new Map([...charges, ['rien', { id: 'rien', categorie: 'sante', commun: true }]])
  it('un segment à 0 centime ne s’affiche pas, et un reste exactement nul non plus', () => {
    const l = [
      ligne({ id: 'a', charge_id: 'loyer', facon: 'fixe', montant_cents: 200_000 }),
      ligne({ id: 'b', charge_id: 'courses', montant_cents: 100_000 }),
      ligne({ id: 'z', charge_id: 'rien', facon: 'fixe', montant_cents: 0, parts: [[K, 0]] }),
    ]
    const b = barre({ lignes: l, charges: ch, saisies: [], moi: K, revenu: 300_000, clos: false })
    expect(b.map(s => [s.cle, s.cents, s.pourcent]))
      .toEqual([['maison', 200_000, 67], ['vie_courante', 100_000, 33]])
  })
  it('un reste d’un centime s’affiche', () => {
    const l = [ligne({ id: 'a', charge_id: 'loyer', facon: 'fixe', montant_cents: 299_999 })]
    expect(barre({ lignes: l, charges: ch, saisies: [], moi: K, revenu: 300_000, clos: false })
      .map(s => s.cle)).toEqual(['maison', 'reste'])
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
    expect(joursProposes('2026-10-01', '2026-10-19')).toEqual({
      choix: [{ libelle: 'Aujourd’hui', date: '2026-10-19' }, { libelle: 'Hier', date: '2026-10-18' }],
      min: '2026-10-01', max: '2026-10-19' })
    expect(joursProposes('2026-03-01', '2026-03-02').choix.map(c => c.date))
      .toEqual(['2026-03-02', '2026-03-01'])
    expect(joursProposes('2026-10-01', '2026-10-01').choix)
      .toEqual([{ libelle: 'Aujourd’hui', date: '2026-10-01' }])
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
  it('les soldes entrent dans X : ils comptent contre le revenu, X + Y fait toujours le chiffre', () => {
    const lignes = [
      ligne({ id: 'courses', charge_id: 'courses', montant_cents: 80_000 }),
      ligne({ id: 'internet', charge_id: 'internet', facon: 'fixe', montant_cents: 3_700 }),
    ]
    const saisies = [saisie('courses', 70_000)]
    const base = { revenu: 432_500, lignes, saisies, moi: K, factures: new Map<string, number>(),
                   rien: new Set<string>() }
    const sans = recapCloture({ ...base, soldes: 0 })
    // Un solde négatif (de l'argent qui revient) allège X ; un positif (à payer) l'alourdit.
    const rend = recapCloture({ ...base, soldes: -16_668 })
    expect(rend.prevus).toBe(sans.prevus + 16_668)
    expect(rend.ecart).toBe(sans.ecart)
    expect(rend.reste).toBe(rend.prevus + rend.ecart)
    const doit = recapCloture({ ...base, soldes: 8_334 })
    expect(doit.prevus).toBe(sans.prevus - 8_334)
    expect(doit.reste).toBe(sans.reste - 8_334)
  })
  it('seul au foyer, tout le solde est le mien : le chiffre est sûr', () => {
    expect(partDesSoldes([{ cents: -16_668 }, { cents: 8_334 }], 1)).toEqual({ cents: -8_334, incertain: false })
  })
  it('sans solde, rien à répartir : sûr, à deux comme seul (onze mois sur douze)', () => {
    expect(partDesSoldes([], 2)).toEqual({ cents: 0, incertain: false })
    expect(partDesSoldes([], undefined)).toEqual({ cents: 0, incertain: false })
  })
  /* La base répartit le solde selon ce que CHACUN a porté sur l'année (`recale_l_annee`) et
     `apercu_des_soldes` ne rend que le total : à deux, ma part n'est pas lisible. Un prorata
     des parts de décembre annonçait −83,34 € à Kamil pour −125 € posés (`tests/budget-solde-part`). */
  it('à deux, ma part n’est pas connue : on ne chiffre rien (0) et on le dit (incertain)', () => {
    expect(partDesSoldes([{ cents: -16_668 }], 2)).toEqual({ cents: 0, incertain: true })
  })
  it('le foyer pas lu : on ne sait pas si l’on est seul, donc incertain', () => {
    expect(partDesSoldes([{ cents: -16_668 }], undefined)).toEqual({ cents: 0, incertain: true })
  })
  it('un récap sans part des soldes est « avant les soldes » : X + Y fait ce chiffre, marqué incertain', () => {
    const lignes = [ligne({ id: 'courses', charge_id: 'courses', montant_cents: 80_000 })]
    const base = { revenu: 432_500, lignes, saisies: [], moi: K, factures: new Map<string, number>(),
                   rien: new Set<string>() }
    const sur = recapCloture({ ...base, soldes: 0 })
    const inc = recapCloture({ ...base, soldes: null })
    expect(sur.incertain).toBeUndefined()
    expect(inc.incertain).toBe(true)
    expect({ ...inc, incertain: undefined }).toEqual(sur)
  })
  it('une ligne aux parts nulles se partage sur ses points de base, comme partSur', () => {
    // Une provision à 0 € : les parts en centimes sont nulles, les points de base restent.
    const lignes = [ligne({ id: 'e', charge_id: 'entretien', facon: 'mis_de_cote',
                            montant_cents: 0, montant_prevu_cents: 0, parts: [[K, 0], [T, 0]] })]
    expect(partSur(lignes[0], K, -1_000)).toBe(-500)
  })
})

describe('sousLEuro', () => {
  it('un reste non nul que l’arrondi à l’euro ferait tomber à « 0 € »', () => {
    expect(sousLEuro(-30)).toBe(true)
    expect(sousLEuro(30)).toBe(true)
    expect(sousLEuro(49)).toBe(true)
  })
  it('0 exactement, et dès 50 centimes (qui arrondit à 1 €), non', () => {
    expect(sousLEuro(0)).toBe(false)
    expect(sousLEuro(50)).toBe(false)
    expect(sousLEuro(-50)).toBe(false)
    expect(sousLEuro(-3_000)).toBe(false)
  })
})

describe('nomDuMoisDate — l’année dès qu’elle n’est pas la courante', () => {
  it('l’année courante : le nom seul', () => {
    expect(nomDuMoisDate('2026-09-01', '2026-10-01')).toBe('septembre')
  })
  it('une autre année : le nom et l’année — « septembre » seul ne dit pas lequel', () => {
    expect(nomDuMoisDate('2025-09-01', '2026-10-01')).toBe('septembre 2025')
    expect(nomDuMoisDate('2030-05-01', '2026-10-01')).toBe('mai 2030')
  })
})

describe('moisDemande — le mois que l’adresse demande', () => {
  const courant = '2026-10-01'
  it('sans adresse de mois : le mois courant', () => {
    expect(moisDemande(undefined, courant)).toEqual({ mois: courant, futur: false })
  })
  it('un mois passé ou le courant : tel quel', () => {
    expect(moisDemande('2025-09-01', courant)).toEqual({ mois: '2025-09-01', futur: false })
    expect(moisDemande(courant, courant)).toEqual({ mois: courant, futur: false })
  })
  it('un mois à venir : le courant — et « futur », pour que l’écran quitte cette adresse fausse', () => {
    expect(moisDemande('2030-05-01', courant)).toEqual({ mois: courant, futur: true })
    expect(moisDemande('2026-11-01', courant)).toEqual({ mois: courant, futur: true })
  })
  it('une adresse illisible : le courant, sans « futur » (rien à rediriger)', () => {
    expect(moisDemande('2026-13-01', courant)).toEqual({ mois: courant, futur: false })
    expect(moisDemande('n’importe quoi', courant)).toEqual({ mois: courant, futur: false })
  })
})
