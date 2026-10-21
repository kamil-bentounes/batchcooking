/**
 * La feuille « Facture du mois » (2.13).
 *
 * Rendu en chaîne, sans navigateur : `VueFactureMois` est le dessin sans état ; on
 * lui donne chaque état (habituel, retenu, modifié, 0 € d'un avoir, envoi en vol,
 * mois clôturé) et on lit les mots et ce que les boutons permettent. Les montants
 * portent l'espace fine insécable (U+202F) de `toLocaleString('fr-FR')`.
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { Depense } from '../../lib/donnees/budget.ts'
import { lisLeMontant } from '../../lib/budget/feuilles.ts'
import { FeuilleFactureMois, VueFactureMois } from './FeuilleFactureMois.tsx'

const rends = (el: ReactElement) => renderToStaticMarkup(el)
/** Le texte vu, sans balises. `\s` avalerait U+202F et U+00A0 : on ne replie que l'ordinaire. */
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()
const FINE = ' '

const ligne = (p: Partial<Depense> = {}): Depense => ({
  id: 'l1', charge_id: 'c1', libelle: 'Électricité', mois: '2026-10-01',
  montant_cents: 50_00, montant_prevu_cents: 50_00, nature: 'estimee', source: 'modele',
  facon: 'facture', confirme_le: null, regularise_annee: null, regle_le: null,
  enveloppe_id: null, compte_id: null, parts: [], ...p,
})
const confirmee = (p: Partial<Depense> = {}) =>
  ligne({ confirme_le: '2026-10-05T10:00:00Z', nature: 'connue', ...p })

type Props = Parameters<typeof VueFactureMois>[0]
const props = (p: Partial<Props> = {}): Props => ({
  ligne: ligne(), categorie: 'maison', modifie: false, saisi: '',
  montantTape: lisLeMontant('', { zeroOk: true }), enCours: false, erreur: null,
  cestca: () => {}, modifier: () => {}, tape: () => {}, valider: () => {}, fermer: () => {}, ...p,
})
const avec = (saisi: string, p: Partial<Props> = {}) =>
  props({ modifie: true, saisi, montantTape: lisLeMontant(saisi, { zeroOk: true }), ...p })
const vue = (p: Props) => rends(<VueFactureMois {...p} />)

function bouton(h: string, nom: string): string {
  const m = [...h.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].find(x => texte(x[2]) === nom)
  if (!m) throw new Error(`pas de bouton « ${nom} » dans ${texte(h)}`)
  return m[1]
}
/** Le nom accessible de chaque bouton : son aria-label, sinon son texte. */
const noms = (h: string) => [...h.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)]
  .map(m => /aria-label="([^"]*)"/.exec(m[1])?.[1] ?? texte(m[2]))
const eteint = (attrs: string) => /\bdisabled(=|\s|$)/.test(attrs)

function trouve(n: ReactNode, ok: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(n)) { for (const x of n) { const r = trouve(x, ok); if (r) return r } return null }
  if (!isValidElement<Record<string, unknown>>(n)) return null
  if (ok(n)) return n
  return trouve(n.props.children as ReactNode, ok)
}

describe('VueFactureMois — avant la validation', () => {
  it('dit le montant habituel, et propose « C’est ça » puis « Modifier »', () => {
    const h = vue(props())
    expect(texte(h)).toContain('Le montant habituel : 50 €')
    expect(noms(h)).toEqual(['Fermer', 'C’est ça', 'Modifier'])
  })

  it('le montant habituel est le prévu de la ligne, pas le montant courant', () => {
    const t = texte(vue(props({ ligne: ligne({ montant_cents: 52_00, montant_prevu_cents: 50_00 }) })))
    expect(t).toContain('Le montant habituel : 50 €')
  })

  it('les centimes et les milliers se disent comme sur l’écran du mois', () => {
    const t = texte(vue(props({ ligne: ligne({ montant_cents: 1234_56, montant_prevu_cents: null }) })))
    expect(t).toContain(`Le montant habituel : 1${FINE}234,56 €`)
  })

  it('aucune phrase de confirmation ne reste (D79) ; aucun champ avant « Modifier »', () => {
    const h = vue(props())
    expect(h).not.toContain('<input')
    expect(texte(h)).not.toMatch(/confirmé|validé|enregistré/i)
  })

  it('« C’est ça » est herbe, « Modifier » ne l’est pas ; les deux tiennent 52 px', () => {
    const h = vue(props())
    expect(bouton(h, 'C’est ça')).toContain('bg-herbe')
    expect(bouton(h, 'Modifier')).not.toContain('bg-herbe')
    expect(bouton(h, 'C’est ça')).toContain('h-[52px]')
  })

  it('un envoi en vol éteint les deux boutons', () => {
    const h = vue(props({ enCours: true }))
    expect(eteint(bouton(h, 'C’est ça'))).toBe(true)
    expect(eteint(bouton(h, 'Modifier'))).toBe(true)
    const libre = vue(props())
    expect(eteint(bouton(libre, 'C’est ça'))).toBe(false)
  })

  it('« C’est ça » appelle `cestca`, « Modifier » appelle `modifier`', () => {
    const cestca = vi.fn(); const modifier = vi.fn()
    const arbre = VueFactureMois(props({ cestca, modifier }))
    const b = (cls: string) => trouve(arbre, e => e.type === 'button'
      && typeof e.props.className === 'string' && e.props.className.includes(cls))!
    ;(b('bg-herbe').props.onClick as () => void)()
    ;(b('border-brume').props.onClick as () => void)()
    expect(cestca).toHaveBeenCalledTimes(1)
    expect(modifier).toHaveBeenCalledTimes(1)
  })
})

describe('VueFactureMois — une facture déjà validée', () => {
  it('dit le montant retenu, sans « C’est ça » : il n’y a plus rien à valider', () => {
    const h = vue(props({ ligne: confirmee({ montant_cents: 61_20 }) }))
    expect(texte(h)).toContain('Le montant retenu : 61,20 €')
    expect(noms(h)).toEqual(['Fermer', 'Modifier'])
    expect(bouton(h, 'Modifier')).toContain('col-span-2')
  })

  it('un avoir validé à 0 € se lit « 0 € », pas « le montant habituel »', () => {
    const t = texte(vue(props({ ligne: confirmee({ montant_cents: 0, montant_prevu_cents: 50_00 }) })))
    expect(t).toContain('Le montant retenu : 0 €')
    expect(t).not.toContain('habituel')
  })
})

describe('VueFactureMois — « Modifier » : le montant de la facture', () => {
  it('un champ décimal nommé, et « Valider » éteint tant que rien n’est tapé', () => {
    const h = vue(avec(''))
    expect(h).toContain('aria-label="Le montant de la facture"')
    expect(h).toContain('inputMode="decimal"')
    expect(eteint(bouton(h, 'Valider'))).toBe(true)
    expect(h).not.toContain('role="alert"')
    expect(noms(h)).not.toContain('C’est ça')
  })

  it('« 61,20 » : « Valider 61,20 € », allumé', () => {
    const h = vue(avec('61,20'))
    expect(eteint(bouton(h, 'Valider 61,20 €'))).toBe(false)
  })

  it('« 61.2 » vaut « 61,20 » (le point comme la virgule)', () => {
    expect(texte(vue(avec('61.2')))).toContain('Valider 61,20 €')
  })

  it('0 € passe : un avoir. « Valider 0 € » est allumé, sans reproche', () => {
    for (const zero of ['0', '0,00', '0.0']) {
      const h = vue(avec(zero))
      expect(eteint(bouton(h, 'Valider 0 €')), zero).toBe(false)
      expect(h).not.toContain('role="alert"')
    }
  })

  it('un montant refusé : la phrase dit pourquoi et la borne, « Valider » reste éteint', () => {
    for (const mauvais of ['abc', '-3', '12,345', '1000000,01']) {
      const h = vue(avec(mauvais))
      expect(texte(h), mauvais).toContain('Un montant, de 0 € à 1 000 000 € : 47 ou 47,90.')
      expect(h, mauvais).toMatch(/<p role="alert"/)
      expect(eteint(bouton(h, 'Valider')), mauvais).toBe(true)
    }
  })

  it('1 000 000 € pile passe', () => {
    expect(texte(vue(avec('1000000')))).toContain(`Valider 1${FINE}000${FINE}000 €`)
  })

  it('un envoi en vol éteint « Valider » : pas de double envoi', () => {
    expect(eteint(bouton(vue(avec('61,20', { enCours: true })), 'Valider 61,20 €'))).toBe(true)
    expect(eteint(bouton(vue(avec('61,20', { enCours: false })), 'Valider 61,20 €'))).toBe(false)
  })

  it('« Valider » appelle `valider`', () => {
    const valider = vi.fn()
    const arbre = VueFactureMois(avec('61,20', { valider }))
    const b = trouve(arbre, e => e.type === 'button'
      && typeof e.props.className === 'string' && e.props.className.includes('bg-safran'))!
    ;(b.props.onClick as () => void)()
    expect(valider).toHaveBeenCalledTimes(1)
  })
})

describe('VueFactureMois — un mois clôturé (lot 3)', () => {
  it('lecture seule : ce qu’on donne à la place, ni « C’est ça », ni « Modifier », ni champ', () => {
    const h = vue(props({ clos: <p>Octobre est clôturé.</p>, ligne: confirmee({ montant_cents: 61_20 }) }))
    expect(texte(h)).toContain('Octobre est clôturé.')
    expect(texte(h)).toContain('Le montant retenu : 61,20 €')
    expect(noms(h)).toEqual(['Fermer'])
    expect(h).not.toContain('<input')
  })
})

describe('VueFactureMois — l’erreur', () => {
  it('l’erreur de la base s’affiche telle quelle, annoncée', () => {
    const h = vue(props({ erreur: new Error('Cette ligne ne se confirme pas.') }))
    expect(h).toMatch(/<p role="alert"[^>]*>Cette ligne ne se confirme pas\./)
  })
})

describe('FeuilleFactureMois — la feuille montée', () => {
  const monte = (l: Depense) => rends(
    <QueryClientProvider client={new QueryClient()}>
      <FeuilleFactureMois ligne={l} categorie="maison" fermer={() => {}} />
    </QueryClientProvider>)

  it('s’ouvre sur le montant habituel, les deux boutons allumés', () => {
    const h = monte(ligne())
    expect(texte(h)).toContain('Le montant habituel : 50 €')
    expect(eteint(bouton(h, 'C’est ça'))).toBe(false)
  })

  it('une ligne déjà validée s’ouvre sur le montant retenu', () => {
    expect(texte(monte(confirmee({ montant_cents: 61_20 })))).toContain('Le montant retenu : 61,20 €')
  })
})
