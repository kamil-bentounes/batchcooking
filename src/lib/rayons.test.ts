/**
 * Du groupe CIQUAL au rayon : ce que le grand test « cuisine » a trouvé faux.
 *
 * Les lentilles tombaient en « Fruits et légumes » (le regex ne connaissait pas « sèche »,
 * et le groupe CIQUAL range les légumineuses avec les légumes) ; les œufs, en « Boucherie ».
 */
import { describe, expect, it } from 'vitest'
import { rayonDe } from './rayons.ts'

const FRUITS_LEGUMES = 'fruits, légumes, légumineuses et oléagineux'
const VIANDES_OEUFS = 'viandes, œufs, poissons et assimilés'
const AIDES = 'aides culinaires et ingrédients divers'

describe('rayonDe : les cas du grand test', () => {
  it.each([
    ['un œuf', { groupe: VIANDES_OEUFS, sousGroupe: 'œufs', libelle: 'Oeuf, cru' }, 'Frais'],
    ['des lentilles corail sèches', { groupe: FRUITS_LEGUMES, sousGroupe: 'légumineuses', libelle: 'Lentille corail, sèche' }, 'Épicerie salée'],
    // sans l'indice « sèche » : seule la sous-catégorie peut le dire
    ['des pois chiches cuits', { groupe: FRUITS_LEGUMES, sousGroupe: 'légumineuses', libelle: 'Pois chiche, bouilli/cuit à l’eau' }, 'Épicerie salée'],
    ['des noix de pécan', { groupe: FRUITS_LEGUMES, sousGroupe: 'fruits à coque et graines oléagineuses', libelle: 'Noix de pécan' }, 'Épicerie salée'],
    ['du jambon', { groupe: VIANDES_OEUFS, sousGroupe: 'charcuteries et assimilés', libelle: 'Jambon cuit, choix' }, 'Frais'],
    ['du persil frais', { groupe: AIDES, sousGroupe: 'herbes', libelle: 'Persil, frais' }, 'Fruits et légumes'],
    ['du thym séché', { groupe: AIDES, sousGroupe: 'herbes', libelle: 'Thym, séché' }, 'Épicerie salée'],
    ['des herbes sans mention', { groupe: AIDES, sousGroupe: 'herbes', libelle: 'Herbes de Provence' }, 'Épicerie salée'],
    ['des pommes de terre', { groupe: FRUITS_LEGUMES, sousGroupe: 'pommes de terre et autres tubercules', libelle: 'Pomme de terre, crue' }, 'Fruits et légumes'],
    ['du poulet', { groupe: VIANDES_OEUFS, sousGroupe: 'viandes crues', libelle: 'Poulet, cuisse, viande, cru' }, 'Boucherie, poissonnerie'],
    ['une tomate', { groupe: FRUITS_LEGUMES, sousGroupe: 'légumes', libelle: 'Tomate, crue' }, 'Fruits et légumes'],
    ['du sel', { groupe: AIDES, sousGroupe: 'sels', libelle: 'Sel fin' }, 'Épicerie salée'],
  ] as const)('%s', (_, entree, rayon) => {
    expect(rayonDe(entree)).toBe(rayon)
  })

  it('les INDICES gardent la priorité sur la sous-catégorie', () => {
    expect(rayonDe({ groupe: VIANDES_OEUFS, sousGroupe: 'viandes crues', libelle: 'Poulet, filet, surgelé' })).toBe('Surgelés')
    expect(rayonDe({ groupe: VIANDES_OEUFS, sousGroupe: 'œufs', libelle: 'Oeuf, blanc, en conserve' })).toBe('Épicerie salée')
    expect(rayonDe({ groupe: FRUITS_LEGUMES, sousGroupe: 'légumes', libelle: 'Haricots verts, surgelés' })).toBe('Surgelés')
  })

  it('« sèche » et « séché », avec ou sans accent, vont à l’épicerie', () => {
    expect(rayonDe({ libelle: 'Lentilles corail sèches' })).toBe('Épicerie salée')
    expect(rayonDe({ libelle: 'Tomates séchées' })).toBe('Épicerie salée')
    expect(rayonDe({ libelle: 'Lentille, seche' })).toBe('Épicerie salée')
    expect(rayonDe({ libelle: 'Fruits secs' })).toBe('Épicerie salée')
  })

  it('sans sous-catégorie, le groupe seul décide comme avant', () => {
    expect(rayonDe({ groupe: FRUITS_LEGUMES, libelle: 'Courgette, crue' })).toBe('Fruits et légumes')
    expect(rayonDe({ groupe: 'produits laitiers et assimilés', libelle: 'Lait entier' })).toBe('Frais')
    expect(rayonDe({ libelle: 'Truc inconnu' })).toBe('Autre')
  })

  it('la catégorie du catalogue passe avant tout', () => {
    expect(rayonDe({ categorie: 'Entretien', sousGroupe: 'œufs', libelle: 'Oeuf' })).toBe('Entretien')
  })
})
