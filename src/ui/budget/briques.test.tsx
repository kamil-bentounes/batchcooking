/**
 * Les briques de l'écran du mois (2.9) : la feuille, la jauge, la photo, les icônes.
 *
 * Le dépôt n'a ni jsdom ni Testing Library : on rend en chaîne (`renderToStaticMarkup`)
 * et on lit le HTML. Ce que le navigateur ajoute (le focus, Échap, `showModal`) se voit
 * à l'e2e ; ici, ce que le balisage promet.
 */
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Feuille } from './Feuille.tsx'
import { Jauge } from './Jauge.tsx'
import { Photo } from './Photo.tsx'
import { Chevron, Corbeille, Croix, Info } from './icones.tsx'

const rends = (el: ReactElement) => renderToStaticMarkup(el)

describe('Jauge', () => {
  const largeur = (html: string) => Number(/width:([\d.]+)%/.exec(html)?.[1])

  it('se remplit en proportion du plafond, en herbe', () => {
    const h = rends(<Jauge valeur={25_00} plafond={100_00} nom="Courses" />)
    expect(largeur(h)).toBe(25)
    expect(h).toContain('var(--color-herbe)')
    expect(h).not.toContain('var(--color-ocre)')
  })

  it('passe à l’ocre au-delà du prévu, et s’arrête pleine', () => {
    const h = rends(<Jauge valeur={150_00} plafond={100_00} nom="Courses" />)
    expect(largeur(h)).toBe(100)
    expect(h).toContain('var(--color-ocre)')
  })

  it('pile au prévu, ce n’est pas un dépassement', () => {
    const h = rends(<Jauge valeur={100_00} plafond={100_00} nom="Courses" />)
    expect(h).toContain('var(--color-herbe)')
  })

  it('sans plafond : vide à 0, pleine et en ocre dès qu’il y a un montant', () => {
    expect(largeur(rends(<Jauge valeur={0} plafond={0} nom="x" />))).toBe(0)
    const h = rends(<Jauge valeur={5_00} plafond={0} nom="x" />)
    expect(largeur(h)).toBe(100)
    expect(h).toContain('var(--color-ocre)')
  })

  it('un montant négatif (un avoir) ne rend pas une largeur négative', () => {
    expect(largeur(rends(<Jauge valeur={-20_00} plafond={100_00} nom="x" />))).toBe(0)
  })

  it('n’est jamais rouge : une dépense n’est pas une erreur', () => {
    const h = rends(<Jauge valeur={999_00} plafond={1_00} nom="x" />)
    expect(h).not.toContain('groseille')
  })

  it('se dit aux lecteurs d’écran : un meter nommé, avec ses bornes', () => {
    const h = rends(<Jauge valeur={30_00} plafond={80_00} nom="30 € sur 80 €" />)
    expect(h).toContain('role="meter"')
    expect(h).toContain('aria-label="30 € sur 80 €"')
    expect(h).toContain('aria-valuemin="0"')
    expect(h).toContain('aria-valuemax="8000"')
    expect(h).toContain('aria-valuenow="3000"')
  })

  it('aria-valuenow ne dépasse jamais aria-valuemax : un meter au-delà de son max est invalide', () => {
    // Le dépassement se dit par l'ocre (testé plus haut), pas par une valeur hors bornes.
    const h = rends(<Jauge valeur={150_00} plafond={100_00} nom="Courses" />)
    expect(h).toContain('aria-valuemax="10000"')
    expect(h).toContain('aria-valuenow="10000"')
    expect(h).not.toContain('aria-valuenow="15000"')
  })

  it('aria-valuenow ne passe pas sous aria-valuemin non plus (un avoir)', () => {
    expect(rends(<Jauge valeur={-20_00} plafond={100_00} nom="x" />)).toContain('aria-valuenow="0"')
  })

  it('la version épaisse est plus haute que la fine', () => {
    expect(rends(<Jauge valeur={1} plafond={2} nom="x" epaisse />)).toContain('h-2.5')
    expect(rends(<Jauge valeur={1} plafond={2} nom="x" />)).toContain('h-1.5')
  })
})

describe('Photo', () => {
  it('prend la photo de la catégorie, sans texte alternatif (décorative)', () => {
    const h = rends(<Photo categorie="maison" />)
    expect(h).toContain('budget/maison.jpg')
    expect(h).toContain('alt=""')
  })

  it('l’épargne a sa photo, quelle que soit la catégorie', () => {
    expect(rends(<Photo epargne categorie="auto" />)).toContain('budget/epargne.jpg')
  })

  it('une catégorie inconnue, ou absente, se replie sur « autre » (jamais une image cassée)', () => {
    expect(rends(<Photo categorie="inconnue" />)).toContain('budget/autre.jpg')
    expect(rends(<Photo />)).toContain('budget/autre.jpg')
  })

  it('garde sa taille, pour que la liste ne saute pas au chargement', () => {
    const h = rends(<Photo categorie="auto" taille={40} />)
    expect(h).toContain('width="40"')
    expect(h).toContain('height="40"')
  })
})

describe('Feuille', () => {
  it('est un <dialog> nommé par son titre, avec sa poignée décorative', () => {
    const h = rends(<Feuille fermer={() => {}} titre="Courses"><p>dedans</p></Feuille>)
    expect(h).toMatch(/^<dialog /)
    expect(h).toContain('aria-label="Courses"')
    expect(h).toContain('class="feuille ')
    expect(h).toMatch(/aria-hidden="true"[^>]*bg-brume/)
    expect(h).toContain('<p>dedans</p>')
  })

  it('fermée, elle ne monte pas son contenu : pas de champ caché dans le focus', () => {
    const h = rends(<Feuille ouverte={false} fermer={() => {}} titre="x"><p>dedans</p></Feuille>)
    expect(h).not.toContain('dedans')
  })
})

describe('icones', () => {
  it('sont décoratives et prennent la couleur du texte', () => {
    const icones = [<Corbeille key="a" />, <Croix key="b" />, <Info key="c" />, <Chevron key="d" ouvert />]
    for (const i of icones) {
      const h = rends(i)
      expect(h).toContain('aria-hidden="true"')
      expect(h).toContain('stroke="currentColor"')
    }
  })

  it('le chevron change de sens selon l’état', () => {
    expect(rends(<Chevron ouvert />)).not.toBe(rends(<Chevron ouvert={false} />))
  })
})
