/**
 * Les dépenses de la clôture (3.3, étape 2). `EtapeDepenses` n'a pas d'état : on la
 * rend en chaîne pour lire les mots, et on appelle ses boutons dans l'arbre qu'elle
 * rend pour lire ce qu'ils envoient — surtout que « Rien dépensé » porte une CHARGE,
 * pas une ligne. Les montants portent l'espace fine insécable (U+202F).
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Depense } from '../../lib/donnees/budget.ts'
import type { Saisie } from '../../lib/budget/mois.ts'
import { EtapeDepenses } from './EtapeDepenses.tsx'

const FINE = ' '
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()

const ligne = (p: Partial<Depense> = {}): Depense => ({
  id: 'l1', charge_id: 'c1', libelle: 'Courses', mois: '2026-09-01',
  montant_cents: 800_00, montant_prevu_cents: 800_00, nature: 'estimee', source: 'modele',
  facon: 'au_fil', confirme_le: null, regularise_annee: null, regle_le: null,
  enveloppe_id: null, compte_id: null, parts: [], ...p,
})
const saisie = (depense_id: string, montant_cents: number, id = `s${depense_id}${montant_cents}`): Saisie =>
  ({ id, depense_id, fait_le: '2026-09-10', montant_cents, saisi_par: 'u1' })

type Props = Parameters<typeof EtapeDepenses>[0]
const props = (p: Partial<Props> = {}): Props => ({
  lignes: [ligne()], saisies: [], rien: new Set(), basculer: () => {}, declarer: () => {},
  ecart: 0, ...p,
})
const vue = (p: Partial<Props> = {}) => renderToStaticMarkup(<EtapeDepenses {...props(p)} />)

function trouve(n: ReactNode, ok: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(n)) { for (const x of n) { const r = trouve(x, ok); if (r) return r } return null }
  if (!isValidElement<Record<string, unknown>>(n)) return null
  if (ok(n)) return n
  return trouve(n.props.children as ReactNode, ok)
}
const bouton = (p: Props, nom: string) => {
  const b = trouve(EtapeDepenses(p), e => e.type === 'button' && e.props['aria-label'] === nom)
  if (!b) throw new Error(`pas de bouton « ${nom} »`)
  return b.props as { onClick: () => void }
}

describe('EtapeDepenses — avant toute lecture, jamais un faux constat', () => {
  it('saisies pas encore lues : « Un instant… », ni « Rien de déclaré » ni « ce qui était prévu »', () => {
    const t = texte(vue({ saisies: undefined, ecart: null }))
    expect(t).toBe('Un instant…')
  })

  it('lignes pas encore lues : « Un instant… » aussi — et pas « Aucune dépense au fil du mois »', () => {
    expect(texte(vue({ lignes: undefined }))).toBe('Un instant…')
  })

  it('lecture en panne : le message de la panne', () => {
    const h = vue({ saisies: undefined, panne: new Error('permission denied') })
    expect(texte(h)).toBe('Je n’ai pas pu lire le budget : permission denied')
    expect(h).toContain('role="alert"')
  })

  it('un écart pas encore calculable : la liste se montre, mais aucune phrase d’écart', () => {
    const t = texte(vue({ ecart: null }))
    expect(t).toContain('Courses')
    expect(t).not.toMatch(/Tu as dépensé/)
  })
})

describe('EtapeDepenses — les lignes', () => {
  it('sans dépense au fil du mois : une ligne le dit', () => {
    expect(texte(vue({ lignes: [ligne({ facon: 'facture' }), ligne({ id: 'x', facon: 'fixe' })] })))
      .toBe('Aucune dépense au fil du mois.')
  })

  it('une ligne sans charge ne se montre pas : « Rien dépensé » n’aurait rien à désigner', () => {
    expect(texte(vue({ lignes: [ligne({ charge_id: null })] }))).toBe('Aucune dépense au fil du mois.')
  })

  it('X sur Y, avec les centimes impairs et les milliers', () => {
    const t = texte(vue({
      lignes: [ligne({ id: 'a', libelle: 'Courses', montant_prevu_cents: 1_200_50 }),
               ligne({ id: 'b', charge_id: 'c2', libelle: 'Essence', montant_prevu_cents: 160_00 })],
      saisies: [saisie('a', 642_30), saisie('a', 1, 'u'), saisie('b', 138_61)],
    }))
    expect(t).toContain('642,31 € sur 1' + FINE + '200,50 €')
    expect(t).toContain('138,61 € sur 160 €')
  })

  it('une dépense plus grande que le prévu se dit telle quelle, jauge comprise (valeur ≤ plafond)', () => {
    const h = vue({ saisies: [saisie('l1', 850_01)] })
    expect(texte(h)).toContain('850,01 € sur 800 €')
    expect(h).toContain('aria-valuemax="80000"')
    expect(h).toContain('aria-valuenow="80000"')
  })

  it('sans saisie : « Rien de déclaré » et le bouton « Rien dépensé »', () => {
    const h = vue()
    expect(texte(h)).toContain('Rien de déclaré')
    expect(h).toContain('aria-label="Rien dépensé : Courses"')
    expect(h).not.toContain('role="meter"')
  })

  it('avec une saisie : pas de « Rien dépensé » — on a dépensé', () => {
    const h = vue({ saisies: [saisie('l1', 10_00)] })
    expect(h).not.toContain('role="switch"')
    expect(texte(h)).not.toContain('Rien de déclaré')
  })

  it('la saisie d’une autre ligne ne compte pas', () => {
    const h = vue({ saisies: [saisie('autre', 10_00)] })
    expect(texte(h)).toContain('Rien de déclaré')
  })

  it('l’interrupteur reflète `rien`, par CHARGE', () => {
    const non = vue()
    const oui = vue({ rien: new Set(['c1']) })
    expect(non).toMatch(/role="switch" aria-checked="false"/)
    expect(oui).toMatch(/role="switch" aria-checked="true"/)
    /* Un identifiant de ligne ne bascule rien : `cloture_le_mois` attend des charges. */
    expect(vue({ rien: new Set(['l1']) })).toMatch(/role="switch" aria-checked="false"/)
  })

  it('les lignes se rangent par ordre alphabétique français', () => {
    const t = texte(vue({ lignes: [
      ligne({ id: 'a', charge_id: 'ca', libelle: 'Péage' }),
      ligne({ id: 'b', charge_id: 'cb', libelle: 'Essence' }),
      ligne({ id: 'c', charge_id: 'cc', libelle: 'Épicerie' }),
    ] }))
    expect(t.indexOf('Épicerie')).toBeLessThan(t.indexOf('Essence'))
    expect(t.indexOf('Essence')).toBeLessThan(t.indexOf('Péage'))
  })

  it('ne réordonne pas le tableau reçu', () => {
    const lignes = [ligne({ id: 'a', charge_id: 'ca', libelle: 'Péage' }),
                    ligne({ id: 'b', charge_id: 'cb', libelle: 'Essence' })]
    vue({ lignes })
    expect(lignes.map(l => l.id)).toEqual(['a', 'b'])
  })
})

describe('EtapeDepenses — ce que les boutons envoient', () => {
  it('« + » ouvre Déclarer sur la LIGNE, pas sur sa charge', () => {
    const declarer = vi.fn()
    const l = ligne({ id: 'ligne-9', charge_id: 'charge-9' })
    bouton(props({ lignes: [l], declarer }), 'Déclarer pour Courses').onClick()
    expect(declarer).toHaveBeenCalledWith(l)
  })

  it('« Rien dépensé » bascule la CHARGE, pas la ligne', () => {
    const basculer = vi.fn()
    bouton(props({ lignes: [ligne({ id: 'ligne-9', charge_id: 'charge-9' })], basculer }),
           'Rien dépensé : Courses').onClick()
    expect(basculer).toHaveBeenCalledWith('charge-9')
  })

  it('« + » reste proposé sur une ligne déjà déclarée', () => {
    const declarer = vi.fn()
    bouton(props({ saisies: [saisie('l1', 10_00)], declarer }), 'Déclarer pour Courses').onClick()
    expect(declarer).toHaveBeenCalledTimes(1)
  })
})

describe('EtapeDepenses — le Y sous la liste', () => {
  it('de moins, de plus, pile', () => {
    expect(texte(vue({ ecart: 366_61 }))).toContain('Tu as dépensé 366,61 € de moins que prévu.')
    expect(texte(vue({ ecart: -1 }))).toContain('Tu as dépensé 0,01 € de plus que prévu.')
    expect(texte(vue({ ecart: 0 }))).toContain('Tu as dépensé ce qui était prévu.')
  })

  it('« de plus » se dit en ocre, jamais en rouge : une dépense n’est pas une erreur', () => {
    /* Avec une saisie, la ligne ne porte ni « Rien de déclaré » (ocre) ni la jauge : seule la
       phrase d'écart peut apporter la couleur. */
    const dit = [saisie('l1', 10_00)]
    const plus = vue({ saisies: dit, ecart: -5_00 })
    const moins = vue({ saisies: dit, ecart: 5_00 })
    expect(plus).toContain('var(--color-ocre)')
    expect(plus).not.toContain('groseille')
    expect(moins).not.toContain('var(--color-ocre)')
    expect(moins).toContain('var(--color-herbe)')
  })

  it('aucune dépense au fil du mois : pas de phrase d’écart', () => {
    expect(texte(vue({ lignes: [], ecart: 0 }))).toBe('Aucune dépense au fil du mois.')
  })
})
