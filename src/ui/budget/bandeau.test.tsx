/**
 * Le bandeau du mois (3.6, § 3.1 point 9) : un seul à la fois, celui du mois précédent
 * non clôturé passe devant, et rien tant que les clôtures ne sont pas lues.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bandeau } from './Bandeau.tsx'
import { cloture, depense, ecranDuMois, OCT, revenu, SEPT, texte, tout } from '../../pages/budget-banc.tsx'

const rendu = (b: Parameters<typeof Bandeau>[0]['bandeau'], va = () => {}) =>
  renderToStaticMarkup(<Bandeau bandeau={b} va={va} />)

describe('Bandeau — chacun des trois genres', () => {
  it('rien du tout : rien', () => {
    expect(rendu(null)).toBe('')
  })

  it('le rappel dit comment on clôture, sans bouton', () => {
    const h = rendu({ genre: 'rappel', mois: OCT })
    expect(texte(h)).toContain('Le mois fini, on le clôture')
    expect(h).not.toContain('<button')
  })

  it('« bientôt » nomme le mois qui se termine et le jour de la clôture, sans bouton', () => {
    const h = rendu({ genre: 'bientot', mois: OCT })
    expect(texte(h)).toBe('Octobre se termine. Le 1er novembre, on le clôture.')
    expect(h).not.toContain('<button')
  })

  it('« bientôt » de décembre ouvre janvier (le 1er janvier, pas le 1er « treizième »)', () => {
    expect(texte(rendu({ genre: 'bientot', mois: '2026-12-01' }))).toContain('Le 1er janvier')
  })

  it('« à clôturer » mène à la clôture du mois nommé', () => {
    const h = rendu({ genre: 'cloturer', mois: SEPT })
    expect(texte(h)).toContain('Septembre est fini : on le clôture ?')
    expect(texte(h)).toContain('Clôturer septembre')
  })
})

describe('Bandeau — sur l’écran du mois (le 21 octobre)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 10, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  const septembre = [depense({ mois: SEPT })]

  it('octobre, septembre pas clôturé et avec un revenu : « Septembre est fini », devant le rappel', () => {
    const t = texte(ecranDuMois(tout()))
    expect(t).toContain('Septembre est fini : on le clôture ?')
    expect(t).toContain('Clôturer septembre')
    expect(t).not.toContain('Le mois fini, on le clôture')
  })

  it('octobre, septembre clôturé : le rappel du 21', () => {
    const t = texte(ecranDuMois(tout({ clotures: [cloture(SEPT)] })))
    expect(t).toContain('Le mois fini, on le clôture')
    expect(t).not.toContain('est fini : on le clôture')
  })

  it('sans revenu en septembre, rien ne propose de clôturer : seul le rappel reste', () => {
    const t = texte(ecranDuMois(tout({ revenus: [{ ...revenu(), valid_from: '2026-10-01' }] })))
    expect(t).not.toContain('est fini : on le clôture')
    expect(t).toContain('Le mois fini, on le clôture')
  })

  it('un seul bandeau à la fois', () => {
    const t = texte(ecranDuMois(tout()))
    expect((t.match(/on le clôture/g) ?? []).length).toBe(1)
  })

  it('un mois passé non clôturé, avec un revenu : lui-même à clôturer', () => {
    const t = texte(ecranDuMois(tout({ depenses: septembre }), { mois: SEPT, depart: SEPT }))
    expect(t).toContain('Septembre est fini : on le clôture ?')
  })

  it('un mois CLÔTURÉ n’a pas de bandeau', () => {
    const t = texte(ecranDuMois(tout({ depenses: septembre, clotures: [cloture(SEPT)] }),
                                { mois: SEPT, depart: SEPT }))
    expect(t).not.toContain('on le clôture')
  })

  it('les clôtures pas encore lues : aucun bandeau (et pas de chiffre : l’écran attend)', () => {
    const lues = tout()
    delete lues.clotures
    const t = texte(ecranDuMois(lues))
    expect(t).toContain('Un instant…')
    expect(t).not.toContain('on le clôture')
  })
})

describe('Bandeau — le 27 et après', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 28, 10, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('septembre clôturé : « Octobre se termine. Le 1er novembre, on le clôture. »', () => {
    expect(texte(ecranDuMois(tout({ clotures: [cloture(SEPT)] }))))
      .toContain('Octobre se termine. Le 1er novembre, on le clôture.')
  })
})
