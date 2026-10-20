/**
 * Le texte des recettes, tel qu'il arrive des sites (R5). Les titres réels de la
 * maquette sont éprouvés à part, dans `worker/test/titres.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { decodeEntites, plie, titrePropre } from './texte.ts'

describe('les entités', () => {
  it.each([
    ['Fish &amp; chips', 'Fish & chips'],
    ['Tarte a l&#039;oignon', 'Tarte a l\'oignon'],
    ['Cr&egrave;me br&ucirc;l&eacute;e', 'Crème brûlée'],
    ['&#x27;', '\''],
    ['Fish &amp;amp; chips', 'Fish & chips'],
  ])('décode %s', (brut, attendu) => {
    expect(decodeEntites(brut)).toBe(attendu)
  })

  it('laisse une entité inconnue telle quelle', () => {
    expect(decodeEntites('a &zz; b')).toBe('a &zz; b')
  })

  it('ne décode pas une moitié de caractère (plage 0xD800–0xDFFF)', () => {
    expect(decodeEntites('a &#55357; b')).toBe('a &#55357; b')
    expect(decodeEntites('a &#xD83D; b')).toBe('a &#xD83D; b')
    expect(decodeEntites('a &#xdfff; b')).toBe('a &#xdfff; b')
    expect(decodeEntites('a &#xD800; b')).toBe('a &#xD800; b')
  })

  it('décode juste en deçà et au-delà de cette plage', () => {
    expect(decodeEntites('&#xD7FF;')).toBe('\uD7FF')
    expect(decodeEntites('&#57344;')).toBe('\uE000')
    expect(decodeEntites('&#128512;')).toBe('😀')
  })
})

describe('la pliure', () => {
  it('ignore la casse et les accents', () => {
    expect(plie('Pâtes CRÉMEUSES')).toBe('pates cremeuses')
    expect(plie('Œufs')).toBe('oeufs')
  })
})

describe('le titre', () => {
  it.each([
    ['Poulet basquaise : la meilleure recette', 'Poulet basquaise'],
    ['Gâteau au yaourt : la recette de grand-mère', 'Gâteau au yaourt'],
    ['Crêpes faciles - Recette Ptitchef', 'Crêpes faciles'],
    ['Pâtes à la carbonara, la vraie recette italienne', 'Pâtes à la carbonara'],
    ['Pancakes protéinés | Recette fitness', 'Pancakes protéinés'],
    ['Bœuf bourguignon – la recette du chef', 'Bœuf bourguignon'],
    ['Velouté de potimarron (recette facile)', 'Velouté de potimarron'],
    ['Butternut & saucisses rôties - Cookeo', 'Butternut & saucisses rôties'],
    ['Recette de la pâte à crêpes', 'Pâte à crêpes'],
    ['Recette du poulet basquaise', 'Poulet basquaise'],
    ['Recette : gratin dauphinois', 'Gratin dauphinois'],
    ['Poulet mariné a l\'indienne', 'Poulet mariné à l\'indienne'],
    ['Tarte a la rhubarbe', 'Tarte à la rhubarbe'],
    ['Fish &amp; chips maison', 'Fish & chips maison'],
    ['  Lasagnes   bolognaise.  ', 'Lasagnes bolognaise'],
    // Une virgule du nom du plat ne doit pas faire commencer la coupe plus tôt.
    ['Poulet, riz et petits pois - Recette facile', 'Poulet, riz et petits pois'],
    ['Salade de pâtes, tomates et feta - Recette rapide', 'Salade de pâtes, tomates et feta'],
    ['Lasagnes à la bolognaise | Recette | Marmiton', 'Lasagnes à la bolognaise'],
  ])('« %s » devient « %s »', (brut, attendu) => {
    expect(titrePropre(brut)).toBe(attendu)
  })

  it.each([
    'Gâteau marbré',
    // Une réclame sans le mot « recette » : on n'y touche pas, on ne devine pas.
    'Brownies : le moelleux absolu',
    // La marque fait partie du nom quand elle n'est pas seule après un séparateur.
    'Poulet curry coco au Cookeo',
    // Un tiret sans espaces n'est pas un séparateur.
    'Noix de Saint-Jacques poêlées',
    // « Recette » sans « de » derrière n'annonce rien.
    'Recette facile de crêpes',
  ])('laisse « %s » tel quel', t => {
    expect(titrePropre(t)).toBe(t)
  })

  it('ne vide jamais un titre', () => {
    expect(titrePropre('Recette')).toBe('Recette')
    expect(titrePropre(': la recette')).toBe(': la recette')
  })

  it('rend null pour null', () => {
    expect(titrePropre(null)).toBeNull()
  })

  it('ne change plus un titre déjà nettoyé', () => {
    for (const t of ['Poulet basquaise : la meilleure recette', 'Recette de la pâte à crêpes',
      'Tarte a l&#039;oignon - Cookeo', 'Velouté (recette facile)',
      'Poulet, riz et petits pois - Recette facile',
      'Salade de pâtes, tomates et feta - Recette rapide',
      'Lasagnes à la bolognaise | Recette | Marmiton',
      // Quatre fins empilées : une par passe, la réclame en dernier.
      'Poulet - Recette - Cookeo - Marmiton - Jow',
      'Poulet - Cookeo - Marmiton - Jow - Ptitchef - Thermomix - CuisineAZ',
      // Une entité à trois étages.
      'Fish &amp;amp;amp; chips']) {
      const une = titrePropre(t)
      expect(titrePropre(une), t).toBe(une)
    }
  })

  it('rend « Poulet » pour quatre fins empilées, dès le premier appel', () => {
    expect(titrePropre('Poulet - Recette - Cookeo - Marmiton - Jow')).toBe('Poulet')
  })

  it('décode une entité à trois étages en un seul appel', () => {
    expect(titrePropre('Fish &amp;amp;amp; chips')).toBe('Fish & chips')
  })

  it('est idempotent sur deux cent mille titres tirés au hasard', () => {
    // Un générateur à graine fixe : le jour où ça casse, on rejoue le même titre.
    let etat = 123456789
    const alea = () => { etat = (Math.imul(etat, 1664525) + 1013904223) >>> 0; return etat / 2 ** 32 }
    const choix = <T,>(l: T[]) => l[Math.floor(alea() * l.length)]
    const morceaux = ['Poulet', 'riz', 'Recette', 'recettes', 'facile', 'Cookeo', 'Marmiton', 'Jow',
      'Thermomix', 'Ptitchef', 'de', 'la', 'du', 'a', 'l\'', 'pâtes', '&amp;', '&amp;amp;', '&#039;',
      'la meilleure', '(recette facile)', 'a la', 'Saint-Jacques']
    const seps = [' ', ' - ', ' | ', ' : ', ', ', ' – ', ' — ', '-', '. ', ' ']
    for (let n = 0; n < 200_000; n++) {
      const k = 1 + Math.floor(alea() * 7)
      let t = ''
      for (let j = 0; j < k; j++) t += (j ? choix(seps) : '') + choix(morceaux)
      const une = titrePropre(t)
      expect(titrePropre(une), JSON.stringify(t)).toBe(une)
    }
  })
})
