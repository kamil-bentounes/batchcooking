import { describe, expect, it } from 'vitest'
import {
  afficheur, ariaDeCarte, auPlusTard, etagereDe, groupeLesParts, macrosDuGroupe, magnet, motDuPlat,
  nomCourt, noteDeLaFiche, partsAChoisir, partsASortir, partsLibres, peremptionApres, prevuesPour,
  pourQui, pressesGroupees, quand, repasDuJour, repasEnCours, repasEnMots, soustitreDuCongelo, soustitreDuFrigo, NOTE_DU_SOIR,
} from './frigo.ts'
import type { Part, Prevu } from './frigo.ts'

/** Lundi 26 octobre 2026, 20 h : le jour de la maquette. */
const LUNDI = new Date(2026, 9, 26, 20, 0)
const MARDI = new Date(2026, 9, 27, 10, 0)
const KAMIL = 'u-kamil'
const THAUBA = 'u-thauba'
const MEMBRES = [{ id: KAMIL, prenom: 'Kamil' }, { id: THAUBA, prenom: 'Thauba' }]

let n = 0
function part(o: Partial<Part> & { label: string; location: 'frigo' | 'congelateur' }): Part {
  n += 1
  const congele = o.location === 'congelateur'
  return {
    id: `p${n}`, recipe_id: o.recipe_id ?? o.label, state: 'au_frais', grams: 500, kcal: 600, protein_g: 50,
    prepared_at: new Date(2026, 9, 25, 21, 26).toISOString(),
    frozen_at: congele ? new Date(2026, 9, 25, 21, 26).toISOString() : null,
    expires_at: (congele ? new Date(2027, 0, 23, 21, 26) : new Date(2026, 9, 29, 21, 26)).toISOString(),
    ...o,
  }
}
const fois = (k: number, o: Parameters<typeof part>[0]) => Array.from({ length: k }, () => part(o))
const prevu = (p: Part, day: string, meal: string, qui = KAMIL): Prevu =>
  ({ id: `s${++n}`, day, meal, user_profile_id: qui, portion_id: p.id })

describe('les noms', () => {
  it('le nom court de la maquette', () => {
    expect(nomCourt('Lasagnes au saumon-poireaux')).toBe('Lasagnes saumon-poireaux')
    expect(nomCourt('Pizza vietnamienne protéinée')).toBe('Pizza vietnamienne')
    expect(nomCourt('Burger de feuilles de riz')).toBe('Burger de feuilles de riz')
    expect(nomCourt('Wrap')).toBe('Wrap')
    expect(nomCourt('Tarte à la courge')).toBe('Tarte courge')
  })
  it('le mot du plat, au pluriel quand il y en a plusieurs', () => {
    expect(motDuPlat('Burger de feuilles de riz', 2)).toBe('burgers')
    expect(motDuPlat('Burger de feuilles de riz', 1)).toBe('burger')
    expect(motDuPlat('Lasagnes au saumon', 2)).toBe('lasagnes')
    expect(motDuPlat('Pizza vietnamienne', 2)).toBe('pizzas')
  })
})

describe('les plats : le regroupement', () => {
  it('une carte par recette, libellé, lieu et état ; les mangées et jetées n’y sont pas', () => {
    const parts = [
      ...fois(6, { label: 'Lasagnes', location: 'frigo' }),
      ...fois(2, { label: 'Burger', location: 'congelateur' }),
      ...fois(2, { label: 'Burger', location: 'frigo', state: 'decongelee' }),
      part({ label: 'Burger', location: 'frigo', state: 'mangee' }),
      part({ label: 'Burger', location: 'frigo', state: 'jetee' }),
    ]
    const g = groupeLesParts(parts)
    expect(g.map(x => [x.label, x.location, x.state, x.parts.length]).sort())
      .toEqual([
        ['Burger', 'congelateur', 'au_frais', 2], ['Burger', 'frigo', 'decongelee', 2],
        ['Lasagnes', 'frigo', 'au_frais', 6],
      ])
  })
  it('deux recettes de même libellé ne se mélangent pas, et les plus pressés passent d’abord', () => {
    const tard = new Date(2026, 10, 2).toISOString()
    const g = groupeLesParts([
      part({ label: 'Soupe', recipe_id: 'a', location: 'frigo', expires_at: tard }),
      part({ label: 'Soupe', recipe_id: 'b', location: 'frigo' }),
    ])
    expect(g).toHaveLength(2)
    expect(g[0].recipeId).toBe('b')
  })
  it('une part sans recette se groupe par libellé', () => {
    const g = groupeLesParts([
      part({ label: 'Plat acheté', recipe_id: null, location: 'frigo' }),
      part({ label: 'Plat acheté', recipe_id: null, location: 'frigo' }),
    ])
    expect(g).toHaveLength(1)
    expect(g[0].parts).toHaveLength(2)
  })
})

describe('le repas, en mots', () => {
  it('aujourd’hui : ce soir, ce midi ; ensuite le jour ; au-delà d’une semaine, le quantième', () => {
    expect(repasEnMots('2026-10-26', 'diner', LUNDI)).toBe('ce soir')
    expect(repasEnMots('2026-10-26', 'dejeuner', LUNDI)).toBe('ce midi')
    expect(repasEnMots('2026-10-27', 'dejeuner', LUNDI)).toBe('mar. midi')
    expect(repasEnMots('2026-10-28', 'diner', LUNDI)).toBe('mer. soir')
    expect(repasEnMots('2026-11-02', 'dejeuner', LUNDI)).toBe('lun. 2 midi')
  })
  it('le repas en cours', () => {
    expect(repasEnCours(new Date(2026, 9, 26, 8))).toBe('petit_dejeuner')
    expect(repasEnCours(new Date(2026, 9, 26, 12, 30))).toBe('dejeuner')
    expect(repasEnCours(new Date(2026, 9, 26, 19))).toBe('diner')
  })
})

describe('« Prévues pour vous deux » et les puces', () => {
  const lasagnes = fois(6, { label: 'Lasagnes', location: 'frigo' })
  const [g] = groupeLesParts(lasagnes)
  it('les mêmes repas pour les deux : « vous deux », une puce par repas', () => {
    const prevus = [
      ...[0, 1].map(i => prevu(lasagnes[i], '2026-10-27', 'dejeuner', i ? THAUBA : KAMIL)),
      ...[2, 3].map(i => prevu(lasagnes[i], '2026-10-27', 'diner', i % 2 ? THAUBA : KAMIL)),
      ...[4, 5].map(i => prevu(lasagnes[i], '2026-10-28', 'dejeuner', i % 2 ? THAUBA : KAMIL)),
    ]
    expect(prevuesPour(g, prevus, MEMBRES, LUNDI))
      .toEqual({ titre: 'Prévues pour vous deux', puces: ['mar. midi', 'mar. soir', 'mer. midi'] })
  })
  it('un seul convive : « pour Kamil »', () => {
    const prevus = [prevu(lasagnes[0], '2026-10-27', 'diner')]
    expect(prevuesPour(g, prevus, MEMBRES, LUNDI))
      .toEqual({ titre: 'Prévues pour Kamil', puces: ['mar. soir'] })
  })
  it('un repas d’aujourd’hui se dit « ce soir »', () => {
    const prevus = [prevu(lasagnes[0], '2026-10-26', 'diner'), prevu(lasagnes[1], '2026-10-26', 'diner', THAUBA)]
    expect(prevuesPour(g, prevus, MEMBRES, LUNDI).puces).toEqual(['ce soir'])
  })
  it('des publics différents : la puce le dit', () => {
    const prevus = [
      prevu(lasagnes[0], '2026-10-27', 'diner'), prevu(lasagnes[1], '2026-10-27', 'diner', THAUBA),
      prevu(lasagnes[2], '2026-10-28', 'diner'),
    ]
    expect(prevuesPour(g, prevus, MEMBRES, LUNDI))
      .toEqual({ titre: 'Prévues', puces: ['mar. soir', 'mer. soir · Kamil'] })
  })
  it('rien de prévu : aucune puce', () => {
    expect(prevuesPour(g, [], MEMBRES, LUNDI).puces).toEqual([])
  })
  it('une part libre est une part qu’aucun repas ne réclame', () => {
    const prevus = [prevu(lasagnes[0], '2026-10-27', 'diner'), prevu(lasagnes[1], '2026-10-27', 'diner', THAUBA)]
    expect(partsLibres(g, prevus)).toHaveLength(4)
  })
})

describe('la porte gauche : l’afficheur', () => {
  const burgers = fois(2, { label: 'Burger de feuilles de riz', location: 'congelateur' })
  it('le dîner de ce soir pour MOI, en nom court', () => {
    const prevus = [prevu(burgers[0], '2026-10-26', 'diner', KAMIL), prevu(burgers[1], '2026-10-26', 'diner', THAUBA)]
    expect(afficheur(prevus, burgers, KAMIL, LUNDI)).toEqual({ titre: 'Ce soir', plat: 'Burger de feuilles de riz' })
  })
  it('rien de prévu pour moi, même si l’autre mange', () => {
    const prevus = [prevu(burgers[1], '2026-10-26', 'diner', THAUBA)]
    expect(afficheur(prevus, burgers, KAMIL, LUNDI)).toEqual({ titre: 'Rien de prévu ce soir', plat: null })
  })
  it('un dîner d’un autre jour, ou un déjeuner, ne compte pas', () => {
    const prevus = [prevu(burgers[0], '2026-10-27', 'diner'), prevu(burgers[1], '2026-10-26', 'dejeuner')]
    expect(afficheur(prevus, burgers, KAMIL, LUNDI).plat).toBeNull()
  })
  it('un repas sans barquette ne montre rien', () => {
    const vide: Prevu = { id: 'x', day: '2026-10-26', meal: 'diner', user_profile_id: KAMIL, portion_id: null }
    expect(afficheur([vide], burgers, KAMIL, LUNDI).plat).toBeNull()
  })
})

describe('la porte droite : le magnet', () => {
  const burgers = fois(2, { label: 'Burger de feuilles de riz', location: 'congelateur' })
  const pizzas = fois(2, { label: 'Pizza vietnamienne protéinée', location: 'frigo' })
  const lasagnes = fois(6, { label: 'Lasagnes', location: 'frigo' })
  const tout = [...burgers, ...pizzas, ...lasagnes]

  it('1 · des congelées posées sur ce soir passent avant tout', () => {
    const prevus = [prevu(burgers[0], '2026-10-26', 'diner', KAMIL), prevu(burgers[1], '2026-10-26', 'diner', THAUBA)]
    expect(magnet(tout, prevus, LUNDI)).toEqual({ texte: 'Sors les 2 burgers : c’est ce soir', sorsLesAujourdhui: true })
  })
  it('1 · demain aussi, et au singulier', () => {
    const prevus = [prevu(burgers[0], '2026-10-27', 'diner')]
    expect(magnet(tout, prevus, LUNDI)?.texte).toBe('Sors 1 burger : c’est demain')
  })
  it('1 · avant le frigo qui presse', () => {
    const prevus = [prevu(burgers[0], '2026-10-27', 'diner')]
    const m = magnet(tout, prevus, MARDI)
    expect(m?.texte).toContain('burger')
  })
  it('1 · des congelées posées dans trois jours ne pressent pas', () => {
    const prevus = [prevu(burgers[0], '2026-10-29', 'diner')]
    expect(magnet(burgers, prevus, LUNDI)).toBeNull()
  })
  it('2 · sinon le frigo qui périt sous 72 h et que rien ne réclame', () => {
    expect(magnet(tout, [], MARDI)?.texte).toBe('2 pizzas à prévoir avant jeudi')
  })
  it('2 · seules les parts non prévues comptent', () => {
    const prevus = [prevu(pizzas[0], '2026-10-28', 'diner')]
    expect(magnet(pizzas, prevus, MARDI)?.texte).toBe('1 pizza à prévoir avant jeudi')
  })
  it('2 · tout est prévu : pas de magnet', () => {
    const prevus = pizzas.map(p => prevu(p, '2026-10-28', 'diner'))
    expect(magnet(pizzas, prevus, MARDI)).toBeNull()
  })
  it('2 · ce qui périt dans plus de 72 h ne presse pas encore', () => {
    expect(magnet(lasagnes, [], LUNDI)).toBeNull()
  })
  it('2 · le plus pressé d’abord', () => {
    const t = [
      ...fois(1, { label: 'Soupe', location: 'frigo', expires_at: new Date(2026, 9, 29, 12).toISOString() }),
      ...pizzas,
    ]
    expect(magnet(t, [], MARDI)?.texte).toBe('1 soupe à prévoir avant jeudi')
  })
  it('2 · ce qui périt aujourd’hui : « avant ce soir »', () => {
    const t = fois(3, { label: 'Wraps', location: 'frigo', expires_at: new Date(2026, 9, 26, 23).toISOString() })
    expect(magnet(t, [], LUNDI)?.texte).toBe('3 wraps à prévoir avant ce soir')
  })
  it('3 · rien du tout : pas de magnet', () => {
    expect(magnet([], [], LUNDI)).toBeNull()
  })
  it('les barquettes mangées ne comptent pas', () => {
    const t = fois(2, { label: 'Pizza', location: 'frigo', state: 'mangee' })
    expect(magnet(t, [], MARDI)).toBeNull()
  })
})

describe('ce que dit une carte', () => {
  it('le congelé posé ce soir : à sortir maintenant, en ocre', () => {
    const b = fois(2, { label: 'Burger', location: 'congelateur' })
    const [g] = groupeLesParts(b)
    const prevus = [prevu(b[0], '2026-10-26', 'diner'), prevu(b[1], '2026-10-26', 'diner', THAUBA)]
    expect(quand(g, prevus, LUNDI)).toEqual({ texte: 'Ce soir : à sortir maintenant', encre: 'var(--color-ocre)' })
    expect(ariaDeCarte(g, quand(g, prevus, LUNDI))).toBe('Burger, 2 parts, Ce soir : à sortir maintenant')
  })
  it('le frigo planifié : du premier au dernier repas', () => {
    const l = fois(6, { label: 'Lasagnes', location: 'frigo' })
    const [g] = groupeLesParts(l)
    const prevus = [
      prevu(l[0], '2026-10-27', 'dejeuner'), prevu(l[1], '2026-10-27', 'dejeuner', THAUBA),
      prevu(l[2], '2026-10-28', 'dejeuner'), prevu(l[3], '2026-10-28', 'dejeuner', THAUBA),
      prevu(l[4], '2026-10-27', 'diner'), prevu(l[5], '2026-10-27', 'diner', THAUBA),
    ]
    expect(quand(g, prevus, LUNDI).texte).toBe('mar. midi → mer. midi')
  })
  it('un seul repas : sans flèche', () => {
    const p = fois(2, { label: 'Pizza', location: 'frigo' })
    const [g] = groupeLesParts(p)
    const prevus = p.map((x, i) => prevu(x, '2026-10-28', 'diner', i ? THAUBA : KAMIL))
    expect(quand(g, prevus, LUNDI).texte).toBe('mer. soir')
  })
  it('le frigo qui presse et n’est pas posé : le mot d’urgence', () => {
    const p = fois(2, { label: 'Pizza', location: 'frigo', expires_at: new Date(2026, 9, 27, 22).toISOString() })
    const [g] = groupeLesParts(p)
    expect(quand(g, [], LUNDI).texte).toBe('demain dernier délai')
  })
  it('rien de prévu, rien ne presse : le mot, en doux', () => {
    const p = fois(2, { label: 'Pizza', location: 'frigo' })
    const [g] = groupeLesParts(p)
    expect(quand(g, [], LUNDI)).toEqual({ texte: 'encore 3 jours', encre: 'var(--color-doux)' })
  })
})

describe('la fiche', () => {
  it('la note du soir : seulement du congelé posé AUJOURD’HUI', () => {
    const b = fois(2, { label: 'Burger', location: 'congelateur' })
    const [g] = groupeLesParts(b)
    expect(noteDeLaFiche(g, [prevu(b[0], '2026-10-26', 'diner')], LUNDI)).toBe(NOTE_DU_SOIR)
    expect(noteDeLaFiche(g, [prevu(b[0], '2026-10-27', 'diner')], LUNDI)).toBe('')
    const f = fois(2, { label: 'Pizza', location: 'frigo' })
    expect(noteDeLaFiche(groupeLesParts(f)[0], [prevu(f[0], '2026-10-26', 'diner')], LUNDI)).toBe('')
  })
  it('les macros, par part', () => {
    const [g] = groupeLesParts([
      part({ label: 'L', location: 'frigo', grams: 784, kcal: 682, protein_g: 56 }),
      part({ label: 'L', location: 'frigo', grams: 784, kcal: 682, protein_g: 56 }),
    ])
    expect(macrosDuGroupe(g)).toBe('784 g, 682 kcal et 56 g de protéines la part')
  })
  it('« À manger avant » : la date, et au frigo ce qu’en dit l’urgence', () => {
    const f = groupeLesParts(fois(1, { label: 'Pizza', location: 'frigo' }))[0]
    expect(auPlusTard(f, MARDI)).toBe('jeu. 29 oct., encore 2 jours')
    const c = groupeLesParts(fois(1, { label: 'Burger', location: 'congelateur' }))[0]
    expect(auPlusTard(c, MARDI)).toBe('sam. 23 janv.')
  })
  it('Congeler ou jeter : les libres d’abord, puis les posées le plus tard', () => {
    const l = fois(4, { label: 'Lasagnes', location: 'frigo' })
    const [g] = groupeLesParts(l)
    const prevus = [
      prevu(g.parts[0], '2026-10-27', 'diner'), prevu(g.parts[1], '2026-10-29', 'diner'),
      prevu(g.parts[2], '2026-10-28', 'diner'),
    ]
    expect(partsAChoisir(g, prevus, 1).map(p => p.id)).toEqual([g.parts[3].id])
    expect(partsAChoisir(g, prevus, 3).map(p => p.id)).toEqual([g.parts[3].id, g.parts[1].id, g.parts[2].id])
    expect(partsAChoisir(g, prevus, 9)).toHaveLength(4)
  })
  it('Je les sors : celles posées aujourd’hui ou demain, sinon on demande combien', () => {
    const b = fois(4, { label: 'Wrap', location: 'congelateur' })
    const [g] = groupeLesParts(b)
    const prevus = [prevu(g.parts[0], '2026-10-27', 'diner'), prevu(g.parts[1], '2026-10-30', 'diner')]
    expect(partsASortir(g, prevus, LUNDI)?.map(p => p.id)).toEqual([g.parts[0].id])
    expect(partsASortir(g, [prevu(g.parts[1], '2026-10-30', 'diner')], LUNDI)).toBeNull()
  })
})

describe('la date de péremption suit la date de départ — comme le trigger', () => {
  const depart = new Date(2026, 9, 25, 21, 26)
  it('frigo : quatre jours', () => {
    expect(peremptionApres('frigo', 'au_frais', depart)).toEqual(new Date(2026, 9, 29, 21, 26))
  })
  it('congélateur : quatre-vingt-dix jours', () => {
    expect(peremptionApres('congelateur', 'au_frais', depart)).toEqual(new Date(2027, 0, 23, 21, 26))
  })
  it('décongelée : pas de recalcul (elle tient 24 h depuis la décongélation, pas depuis la préparation)', () => {
    expect(peremptionApres('frigo', 'decongelee', depart)).toBeNull()
  })
  it('passe l’heure d’été : le même instant de calendrier', () => {
    expect(peremptionApres('frigo', 'au_frais', new Date(2026, 9, 28, 21, 0))).toEqual(new Date(2026, 10, 1, 21, 0))
  })
})

describe('les ingrédients, par étagère', () => {
  it('le groupe CIQUAL range : laitages, viandes et poissons, légumes au bac, le reste', () => {
    expect(etagereDe({ label: 'Lait demi-écrémé', groupe: 'produits laitiers et assimilés' })).toBe('Laitages et frais')
    expect(etagereDe({ label: 'Saumon', groupe: 'viandes, œufs, poissons et assimilés' })).toBe('Viandes et poissons')
    expect(etagereDe({ label: 'Poireaux', groupe: 'fruits, légumes, légumineuses et oléagineux' })).toBe('Bac à légumes')
    expect(etagereDe({ label: 'Sauce soja' })).toBe('Autres')
  })
  it('un yaourt sans aliment connu est rangé par son nom', () => {
    expect(etagereDe({ label: 'Yaourts dessert protéinés' })).toBe('Laitages et frais')
    expect(etagereDe({ label: 'Skyr nature' })).toBe('Laitages et frais')
  })
  it('les œufs vont avec le frais, les lentilles sèches ailleurs', () => {
    expect(etagereDe({ label: 'Œufs', groupe: 'viandes, œufs, poissons et assimilés', sousGroupe: 'œufs' })).toBe('Laitages et frais')
    expect(etagereDe({ label: 'Lentilles sèches', groupe: 'fruits, légumes, légumineuses et oléagineux' })).toBe('Autres')
  })
})

describe('les sous-titres', () => {
  it('le frigo', () => {
    expect(soustitreDuFrigo(8, 3)).toBe('8 parts prêtes, et 3 ingrédients')
    expect(soustitreDuFrigo(1, 0)).toBe('1 part prête')
    expect(soustitreDuFrigo(0, 1)).toBe('1 ingrédient')
    expect(soustitreDuFrigo(0, 0)).toBe('Vide pour l’instant')
  })
  it('le congélateur', () => {
    expect(soustitreDuCongelo(22, new Date(2027, 0, 23))).toBe('22 parts, jusqu’en janvier')
    expect(soustitreDuCongelo(0, null)).toBe('Vide pour l’instant')
  })
})

describe('pour qui, et à quels repas', () => {
  it('tout le foyer : « vous deux » ; moi seul : « toi » ; l’autre : son prénom', () => {
    expect(pourQui([KAMIL, THAUBA], MEMBRES, KAMIL)).toBe('vous deux')
    expect(pourQui([KAMIL, KAMIL], MEMBRES, KAMIL)).toBe('toi')
    expect(pourQui([THAUBA], MEMBRES, KAMIL)).toBe('Thauba')
    expect(pourQui([KAMIL], [{ id: KAMIL, prenom: 'Kamil' }], KAMIL)).toBe('toi')
  })
  it('les repas d’un jour', () => {
    expect(repasDuJour(['diner', 'dejeuner'])).toBe('midi et soir')
    expect(repasDuJour(['dejeuner'])).toBe('midi')
    expect(repasDuJour(['petit_dejeuner', 'dejeuner', 'diner'])).toBe('matin, midi et soir')
    expect(repasDuJour([])).toBe('')
  })
})

describe('« À manger bientôt » : un plat, une ligne', () => {
  const b = (label: string, expires: Date, location: 'frigo' | 'congelateur' = 'frigo') =>
    ({ label, expires_at: expires.toISOString(), location })
  const aujourdhui = new Date(2026, 9, 26, 20, 30)

  it('deux burgers qui pressent pareil : UNE ligne, avec leur nombre', () => {
    const lignes = pressesGroupees([
      b('Burger de feuilles de riz', new Date(2026, 9, 27, 8)), b('Burger de feuilles de riz', new Date(2026, 9, 27, 8)),
    ], aujourdhui)
    expect(lignes).toHaveLength(1)
    expect(lignes[0]).toMatchObject({ label: 'Burger de feuilles de riz', n: 2 })
    expect(lignes[0].u.mot).toBe('à manger aujourd\'hui')
  })
  it('le plus pressé d’abord, deux plats au plus, et ce qui ne presse pas n’y est pas', () => {
    const lignes = pressesGroupees([
      b('Lasagnes', new Date(2026, 9, 28, 20)), b('Dahl', new Date(2026, 9, 27, 8)),
      b('Poulet', new Date(2026, 9, 27, 20)), b('Riz', new Date(2026, 10, 20)),
    ], aujourdhui)
    expect(lignes.map(l => l.label)).toEqual(['Dahl', 'Poulet'])
  })
  it('un même plat à deux degrés d’urgence fait deux lignes', () => {
    const lignes = pressesGroupees([
      b('Dahl', new Date(2026, 9, 27, 8)), b('Dahl', new Date(2026, 9, 28, 8)),
    ], aujourdhui)
    expect(lignes.map(l => [l.label, l.n])).toEqual([['Dahl', 1], ['Dahl', 1]])
  })
})
