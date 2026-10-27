import { describe, expect, it } from 'vitest'
import {
  MOT_DU_MOMENT, aNoter, caseVide, cartesDuRepas, choisirLesParts, contenuDe, couleurDuPoint, dejaPosees, detailDeLaPart, detailDuCongele,
  detailDuFrigo, indexDAujourdhui, joursDuBandeau, libresPourLeChoix, ligneDeLaCarte, lisLAdresse, messageDeLiberation, nomDeLaCarte,
  ordonneLesChoix, peremptionDeLaCarte, personnesDuChoix, phraseDuBandeau, pourDit, resteLibre, texteDeLaCarteVide, titreDeLaFeuille,
} from './choix.ts'
import type { CaseLue, ChoixDuFrigo } from './choix.ts'
import { groupeLesParts, noteDeLaFiche } from './frigo.ts'
import type { Part, Prevu } from './frigo.ts'

/** Lundi 26 octobre 2026, 10 h : le jour de la maquette. */
const LUNDI = new Date(2026, 9, 26, 10, 0)
const LUNDI_SOIR = new Date(2026, 9, 26, 20, 0)
const KAMIL = 'u-kamil'
const THAUBA = 'u-thauba'
const MEMBRES = [{ id: KAMIL, prenom: 'Kamil' }, { id: THAUBA, prenom: 'Thauba' }]

let n = 0
function part(o: Partial<Part> & { label: string; location: 'frigo' | 'congelateur' }): Part {
  n += 1
  const congele = o.location === 'congelateur'
  return {
    id: `p${String(n).padStart(3, '0')}`, recipe_id: o.recipe_id ?? o.label, state: 'au_frais', grams: 500, kcal: 600, protein_g: 50,
    prepared_at: new Date(2026, 9, 25, 21, 26).toISOString(),
    frozen_at: congele ? new Date(2026, 9, 25, 21, 26).toISOString() : null,
    expires_at: (congele ? new Date(2027, 0, 23, 21, 26) : new Date(2026, 9, 29, 21, 26)).toISOString(),
    ...o,
  }
}
const fois = (k: number, o: Parameters<typeof part>[0]) => Array.from({ length: k }, () => part(o))
const prevu = (p: Part, day: string, meal: string, qui = KAMIL): Prevu =>
  ({ id: `s${++n}`, day, meal, user_profile_id: qui, portion_id: p.id })
const case_ = (o: Partial<CaseLue> & { qui: string }): CaseLue => ({
  id: `c${++n}`, user_profile_id: o.qui, day: '2026-10-26', meal: 'diner', state: 'prevu', portion: null, extras: [], ...o,
})

describe('le bandeau : sept jours passés, aujourd’hui, six jours à venir', () => {
  const jours = joursDuBandeau(LUNDI)
  it('quatorze jours : on remonte de sept jours, aujourd’hui est au huitième rang', () => {
    expect(jours).toHaveLength(14)
    expect(jours.map(j => j.jour)).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26',
      '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ])
    expect(indexDAujourdhui(jours)).toBe(7)
    expect(jours[7].jour).toBe('2026-10-26')
    expect(jours.filter(j => j.aujourdhui)).toHaveLength(1)
  })
  it('« hier » remplace l’abréviation d’hier, « auj. » celle d’aujourd’hui ; les autres gardent la leur', () => {
    expect(jours.map(j => j.court)).toEqual([
      'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'hier', 'auj.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.',
    ])
    expect(jours.filter(j => j.hier).map(j => j.jour)).toEqual(['2026-10-25'])
  })
  it('un jour passé l’est : les sept d’avant, jamais aujourd’hui ni la suite', () => {
    expect(jours.map(j => j.passe)).toEqual([...Array(7).fill(true), ...Array(7).fill(false)])
    expect(jours[7].passe).toBe(false)
  })
  it('le jour en toutes lettres, comme la maquette', () => {
    expect(jours[7].long).toBe('Lundi 26 octobre')
    expect(jours[13].long).toBe('Dimanche 1er novembre')
    expect(jours[0].long).toBe('Lundi 19 octobre')
    expect(titreDeLaFeuille(jours[7], 'dejeuner')).toBe('Lundi midi')
    expect(titreDeLaFeuille(jours[8], 'diner')).toBe('Mardi soir')
  })
  it('le bandeau traverse un changement de mois et d’année', () => {
    const j = joursDuBandeau(new Date(2027, 0, 3, 10, 0))
    expect(j[0].jour).toBe('2026-12-27')
    expect(j[6].jour).toBe('2027-01-02')
    expect(j[6].long).toBe('Samedi 2 janvier')
    expect(j[13].jour).toBe('2027-01-09')
  })
  it('le jour n’est pas décalé par l’heure : à 23 h 59 comme à 0 h 01, hier est la veille', () => {
    for (const h of [new Date(2026, 9, 26, 0, 1), new Date(2026, 9, 26, 23, 59)]) {
      const j = joursDuBandeau(h)
      expect(j.find(x => x.hier)!.jour).toBe('2026-10-25')
      expect(j.find(x => x.aujourdhui)!.jour).toBe('2026-10-26')
    }
  })
  it('on peut demander moins : sans passé, le bandeau commence aujourd’hui (le nombre de jours se règle)', () => {
    const j = joursDuBandeau(LUNDI, 6, 0)
    expect(j).toHaveLength(7)
    expect(j[0].aujourdhui).toBe(true)
    expect(j.some(x => x.passe)).toBe(false)
  })
  it('l’adresse ouvre le jour et la feuille ; un jour hors du bandeau ou un repas sans feuille est ignoré : on ouvre aujourd’hui', () => {
    expect(lisLAdresse('?jour=2026-10-28&repas=diner', jours)).toEqual({ index: 9, repas: 'diner' })
    expect(lisLAdresse('?jour=2026-10-27', jours)).toEqual({ index: 8, repas: null })
    expect(lisLAdresse('?jour=2026-10-25&repas=dejeuner', jours)).toEqual({ index: 6, repas: 'dejeuner' })
    expect(lisLAdresse('?jour=2026-10-19', jours)).toEqual({ index: 0, repas: null })
    expect(lisLAdresse('?jour=2026-12-01&repas=diner', jours)).toEqual({ index: 7, repas: null })
    expect(lisLAdresse('?jour=2026-10-18&repas=diner', jours)).toEqual({ index: 7, repas: null })
    expect(lisLAdresse('?jour=2026-10-26&repas=collation', jours)).toEqual({ index: 7, repas: null })
    expect(lisLAdresse('?repas=diner', jours)).toEqual({ index: 7, repas: null })
    expect(lisLAdresse('', jours)).toEqual({ index: 7, repas: null })
  })
})

describe('un jour passé : ce qui reste à noter', () => {
  const burger = part({ label: 'Burger de feuilles de riz', location: 'congelateur' })
  const carte = (etats: ('prevu' | 'mange')[]) => cartesDuRepas(
    etats.map((state, i) => case_({ qui: [KAMIL, THAUBA][i], day: '2026-10-25', state, portion: burger })), MEMBRES, KAMIL,
  ).cartes[0]
  it('un repas posé et pas marqué mangé le dit : « pas encore noté »', () => {
    expect(ligneDeLaCarte(carte(['prevu', 'prevu']), MEMBRES, true)).toBe('Du congélateur, pour vous deux · pas encore noté')
    expect(ligneDeLaCarte(carte(['prevu', 'prevu']), MEMBRES, false)).toBe('Du congélateur, pour vous deux')
  })
  it('mangé : « mangé », rien à noter', () => {
    expect(ligneDeLaCarte(carte(['mange', 'mange']), MEMBRES, true)).toBe('Du congélateur, pour vous deux · mangé')
    expect(aNoter(carte(['mange', 'mange']))).toBe(false)
    expect(aNoter(carte(['prevu', 'prevu']))).toBe(true)
  })
  it('à moitié noté : qui l’a mangé, et pour qui il reste à noter', () => {
    expect(ligneDeLaCarte(carte(['mange', 'prevu']), MEMBRES, true))
      .toBe('Du congélateur, pour vous deux · Kamil l’a mangé, pas encore noté pour Thauba')
    expect(ligneDeLaCarte(carte(['mange', 'prevu']), MEMBRES, false)).toBe('Du congélateur, pour vous deux · Kamil l’a mangé')
  })
  it('« On saute ce repas » n’est pas « pas encore noté » : c’est une réponse', () => {
    const saute = cartesDuRepas([case_({ qui: KAMIL, state: 'saute' })], MEMBRES, KAMIL).cartes[0]
    expect(ligneDeLaCarte(saute, MEMBRES, true)).toBe('Pour Kamil')
    expect(aNoter(saute)).toBe(false)
  })
  it('un repas passé ne dit pas « périme avant ce repas », et ne dit rien d’un délai de congélateur', () => {
    const lasagnes = part({ label: 'Lasagnes', location: 'frigo', expires_at: new Date(2026, 9, 24, 12, 0).toISOString() })
    const c = cartesDuRepas([case_({ qui: KAMIL, day: '2026-10-25', portion: lasagnes })], MEMBRES, KAMIL).cartes[0]
    expect(peremptionDeLaCarte(c, '2026-10-25', 'diner', LUNDI)).toBeNull()
    expect(detailDuCongele({ jour: '2026-10-25', repas: 'diner', personnes: [KAMIL] }, LUNDI)).toBe('sort du congélateur')
    expect(detailDuFrigo([lasagnes], { jour: '2026-10-25', repas: 'diner', personnes: [KAMIL] }, LUNDI)).toEqual({ texte: 'sort du frigo', urgent: false })
  })
})

describe('la carte vide', () => {
  const ids = (...x: string[]) => ({ ids: x, membres: MEMBRES, moi: KAMIL })
  it('à venir : « + Choisir le midi », avec les prénoms quand une autre carte existe', () => {
    expect(texteDeLaCarteVide('dejeuner', false)).toBe('+ Choisir le midi')
    expect(texteDeLaCarteVide('diner', false)).toBe('+ Choisir le soir')
    expect(texteDeLaCarteVide('diner', false, ids(THAUBA))).toBe('+ Choisir le soir pour Thauba')
  })
  it('passé : « + Noter ce que j’ai mangé ce midi » (ou ce soir)', () => {
    expect(texteDeLaCarteVide('dejeuner', true)).toBe('+ Noter ce que j’ai mangé ce midi')
    expect(texteDeLaCarteVide('diner', true)).toBe('+ Noter ce que j’ai mangé ce soir')
    expect(texteDeLaCarteVide('diner', true, ids(KAMIL))).toBe('+ Noter ce que j’ai mangé ce soir')
  })
  it('passé, pour quelqu’un d’autre : son prénom, au singulier ou au pluriel', () => {
    expect(texteDeLaCarteVide('diner', true, ids(THAUBA))).toBe('+ Noter ce que Thauba a mangé ce soir')
    const trois = [...MEMBRES, { id: 'u-marc', prenom: 'Marc' }]
    expect(texteDeLaCarteVide('dejeuner', true, { ids: [THAUBA, 'u-marc'], membres: trois, moi: KAMIL }))
      .toBe('+ Noter ce que Thauba et Marc ont mangé ce midi')
  })
  it('le moment, en mots', () => {
    expect(MOT_DU_MOMENT.diner).toEqual({ au: 'au soir', du: 'du soir' })
    expect(MOT_DU_MOMENT.dejeuner.au).toBe('au midi')
    expect(MOT_DU_MOMENT.petit_dejeuner.au).toBe('au petit déjeuner')
    expect(MOT_DU_MOMENT.collation).toEqual({ au: 'à la collation', du: 'de la collation' })
  })
})

describe('ce que porte une case, et la couleur du point', () => {
  const lasagnes = part({ label: 'Lasagnes', location: 'frigo' })
  const wraps = part({ label: 'Wrap', location: 'congelateur' })
  it('un plat du frigo, un plat du congélateur, autre chose, sauté, rien', () => {
    expect(contenuDe({ state: 'prevu', portion: lasagnes, extras: [] })).toMatchObject({ genre: 'plat', lieu: 'frigo' })
    expect(contenuDe({ state: 'prevu', portion: wraps, extras: [] })).toMatchObject({ genre: 'plat', lieu: 'congelateur' })
    expect(contenuDe({ state: 'prevu', portion: null, extras: [{ label: 'Restaurant' }] })).toEqual({ genre: 'autre', label: 'Restaurant' })
    expect(contenuDe({ state: 'saute', portion: null, extras: [] })).toEqual({ genre: 'saute' })
    expect(contenuDe({ state: 'prevu', portion: null, extras: [] })).toEqual({ genre: 'vide' })
  })
  it('vert, bleu, safran, creux', () => {
    const c = (o: Parameters<typeof contenuDe>[0]) => contenuDe(o)
    expect(couleurDuPoint([c({ state: 'prevu', portion: lasagnes, extras: [] })])).toBe('frigo')
    expect(couleurDuPoint([c({ state: 'prevu', portion: wraps, extras: [] })])).toBe('congelateur')
    expect(couleurDuPoint([c({ state: 'prevu', portion: null, extras: [{ label: 'Sandwich' }] })])).toBe('autre')
    expect(couleurDuPoint([c({ state: 'saute', portion: null, extras: [] })])).toBe('autre')
    expect(couleurDuPoint([])).toBe('vide')
    expect(couleurDuPoint([{ genre: 'vide' }])).toBe('vide')
  })
  it('quand les deux ne mangent pas la même chose, le premier contenu (le mien) donne le ton', () => {
    expect(couleurDuPoint([{ genre: 'vide' }, { genre: 'plat', lieu: 'congelateur', label: 'Wrap', recipeId: null }, { genre: 'autre', label: 'x' }])).toBe('congelateur')
  })
})

describe('les cartes d’un repas', () => {
  const lasagnes = fois(2, { label: 'Lasagnes au saumon-poireaux', location: 'frigo' })
  const wraps = fois(2, { label: 'Wrap', location: 'congelateur' })
  it('un plat pour deux : UNE carte, « Du frigo, pour vous deux »', () => {
    const { cartes, sansChoix } = cartesDuRepas([
      case_({ qui: THAUBA, portion: lasagnes[1] }), case_({ qui: KAMIL, portion: lasagnes[0] }),
    ], MEMBRES, KAMIL)
    expect(cartes).toHaveLength(1)
    expect(sansChoix).toEqual([])
    expect(cartes[0].personnes).toEqual([KAMIL, THAUBA])
    expect(ligneDeLaCarte(cartes[0], MEMBRES)).toBe('Du frigo, pour vous deux')
    expect(nomDeLaCarte(cartes[0])).toBe('Lasagnes saumon-poireaux')
  })
  it('un plat congelé pour une personne : « Du congélateur, pour Kamil » ; l’autre reste sans choix', () => {
    const { cartes, sansChoix } = cartesDuRepas([case_({ qui: KAMIL, portion: wraps[0] })], MEMBRES, KAMIL)
    expect(ligneDeLaCarte(cartes[0], MEMBRES)).toBe('Du congélateur, pour Kamil')
    expect(sansChoix).toEqual([THAUBA])
  })
  it('deux plats différents : deux cartes, la mienne d’abord ; une case vide ne fait pas de carte', () => {
    const { cartes, sansChoix } = cartesDuRepas([
      case_({ qui: THAUBA, portion: wraps[0] }), case_({ qui: KAMIL, portion: lasagnes[0] }),
    ], MEMBRES, KAMIL)
    expect(cartes.map(c => nomDeLaCarte(c))).toEqual(['Lasagnes saumon-poireaux', 'Wrap'])
    expect(sansChoix).toEqual([])
    const vide = cartesDuRepas([case_({ qui: KAMIL }), case_({ qui: THAUBA })], MEMBRES, KAMIL)
    expect(vide.cartes).toEqual([])
    expect(vide.sansChoix).toEqual([KAMIL, THAUBA])
  })
  it('autre chose et sauté', () => {
    const { cartes } = cartesDuRepas([
      case_({ qui: KAMIL, extras: [{ label: 'Restaurant' }] }), case_({ qui: THAUBA, state: 'saute' }),
    ], MEMBRES, KAMIL)
    expect(cartes.map(c => [nomDeLaCarte(c), ligneDeLaCarte(c, MEMBRES)])).toEqual([
      ['Restaurant', 'Pour Kamil'], ['On saute ce repas', 'Pour Thauba'],
    ])
  })
  it('qui l’a mangé', () => {
    const tous = cartesDuRepas([
      case_({ qui: KAMIL, portion: lasagnes[0], state: 'mange' }), case_({ qui: THAUBA, portion: lasagnes[1], state: 'mange' }),
    ], MEMBRES, KAMIL).cartes[0]
    expect(ligneDeLaCarte(tous, MEMBRES)).toBe('Du frigo, pour vous deux · mangé')
    const un = cartesDuRepas([
      case_({ qui: KAMIL, portion: lasagnes[0], state: 'mange' }), case_({ qui: THAUBA, portion: lasagnes[1] }),
    ], MEMBRES, KAMIL).cartes[0]
    expect(ligneDeLaCarte(un, MEMBRES)).toBe('Du frigo, pour vous deux · Kamil l’a mangé')
  })
  it('pour qui : tout le foyer, une personne, ou plusieurs dans un grand foyer', () => {
    expect(pourDit([KAMIL, THAUBA], MEMBRES)).toBe('vous deux')
    expect(pourDit([KAMIL], MEMBRES)).toBe('Kamil')
    const trois = [...MEMBRES, { id: 'u-3', prenom: 'Léa' }]
    expect(pourDit([KAMIL, THAUBA], trois)).toBe('Kamil et Thauba')
    expect(pourDit([KAMIL, THAUBA, 'u-3'], trois)).toBe('vous trois')
    expect(personnesDuChoix('tous', MEMBRES)).toEqual([KAMIL, THAUBA])
    expect(personnesDuChoix(THAUBA, MEMBRES)).toEqual([THAUBA])
  })
})

describe('le bandeau bleu d’un plat congelé', () => {
  const base = { repas: 'diner', label: 'Wrap', rappelActif: false, maintenant: LUNDI }
  it('aujourd’hui : on décongèle au micro-ondes', () => {
    expect(phraseDuBandeau({ ...base, jour: '2026-10-26', n: 2 }))
      .toBe('C’est pour aujourd’hui : décongèle les 2 wraps au micro-ondes.')
    expect(phraseDuBandeau({ ...base, jour: '2026-10-26', n: 1 }))
      .toBe('C’est pour aujourd’hui : décongèle 1 wrap au micro-ondes.')
  })
  it('un jour futur, sans rappel : pense à sortir la veille au soir', () => {
    expect(phraseDuBandeau({ ...base, jour: '2026-10-28', n: 2 })).toBe('Pense à sortir les 2 wraps la veille au soir.')
    expect(phraseDuBandeau({ ...base, jour: '2026-10-28', n: 1, label: 'Burger de feuilles de riz' }))
      .toBe('Pense à sortir la barquette de burger de feuilles de riz la veille au soir.')
  })
  it('un jour futur, avec un rappel actif : le mail, la veille à 19 h', () => {
    expect(phraseDuBandeau({ ...base, jour: '2026-10-28', n: 2, rappelActif: true }))
      .toBe('Mail mardi à 19 h : sortir 2 wraps du congélateur pour la nuit au frigo.')
    expect(phraseDuBandeau({ ...base, jour: '2026-10-28', n: 1, rappelActif: true, label: 'Burger de feuilles de riz' }))
      .toBe('Mail mardi à 19 h : sortir 1 barquette de burger de feuilles de riz du congélateur pour la nuit au frigo.')
    expect(phraseDuBandeau({ ...base, jour: '2026-10-27', n: 2, rappelActif: true }))
      .toBe('Mail ce soir à 19 h : sortir 2 wraps du congélateur pour la nuit au frigo.')
  })
  it('demain : dit la même chose que la fiche du frigo — à partir de quand, ou maintenant', () => {
    // Lundi 10 h, dîner de demain : on peut sortir à partir de 19 h aujourd'hui.
    expect(phraseDuBandeau({ ...base, jour: '2026-10-27', n: 2 })).toBe('Pense à sortir les 2 wraps la veille au soir.')
    // Lundi 20 h : l'heure est venue.
    const q = { ...base, jour: '2026-10-27', n: 2, maintenant: LUNDI_SOIR }
    expect(phraseDuBandeau(q)).toBe('C’est pour demain soir : sors-les maintenant, une part décongelée se mange dans les 24 heures.')
    const wraps = fois(2, { label: 'Wrap', location: 'congelateur' })
    const g = groupeLesParts(wraps)[0]
    const prevus = wraps.map((p, i) => prevu(p, '2026-10-27', 'diner', i ? THAUBA : KAMIL))
    expect(phraseDuBandeau(q), 'le bandeau et la fiche du frigo divergent').toBe(noteDeLaFiche(g, prevus, LUNDI_SOIR))
  })
  it('demain, UNE barquette : « sors-la », jamais « sors-les » (revue du 26/10) — et la fiche du frigo dit pareil', () => {
    const q = { ...base, jour: '2026-10-27', n: 1, maintenant: LUNDI_SOIR }
    expect(phraseDuBandeau(q)).toBe('C’est pour demain soir : sors-la maintenant, une part décongelée se mange dans les 24 heures.')
    expect(phraseDuBandeau({ ...q, maintenant: new Date(2026, 9, 26, 8, 0), n: 1 }))
      .toBe('Pense à sortir 1 wrap la veille au soir.')
    const wrap = part({ label: 'Wrap', location: 'congelateur' })
    const g = groupeLesParts([wrap])[0]
    expect(noteDeLaFiche(g, [prevu(wrap, '2026-10-27', 'diner')], LUNDI_SOIR)).toBe(phraseDuBandeau(q))
    /* Deux barquettes sur ce repas : « sors-les », comme avant. */
    expect(phraseDuBandeau({ ...q, n: 2 })).toContain('sors-les maintenant')
  })
  it('un plat qui a plusieurs mots : « la barquette de petit salé aux lentilles », pas « les petits »', () => {
    const salé = 'Petit salé aux lentilles'
    const q = { ...base, label: salé, jour: '2026-10-26' }
    expect(phraseDuBandeau({ ...q, n: 2 })).toBe('C’est pour aujourd’hui : décongèle les 2 barquettes de petit salé aux lentilles au micro-ondes.')
    expect(phraseDuBandeau({ ...q, n: 1 })).toBe('C’est pour aujourd’hui : décongèle la barquette de petit salé aux lentilles au micro-ondes.')
    expect(phraseDuBandeau({ ...q, jour: '2026-10-28', n: 2 })).toBe('Pense à sortir les 2 barquettes de petit salé aux lentilles la veille au soir.')
  })
  it('un jour passé : rien', () => {
    expect(phraseDuBandeau({ ...base, jour: '2026-10-25', n: 2 })).toBe('')
  })
})

describe('les parts libres et le choix de la part de chacun', () => {
  const cible = { jour: '2026-10-28', repas: 'diner', personnes: [KAMIL, THAUBA] }
  it('les parts réclamées par un repas à venir ne sont pas libres ; celles de la cible le redeviennent', () => {
    const lasagnes = fois(4, { label: 'Lasagnes', location: 'frigo' })
    const g = groupeLesParts(lasagnes)[0]
    const prevus = [
      prevu(lasagnes[0], '2026-10-27', 'diner'),                 // un autre repas : retenue
      prevu(lasagnes[1], '2026-10-28', 'diner', THAUBA),         // la cible : redevient libre
      prevu(lasagnes[2], '2026-10-20', 'diner', THAUBA),         // un repas passé : ne retient pas
    ]
    const libres = libresPourLeChoix(g, prevus, cible, LUNDI).map(p => p.id).sort()
    expect(libres).toEqual([lasagnes[1].id, lasagnes[2].id, lasagnes[3].id].sort())
    // La cible d'une seule personne : la case de l'autre retient toujours sa part.
    const seule = libresPourLeChoix(g, prevus, { ...cible, personnes: [KAMIL] }, LUNDI).map(p => p.id)
    expect(seule).not.toContain(lasagnes[1].id)
  })

  it('la sienne d’abord, puis celle de personne, puis celle d’un autre ; la plus pressée d’abord', () => {
    const tard = part({ label: 'P', location: 'frigo', for_user_id: null, expires_at: new Date(2026, 10, 3).toISOString() })
    const tot = part({ label: 'P', location: 'frigo', for_user_id: null, expires_at: new Date(2026, 9, 28).toISOString() })
    const deThauba = part({ label: 'P', location: 'frigo', for_user_id: THAUBA, expires_at: new Date(2026, 9, 27).toISOString() })
    const deKamil = part({ label: 'P', location: 'frigo', for_user_id: KAMIL, expires_at: new Date(2026, 10, 5).toISOString() })
    const deux = choisirLesParts([tard, tot, deThauba, deKamil], [KAMIL, THAUBA])!
    expect(deux.get(KAMIL)!.id).toBe(deKamil.id)
    expect(deux.get(THAUBA)!.id).toBe(deThauba.id)
    // Kamil seul : celle de personne la plus pressée, jamais celle de Thauba.
    expect(choisirLesParts([tard, tot, deThauba], [KAMIL])!.get(KAMIL)!.id).toBe(tot.id)
    // Plus rien pour personne : celle d'un autre.
    expect(choisirLesParts([deThauba], [KAMIL])!.get(KAMIL)!.id).toBe(deThauba.id)
  })

  it('toutes personnes confondues : la part de Thauba ne part pas chez Kamil tant qu’il en reste une pour Kamil', () => {
    const deThauba = part({ label: 'P', location: 'frigo', for_user_id: THAUBA, expires_at: new Date(2026, 9, 27).toISOString() })
    const deKamil = part({ label: 'P', location: 'frigo', for_user_id: KAMIL, expires_at: new Date(2026, 9, 28).toISOString() })
    const r = choisirLesParts([deThauba, deKamil], [THAUBA, KAMIL])!
    expect(r.get(KAMIL)!.id).toBe(deKamil.id)
    expect(r.get(THAUBA)!.id).toBe(deThauba.id)
  })

  it('la part que la case porte déjà passe avant les autres', () => {
    const pressee = part({ label: 'P', location: 'frigo', expires_at: new Date(2026, 9, 27).toISOString() })
    const posee = part({ label: 'P', location: 'frigo', expires_at: new Date(2026, 10, 3).toISOString() })
    expect(choisirLesParts([pressee, posee], [KAMIL], { [KAMIL]: posee.id })!.get(KAMIL)!.id).toBe(posee.id)
  })

  it('pas assez de parts pour tout le monde : rien', () => {
    expect(choisirLesParts([part({ label: 'P', location: 'frigo' })], [KAMIL, THAUBA])).toBeNull()
    expect(choisirLesParts([], [KAMIL])).toBeNull()
  })

  it('le plus pressé d’abord, et ce qui n’a plus de part libre à la fin', () => {
    const mk = (label: string, expire: Date, libres: number): ChoixDuFrigo => {
      const ps = fois(Math.max(1, libres), { label, location: 'frigo', expires_at: expire.toISOString() })
      return { groupe: groupeLesParts(ps)[0], libres: libres === 0 ? [] : ps }
    }
    const pizza = mk('Pizza vietnamienne', new Date(2026, 9, 29), 2)
    const lasagnes = mk('Lasagnes', new Date(2026, 9, 30), 6)
    const burger = mk('Burger', new Date(2026, 9, 28), 0)
    const ordre = ordonneLesChoix([lasagnes, burger, pizza]).map(c => c.groupe.label)
    expect(ordre).toEqual(['Pizza vietnamienne', 'Lasagnes', 'Burger'])
    expect(resteLibre(6)).toBe('6 libres')
    expect(resteLibre(1)).toBe('1 libre')
    expect(resteLibre(0)).toBe('0 libre')
  })
})

describe('ce que disent les lignes de la feuille', () => {
  const cible = { jour: '2026-10-28', repas: 'diner', personnes: [KAMIL] }
  it('au frigo : quand il faut le manger, ou que ça périme avant ce repas, ou que tout est pris', () => {
    const jeudi = part({ label: 'P', location: 'frigo', expires_at: new Date(2026, 9, 29, 21, 26).toISOString() })
    expect(detailDuFrigo([jeudi], cible, LUNDI).texte).toBe('à manger avant jeudi')
    const mardi = part({ label: 'P', location: 'frigo', expires_at: new Date(2026, 9, 27, 21, 26).toISOString() })
    expect(detailDuFrigo([mardi], cible, LUNDI)).toEqual({ texte: 'périme avant ce repas', urgent: true })
    expect(detailDuFrigo([], cible, LUNDI).texte).toBe('déjà choisi pour d’autres repas')
  })
  it('au congélateur : la même heure que le frigo (vingt-quatre heures avant le repas)', () => {
    expect(detailDuCongele({ jour: '2026-10-28', repas: 'diner', personnes: [] }, LUNDI)).toBe('à sortir la veille, dès 19 h')
    expect(detailDuCongele({ jour: '2026-10-28', repas: 'dejeuner', personnes: [] }, LUNDI)).toBe('à sortir la veille, dès 12 h')
    expect(detailDuCongele({ jour: '2026-10-26', repas: 'diner', personnes: [] }, LUNDI)).toBe('à sortir maintenant')
    expect(detailDuCongele({ jour: '2026-10-27', repas: 'diner', personnes: [] }, LUNDI_SOIR)).toBe('à sortir maintenant')
  })
})

describe('ce qu’on dit après un changement', () => {
  const l = (label: string, location: string) => ({ label, location })
  it('le frigo : elles retournent, libres ; le congélateur : elles restent', () => {
    expect(messageDeLiberation([l('Lasagnes au saumon-poireaux', 'frigo'), l('Lasagnes au saumon-poireaux', 'frigo')]))
      .toBe('Les 2 barquettes de lasagnes au saumon-poireaux retournent au frigo, libres pour un autre jour.')
    expect(messageDeLiberation([l('Wrap', 'congelateur'), l('Wrap', 'congelateur')])).toBe('Les 2 wraps restent au congélateur.')
    expect(messageDeLiberation([l('Pizza', 'frigo')]))
      .toBe('Une part de pizza retourne au frigo, libre pour un autre jour.')
    expect(messageDeLiberation([l('Burger de feuilles de riz', 'congelateur')]))
      .toBe('La barquette de burger de feuilles de riz reste au congélateur.')
    expect(messageDeLiberation([])).toBe('')
  })
  it('des libellés à plusieurs mots : jamais de « s » collé au premier mot (petits, pot-au-feus, gâteaus)', () => {
    expect(messageDeLiberation([l('Petit salé aux lentilles', 'frigo'), l('Petit salé aux lentilles', 'frigo')]))
      .toBe('Les 2 barquettes de petit salé aux lentilles retournent au frigo, libres pour un autre jour.')
    expect(messageDeLiberation([l('Pot-au-feu', 'frigo'), l('Pot-au-feu', 'frigo')]))
      .toBe('Les 2 barquettes de pot-au-feu retournent au frigo, libres pour un autre jour.')
    expect(messageDeLiberation([l('Gâteau de patates douces', 'congelateur')]))
      .toBe('La barquette de gâteau de patates douces reste au congélateur.')
    expect(messageDeLiberation([l('Gâteau', 'frigo'), l('Gâteau', 'frigo')]))
      .toBe('Les 2 gâteaux retournent au frigo, libres pour un autre jour.')
  })
  it('un message par plat quand les deux ne mangeaient pas la même chose', () => {
    expect(messageDeLiberation([l('Wrap', 'congelateur'), l('Lasagnes', 'frigo')]))
      .toBe('Une part de wrap reste au congélateur. Une part de lasagnes retourne au frigo, libre pour un autre jour.')
  })
})

describe('la péremption : la feuille annonce ce que la base posera, la carte le redit', () => {
  const cible = { jour: '2026-10-28', repas: 'diner', personnes: [KAMIL] }
  const MOMENT = new Date(2026, 9, 28, 19, 0)
  const avant_ = new Date(2026, 9, 27, 21, 0).toISOString()   // périme la veille du repas
  const apres = new Date(2026, 10, 3, 21, 0).toISOString()
  it('une part encore bonne passe avant une plus pressée qui périme avant le repas (comme la base)', () => {
    const perime = part({ label: 'P', location: 'frigo', expires_at: avant_ })
    const bonne = part({ label: 'P', location: 'frigo', expires_at: apres })
    expect(choisirLesParts([perime, bonne], [KAMIL], {}, MOMENT)!.get(KAMIL)!.id).toBe(bonne.id)
    /* Sans l'heure du repas, c'est l'ancien ordre : la plus pressée. */
    expect(choisirLesParts([perime, bonne], [KAMIL])!.get(KAMIL)!.id).toBe(perime.id)
    /* Faute de mieux, celle qui périme est posée quand même. */
    expect(choisirLesParts([perime], [KAMIL], {}, MOMENT)!.get(KAMIL)!.id).toBe(perime.id)
  })
  it('la garde passe avant « la sienne » ; entre deux bonnes, la sienne reste préférée', () => {
    const sienneQuiPerime = part({ label: 'P', location: 'frigo', for_user_id: KAMIL, expires_at: avant_ })
    const deTous = part({ label: 'P', location: 'frigo', for_user_id: null, expires_at: apres })
    expect(choisirLesParts([sienneQuiPerime, deTous], [KAMIL], {}, MOMENT)!.get(KAMIL)!.id).toBe(deTous.id)
    const sienneBonne = part({ label: 'P', location: 'frigo', for_user_id: KAMIL, expires_at: new Date(2026, 10, 9).toISOString() })
    expect(choisirLesParts([sienneBonne, deTous], [KAMIL], {}, MOMENT)!.get(KAMIL)!.id).toBe(sienneBonne.id)
  })
  it('dejaPosees : les parts que les cases visées portent déjà (la base les reprend en premier)', () => {
    const a = part({ label: 'P', location: 'frigo' })
    const b = part({ label: 'P', location: 'frigo' })
    const prevus = [prevu(a, '2026-10-28', 'diner', KAMIL), prevu(b, '2026-10-28', 'diner', THAUBA), prevu(b, '2026-10-29', 'diner', KAMIL)]
    expect(dejaPosees(prevus, { ...cible, personnes: [KAMIL] })).toEqual({ [KAMIL]: a.id })
  })
  it('la ligne du frigo parle de la part qui sera posée, pas de la plus pressée', () => {
    const perime = part({ label: 'P', location: 'frigo', expires_at: avant_ })
    const bonne = part({ label: 'P', location: 'frigo', expires_at: new Date(2026, 10, 3, 21, 0).toISOString() })
    const posee = [...choisirLesParts([perime, bonne], [KAMIL], {}, MOMENT)!.values()]
    expect(detailDuFrigo(posee, cible, LUNDI).urgent).toBe(false)
    expect(detailDuFrigo(posee, cible, LUNDI).texte).toMatch(/^à manger avant /)
    expect(detailDuFrigo([perime], cible, LUNDI)).toEqual({ texte: 'périme avant ce repas', urgent: true })
  })

  const carteDe = (parts: Part[], jour: string, meal: string, etats: string[] = []) => {
    const cases = parts.map((p, i) => case_({ qui: i ? THAUBA : KAMIL, day: jour, meal, state: etats[i] ?? 'prevu', portion: { ...p, recipe_id: null } }))
    return cartesDuRepas(cases, MEMBRES, KAMIL).cartes[0]
  }
  it('la carte : « périme avant ce repas » en ocre, « périmée », ou rien', () => {
    const perime = part({ label: 'P', location: 'frigo', expires_at: avant_ })
    expect(peremptionDeLaCarte(carteDe([perime], '2026-10-28', 'diner'), '2026-10-28', 'diner', LUNDI))
      .toEqual({ texte: 'périme avant ce repas', encre: 'var(--color-ocre)' })
    const hier = part({ label: 'P', location: 'frigo', expires_at: new Date(2026, 9, 25, 21, 0).toISOString() })
    expect(peremptionDeLaCarte(carteDe([hier], '2026-10-28', 'diner'), '2026-10-28', 'diner', LUNDI)?.texte).toBe('périmée')
    const loin = part({ label: 'P', location: 'frigo', expires_at: new Date(2026, 10, 20).toISOString() })
    expect(peremptionDeLaCarte(carteDe([loin], '2026-10-28', 'diner'), '2026-10-28', 'diner', LUNDI)).toBeNull()
    /* Une part qui ne périme qu'après le repas, mais ce soir : le mot du frigo. */
    const ceSoir = part({ label: 'P', location: 'frigo', expires_at: new Date(2026, 9, 26, 23, 0).toISOString() })
    expect(peremptionDeLaCarte(carteDe([ceSoir], '2026-10-26', 'diner'), '2026-10-26', 'diner', LUNDI)?.texte).toBe('à manger aujourd\'hui')
    /* Mangé : plus rien à dire. Autre chose : rien non plus. */
    expect(peremptionDeLaCarte(carteDe([perime], '2026-10-28', 'diner', ['mange']), '2026-10-28', 'diner', LUNDI)).toBeNull()
    const autre = cartesDuRepas([case_({ qui: KAMIL, extras: [{ label: 'Restaurant' }] })], MEMBRES, KAMIL).cartes[0]
    expect(peremptionDeLaCarte(autre, '2026-10-26', 'diner', LUNDI)).toBeNull()
  })
  it('la carte dit la part de la personne : poids, kcal, protéines — la mienne, sinon celle de la première, nommée', () => {
    const mienne = part({ label: 'P', location: 'frigo', grams: 784, kcal: 682, protein_g: 56 })
    const sienne = part({ label: 'P', location: 'frigo', grams: 512, kcal: 595, protein_g: 54 })
    const deux = carteDe([mienne, sienne], '2026-10-28', 'diner')
    expect(detailDeLaPart(deux, MEMBRES, KAMIL)).toBe('784 g · 682 kcal · 56 g de protéines')
    const seuleThauba = cartesDuRepas([case_({ qui: THAUBA, portion: { ...sienne, recipe_id: null } })], MEMBRES, KAMIL).cartes[0]
    expect(detailDeLaPart(seuleThauba, MEMBRES, KAMIL)).toBe('Thauba : 512 g · 595 kcal · 54 g de protéines')
    expect(detailDeLaPart(carteDe([mienne], '2026-10-28', 'diner', ['mange']), MEMBRES, KAMIL)).toBe('')
  })
  it('une case vide (prévue, sans barquette ni extra) n’est rien', () => {
    expect(caseVide({ state: 'prevu', portion: null, extras: [] })).toBe(true)
    expect(caseVide({ state: 'prevu', portion: null, extras: [{ label: 'Yaourt' }] })).toBe(false)
    expect(caseVide({ state: 'saute', portion: null, extras: [] })).toBe(false)
    expect(caseVide({ state: 'mange', portion: null, extras: [] })).toBe(false)
  })
})
