import { describe, expect, it } from 'vitest'
import {
  ceQuElleCouteParMois, comptesDesFiltres, dansLOrdreDuFoyer, duFiltre, faconDeLaLigne, listeDeNoms, parMois, phraseDeLArrivee,
  rangeParCategorie, sousTitreDeLaLigne, totalDuMois, type ChargeDeListe,
} from './charges-liste.ts'

const charge = (o: Partial<ChargeDeListe> & { id: string }): ChargeDeListe => ({
  libelle: o.id, montant_cents: 10_000, periodicite: 'mensuel', mode: 'fixe', categorie: 'maison',
  debut: '2026-01-01', participants: ['k', 't'], cle: null, commun: true, compte_id: 'c', modifie_par: null, ...o,
})
const prenoms = new Map([['k', 'Kamil'], ['t', 'Thauba']])
/* `toLocaleString('fr-FR')` sépare les milliers d'une espace fine insécable : on la lit comme une espace. */
const lis = (s: string | null) => s?.replace(/[\u202f\u00a0]/g, ' ') ?? null
const ligne = (c: ChargeDeListe, mois = '2026-11-01', moi = 'k') => lis(sousTitreDeLaLigne(c, { prenoms, mois, moi }))

describe('le mois d’une charge', () => {
  it('ramène le trimestre au tiers et l’année au douzième', () => {
    expect(parMois({ montant_cents: 30_000, periodicite: 'trimestriel' })).toBe(10_000)
    expect(parMois({ montant_cents: 120_000, periodicite: 'annuel' })).toBe(10_000)
    expect(parMois({ montant_cents: 1_070, periodicite: 'mensuel' })).toBe(1_070)
  })
  it('dit « 100 € par mois » pour ce qui n’est pas mensuel, rien sinon', () => {
    expect(lis(ceQuElleCouteParMois({ montant_cents: 120_000, periodicite: 'annuel' }))).toBe('100 € par mois')
    expect(ceQuElleCouteParMois({ montant_cents: 5_000, periodicite: 'mensuel' })).toBeNull()
  })
})

describe('les filtres', () => {
  const cs = [
    charge({ id: 'a' }), charge({ id: 'b', participants: ['k'] }), charge({ id: 'c', participants: ['t'] }),
    charge({ id: 'd', participants: [] }),
  ]
  it('comptent chaque filtre', () => {
    expect(comptesDesFiltres(cs, 'k')).toEqual({ tout: 4, commun: 1, moi: 1 })
  })
  it('« À moi » ne garde que ce que je paie seul', () => {
    expect(duFiltre(cs, 'moi', 'k').map(c => c.id)).toEqual(['b'])
    expect(duFiltre(cs, 'commun', 'k').map(c => c.id)).toEqual(['a'])
    expect(duFiltre(cs, 'tout', 'k')).toHaveLength(4)
  })
})

describe('le rangement par catégorie', () => {
  const cs = [
    charge({ id: 'petit', categorie: 'maison', montant_cents: 1_000 }),
    charge({ id: 'gros', categorie: 'maison', montant_cents: 58_000 }),
    charge({ id: 'courses', categorie: 'vie_courante', montant_cents: 50_000 }),
    charge({ id: 'taxe', categorie: 'maison', montant_cents: 120_000, periodicite: 'annuel' }),
    charge({ id: 'plus-tard', categorie: 'maison', montant_cents: 999_999, debut: '2031-01-01' }),
    charge({ id: 'inconnue', categorie: 'n_importe_quoi', montant_cents: 500 }),
  ]
  const g = rangeParCategorie(cs, '2026-11-01')
  it('met la plus lourde d’abord', () => {
    expect(g.map(x => x.cle)).toEqual(['maison', 'vie_courante', 'autre'])
  })
  it('range dans « Autre » une catégorie qu’on ne connaît pas', () => {
    expect(g[2].lignes.map(c => c.id)).toEqual(['inconnue'])
  })
  it('somme par mois ce qui court, sans ce qui commence plus tard', () => {
    expect(g[0].total).toBe(1_000 + 58_000 + 10_000)
  })
  it('trie les lignes : le plus lourd par mois, puis ce qui commence plus tard', () => {
    expect(g[0].lignes.map(c => c.id)).toEqual(['gros', 'taxe', 'petit', 'plus-tard'])
  })
  it('à poids égal, garde l’ordre des catégories du budget', () => {
    const egal = rangeParCategorie([
      charge({ id: 'x', categorie: 'sante', montant_cents: 100 }),
      charge({ id: 'y', categorie: 'vie_courante', montant_cents: 100 }),
    ], '2026-11-01')
    expect(egal.map(x => x.cle)).toEqual(['vie_courante', 'sante'])
  })
  it('le total d’un mois est celui de ce qui court', () => {
    expect(totalDuMois(cs, '2026-11-01')).toBe(1_000 + 58_000 + 10_000 + 50_000 + 500)
    /* Avant le départ de la charge de 2031, elle ne compte pas ; à partir de là, si. */
    expect(totalDuMois(cs, '2031-01-01')).toBe(1_000 + 58_000 + 10_000 + 50_000 + 500 + 999_999)
  })
})

describe('le sous-titre d’une ligne', () => {
  it('dit le montant, qui participe et la façon', () => {
    expect(ligne(charge({ id: 'a', montant_cents: 120_000, periodicite: 'annuel', mode: 'mis_de_cote',
                          participants: ['k'], commun: false }))).toBe('1 200 € par an · Kamil seul · mise de côté')
    expect(ligne(charge({ id: 'b', montant_cents: 70_000, mode: 'au_fil' })))
      .toBe('700 € par mois · Kamil et Thauba · plusieurs dépenses dans le mois')
    expect(ligne(charge({ id: 'c', montant_cents: 1_070 }))).toBe('10,70 € par mois · Kamil et Thauba')
  })
  it('ne dit rien de la façon « Fixe », ni de « sans compte » (une pastille à part)', () => {
    const t = ligne(charge({ id: 'a', compte_id: null }))
    expect(t).not.toMatch(/fixe|sans compte/i)
  })
  it('ne lit plus « personne seul » quand tout le monde est décoché', () => {
    expect(ligne(charge({ id: 'a', participants: [], commun: false }))).toContain('personne n’y participe')
  })
  it('dit la clé et le départ à venir', () => {
    expect(ligne(charge({ id: 'a', cle: 'moitie', debut: '2027-03-01' })))
      .toBe('100 € par mois · Kamil et Thauba · moitié-moitié · commence en mars 2027')
  })
  it('dit qui a corrigé la ligne d’un autre, et seulement d’un autre', () => {
    expect(ligne(charge({ id: 'a', modifie_par: 't' }))).toMatch(/✎ Thauba$/)
    expect(ligne(charge({ id: 'a', modifie_par: 'k' }))).not.toMatch(/✎/)
  })
  it('dit qu’une charge commune attend quelqu’un quand on est seul', () => {
    expect(ligne(charge({ id: 'a', participants: ['k'], commun: true }))).toMatch(/partagée dès que quelqu’un arrive$/)
  })
  it('au mois d’arrivée, une charge qui court depuis lors ne « commence » pas plus tard', () => {
    const c = charge({ id: 'a', debut: '2026-11-01' })
    expect(ligne(c, '2026-10-01')).toContain('commence en novembre 2026')
    expect(ligne(c, '2026-11-01')).not.toContain('commence')
  })
})

describe('l’ordre des participants', () => {
  it('suit le foyer, pas la base', () => {
    expect(ligne(charge({ id: 'a', participants: ['t', 'k'] }))).toBe('100 € par mois · Kamil et Thauba')
    expect(dansLOrdreDuFoyer(['t', 'x', 'k'], ['k', 't'])).toEqual(['k', 't', 'x'])
  })
})

describe('petits textes', () => {
  it('liste des noms', () => {
    expect(listeDeNoms(['A'])).toBe('A')
    expect(listeDeNoms(['A', 'B'])).toBe('A et B')
    expect(listeDeNoms(['A', 'B', 'C'])).toBe('A, B et C')
  })
  it('la façon, en minuscules', () => {
    expect(faconDeLaLigne('fixe')).toBeNull()
    expect(faconDeLaLigne('facture')).toBe('une facture chaque mois')
  })
  it('la phrase d’arrivée n’existe qu’avant l’arrivée', () => {
    expect(phraseDeLArrivee({ avant: false, nomDuMois: 'novembre' })).toBeNull()
    expect(phraseDeLArrivee({ avant: true, nomDuMois: 'novembre' })).toContain('en novembre')
  })
})
