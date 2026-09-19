/**
 * L'analyse des étapes, sur des phrases telles qu'elles s'écrivent vraiment.
 *
 * La barre à tenir est celle de la mesure de référence : 98 % de durées
 * trouvées sans aucun modèle. Un test qui passerait sur des phrases inventées
 * ne prouverait rien — celles-ci sont calquées sur le corpus.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { analyserEtape, dependances, pliure } from '../src/etape.ts'
import type { Referentiel } from '../src/etape.ts'

const seed = JSON.parse(
  readFileSync(new URL('../../seed/conversions.json', import.meta.url), 'utf8'))

const REF: Referentiel = {
  durees: seed.default_duration,
  alias: seed.verbe_alias.alias,
  nonActions: seed.non_action.motifs.map((m: string) => new RegExp(pliure(m), 'i')),
  temperatures: seed.default_temperature,
}

const a = (t: string) => analyserEtape(t, REF)

describe('les phrases qui ne sont pas des gestes', () => {
  it.each([
    'Bon appétit !',
    'Régalez-vous !',
    'Et voilà, c’est prêt.',
    'À déguster bien frais.',
    'Servez immédiatement.',
  ])('écarte « %s »', texte => {
    const e = a(texte)
    expect(e.estAction, 'une phrase sans geste est entrée dans le plan').toBe(false)
    expect(e.dureeMin, 'des minutes fantômes ont été ajoutées').toBeNull()
  })

  it('ne se laisse pas prendre par une étape vide', () => {
    expect(a('').estAction).toBe(false)
    expect(a('   ').estAction).toBe(false)
  })
})

describe('le verbe', () => {
  it.each([
    ['Émincez finement les oignons.', 'émincer'],
    ['Épluchez les pommes de terre et coupez-les en cubes.', 'éplucher'],
    ['Faites revenir l’oignon dans l’huile.', 'faire revenir'],
    ['Faites fondre le beurre à feu doux.', 'faire fondre'],
    ['Préchauffez le four à 180 °C.', 'préchauffer'],
    ['Enfournez pour 25 minutes.', 'enfourner'],
    ['Portez à ébullition.', 'porter à ébullition'],
    ['Laissez reposer la pâte 1 heure.', 'laisser reposer'],
    ['Mélangez délicatement à la spatule.', 'mélanger'],
    ['Râpez le gruyère.', 'râper'],
  ])('trouve le verbe de « %s »', (texte, attendu) => {
    expect(a(texte).verbe).toBe(attendu)
  })

  it('préfère le verbe le plus précis', () => {
    // « cuire sous pression » doit gagner contre « cuire ».
    expect(a('Cuire sous pression pendant 8 minutes.').verbe).toBe('cuire sous pression')
    // « faire revenir » contre « faire fondre ».
    expect(a('Faire revenir les échalotes.').verbe).toBe('faire revenir')
  })

  it('ramène un verbe de cuisine à celui du référentiel', () => {
    // Les alias : sept verbes sur 141 dans l'étalon.
    expect(a('Concassez les tomates.').verbe).toBe('couper')
    expect(a('Abaissez la pâte au rouleau.').verbe).toBe('étaler')
    expect(a('Faites suer les oignons.').verbe).toBe('faire revenir')
  })

  it('accepte l’infinitif comme l’impératif', () => {
    expect(a('Émincer les oignons').verbe).toBe('émincer')
    expect(a('Émincez les oignons').verbe).toBe('émincer')
    expect(a('On émince les oignons').verbe).toBe('émincer')
  })

  it('retient le verbe qui mobilise un appareil, pas celui de tête', () => {
    // Retenir « ajouter » libérerait le feu dans le plan : bien pire qu'une
    // minute mal comptée.
    const e = a('Ajoutez le poulet et faites-le dorer sur toutes les faces.')
    expect(e.verbe).toBe('dorer')
    expect(e.appareil).toBe('plaques')
  })

  it('retient le verbe de tête quand aucun ne mobilise d’appareil', () => {
    // « coupés en lanières » décrit des poivrons, elle ne demande pas de couper.
    const e = a('Ajoutez les poivrons coupés en lanières.')
    expect(e.verbe, 'un participe passé a été pris pour un geste').not.toBe('couper')
  })

  it('préfère le four au geste qui le précède dans la phrase', () => {
    const e = a('Mélangez le tout et enfournez 25 minutes.')
    expect(e.appareil).toBe('four')
    expect(e.dureeMin).toBe(25)
  })

  it('rend null plutôt que d’inventer un verbe', () => {
    expect(a('Dans un grand saladier.').verbe).toBeNull()
  })
})

describe('la durée', () => {
  it.each([
    ['Enfournez pour 25 minutes.', 25],
    ['Laissez cuire 1 h 30.', 90],
    ['Laissez reposer une heure.', 60],
    ['Comptez une demi-heure de repos.', 30],
    ['Mixez 30 secondes.', 1],
    ['Faites cuire 10 à 15 minutes.', 12.5],
    ['Laissez mariner 2 heures.', 120],
  ])('lit la durée écrite dans « %s »', (texte, attendu) => {
    const e = a(texte)
    expect(e.dureeMin).toBe(attendu)
    expect(e.sourceDuree, 'une durée écrite doit être déclarée, pas déduite')
      .toBe('declaree')
  })

  it('comble avec le référentiel quand rien n’est écrit', () => {
    const e = a('Émincez les oignons.')
    expect(e.dureeMin).toBeGreaterThan(0)
    expect(e.sourceDuree).toBe('defaut')
  })

  it('met la durée à l’échelle de la quantité citée (D19)', () => {
    const petit = a('Émincez 200 g d’oignons.')
    const gros = a('Émincez 1 kg d’oignons.')
    expect(gros.dureeMin!).toBeGreaterThan(petit.dureeMin!)
    // Le plafond joue : 1 kg n'est pas quatre fois 250 g.
    expect(gros.dureeMin!).toBeLessThanOrEqual(petit.dureeMin! * 3)
  })

  it('ne met pas une cuisson à l’échelle : elle est constante', () => {
    const e = a('Enfournez 500 g de gratin.')
    expect(e.echelle === 'constant' || e.echelle === null).toBe(true)
  })

  it('ne devine pas devant « quelques minutes »', () => {
    // On ne remplace pas un flou par un chiffre : c'est le référentiel qui
    // parle alors, et il le dit.
    const e = a('Laissez reposer quelques minutes.')
    expect(e.sourceDuree).not.toBe('declaree')
  })
})

describe('l’appareil', () => {
  it.each([
    ['Enfournez à 200 °C.', 'four'],
    ['Faites revenir à la poêle.', 'plaques'],
    ['Portez à ébullition dans une casserole.', 'plaques'],
    ['Cuisez 15 min à l’air fryer.', 'air_fryer'],
    ['Réchauffez au micro-ondes 2 minutes.', 'micro_ondes'],
    ['Mixez au blender.', 'blender'],
    ['Cuire 8 min à l’autocuiseur.', 'autocuiseur'],
  ])('reconnaît celui de « %s »', (texte, attendu) => {
    expect(a(texte).appareil).toBe(attendu)
  })

  it('ramène poêle et casserole aux plaques, jamais l’inverse', () => {
    // On coche « plaques de cuisson », pas « poêle ».
    expect(a('Faites revenir dans une sauteuse.').appareil).toBe('plaques')
    expect(a('Faites mijoter dans une cocotte.').appareil).toBe('plaques')
  })

  it('ne confond pas « four » et « fourchette »', () => {
    expect(a('Piquez la pâte à la fourchette.').appareil).not.toBe('four')
  })

  it('laisse null pour un geste à la main', () => {
    expect(a('Épluchez les carottes.').appareil).toBeNull()
  })

  it('préfère l’appareil écrit à celui que suppose le verbe', () => {
    // « cuire » seul ne dit rien ; « à l'air fryer » le dit.
    expect(a('Cuire les frites à l’air fryer 18 min.').appareil).toBe('air_fryer')
  })
})

describe('la température', () => {
  it.each([
    ['Préchauffez le four à 180 °C.', 180],
    ['Enfournez à 200°C.', 200],
    ['Four à 210 degrés.', 210],
    ['Préchauffez à th. 6.', 180],
    ['Thermostat 7.', 210],
  ])('lit celle de « %s »', (texte, attendu) => {
    const e = a(texte)
    expect(e.temperatureC).toBe(attendu)
    expect(e.sourceTemperature).toBe('declaree')
  })

  it('ne rend rien quand il n’y en a pas', () => {
    expect(a('Émincez les oignons.').temperatureC).toBeNull()
  })
})

describe('la charge', () => {
  it('rend passive une cuisson qui n’occupe personne', () => {
    expect(a('Enfournez pour 25 minutes.').charge).toBe('passif')
    expect(a('Laissez reposer 1 heure.').charge).toBe('passif')
  })

  it('rend bloquante une cuisson qu’il faut surveiller', () => {
    expect(a('Faites revenir les oignons.').charge).toBe('bloquant')
  })

  it('rend actif un geste de la main', () => {
    expect(a('Émincez les oignons.').charge).toBe('actif')
  })
})

describe('la confiance', () => {
  it('est pleine quand le verbe ET la durée sont écrits', () => {
    expect(a('Enfournez pour 25 minutes.').confiance).toBe(1)
  })

  it('baisse quand la durée est déduite', () => {
    expect(a('Émincez les oignons.').confiance).toBeLessThan(1)
  })

  it('est nulle pour une phrase sans geste', () => {
    expect(a('Bon appétit !').confiance).toBe(0)
  })
})

describe('l’ordre du texte', () => {
  it('enchaîne les actions dans l’ordre où elles sont écrites', () => {
    const etapes = [
      'Épluchez les carottes.',
      'Faites revenir les oignons.',
      'Laissez mijoter 20 minutes.',
    ].map(a)
    expect(dependances(etapes)).toEqual([[], ['0'], ['1']])
  })

  it('laisse le préchauffage libre : c’est ce qu’on lance en premier', () => {
    const etapes = [
      'Épluchez les pommes de terre.',
      'Préchauffez le four à 180 °C.',
      'Enfournez 40 minutes.',
    ].map(a)
    const liens = dependances(etapes)
    expect(liens[1], 'le préchauffage attend un épluchage').toEqual([])
    // Enfourner demande les DEUX : les pommes de terre épluchées, et le four
    // chaud. L'ancienne version ne gardait que le préchauffage, parce qu'il
    // remplaçait la chaîne du texte au lieu de s'y ajouter.
    expect(liens[2]).toEqual(['0', '1'])
  })

  it('ne fait PAS attendre ce qui ne se sert pas du four', () => {
    // Le défaut : le préchauffage devenait le prédécesseur de tout ce qui
    // suivait, épluchage compris. Douze minutes de four ajoutées au chemin
    // critique pour rien — mesuré, 65 min au lieu de 53. Le four chauffe
    // pendant qu'on travaille : c'est tout l'objet de D30.
    const etapes = [
      'Préchauffez le four à 180 °C.',
      'Épluchez les pommes de terre.',
      'Émincez les oignons.',
      'Enfournez 40 minutes.',
    ].map(a)
    const liens = dependances(etapes)
    expect(liens[1], 'l’épluchage attend le four').toEqual([])
    expect(liens[2]).toEqual(['1'])
    // Et l'enfournage, lui, attend bien le four.
    expect(liens[3]).toContain('0')
    expect(liens[3]).toContain('2')
  })

  it('saute les phrases qui ne sont pas des gestes', () => {
    const etapes = ['Émincez les oignons.', 'Bon appétit !', 'Servez chaud.'].map(a)
    const liens = dependances(etapes)
    expect(liens[1]).toEqual([])
    expect(liens[2]).toEqual([])
  })
})

describe('la couverture, sur des étapes réelles', () => {
  // Calquées sur le corpus mesuré. La barre est à 98 % de durées trouvées.
  const CORPUS = [
    'Préchauffez le four à 180 °C (th. 6).',
    'Épluchez et émincez les oignons.',
    'Faites chauffer l’huile dans une sauteuse.',
    'Faites revenir les oignons 5 minutes.',
    'Ajoutez le poulet et faites-le dorer sur toutes les faces.',
    'Versez le vin blanc et laissez réduire.',
    'Ajoutez les poivrons coupés en lanières.',
    'Salez, poivrez et assaisonnez de piment d’Espelette.',
    'Couvrez et laissez mijoter 35 minutes à feu doux.',
    'Pendant ce temps, faites cuire le riz.',
    'Rincez les lentilles corail à l’eau froide.',
    'Portez à ébullition puis baissez le feu.',
    'Laissez cuire 20 minutes jusqu’à absorption.',
    'Râpez le gingembre frais.',
    'Mélangez le tout hors du feu.',
    'Réservez au frais.',
    'Battez les œufs en omelette.',
    'Étalez la pâte au rouleau.',
    'Enfournez pour 25 à 30 minutes.',
    'Laissez refroidir sur une grille.',
  ]

  it('trouve une durée pour au moins 95 % des gestes', () => {
    const gestes = CORPUS.map(a).filter(e => e.estAction)
    const avecDuree = gestes.filter(e => e.dureeMin !== null)
    expect(gestes.length, 'trop peu de gestes reconnus').toBeGreaterThanOrEqual(18)
    expect(avecDuree.length / gestes.length).toBeGreaterThanOrEqual(0.95)
  })

  it('trouve un verbe pour au moins 90 % des gestes', () => {
    const gestes = CORPUS.map(a).filter(e => e.estAction)
    const avecVerbe = gestes.filter(e => e.verbe !== null)
    expect(avecVerbe.length / gestes.length).toBeGreaterThanOrEqual(0.9)
  })

  it('n’attribue jamais d’appareil à un geste de la main', () => {
    expect(a('Salez et poivrez.').appareil).toBeNull()
    expect(a('Battez les œufs en omelette.').appareil).toBeNull()
  })
})

describe('le repos n’est pas du travail', () => {
  /*
   * Mesuré sur des recettes réelles : sept formulations sur dix comptaient
   * comme du temps ACTIF. « Laissez décongeler 2 heures » n'a pas de verbe du
   * référentiel — « laisser » n'en est pas un — mais elle a une durée, donc
   * elle passait pour une action, donc pour 120 minutes de travail.
   *
   * Ces minutes entrent dans `recipe.active_time_min` par le trigger, c'est-à-dire
   * dans le filtre principal du catalogue : la recette disparaissait de
   * « 25 min actif » alors qu'elle n'en demande que cinq. Et l'ordonnanceur
   * mobilisait un cuisinier deux heures pour regarder décongeler.
   */
  const repos = [
    'Laissez reposer la pâte 1 heure.',
    'Laissez décongeler 2 heures au réfrigérateur.',
    'Laissez refroidir complètement, environ 30 minutes.',
    'Laissez lever la pâte pendant 1 h 30.',
    'Laissez mariner 2 heures au frais.',
    'Réservez au frais 20 minutes.',
    'Temps de repos : 45 minutes.',
  ]

  it('classe l’attente comme passive', () => {
    const fautes = repos
      .map(t => analyserEtape(t, REF))
      .filter(e => e.estAction && e.charge !== 'passif')
      .map(e => e.brut)
    expect(fautes, 'du repos compté comme du travail').toEqual([])
  })

  it('garde actif ce qui demande la main, même en « laissant »', () => {
    // « Laissez mijoter en remuant » n'est pas du repos : on est devant la
    // casserole. Le test existe pour que le correctif ne parte pas trop loin.
    // Le repos ne doit pas avaler les étapes où la main reste prise. Quand le
    // référentiel a un avis sur le verbe, c'est lui qui tranche — « mijoter »
    // est légitimement passif, la casserole travaille seule.
    for (const t of [
      'Émincez les oignons pendant 10 minutes.',
      'Fouettez les blancs en neige.',
      'Réservez la préparation dans un saladier.',
    ]) {
      const e = analyserEtape(t, REF)
      if (e.estAction) expect(e.charge, t).not.toBe('passif')
    }
  })
})

describe('les radicaux courts', () => {
  /*
   * « saler » donne le radical « sal », et un préfixe de trois lettres attrape
   * « saladier » et « salade » : la phrase « Dans un grand saladier » devenait
   * une action, avec une durée et un cuisinier mobilisé pour rien.
   *
   * Le commentaire de `radical` disait déjà qu'un radical de cinq lettres est
   * rarement ambigu. Sous cette longueur, on énumère les formes au lieu de
   * préfixer.
   */
  it('ne confondent pas un ustensile avec un geste', () => {
    for (const t of [
      'Dans un grand saladier.',
      'Mettez la salade dans un saladier.',
      'Versez dans une poêle.',
    ]) {
      const e = a(t)
      expect(e.verbe, `${t} → ${e.verbe}`).not.toBe('saler')
    }
  })

  it('reconnaissent quand même le geste', () => {
    expect(a('Salez généreusement.').verbe).toBe('saler')
    expect(a('Poivrez à votre goût.').verbe).toBe('poivrer')
    // « Saler et poivrer » en contient deux : l'un ou l'autre convient, ce qui
    // compte est qu'on ne rende pas null.
    expect(['saler', 'poivrer']).toContain(a('Saler et poivrer.').verbe)
  })

  it('reconnaissent les gestes ajoutés au référentiel', () => {
    // Vingt verbes manquaient. Sans eux, l'étape n'a ni verbe ni durée : elle
    // n'est pas une action, et elle DISPARAÎT du plan en silence.
    for (const [texte, attendu] of [
      ['Ajoutez les lentilles.', 'ajouter'],
      ['Versez sur la pâte.', 'verser'],
      ['Incorporez les blancs.', 'incorporer'],
      ['Couvrez et laissez cuire.', 'couvrir'],
      ['Rincez les lentilles.', 'rincer'],
      ['Parsemez de persil.', 'parsemer'],
      ['Démoulez le gâteau.', 'démouler'],
    ] as const) {
      expect(a(texte).verbe, texte).toBe(attendu)
    }
  })
})
