/**
 * Le rattachement, mesuré sur les trente ingrédients les plus courants.
 *
 * Ce test existe parce qu'une relecture a mesuré, le 18 septembre 2026, que
 * **dix-sept sur trente tombaient à côté** — et toujours de la même façon :
 * l'entrée la plus proche par le NOM plutôt que par la chose. « beurre »
 * rendait « Beurre de cacahuète », « pâtes » rendait « Pâté breton », « œuf »
 * rendait « Œuf, en poudre », « tomate » rendait « Tomate, séchée ».
 *
 * Ce n'est pas une erreur d'affichage : c'est le score écrit dans
 * `recipe_ingredient.confidence`, les macros calculées dessus, et — au-delà de
 * 0,8 — le verrou de `tg_class_b_guard` qui interdit ensuite au foyer de
 * corriger. Une tomate séchée pèse cinq fois les calories d'une fraîche.
 *
 * Le corpus est volontairement banal : ce sont les mots qu'une recette écrit.
 * S'il se dégrade, c'est tout le catalogue qui se dégrade en silence.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { indexer, rattacher } from '../src/aliment.ts'
import type { AlimentIndexe } from '../src/aliment.ts'

let index: AlimentIndexe[]

beforeAll(async () => {
  const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const tout: { id: string; name: string; state: string }[] = []
  // PostgREST plafonne à 1 000 lignes en silence : on pagine, toujours.
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from('food')
      .select('id, name, state').order('id').range(de, de + 999)
    if (error) throw new Error(error.message)
    tout.push(...data)
    if (data.length < 1000) break
  }
  expect(tout.length, 'le référentiel n’est pas chargé : le test serait vert à vide')
    .toBeGreaterThan(3000)
  index = indexer(tout.map(a => ({ id: a.id, name: a.name, state: a.state })))
})

/** Ce qu'une recette écrit → ce que l'aliment retenu doit contenir. */
const CORPUS: [string, RegExp][] = [
  ['beurre', /^Beurre à \d+% MG/],
  ['farine', /^Farine de blé tendre/],
  ['coulis de tomates', /^Tomate, coulis/],
  ['fromage frais', /^Fromage blanc/],
  ['crème fraîche', /^Crème de lait/],
  ['oignon', /^Oignon, cru$/],
  ['carotte', /^Carotte, crue$/],
  ['lait', /^Lait entier/],
  ['oeuf', /^Oeuf, cru$/],
  ['poulet', /^Poulet, filet/],
  ['riz', /^Riz blanc/],
  ['pâtes', /^Pâtes sèches standard/],
  ['sucre', /^Sucre blanc$/],
  ['huile d’olive', /^Huile d'olive/],
  ['ail', /^Ail, cru$/],
  ['tomate', /^Tomate, crue$/],
  ['pomme de terre', /^Pomme de terre/],
  ['courgette', /^Courgette/],
  ['poivron', /^Poivron/],
  ['saumon', /^Saumon, cru/],
  ['crème', /^Crème de lait/],
  ['yaourt', /^Yaourt(,| ou)/],
  ['jambon', /^Jambon cuit/],
  ['thon', /^Thon, cru$/],
  ['lentilles', /^Lentille, bouillie/],
  ['chocolat', /^Chocolat noir/],
  ['persil', /^Persil, frais$/],
  ['basilic', /^Basilic, frais$/],
  ['citron', /^Citron, pulpe/],
  ['vinaigre', /^Vinaigre$/],
  /*
   * Ceux-ci ne viennent pas d'une liste écrite d'avance : ils viennent d'un
   * COMPTAGE de ce qui est réellement rattaché en production, fait après le
   * premier correctif. Les deux aliments les plus rattachés du catalogue
   * tombaient encore à côté, et le corpus ci-dessus ne les couvrait pas :
   *
   *  · « sel » rendait « Sel au céleri » — 658 lignes ;
   *  · « eau » rendait « Eau de vie », de l'alcool à 40° là où la recette met
   *    de l'eau — 171 lignes.
   *
   * La leçon mérite d'être gardée avec eux : trente cas bien choisis ne
   * remplacent pas un comptage sur ce qui sert vraiment.
   */
  ['sel', /^Sel blanc/],
  ['gros sel', /^Sel marin/],
  ['eau', /^Eau du robinet$/],
  ['sauce soja', /^Sauce soja/],
  ['poivre', /^Poivre noir/],
  ['levure', /^Levure/],
  ['miel', /^Miel$/],
  ['parmesan', /^Parmesan$/],
  ['moutarde', /^Moutarde$/],
  ['vin blanc', /^Vin blanc/],
  ['maïzena', /^Amidon de maïs/],
  ['thym', /^Thym/],
  ['paprika', /^Paprika$/],
  /*
   * Et les formes composées, relevées elles aussi sur la production : le score
   * seul les envoyait au mauvais endroit parce que le nom CIQUAL canonique est
   * long et que la précision le punissait. « Sel et poivre » rendait
   * « Beurre à 80% MG, demi-sel » — 217 lignes de recette annonçaient du beurre
   * là où il y a du sel.
   */
  ['sel et poivre', /^Sel /],
  ['sel fin', /^Sel blanc/],
  ['sauce tomate', /^Tomate, coulis/],
  ['jambon', /^Jambon cuit/],
  ['lentilles', /^Lentille, bouillie/],
  ['lait', /^Lait entier/],
]

describe('les trente ingrédients les plus courants', () => {
  it('se rattachent tous à l’aliment que la recette désigne', () => {
    const ratés: string[] = []
    for (const [ecrit, attendu] of CORPUS) {
      const r = rattacher(ecrit, index)
      if (!r || !attendu.test(r.nom)) ratés.push(`${ecrit} → ${r?.nom ?? '—'}`)
    }
    expect(ratés, `${ratés.length} sur ${CORPUS.length} tombent à côté`).toEqual([])
  })

  it('ne rattachent JAMAIS une transformation qu’on n’a pas demandée', () => {
    // Le défaut avait toujours la même forme : séchée, en poudre, fumé, purée.
    const interdit = /séch|en poudre|fumé|purée|germ|confit|pané|farci/i
    // Ce qui est entre parenthèses DÉCRIT l'aliment, il ne le nomme pas :
    // « Tomate, coulis, appertisé (purée de tomates mi-réduite à 11 %) » est
    // bien un coulis, et c'est ce qu'une recette demande en écrivant « coulis ».
    const nom = (s2: string) => s2.split('(')[0]
    const fautes: string[] = []
    for (const [ecrit] of CORPUS) {
      const r = rattacher(ecrit, index)
      if (r && interdit.test(nom(r.nom)) && !interdit.test(ecrit)) {
        fautes.push(`${ecrit} → ${r.nom}`)
      }
    }
    expect(fautes).toEqual([])
  })

  it('rendent le même aliment à chaque appel, quel que soit l’ordre de l’index', () => {
    // À score égal, le vainqueur dépendait de l'ordre de lecture de la base,
    // c'est-à-dire de `gen_random_uuid()` : la même URL ingérée deux fois
    // donnait deux jeux de macros, et un `db reset` rebattait le catalogue.
    const melange = [...index].reverse()
    for (const [ecrit] of CORPUS) {
      const a = rattacher(ecrit, index)
      const b = rattacher(ecrit, melange)
      expect(b?.nom, `${ecrit} : le résultat dépend de l’ordre de l’index`).toBe(a?.nom)
    }
  })

  it('refusent encore de rattacher ce qui n’existe pas', () => {
    // Le seuil doit rester mordant : mieux vaut « je ne sais pas » qu'un
    // rattachement au hasard, qui fausse les macros sans prévenir.
    expect(rattacher('zorglub des cavernes', index)).toBeNull()
  })
})
