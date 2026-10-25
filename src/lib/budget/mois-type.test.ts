import { describe, expect, it } from 'vitest'
import {
  filtreLesLignes, moisType, phraseDuPartage, sansFiltre, type ChargeDuMoisType, type FiltreDuTableau, type PartsParCle,
} from './mois-type.ts'

const K = 'kamil'
const T = 'thauba'
const NOVEMBRE = '2026-11-01'

/** 3 800 € et 2 400 € : 61,29 % et 38,71 %, comme la base les arrondit (`parts_du_mois`). */
const PARTS: PartsParCle = {
  foyer: { [K]: 6129, [T]: 3871 },
  prorata: { [K]: 6129, [T]: 3871 },
  moitie: { [K]: 5000, [T]: 5000 },
}
const REVENUS = [
  { user_profile_id: K, net_mensuel_cents: 380_000, valid_from: NOVEMBRE },
  { user_profile_id: T, net_mensuel_cents: 240_000, valid_from: NOVEMBRE },
]

function charge(o: Partial<ChargeDuMoisType> = {}): ChargeDuMoisType {
  return {
    id: o.id ?? `c-${Math.random()}`, libelle: 'Courses', montant_cents: 70_000, periodicite: 'mensuel',
    mode: 'au_fil', categorie: 'vie_courante', commun: true, cle: null, debut: NOVEMBRE, archive_le: null,
    participants: [K, T], ...o,
  }
}

describe('moisType', () => {
  it('partage une charge commune au prorata, au centime près, sans perdre un centime', () => {
    const m = moisType({ charges: [charge()], parts: PARTS, membres: [K, T], revenus: REVENUS, mois: NOVEMBRE })
    expect(m.lignes[0].parts).toEqual({ [K]: 42_903, [T]: 27_097 })
    expect(m.total).toBe(70_000)
  })

  it('ramène au mois ce qui se paie au trimestre ou à l’année', () => {
    const m = moisType({
      charges: [
        charge({ libelle: 'Copropriété', montant_cents: 30_000, periodicite: 'trimestriel', categorie: 'maison' }),
        charge({ libelle: 'Taxe foncière', montant_cents: 120_000, periodicite: 'annuel', categorie: 'maison',
                 commun: false, participants: [K] }),
      ],
      parts: PARTS, membres: [K, T], revenus: REVENUS, mois: NOVEMBRE,
    })
    expect(m.lignes.map(l => l.mensuel)).toEqual([10_000, 10_000])
    expect(m.lignes[1].parts).toEqual({ [K]: 10_000, [T]: 0 })
  })

  it('suit la clé de la charge : moitié-moitié l’emporte sur le prorata du foyer', () => {
    const m = moisType({ charges: [charge({ cle: 'moitie', montant_cents: 10_001 })], parts: PARTS,
                         membres: [K, T], revenus: REVENUS, mois: NOVEMBRE })
    expect(Object.values(m.lignes[0].parts).sort()).toEqual([5_000, 5_001])
  })

  it('compte une charge qui démarre plus tard dans la liste, pas dans les totaux', () => {
    const m = moisType({
      charges: [charge(), charge({ libelle: 'Entretien', montant_cents: 60_000, periodicite: 'annuel',
                                   categorie: 'auto', commun: false, participants: [K], debut: '2027-01-01' })],
      parts: PARTS, membres: [K, T], revenus: REVENUS, mois: NOVEMBRE,
    })
    expect(m.lignes.find(l => l.libelle === 'Entretien')?.plusTard).toBe(true)
    expect(m.total).toBe(70_000)
    expect(m.categories.map(c => c.cle)).toEqual(['vie_courante', 'auto'])
    expect(m.categories[1].total).toBe(0)
  })

  it('laisse de côté une charge retirée', () => {
    const m = moisType({ charges: [charge({ archive_le: '2026-10-20T10:00:00Z' })], parts: PARTS,
                         membres: [K, T], revenus: REVENUS, mois: NOVEMBRE })
    expect(m.lignes).toEqual([])
  })

  it('dit ce que chacun paie, ce qui est commun, et ce qu’il lui reste', () => {
    const m = moisType({
      charges: [charge(), charge({ libelle: 'Prêt', montant_cents: 58_000, categorie: 'maison', mode: 'fixe',
                                   commun: false, participants: [K] })],
      parts: PARTS, membres: [K, T], revenus: REVENUS, mois: NOVEMBRE,
    })
    const [kamil, thauba] = m.personnes
    expect(kamil).toEqual({ id: K, commun: 42_903, perso: 58_000, total: 100_903, revenu: 380_000, reste: 279_097 })
    expect(thauba).toEqual({ id: T, commun: 27_097, perso: 0, total: 27_097, revenu: 240_000, reste: 212_903 })
  })

  it('range les catégories de la plus lourde à la plus légère, avec la part de chacun', () => {
    const m = moisType({
      charges: [charge(), charge({ libelle: 'Psy', montant_cents: 7_500, categorie: 'sante', mode: 'fixe',
                                   commun: false, participants: [T] })],
      parts: PARTS, membres: [K, T], revenus: REVENUS, mois: NOVEMBRE,
    })
    expect(m.categories.map(c => [c.cle, c.total])).toEqual([['vie_courante', 70_000], ['sante', 7_500]])
    expect(m.categories[1].parPersonne).toEqual({ [K]: 0, [T]: 7_500 })
  })

  it('sans revenu, ne dit pas de reste', () => {
    const m = moisType({ charges: [charge()], parts: PARTS, membres: [K, T], revenus: [], mois: NOVEMBRE })
    expect(m.personnes[0].reste).toBeNull()
  })

  it('une charge dont aucun participant n’est encore là ne compte pas : la base ne lui crée pas de ligne', () => {
    const m = moisType({
      charges: [charge(), charge({ libelle: 'Perso Thauba', montant_cents: 10_000, commun: false, participants: [T] })],
      parts: { foyer: { [K]: 10_000 }, prorata: { [K]: 10_000 }, moitie: { [K]: 10_000 } },
      membres: [K, T], revenus: REVENUS, mois: NOVEMBRE,
    })
    const perso = m.lignes.find(l => l.libelle === 'Perso Thauba')!
    expect(perso).toMatchObject({ plusTard: true, pourquoi: 'arrivee', parts: { [K]: 0, [T]: 0 } })
    expect(m.total).toBe(70_000)
    expect(m.personnes.map(p => p.total)).toEqual([70_000, 0])
  })

  it('une charge sans participant ne compte pas non plus', () => {
    const m = moisType({ charges: [charge({ participants: [] })], parts: PARTS, membres: [K, T],
                         revenus: REVENUS, mois: NOVEMBRE })
    expect(m.total).toBe(0)
  })

  it('une part absente (arrivée plus tard) partage entre ceux qui sont là', () => {
    const m = moisType({ charges: [charge()], parts: { ...PARTS, foyer: { [K]: 10_000 } },
                         membres: [K, T], revenus: REVENUS, mois: NOVEMBRE })
    expect(m.lignes[0].parts).toEqual({ [K]: 70_000, [T]: 0 })
  })
})

describe('filtreLesLignes', () => {
  const m = moisType({
    charges: [
      charge({ libelle: 'Courses' }),
      charge({ libelle: 'Netflix', montant_cents: 1_500, categorie: 'abonnements', mode: 'fixe', commun: false,
               participants: [K] }),
      charge({ libelle: 'Psychologue', montant_cents: 7_500, categorie: 'sante', mode: 'fixe', commun: false,
               participants: [T] }),
      charge({ libelle: 'Taxe foncière', montant_cents: 120_000, periodicite: 'annuel', mode: 'mis_de_cote',
               categorie: 'maison', commun: false, participants: [K] }),
    ],
    parts: PARTS, membres: [K, T], revenus: REVENUS, mois: NOVEMBRE,
  })
  const tout: FiltreDuTableau = sansFiltre()
  const libelles = (f: Partial<FiltreDuTableau>) => filtreLesLignes(m.lignes, { ...tout, ...f }).map(l => l.libelle)

  it('sans filtre, tout passe', () => {
    expect(libelles({})).toHaveLength(4)
  })
  it('« Commun » ne garde que le commun ; une personne garde tout ce dont elle paie une part', () => {
    expect(libelles({ qui: 'commun' })).toEqual(['Courses'])
    expect(libelles({ qui: K }).sort()).toEqual(['Courses', 'Netflix', 'Taxe foncière'])
    expect(libelles({ qui: T }).sort()).toEqual(['Courses', 'Psychologue'])
  })
  it('filtre par catégorie, par rythme et par façon de payer', () => {
    expect(libelles({ categorie: 'sante' })).toEqual(['Psychologue'])
    expect(libelles({ rythme: 'annuel' })).toEqual(['Taxe foncière'])
    expect(libelles({ facon: 'au_fil' })).toEqual(['Courses'])
  })
  it('cherche sans tenir compte des accents ni des majuscules', () => {
    expect(libelles({ cherche: 'TAXE fonciere' })).toEqual(['Taxe foncière'])
    expect(libelles({ cherche: '  ' })).toHaveLength(4)
  })
})

describe('phraseDuPartage', () => {
  it('dit la règle du foyer, et les parts égales quand un revenu manque', () => {
    expect(phraseDuPartage({ regle: 'prorata', revenuManque: false })).toMatch(/au prorata des revenus/)
    expect(phraseDuPartage({ regle: 'moitie', revenuManque: false })).toMatch(/moitié-moitié/)
    expect(phraseDuPartage({ regle: 'prorata', revenuManque: true })).toMatch(/parts égales/)
  })
})
