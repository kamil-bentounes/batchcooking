import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { indexer, rattacher, SEUIL, type AlimentIndexe } from '../src/aliment'

let index: AlimentIndexe[]
beforeAll(() => {
  const ciqual = JSON.parse(readFileSync(new URL('../../seed/ciqual.json', import.meta.url), 'utf8'))
  index = indexer(ciqual.map((a: any) => ({ id: a.code, name: a.nom, state: a.etat })))
})

const nom = (s: string) => rattacher(s, index)?.nom ?? null

describe('rattachement à CIQUAL', () => {
  it('retrouve les aliments simples', () => {
    expect(nom('oignon')).toMatch(/oignon/i)
    expect(nom('carotte')).toMatch(/carotte/i)
    expect(nom('lentilles corail')).toMatch(/lentille/i)
  })

  it('préfère le cru quand la recette ne précise rien', () => {
    const r = rattacher('poulet', index, { prefereCru: true })
    expect(r).not.toBeNull()
    expect(r!.nom).toMatch(/poulet/i)
  })

  it('évite les préparations industrielles', () => {
    // « Poulet au curry, préemballé » ne doit pas gagner contre une viande simple.
    expect(nom('blanc de poulet')).not.toMatch(/pr[ée]emball|appertis/i)
    expect(nom('tomate')).not.toMatch(/pr[ée]emball/i)
  })

  it('ignore les mots vides et la casse', () => {
    expect(nom('de la Farine')).toBe(nom('farine'))
    expect(nom('des OIGNONS bio')).toMatch(/oignon/i)
  })

  // ⚠️ Le point qui compte : refuser vaut mieux que rattacher au hasard.
  it('ne rattache PAS ce qu\'il ne reconnaît pas', () => {
    for (const s of ['zblorg', 'xyzzy quelque chose', 'ustensile']) {
      expect(rattacher(s, index), s).toBeNull()
    }
  })

  it('rend un score, et il est au-dessus du seuil', () => {
    const r = rattacher('courgette', index)
    expect(r!.score).toBeGreaterThanOrEqual(SEUIL)
    expect(r!.score).toBeLessThanOrEqual(1)
  })

  // ⚠️ Régression réelle : NFD ne décompose pas les ligatures, donc « Œuf »
  // devenait « uf » et l'ingrédient le plus courant des recettes ne trouvait rien.
  // Le correctif a fait gagner 2 points de rattachement sur tout le corpus.
  it('gère les ligatures Œ et Æ', () => {
    expect(nom('Œuf'), 'la ligature Œ doit être décomposée').toMatch(/oeuf|œuf/i)
    expect(nom('oeuf')).toMatch(/oeuf|œuf/i)
    expect(nom('ŒUFS')).toMatch(/oeuf|œuf/i)
  })

  it('accepte les pluriels', () => {
    expect(nom('oignons')).toMatch(/oignon/i)
    expect(nom('poireaux')).toMatch(/poireau/i)
    expect(nom('carottes')).toMatch(/carotte/i)
  })

  it('traduit les noms usuels que CIQUAL nomme autrement', () => {
    expect(nom('maïzena')).toMatch(/amidon|ma[ïi]s/i)
    expect(nom('cassonade')).toMatch(/sucre/i)
  })

  it('le foodId permet de retrouver les nutriments', () => {
    const r = rattacher('lentille verte', index)
    expect(r!.foodId).toMatch(/^\d+$/)
  })
})
