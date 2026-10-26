/**
 * Le bilan refait : ce que l'écran ne doit plus faire (deux échelles, « 6 / » puis « 6 », une cible inventée) et ce
 * qu'il doit continuer à dire (le trou n'est pas un zéro, le payé n'est pas l'estimé).
 *
 * Rendu en chaîne, comme les briques du budget : le dépôt n'a ni jsdom ni Testing Library.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Personne } from '../../lib/donnees/bilan.ts'
import type { Budget } from '../../lib/suivi.ts'
import { serie } from '../../lib/suivi.ts'
import { Barquettes } from './Barquettes.tsx'
import { CartePersonne } from './CartePersonne.tsx'
import { CeQuiEstPasse } from './CeQuiEstPasse.tsx'
import { Courses } from './Courses.tsx'
import { dateCourteDe, jourCourtDe } from './format.ts'
import { echelleCommune } from './echelle.ts'

const JOURS = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']
const repas = (user: string, day: string, kcal: number, protein_g: number) =>
  ({ day, user_profile_id: user, state: 'mange' as const, kcal, protein_g, kcalExtra: 0, proteinExtra: 0 })

function personne(id: string, nom: string, cible: { kcal: number; protein: number } | null,
                  r: [string, number, number][]): Personne {
  return {
    userId: id, nom, cibleKcal: cible?.kcal ?? null, cibleProtein: cible?.protein ?? null,
    serie: serie(JOURS, r.map(([d, k, p]) => repas(id, d, k, p)), id, { kcal: cible?.kcal ?? null, protein: cible?.protein ?? null }),
  }
}

const kamil = personne('k', 'Kamil', { kcal: 2200, protein: 150 }, [['2026-10-24', 620, 34], ['2026-10-25', 620, 34]])
const thauba = personne('t', 'Thauba', null, [['2026-10-24', 840, 60], ['2026-10-25', 1680, 90]])

const hauteurs = (html: string) => [...html.matchAll(/data-barre="" class="[^"]*" style="height:([\d.]+)%"/g)].map(m => Number(m[1]))

describe('l’échelle commune', () => {
  it('prend le plus haut des jours ET des cibles, de tout le foyer', () => {
    const e = echelleCommune([kamil, thauba])
    expect(e.kcal).toBeCloseTo(2200 * 1.05)
    expect(e.protein).toBeCloseTo(150 * 1.05)
  })

  it('sans cible, c’est le plus haut jour', () => {
    expect(echelleCommune([thauba]).kcal).toBeCloseTo(1680 * 1.05)
  })

  it('ne tombe jamais à zéro, même sans rien', () => {
    expect(echelleCommune([]).kcal).toBeGreaterThan(0)
  })
})

describe('les graphes des deux personnes', () => {
  const echelle = echelleCommune([kamil, thauba])
  const cK = renderToStaticMarkup(<CartePersonne p={kamil} rang={0} echelle={echelle} />)
  const cT = renderToStaticMarkup(<CartePersonne p={thauba} rang={1} echelle={echelle} />)

  it('une même valeur fait la même hauteur chez l’un et chez l’autre', () => {
    const solo = renderToStaticMarkup(<CartePersonne p={thauba} rang={1} echelle={echelleCommune([thauba])} />)
    expect(hauteurs(cT)).not.toEqual(hauteurs(solo))
    // 840 kcal : la barre de Thauba et celle que Kamil aurait à 840 se mesurent à la même règle.
    const h = hauteurs(cT)[0]
    expect(h).toBeCloseTo(840 / echelle.kcal * 100, 1)
  })

  it('trace la cible pour Kamil, et pas pour Thauba, qui n’en a pas', () => {
    expect(cK.match(/data-cible=""/g)).toHaveLength(2)
    expect(cT).not.toContain('data-cible')
    expect(cT).not.toContain('cible')
  })

  it('mêmes teintes pour les deux : herbe pour les calories, safran pour les protéines', () => {
    for (const html of [cK, cT]) {
      expect(html).toContain('bg-herbe')
      expect(html).toContain('bg-safran')
    }
  })

  it('le moyenne en très gros, avec son unité', () => {
    expect(cK).toContain('620')
    expect(cK).toContain('kcal en moyenne')
    expect(cK).toContain('g de protéines en moyenne')
    expect(cK).toContain('cible 2')
  })

  it('un jour non renseigné est un trou, pas une barre à zéro', () => {
    // 7 jours, 2 renseignés : 2 barres par graphe, 5 traits.
    expect(hauteurs(cK)).toHaveLength(4)
    expect(cK.match(/h-\[5px\] w-full rounded-full bg-piste/g)).toHaveLength(10)
  })

  it('nomme chaque jour, et marque le dernier', () => {
    expect(cK).toContain('lun.')
    expect(cK).toContain('font-bold text-encre')
    expect(jourCourtDe('2026-10-26')).toBe('lun.')
    expect(dateCourteDe('2026-10-03')).toBe('3 oct.')
  })

  it('dit sur combien de jours il parle (D33), et garde les noms accessibles des dessins', () => {
    expect(cK).toContain('2 jours renseignés sur 7')
    expect(cK).toContain('aria-label="Calories par jour, cible 2200 kcal"')
    expect(cT).toContain('aria-label="Protéines par jour"')
    expect(cK).toContain('2 jours sous la cible sur les 2 renseignés.')
    expect(cK).toContain('0 jour au-dessus de la cible sur les 2 renseignés.')
  })

  it('une personne sans repas renseigné n’a ni moyenne ni dessin', () => {
    const vide = personne('v', 'Vide', null, [])
    const html = renderToStaticMarkup(<CartePersonne p={vide} rang={2} echelle={echelle} />)
    expect(html).toContain('Aucun repas renseigné sur la période.')
    expect(html).not.toContain('data-graphe')
  })

  it('l’avatar porte l’initiale et la couleur de son rang dans le foyer', () => {
    expect(cK).toContain('bg-herbe')
    expect(cT).toContain('bg-ocre')
    expect(cT).toContain('>T<')
  })
})

describe('« Ce qui est passé »', () => {
  const html = renderToStaticMarkup(
    <CeQuiEstPasse photoDe={id => (id === 'r1' ? 'https://exemple.test/a.jpg' : null)}
                   recettes={[
                     { label: 'Pintade, semoule & sauce tomate aux épices', recipeId: 'r1', dressees: 6, mangees: 6, jetees: 0 },
                     { label: 'Tajine', recipeId: null, dressees: 4, mangees: 1, jetees: 2 },
                   ]} />)

  it('le décompte ne passe jamais à la ligne', () => {
    expect(html).toMatch(/whitespace-nowrap[^>]*>6 \/ 6</)
  })

  it('une photo quand il y en a une, l’appareil photo sinon', () => {
    expect(html).toContain('src="https://exemple.test/a.jpg"')
    expect(html).toContain('data-photo="vide"')
  })

  it('dit ce qui est jeté, et remplit la barre de ce qui est mangé', () => {
    expect(html).toContain('2 jetées')
    expect(html).toContain('width:100%')
    expect(html).toContain('width:25%')
  })
})

describe('les courses', () => {
  const b = (p: Partial<Budget> = {}): Budget =>
    ({ paye: 0, estimeRestant: 9.4, plafond: 73.59, part: 0, parPortion: null, ...p }) as Budget

  it('sans ticket, le dit, et ne remplit pas la jauge', () => {
    const html = renderToStaticMarkup(<Courses b={b()} />)
    expect(html).toContain('Aucun ticket enregistré sur la période.')
    expect(html).toContain('9,40 € encore estimés')
    expect(html).toContain('width:0%')
  })

  it('au-dessus du budget, la jauge passe à l’ocre et le dépassement se dit', () => {
    const html = renderToStaticMarkup(<Courses b={b({ paye: 87.4, part: 87.4 / 73.59, parPortion: 6.24, estimeRestant: 0 })} />)
    expect(html).toContain('bg-ocre')
    expect(html).toContain('13,81 € au-dessus du budget.')
    expect(html).toContain('6,24 € la part')
    expect(html).not.toContain('Aucun ticket')
  })

  it('sans budget posé, ni plafond ni jauge', () => {
    const html = renderToStaticMarkup(<Courses b={b({ plafond: null, part: null, paye: 12 })} />)
    expect(html).not.toContain('de budget')
    expect(html).not.toContain('rounded-full bg-piste')
  })
})

describe('les barquettes', () => {
  it('« jetées » n’apparaît que s’il y en a, et s’accorde', () => {
    expect(renderToStaticMarkup(<Barquettes mangees={1} restantes={3} jetees={0} />)).not.toContain('jetée')
    const un = renderToStaticMarkup(<Barquettes mangees={1} restantes={3} jetees={1} />)
    expect(un).toContain('>jetée<')
    expect(un).toContain('>mangée<')
    expect(renderToStaticMarkup(<Barquettes mangees={2} restantes={3} jetees={2} />)).toContain('>jetées<')
  })
})
