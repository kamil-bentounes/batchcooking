import { describe, expect, it } from 'vitest'
import { maPart, montant, montantCompte, resteDuMois, revenuDuMois, type Ligne, type Saisie }
  from './mois.ts'

const K = 'kamil'
const T = 'thauba'

/** Une ligne du mois, prévue et partagée comme on le demande. */
function ligne(o: Partial<Ligne> & { parts?: [string, number][] } = {}): Ligne {
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
