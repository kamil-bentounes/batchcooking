import { describe, expect, it } from 'vitest'
import {
  cartesDuRepas, choisirLesParts, contenuDe, couleurDuPoint, detailDuCongele, detailDuFrigo, joursDuBandeau,
  libresPourLeChoix, ligneDeLaCarte, lisLAdresse, messageDeLiberation, nomDeLaCarte, ordonneLesChoix,
  personnesDuChoix, phraseDuBandeau, pourDit, resteLibre, titreDeLaFeuille,
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

describe('les sept jours', () => {
  const jours = joursDuBandeau(LUNDI)
  it('sept jours à partir d’aujourd’hui, aujourd’hui en « auj. »', () => {
    expect(jours).toHaveLength(7)
    expect(jours.map(j => j.jour)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
    expect(jours.map(j => j.court)).toEqual(['auj.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'])
    expect(jours[0].aujourdhui).toBe(true)
    expect(jours.slice(1).some(j => j.aujourdhui)).toBe(false)
  })
  it('le jour en toutes lettres, comme la maquette', () => {
    expect(jours[0].long).toBe('Lundi 26 octobre')
    expect(jours[6].long).toBe('Dimanche 1er novembre')
    expect(titreDeLaFeuille(jours[0], 'dejeuner')).toBe('Lundi midi')
    expect(titreDeLaFeuille(jours[1], 'diner')).toBe('Mardi soir')
  })
  it('l’adresse ouvre le jour et la feuille ; un jour hors du bandeau ou un repas sans feuille est ignoré', () => {
    expect(lisLAdresse('?jour=2026-10-28&repas=diner', jours)).toEqual({ index: 2, repas: 'diner' })
    expect(lisLAdresse('?jour=2026-10-27', jours)).toEqual({ index: 1, repas: null })
    expect(lisLAdresse('?jour=2026-12-01&repas=diner', jours)).toEqual({ index: 0, repas: null })
    expect(lisLAdresse('?jour=2026-10-26&repas=collation', jours)).toEqual({ index: 0, repas: null })
    expect(lisLAdresse('?repas=diner', jours)).toEqual({ index: 0, repas: null })
    expect(lisLAdresse('', jours)).toEqual({ index: 0, repas: null })
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
      .toBe('Pense à sortir 1 burger la veille au soir.')
  })
  it('un jour futur, avec un rappel actif : le mail, la veille à 19 h', () => {
    expect(phraseDuBandeau({ ...base, jour: '2026-10-28', n: 2, rappelActif: true }))
      .toBe('Mail mardi à 19 h : sortir 2 wraps du congélateur pour la nuit au frigo.')
    expect(phraseDuBandeau({ ...base, jour: '2026-10-28', n: 1, rappelActif: true, label: 'Burger de feuilles de riz' }))
      .toBe('Mail mardi à 19 h : sortir 1 burger du congélateur pour la nuit au frigo.')
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
  it('le frigo : elles retournent, libres ; le congélateur : elles restent', () => {
    const l = (label: string, location: string) => ({ label, location })
    expect(messageDeLiberation([l('Lasagnes au saumon-poireaux', 'frigo'), l('Lasagnes au saumon-poireaux', 'frigo')]))
      .toBe('Les lasagnes retournent au frigo, libres pour un autre jour.')
    expect(messageDeLiberation([l('Wrap', 'congelateur'), l('Wrap', 'congelateur')])).toBe('Les wraps restent au congélateur.')
    expect(messageDeLiberation([l('Pizza vietnamienne protéinée', 'frigo')]))
      .toBe('Une part de pizza retourne au frigo, libre pour un autre jour.')
    expect(messageDeLiberation([l('Burger de feuilles de riz', 'congelateur')])).toBe('Une part de burger reste au congélateur.')
    expect(messageDeLiberation([])).toBe('')
  })
  it('un message par plat quand les deux ne mangeaient pas la même chose', () => {
    expect(messageDeLiberation([{ label: 'Wrap', location: 'congelateur' }, { label: 'Lasagnes', location: 'frigo' }]))
      .toBe('Une part de wrap reste au congélateur. Une part de lasagnes retourne au frigo, libre pour un autre jour.')
  })
})
