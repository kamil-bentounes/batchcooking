/**
 * L'extraction JSON-LD, sur les formes que les sites publient réellement.
 *
 * Les cas ci-dessous ne sont pas inventés : graphe `@graph`, instructions en
 * `HowToStep`, en `HowToSection`, en une seule chaîne, `recipeYield` écrit
 * « 4 personnes ». Un extracteur qui ne gère que la forme canonique rate la
 * moitié du web.
 */
import { describe, expect, it } from 'vitest'
import { blocsJsonLd, dureeIso, etapes, extraire, ingredients, parts } from '../src/jsonld.ts'

const page = (json: unknown, autour = '') => `<!doctype html><html><head>
  ${autour}
  <script type="application/ld+json">${JSON.stringify(json)}</script>
</head><body>peu importe</body></html>`

const RECETTE = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Poulet basquaise',
  recipeYield: '4 personnes',
  totalTime: 'PT1H15M',
  prepTime: 'PT25M',
  cookTime: 'PT50M',
  recipeIngredient: ['500 g de poulet', '2 poivrons', '1 oignon'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Émincez les oignons.' },
    { '@type': 'HowToStep', text: 'Faites revenir le poulet.' },
  ],
  publisher: { '@type': 'Organization', name: 'Marmiton' },
}

describe('les blocs de la page', () => {
  it('lit un bloc bien formé', () => {
    expect(blocsJsonLd(page(RECETTE))).toHaveLength(1)
  })

  it('ignore un bloc cassé sans perdre les autres', () => {
    const html = `<script type="application/ld+json">{ pas du json</script>`
      + `<script type="application/ld+json">${JSON.stringify(RECETTE)}</script>`
    expect(blocsJsonLd(html)).toHaveLength(1)
  })

  it('ne rend rien pour une page sans ld+json', () => {
    expect(blocsJsonLd('<html><body>rien</body></html>')).toEqual([])
  })
})

describe('trouver la recette dans le graphe', () => {
  it('la trouve à la racine', () => {
    expect(extraire(page(RECETTE), 'https://x/r')!.titre).toBe('Poulet basquaise')
  })

  it('la trouve dans un @graph', () => {
    const html = page({ '@context': 'https://schema.org', '@graph': [
      { '@type': 'WebSite', name: 'Site' },
      { '@type': 'BreadcrumbList' },
      RECETTE,
    ] })
    expect(extraire(html, 'https://x/r')!.titre).toBe('Poulet basquaise')
  })

  it('la trouve quand @type est une liste', () => {
    const html = page({ ...RECETTE, '@type': ['Recipe', 'NewsArticle'] })
    expect(extraire(html, 'https://x/r')).not.toBeNull()
  })

  it('rend null pour une page sans recette', () => {
    const html = page({ '@type': 'Article', headline: 'Les dix meilleurs woks' })
    expect(extraire(html, 'https://x/a')).toBeNull()
  })

  it('refuse une recette sans étapes : un titre seul pollue le catalogue', () => {
    const html = page({ ...RECETTE, recipeInstructions: [] })
    expect(extraire(html, 'https://x/r')).toBeNull()
  })

  it('refuse une recette sans ingrédients', () => {
    const html = page({ ...RECETTE, recipeIngredient: [] })
    expect(extraire(html, 'https://x/r')).toBeNull()
  })
})

describe('les durées ISO 8601', () => {
  it.each([
    ['PT25M', 25],
    ['PT1H', 60],
    ['PT1H30M', 90],
    ['P0DT2H15M', 135],
    ['PT2H', 120],
  ])('lit %s', (iso, attendu) => expect(dureeIso(iso)).toBe(attendu))

  it('accepte un nombre déjà en minutes', () => {
    expect(dureeIso(45)).toBe(45)
  })

  it('rend null sur ce qui n’est pas une durée', () => {
    expect(dureeIso('bientôt')).toBeNull()
    expect(dureeIso(null)).toBeNull()
    expect(dureeIso('PT')).toBeNull()
  })
})

describe('le nombre de parts', () => {
  it.each([
    ['4', 4],
    ['4 personnes', 4],
    ['Pour 6 personnes', 6],
    [6, 6],
    [['8', '8 parts'], 8],
  ])('lit %s', (v, attendu) => expect(parts(v)).toBe(attendu))

  it('ne prend pas un poids pour un nombre de parts', () => {
    // « 750 g » se glisse parfois dans recipeYield.
    expect(parts('750 g')).toBeNull()
  })

  it('rend null quand rien n’est écrit', () => {
    expect(parts(undefined)).toBeNull()
    expect(parts('à volonté')).toBeNull()
  })
})

describe('les étapes', () => {
  it('lit une liste de HowToStep', () => {
    expect(etapes(RECETTE.recipeInstructions)).toEqual([
      'Émincez les oignons.', 'Faites revenir le poulet.',
    ])
  })

  it('descend dans les HowToSection', () => {
    const v = [
      { '@type': 'HowToSection', name: 'La garniture', itemListElement: [
        { '@type': 'HowToStep', text: 'Émincez les oignons.' },
      ] },
      { '@type': 'HowToSection', name: 'La cuisson', itemListElement: [
        { '@type': 'HowToStep', text: 'Enfournez 25 minutes.' },
      ] },
    ]
    expect(etapes(v)).toEqual(['Émincez les oignons.', 'Enfournez 25 minutes.'])
  })

  it('découpe une chaîne unique aux retours à la ligne', () => {
    expect(etapes('Émincez les oignons.\nFaites revenir.\n\nEnfournez.'))
      .toEqual(['Émincez les oignons.', 'Faites revenir.', 'Enfournez.'])
  })

  it('découpe une chaîne unique aux « Étape N »', () => {
    expect(etapes('Étape 1 : Émincez. Étape 2 : Enfournez 25 min.'))
      .toEqual(['Émincez.', 'Enfournez 25 min.'])
  })

  it('ne découpe PAS au point : « 180 °C. » n’est pas une étape', () => {
    const r = etapes('Préchauffez le four à 180 °C. Enfournez 25 minutes.')
    expect(r).toHaveLength(1)
  })

  it('lit une liste de chaînes nues', () => {
    expect(etapes(['Émincez.', 'Enfournez.'])).toEqual(['Émincez.', 'Enfournez.'])
  })

  it('rend une liste vide plutôt que de planter', () => {
    expect(etapes(undefined)).toEqual([])
    expect(etapes({})).toEqual([])
  })
})

describe('les ingrédients', () => {
  it('lit une liste de chaînes', () => {
    expect(ingredients(['500 g de poulet', '2 poivrons'])).toHaveLength(2)
  })

  it('écarte les entrées vides', () => {
    expect(ingredients(['500 g de poulet', '', '  ', 'x'])).toEqual(['500 g de poulet'])
  })

  it('lit une chaîne seule', () => {
    expect(ingredients('500 g de poulet')).toEqual(['500 g de poulet'])
  })
})

describe('la source', () => {
  it('rend le domaine, pas l’éditeur déclaré', () => {
    // `publisher` n'est pas fiable : relevé « Marmiton_Recettes », « Anonyme »,
    // et une URL de schéma. Le domaine, lui, n'est jamais faux.
    expect(extraire(page(RECETTE), 'https://www.marmiton.org/r/42')!.source)
      .toBe('marmiton.org')
  })

  it('ne se rabat jamais sur l’auteur', () => {
    const sansEditeur = { ...RECETTE, publisher: undefined, author: { name: 'Rinoa Keller' } }
    expect(extraire(page(sansEditeur), 'https://www.ptitchef.com/r/7')!.source)
      .toBe('ptitchef.com')
  })

  it('garde les sous-domaines, qui distinguent les sites', () => {
    expect(extraire(page(RECETTE), 'https://cuisine.journaldesfemmes.fr/r/1')!.source)
      .toBe('cuisine.journaldesfemmes.fr')
  })
})

describe('la recette complète', () => {
  it('rend tout ce dont l’ingestion a besoin', () => {
    const r = extraire(page(RECETTE), 'https://marmiton.org/r/42')!
    expect(r.url).toBe('https://marmiton.org/r/42')
    expect(r.titre).toBe('Poulet basquaise')
    expect(r.source).toBe('marmiton.org')
    expect(r.parts).toBe(4)
    expect(r.totalMin).toBe(75)
    expect(r.prepMin).toBe(25)
    expect(r.cuissonMin).toBe(50)
    expect(r.ingredients).toHaveLength(3)
    expect(r.etapes).toHaveLength(2)
  })
})

describe('le nombre de parts', () => {
  /*
   * Prendre le premier nombre est faux sur la forme la plus courante des
   * tartes, quiches et cakes français : « 1 tarte pour 8 personnes » rendait 1,
   * et les macros par part se retrouvaient multipliées par huit.
   */
  it('lit le nombre qui porte le mot « personnes »', () => {
    expect(parts('1 tarte pour 8 personnes')).toBe(8)
    expect(parts('2 plaques, 12 parts')).toBe(12)
    expect(parts('1 cake (10 portions)')).toBe(10)
  })

  it('lit « pour N » à défaut', () => {
    expect(parts('Recette pour 6')).toBe(6)
  })

  it('garde le cas simple', () => {
    expect(parts('4')).toBe(4)
    expect(parts(6)).toBe(6)
    expect(parts('4 personnes')).toBe(4)
  })

  it('ignore ce qui n’est pas un nombre de parts', () => {
    expect(parts('1 kg')).toBe(1)          // faute de mieux, mais borné
    expect(parts('environ 500 g')).toBeNull()
    expect(parts(null)).toBeNull()
  })
})
