import { describe, expect, it } from 'vitest'
import {
  afficheur, ariaDeCarte, auPlusTard, etagereDe, groupeLesParts, macrosDuGroupe, magnet, partsDuPlat,
  nomCourt, noteDeLaFiche, partsAChoisir, partsASortir, partsLibres, peremptionApres, prevuesPour,
  pourQui, pressesGroupees, quand, repasDuJour, repasEnCours, repasEnMots, soustitreDuCongelo, soustitreDuFrigo, NOTE_DU_SOIR,
  borne, ecrituresDesDates, peremptionDeplacee, phraseDesRepasLibres, sortableDes,
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
  it('un libellé d’un seul mot : le pluriel simple — -eau/-au en -x, s, x et z ne changent pas', () => {
    expect(partsDuPlat('Wrap', 2)).toBe('2 wraps')
    expect(partsDuPlat('Wrap', 1)).toBe('1 wrap')
    expect(partsDuPlat('Burger', 3)).toBe('3 burgers')
    expect(partsDuPlat('Pizzas', 2)).toBe('2 pizzas')
    expect(partsDuPlat('Gâteau', 2)).toBe('2 gâteaux')
    expect(partsDuPlat('Tuyau', 2)).toBe('2 tuyaux')
    expect(partsDuPlat('Couscous', 2)).toBe('2 couscous')
    expect(partsDuPlat('Wrap', 2, true)).toBe('les 2 wraps')
    expect(partsDuPlat('Wrap', 1, true)).toBe('1 wrap')
  })
  it('plusieurs mots : « la barquette de … », jamais un « s » collé au premier mot (revue du 26/10)', () => {
    const salé = 'Petit salé aux lentilles'
    expect(partsDuPlat(salé, 1, true)).toBe('la barquette de petit salé aux lentilles')
    expect(partsDuPlat(salé, 2, true)).toBe('les 2 barquettes de petit salé aux lentilles')
    expect(partsDuPlat(salé, 1)).toBe('1 barquette de petit salé aux lentilles')
    expect(partsDuPlat(salé, 3)).toBe('3 barquettes de petit salé aux lentilles')
    /* Ce que le premier mot donnait : « petits », « pot-au-feus », « gâteaus ». */
    for (const l of [salé, 'Pot-au-feu', 'Gâteau de patates douces', 'Burger de feuilles de riz', 'Tajine d’agneau']) {
      expect(partsDuPlat(l, 2), l).toBe(`2 barquettes de ${l[0].toLowerCase()}${l.slice(1)}`)
    }
    expect(partsDuPlat('Pizza vietnamienne protéinée', 2)).toBe('2 barquettes de pizza vietnamienne')
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
  const lasagnes = fois(6, { label: 'Lasagnes', location: 'frigo', expires_at: new Date(2026, 9, 30, 21, 26).toISOString() })
  const tout = [...burgers, ...pizzas, ...lasagnes]

  it('1 · des congelées posées sur ce soir passent avant tout', () => {
    const prevus = [prevu(burgers[0], '2026-10-26', 'diner', KAMIL), prevu(burgers[1], '2026-10-26', 'diner', THAUBA)]
    expect(magnet(tout, prevus, LUNDI)).toEqual({ texte: 'Sors les 2 barquettes de burger de feuilles de riz : c’est ce soir', sorsLesAujourdhui: true })
  })
  it('1 · demain aussi, et au singulier', () => {
    const prevus = [prevu(burgers[0], '2026-10-27', 'diner')]
    expect(magnet(tout, prevus, LUNDI)?.texte).toBe('Sors la barquette de burger de feuilles de riz : c’est demain soir')
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
    expect(magnet(tout, [], MARDI)?.texte).toBe('2 barquettes de pizza vietnamienne à prévoir avant jeudi')
  })
  it('2 · seules les parts non prévues comptent', () => {
    const prevus = [prevu(pizzas[0], '2026-10-28', 'diner')]
    expect(magnet(pizzas, prevus, MARDI)?.texte).toBe('1 barquette de pizza vietnamienne à prévoir avant jeudi')
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
    expect(noteDeLaFiche(g, [prevu(b[0], '2026-10-26', 'diner'), prevu(b[1], '2026-10-26', 'diner')], LUNDI)).toBe(NOTE_DU_SOIR)
    expect(NOTE_DU_SOIR).toBe('C’est pour ce soir : sors-les maintenant, ou passe-les au micro-ondes avant de manger.')
    /* Une seule part posée : « sors-la », « passe-la » (la revue du 26/10 : « sors-les » pour une barquette). */
    expect(noteDeLaFiche(g, [prevu(b[0], '2026-10-26', 'diner')], LUNDI))
      .toBe('C’est pour ce soir : sors-la maintenant, ou passe-la au micro-ondes avant de manger.')
    expect(noteDeLaFiche(g, [prevu(b[0], '2026-10-30', 'diner')], LUNDI)).toBe('')
    const f = fois(2, { label: 'Pizza', location: 'frigo' })
    expect(noteDeLaFiche(groupeLesParts(f)[0], [prevu(f[0], '2026-10-26', 'diner')], LUNDI)).toBe('')
  })
  it('les macros, par part', () => {
    const [g] = groupeLesParts([
      part({ label: 'L', location: 'frigo', grams: 784, kcal: 682, protein_g: 56 }),
      part({ label: 'L', location: 'frigo', grams: 784, kcal: 682, protein_g: 56 }),
    ])
    expect(macrosDuGroupe(g)).toEqual(['784 g, 682 kcal et 56 g de protéines la part'])
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

// ── La revue du frigo (chantier 2) ──────────────────────────────────────────

describe('H1 · les portions sont PAR PERSONNE : la fiche ne montre pas une moyenne qui ne correspond à aucune part', () => {
  it('des parts différentes selon la personne : une ligne par personne', () => {
    const [g] = groupeLesParts([
      part({ label: 'Lasagnes', location: 'frigo', grams: 784, kcal: 682, protein_g: 56, for_user_id: KAMIL }),
      part({ label: 'Lasagnes', location: 'frigo', grams: 610, kcal: 530, protein_g: 44, for_user_id: THAUBA }),
      part({ label: 'Lasagnes', location: 'frigo', grams: 784, kcal: 682, protein_g: 56, for_user_id: KAMIL }),
    ])
    expect(macrosDuGroupe(g, MEMBRES)).toEqual([
      'Kamil : 784 g, 682 kcal, 56 g de protéines',
      'Thauba : 610 g, 530 kcal, 44 g de protéines',
    ])
  })
  it('des parts pour personne qui diffèrent : « Pour tous », les deux valeurs', () => {
    const [g] = groupeLesParts([
      part({ label: 'L', location: 'frigo', grams: 700, kcal: 600, protein_g: 50, for_user_id: null }),
      part({ label: 'L', location: 'frigo', grams: 800, kcal: 700, protein_g: 60, for_user_id: null }),
    ])
    expect(macrosDuGroupe(g, MEMBRES)).toEqual(['Pour tous : 700 g, 600 kcal, 50 g de protéines ou 800 g, 700 kcal, 60 g de protéines'])
  })
  it('la même valeur pour tous, quel que soit le destinataire : la phrase d’avant, une seule valeur', () => {
    const [g] = groupeLesParts([
      part({ label: 'L', location: 'frigo', grams: 784, kcal: 682, protein_g: 56, for_user_id: KAMIL }),
      part({ label: 'L', location: 'frigo', grams: 784, kcal: 682, protein_g: 56, for_user_id: THAUBA }),
    ])
    expect(macrosDuGroupe(g, MEMBRES)).toEqual(['784 g, 682 kcal et 56 g de protéines la part'])
  })
})

describe('M2 · l’urgence se dit aussi quand tout est réclamé', () => {
  const lasagnes = () => fois(2, { label: 'Lasagnes', location: 'frigo', expires_at: new Date(2026, 9, 28, 14).toISOString() })
  it('un repas posé APRÈS la péremption : le mot d’urgence, pas le planning', () => {
    const l = lasagnes()
    const [g] = groupeLesParts(l)
    const prevus = [prevu(l[0], '2026-10-29', 'diner'), prevu(l[1], '2026-10-29', 'diner', THAUBA)]
    // Lundi 20 h : il reste 42 h, « demain dernier délai », en orange.
    expect(quand(g, prevus, LUNDI)).toEqual({ texte: 'demain dernier délai', encre: '#8F5A0D' })
  })
  it('périmée : le mot « périmée », en rouge', () => {
    const l = fois(2, { label: 'Pizza', location: 'frigo', expires_at: new Date(2026, 9, 26, 12).toISOString() })
    const [g] = groupeLesParts(l)
    const prevus = l.map(p => prevu(p, '2026-10-27', 'diner'))
    expect(quand(g, prevus, LUNDI)).toEqual({ texte: 'périmée', encre: '#9A3526' })
  })
  it('une seule des parts est périmée : on dit combien', () => {
    const a = part({ label: 'Pizza', location: 'frigo', expires_at: new Date(2026, 9, 26, 12).toISOString() })
    const b = part({ label: 'Pizza', location: 'frigo' })
    const [g] = groupeLesParts([a, b])
    expect(quand(g, [prevu(b, '2026-10-27', 'diner')], LUNDI).texte).toBe('1 périmée')
  })
  it('réclamée avant sa péremption : le planning, comme avant', () => {
    const l = lasagnes()
    const [g] = groupeLesParts(l)
    const prevus = [prevu(l[0], '2026-10-27', 'diner'), prevu(l[1], '2026-10-27', 'diner', THAUBA)]
    expect(quand(g, prevus, LUNDI).texte).toBe('mar. soir')
  })
  it('une réclamation d’un jour PASSÉ ne compte pas : la part est libre', () => {
    const l = fois(2, { label: 'Pizza', location: 'frigo', expires_at: new Date(2026, 9, 27, 22).toISOString() })
    const [g] = groupeLesParts(l)
    const vieux = [prevu(l[0], '2026-10-24', 'diner'), prevu(l[1], '2026-10-25', 'diner')]
    expect(partsLibres(g, vieux, LUNDI)).toHaveLength(2)
    expect(partsLibres(g, vieux)).toHaveLength(0)
    expect(quand(g, vieux, LUNDI).texte, 'les parts sont libres et pressent : le mot').toBe('demain dernier délai')
    expect(prevuesPour(g, vieux, MEMBRES, LUNDI).puces, 'les jours passés ne sont pas listés').toEqual([])
    expect(partsAChoisir(g, vieux, 1, LUNDI).map(p => p.id)).toEqual([g.parts[0].id])
  })
})

describe('M3 · le magnet', () => {
  it('une part DÉJÀ périmée : « à jeter », pas « à prévoir avant ce soir »', () => {
    const t = fois(2, { label: 'Pizza vietnamienne', location: 'frigo', expires_at: new Date(2026, 9, 26, 9).toISOString() })
    expect(magnet(t, [], LUNDI)?.texte).toBe('2 barquettes de pizza vietnamienne à jeter')
  })
  it('périmées et pas périmées dans le même plat : on ne jette que les périmées', () => {
    const t = [
      part({ label: 'Soupe', location: 'frigo', expires_at: new Date(2026, 9, 25, 9).toISOString() }),
      part({ label: 'Soupe', location: 'frigo', expires_at: new Date(2026, 9, 27, 9).toISOString() }),
    ]
    expect(magnet(t, [], LUNDI)?.texte).toBe('1 soupe à jeter')
  })
  it('le congelé nomme le repas : « c’est ce midi », « c’est demain soir »', () => {
    const b = fois(2, { label: 'Burger', location: 'congelateur' })
    expect(magnet(b, [prevu(b[0], '2026-10-27', 'dejeuner')], MARDI)?.texte).toBe('Sors 1 burger : c’est ce midi')
    expect(magnet(b, [prevu(b[0], '2026-10-27', 'diner')], LUNDI)?.texte).toBe('Sors 1 burger : c’est demain soir')
  })
  it('à urgence égale, l’ordre ne change pas d’un rendu à l’autre (le nom du plat départage)', () => {
    const meme = new Date(2026, 9, 28, 10).toISOString()
    const a = fois(1, { label: 'Soupe', location: 'frigo', expires_at: meme })
    const b = fois(1, { label: 'Pizza', location: 'frigo', expires_at: meme })
    expect(magnet([...a, ...b], [], MARDI)?.texte).toContain('pizza')
    expect(magnet([...b, ...a], [], MARDI)?.texte).toContain('pizza')
    const c1 = fois(1, { label: 'Soupe', location: 'congelateur' })
    const c2 = fois(1, { label: 'Pizza', location: 'congelateur' })
    const prevus = [prevu(c1[0], '2026-10-27', 'diner'), prevu(c2[0], '2026-10-27', 'diner')]
    expect(magnet([...c1, ...c2], prevus, MARDI)?.texte).toContain('pizza')
    expect(magnet([...c2, ...c1], prevus, MARDI)?.texte).toContain('pizza')
  })
  it('les repas pas lus : pas de magnet, et l’afficheur ne dit pas « rien de prévu »', () => {
    const t = fois(2, { label: 'Pizza', location: 'frigo', expires_at: new Date(2026, 9, 27, 9).toISOString() })
    expect(magnet(t, null, LUNDI)).toBeNull()
    expect(afficheur(null, t, KAMIL, LUNDI)).toEqual({ titre: 'Indisponible', plat: null })
    expect(quand(groupeLesParts(t)[0], null, LUNDI).texte, 'sans les repas, la carte ne prétend pas que la part est libre ou posée').toBe('à manger aujourd\'hui')
  })
})

describe('M4 · sortir du congélateur : une part décongelée vit 24 h', () => {
  const b = fois(3, { label: 'Burger', location: 'congelateur' })
  const [g] = groupeLesParts(b)
  const matin = new Date(2026, 9, 26, 8, 30)
  it('sortable la veille à l’heure du repas, jamais avant', () => {
    expect(sortableDes('2026-10-27', 'diner')).toEqual(new Date(2026, 9, 26, 19, 0))
    expect(sortableDes('2026-10-27', 'dejeuner')).toEqual(new Date(2026, 9, 26, 12, 0))
  })
  it('le matin, les parts de demain soir ne sortent PAS : elles périraient avant le repas', () => {
    const prevus = [prevu(g.parts[0], '2026-10-26', 'diner'), prevu(g.parts[1], '2026-10-27', 'diner')]
    expect(partsASortir(g, prevus, matin)?.map(p => p.id)).toEqual([g.parts[0].id])
  })
  it('le soir, celles de demain sortent aussi', () => {
    const prevus = [prevu(g.parts[0], '2026-10-26', 'diner'), prevu(g.parts[1], '2026-10-27', 'diner')]
    expect(partsASortir(g, prevus, LUNDI)?.map(p => p.id).sort()).toEqual([g.parts[0].id, g.parts[1].id].sort())
  })
  it('rien pour aujourd’hui, demain soir seulement et il est tôt : on ne sort rien, et on le dit', () => {
    const prevus = [prevu(g.parts[0], '2026-10-27', 'diner')]
    expect(partsASortir(g, prevus, matin)).toBeNull()
    expect(quand(g, prevus, matin).texte).toBe('Demain soir : à sortir dès 19 h')
    expect(noteDeLaFiche(g, prevus, matin)).toBe(
      'C’est pour demain soir : sors-la à partir de 19 h, une part décongelée se mange dans les 24 heures.')
    expect(magnet(b, prevus, matin), 'le magnet ne dit pas « sors-la » avant l’heure').toBeNull()
  })
  it('le soir venu : « Demain soir : à sortir maintenant », et le magnet le dit', () => {
    const prevus = [prevu(g.parts[0], '2026-10-27', 'diner')]
    expect(quand(g, prevus, LUNDI).texte).toBe('Demain soir : à sortir maintenant')
    expect(noteDeLaFiche(g, prevus, LUNDI)).toContain('sors-la maintenant')
    expect(magnet(b, prevus, LUNDI)?.texte).toBe('Sors 1 burger : c’est demain soir')
  })
})

describe('les égalités ne changent pas l’ordre', () => {
  it('deux plats qui périment ensemble : le nom, puis la clé', () => {
    const meme = new Date(2026, 9, 29, 21).toISOString()
    const a = part({ label: 'Soupe', location: 'frigo', expires_at: meme, recipe_id: 'r1' })
    const b = part({ label: 'Pizza', location: 'frigo', expires_at: meme, recipe_id: 'r2' })
    expect(groupeLesParts([a, b]).map(x => x.label)).toEqual(['Pizza', 'Soupe'])
    expect(groupeLesParts([b, a]).map(x => x.label)).toEqual(['Pizza', 'Soupe'])
  })
})

describe('L6 · le nombre choisi suit le groupe qui rétrécit', () => {
  it('borné entre 1 et le maximum', () => {
    expect(borne(5, 3)).toBe(3)
    expect(borne(2, 3)).toBe(2)
    expect(borne(0, 3)).toBe(1)
    expect(borne(4, 0)).toBe(1)
  })
})

describe('M8 · la phrase des repas qui ont perdu leur part', () => {
  it('un repas de moi : « Le dîner de dimanche n’a plus de barquette. »', () => {
    expect(phraseDesRepasLibres([{ day: '2026-11-01', meal: 'diner', user_profile_id: KAMIL }], KAMIL, MEMBRES, LUNDI))
      .toBe('Le dîner de dimanche n’a plus de barquette.')
  })
  it('un repas d’un autre, demain, aujourd’hui ; plusieurs', () => {
    expect(phraseDesRepasLibres([{ day: '2026-10-27', meal: 'dejeuner', user_profile_id: THAUBA }], KAMIL, MEMBRES, LUNDI))
      .toBe('Le déjeuner de demain (Thauba) n’a plus de barquette.')
    expect(phraseDesRepasLibres([
      { day: '2026-10-26', meal: 'diner', user_profile_id: KAMIL },
      { day: '2026-10-28', meal: 'collation', user_profile_id: KAMIL },
    ], KAMIL, MEMBRES, LUNDI)).toBe('Le dîner d’aujourd’hui et la collation de mercredi n’ont plus de barquette.')
  })
  it('rien de libéré : rien à dire', () => {
    expect(phraseDesRepasLibres([], KAMIL, MEMBRES, LUNDI)).toBe('')
  })
})

describe('L4 · corriger une date n’écrit que ce qui change, part par part', () => {
  const t1 = new Date(2026, 9, 28, 14).toISOString()
  const t2 = new Date(2026, 9, 29, 21).toISOString()
  const a = part({ label: 'L', location: 'frigo', expires_at: t1 })
  const b = part({ label: 'L', location: 'frigo', expires_at: t2 })
  const c = part({ label: 'L', location: 'frigo', expires_at: t2 })
  it('une date déjà celle de la part : rien à écrire', () => {
    expect(ecrituresDesDates([a], { expires_at: t1 })).toEqual([])
  })
  it('une nouvelle date pour tous : une seule écriture', () => {
    const e = ecrituresDesDates([a, b, c], { expires_at: new Date(2026, 10, 2).toISOString() })
    expect(e).toHaveLength(1)
    expect(e[0].ids.sort()).toEqual([a.id, b.id, c.id].sort())
  })
  it('des parts qui ont déjà la date voulue sont sautées, les autres écrites', () => {
    const e = ecrituresDesDates([a, b, c], { expires_at: t2 })
    expect(e).toEqual([{ ids: [a.id], champs: { expires_at: t2 } }])
  })
  it('au jour près : une part déjà ce jour-là garde son heure', () => {
    const e = ecrituresDesDates([a, b], { expires_at: new Date(2026, 9, 29, 23, 59).toISOString() }, { expiresParJour: true })
    expect(e).toEqual([{ ids: [a.id], champs: { expires_at: new Date(2026, 9, 29, 23, 59).toISOString() } }])
  })
  it('des écritures différentes selon la part : une requête par écriture', () => {
    const depart = new Date(2026, 9, 24, 12).toISOString()
    const p1 = part({ label: 'L', location: 'frigo', prepared_at: depart, expires_at: t1 })
    const p2 = part({ label: 'L', location: 'frigo', prepared_at: new Date(2026, 9, 25, 12).toISOString(), expires_at: t1 })
    const e = ecrituresDesDates([p1, p2], { prepared_at: depart, expires_at: t2 })
    expect(e).toEqual([
      { ids: [p1.id, p2.id].slice(0, 1), champs: { expires_at: t2 } },
      { ids: [p2.id], champs: { prepared_at: depart, expires_at: t2 } },
    ])
  })
})

describe('L9 · déplacer un ingrédient recalcule sa péremption, comme une barquette', () => {
  const now = new Date(2026, 9, 26, 12)
  it('vers le congélateur : trois mois', () => {
    expect(peremptionDeplacee('frigo', 'congelateur', now)).toEqual({ expires_at: new Date(2027, 0, 24, 12).toISOString() })
    expect(peremptionDeplacee('placard', 'congelateur', now)?.expires_at).toBe(new Date(2027, 0, 24, 12).toISOString())
  })
  it('du congélateur au frigo : vingt-quatre heures ; au placard : plus de date', () => {
    expect(peremptionDeplacee('congelateur', 'frigo', now)).toEqual({ expires_at: new Date(2026, 9, 27, 12).toISOString() })
    expect(peremptionDeplacee('congelateur', 'placard', now)).toEqual({ expires_at: null })
  })
  it('entre le frigo et le placard, ou sans déplacement : la date reste', () => {
    expect(peremptionDeplacee('frigo', 'placard', now)).toBeNull()
    expect(peremptionDeplacee('placard', 'frigo', now)).toBeNull()
    expect(peremptionDeplacee('frigo', 'frigo', now)).toBeNull()
  })
})
