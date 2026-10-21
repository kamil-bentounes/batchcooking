/**
 * La feuille « Déclarer » (2.12).
 *
 * Rendu en chaîne, sans navigateur : `VueDeclarer` est le dessin sans état, on lui
 * donne chaque état (montant tapé, envoi en vol, jour hors fenêtre, mois clôturé) et
 * on lit ce que l'écran dit et ce que le bouton permet. Les montants portent
 * l'espace fine insécable (U+202F) de `toLocaleString('fr-FR')`.
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Depense, Saisie } from '../../lib/donnees/budget.ts'
import { lisLeMontant } from '../../lib/budget/feuilles.ts'
import { joursProposes } from '../../lib/budget/mois.ts'
import { FeuilleDeclarer, VueDeclarer } from './FeuilleDeclarer.tsx'

const rends = (el: ReactElement) => renderToStaticMarkup(el)
/** Le texte vu, sans balises. `\s` avalerait U+202F et U+00A0 : on ne replie que l'ordinaire. */
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()
const FINE = ' '

const ligne = (p: Partial<Depense> = {}): Depense => ({
  id: 'l1', charge_id: null, libelle: 'Courses', mois: '2026-10-01',
  montant_cents: 400_00, montant_prevu_cents: null, nature: 'estimee', source: 'charge',
  facon: 'au_fil', confirme_le: null, regularise_annee: null, regle_le: null,
  enveloppe_id: null, compte_id: null, parts: [], ...p,
})
const saisie = (cents: number, p: Partial<Saisie> = {}): Saisie => ({
  id: `s${cents}`, depense_id: 'l1', fait_le: '2026-10-05', montant_cents: cents,
  saisi_par: null, created_at: '2026-10-05T10:00:00Z', ...p,
})

const JOURS = joursProposes('2026-10-01', '2026-10-21')
type Props = Parameters<typeof VueDeclarer>[0]
const props = (p: Partial<Props> = {}): Props => ({
  ligne: ligne(), categorie: 'courses', mois: '2026-10-01', saisies: [], membres: [], jours: JOURS,
  saisi: '', montantTape: lisLeMontant('', { zeroOk: false }), jour: '2026-10-21', autre: false,
  jourOk: true, enCours: false, erreur: null,
  tape: () => {}, choisisJour: () => {}, autreJour: () => {}, ecrisLeJour: () => {},
  ajouter: () => {}, retirer: () => {}, fermer: () => {}, ...p,
})
/** La vue avec un montant tapé : le même `lisLeMontant` que la feuille. */
const avec = (saisi: string, p: Partial<Props> = {}) =>
  props({ saisi, montantTape: lisLeMontant(saisi, { zeroOk: false }), ...p })
const vue = (p: Props) => rends(<VueDeclarer {...p} />)

/** Le `<button …>` dont le texte (balises ôtées) est `nom`. */
function bouton(h: string, nom: string): string {
  const m = [...h.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].find(x => texte(x[2]) === nom)
  if (!m) throw new Error(`pas de bouton « ${nom} » dans ${texte(h)}`)
  return m[1]
}
const eteint = (attrs: string) => /\bdisabled(=|\s|$)/.test(attrs)

/** Parcourt l'arbre React rendu (sans le monter) : le premier élément qui satisfait `ok`. */
function trouve(n: ReactNode, ok: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(n)) { for (const x of n) { const r = trouve(x, ok); if (r) return r } return null }
  if (!isValidElement<Record<string, unknown>>(n)) return null
  if (ok(n)) return n
  return trouve(n.props.children as ReactNode, ok)
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 21, 14, 0, 0)) })
afterEach(() => { vi.useRealTimers() })

describe('VueDeclarer — l’en-tête et la jauge', () => {
  it('dit la ligne, le mois et le prévu', () => {
    const t = texte(vue(props()))
    expect(t).toContain('Courses')
    expect(t).toContain('Octobre · 400 € prévus')
  })

  it('mois ouvert : ce qui est déclaré, sur le prévu, et ce qu’il reste', () => {
    const t = texte(vue(props({ saisies: [saisie(150_00), saisie(40_50)] })))
    expect(t).toContain('190,50 € sur 400 €')
    expect(t).toContain('Il reste 209,50 € pour octobre.')
  })

  it('les saisies d’une AUTRE ligne ne comptent pas dans la jauge', () => {
    const t = texte(vue(props({ saisies: [saisie(150_00, { depense_id: 'autre' })] })))
    expect(t).toContain('0 € sur 400 €')
    expect(t).not.toContain('Déjà ce mois-ci')
  })

  it('au-delà du prévu : l’écart en ocre, jamais en rouge', () => {
    const h = vue(props({ saisies: [saisie(300_00), saisie(160_00)] }))
    expect(texte(h)).toContain('60 € au-delà du prévu.')
    expect(h).toMatch(/color:var\(--color-ocre\)[^>]*>60 € au-delà du prévu\./)
    expect(h).not.toContain('Il reste')
  })

  it('pile le prévu : il reste 0 €, pas un dépassement', () => {
    const t = texte(vue(props({ saisies: [saisie(400_00)] })))
    expect(t).toContain('Il reste 0 € pour octobre.')
  })

  it('les milliers portent l’espace fine', () => {
    const t = texte(vue(props({ ligne: ligne({ montant_cents: 1200_00 }) })))
    expect(t).toContain(`1${FINE}200 € prévus`)
  })

  it('la jauge dit son chiffre à qui ne la voit pas', () => {
    const h = vue(props({ saisies: [saisie(100_00)] }))
    expect(h).toContain('role="meter"')
    expect(h).toContain('aria-label="100 € sur 400 €"')
  })
})

describe('VueDeclarer — le montant tapé et le bouton « Ajouter »', () => {
  it('rien de tapé : le bouton est éteint, et aucune phrase de reproche', () => {
    const h = vue(props())
    expect(eteint(bouton(h, 'Ajouter'))).toBe(true)
    expect(h).not.toContain('role="alert"')
  })

  it('« 47,90 » : le bouton dit le montant, et il est allumé', () => {
    const h = vue(avec('47,90'))
    expect(eteint(bouton(h, 'Ajouter 47,90 €'))).toBe(false)
  })

  it('« 47.9 » et « 47,9 » disent la même chose que « 47,90 »', () => {
    for (const s of ['47.9', '47,9', ' 47,90 ']) {
      expect(texte(vue(avec(s)))).toContain('Ajouter 47,90 €')
    }
  })

  it('« 1 234,56 » (l’espace insécable de l’écran) se lit : « Ajouter 1 234,56 € »', () => {
    expect(texte(vue(avec(`1${FINE}234,56`)))).toContain(`Ajouter 1${FINE}234,56 €`)
  })

  it('0 € ne se déclare pas : la phrase le dit, le bouton reste éteint', () => {
    const h = vue(avec('0'))
    expect(texte(h)).toContain('Un montant au-dessus de 0 € : 47 ou 47,90.')
    expect(eteint(bouton(h, 'Ajouter'))).toBe(true)
  })

  it('plus de 1 000 000 € : refusé avec la borne dite, bouton éteint', () => {
    const h = vue(avec('1000000,01'))
    expect(texte(h)).toContain('Un montant, au plus 1 000 000 € : 47 ou 47,90.')
    expect(eteint(bouton(h, 'Ajouter'))).toBe(true)
    expect(texte(vue(avec('1000000')))).toContain(`Ajouter 1${FINE}000${FINE}000 €`)
  })

  it('du texte, du négatif, une troisième décimale : refusés, jamais arrondis en silence', () => {
    for (const mauvais of ['abc', '-5', '12,345', '1e3']) {
      const h = vue(avec(mauvais))
      expect(texte(h), mauvais).toContain('Un montant, au plus 1 000 000 € : 47 ou 47,90.')
      expect(eteint(bouton(h, 'Ajouter')), mauvais).toBe(true)
    }
  })

  it('le refus est annoncé (role="alert") et pas seulement coloré', () => {
    expect(vue(avec('abc'))).toMatch(/<p role="alert"[^>]*>Un montant/)
  })

  it('un envoi en vol éteint le bouton : un second toucher ne part pas', () => {
    const libre = vue(avec('47,90', { enCours: false }))
    const envoi = vue(avec('47,90', { enCours: true }))
    expect(eteint(bouton(libre, 'Ajouter 47,90 €'))).toBe(false)
    expect(eteint(bouton(envoi, 'Ajouter 47,90 €'))).toBe(true)
  })

  it('le champ est un champ décimal nommé', () => {
    const h = vue(props())
    expect(h).toContain('inputMode="decimal"')
    expect(h).toContain('aria-label="Nouvelle dépense"')
  })

  it('« Ajouter » appelle `ajouter` ; « Fermer » appelle `fermer`', () => {
    const ajouter = vi.fn(); const fermer = vi.fn()
    const arbre = VueDeclarer(avec('47,90', { ajouter, fermer }))
    const ajout = trouve(arbre, e => e.type === 'button'
      && typeof e.props.className === 'string' && e.props.className.includes('bg-safran'))!
    ;(ajout.props.onClick as () => void)()
    const ferme = trouve(arbre, e => e.props['aria-label'] === 'Fermer')!
    ;(ferme.props.onClick as () => void)()
    expect(ajouter).toHaveBeenCalledTimes(1)
    expect(fermer).toHaveBeenCalledTimes(1)
  })
})

describe('VueDeclarer — le jour de la dépense', () => {
  it('mois courant : « Aujourd’hui » coché, « Hier » et « Autre jour » proposés', () => {
    const h = vue(props())
    const radios = [...h.matchAll(/<button[^>]*role="radio"[^>]*aria-checked="(true|false)"[^>]*>(.*?)<\/button>/gs)]
      .map(m => [texte(m[2]), m[1]])
    expect(radios).toEqual([['Aujourd’hui', 'true'], ['Hier', 'false'], ['Autre jour', 'false']])
    expect(h).toContain('aria-label="Le jour de la dépense"')
    expect(h).not.toContain('type="date"')
  })

  it('« Autre jour » coché : le champ date apparaît, borné au mois', () => {
    const h = vue(props({ autre: true, jour: '2026-10-12' }))
    expect(h).toMatch(/type="date"[^>]*min="2026-10-01"[^>]*max="2026-10-21"/)
    expect(h).toContain('value="2026-10-12"')
    expect(bouton(h, 'Autre jour')).toContain('aria-checked="true"')
    expect(bouton(h, 'Aujourd’hui')).toContain('aria-checked="false"')
  })

  it('un jour tapé hors fenêtre : la phrase dit la fenêtre, le bouton reste éteint', () => {
    const h = vue(avec('47,90', { autre: true, jour: '2026-09-30', jourOk: false }))
    expect(texte(h)).toContain('Un jour entre le Jeu. 1 oct. et le Mer. 21 oct.')
    expect(eteint(bouton(h, 'Ajouter 47,90 €'))).toBe(true)
  })

  it('un jour de la fenêtre : pas de phrase, bouton allumé', () => {
    const h = vue(avec('47,90', { autre: true, jour: '2026-10-12', jourOk: true }))
    expect(texte(h)).not.toContain('Un jour entre')
    expect(eteint(bouton(h, 'Ajouter 47,90 €'))).toBe(false)
  })

  it('mois passé : son dernier jour, jamais « Aujourd’hui »', () => {
    const jours = joursProposes('2026-09-01', '2026-10-21')
    const t = texte(vue(props({ jours, mois: '2026-09-01', jour: '2026-09-30' })))
    expect(t).toContain('Mer. 30 sept.')
    expect(t).not.toContain('Aujourd’hui')
    expect(t).toContain('Septembre · 400 € prévus')
  })
})

describe('VueDeclarer — « Déjà ce mois-ci »', () => {
  it('liste les saisies de CETTE ligne, avec une corbeille nommée par montant et jour', () => {
    const h = vue(props({ saisies: [saisie(47_90, { id: 'a' }), saisie(12_00, { id: 'b', fait_le: '2026-10-07' })] }))
    expect(texte(h)).toContain('Déjà ce mois-ci')
    expect(h).toContain('aria-label="Retirer 47,90 € du Lun. 5 oct."')
    expect(h).toContain('aria-label="Retirer 12 € du Mer. 7 oct."')
  })

  it('seul au foyer, on ne dit pas qui ; à deux, on lit le prénom de qui l’a saisie', () => {
    const s = [saisie(47_90, { saisi_par: 'u1' })]
    const seul = texte(vue(props({ saisies: s, membres: [{ id: 'u1', display_name: 'Kamil' }] })))
    expect(seul).not.toContain('· Kamil')
    const deux = texte(vue(props({ saisies: s,
      membres: [{ id: 'u1', display_name: 'Kamil' }, { id: 'u2', display_name: 'Thauba' }] })))
    expect(deux).toContain('Lun. 5 oct. · Kamil')
  })

  it('une saisie d’un membre parti : « Sans prénom », pas un blanc', () => {
    const t = texte(vue(props({ saisies: [saisie(10_00, { saisi_par: 'parti' })],
      membres: [{ id: 'u1', display_name: 'Kamil' }, { id: 'u2', display_name: 'Thauba' }] })))
    expect(t).toContain('· Sans prénom')
  })

  it('la corbeille appelle `retirer` avec l’identifiant de la saisie', () => {
    const retirer = vi.fn()
    const arbre = VueDeclarer(props({ saisies: [saisie(47_90, { id: 'abc' })], retirer }))
    const c = trouve(arbre, e => String(e.props['aria-label'] ?? '').startsWith('Retirer'))!
    ;(c.props.onClick as () => void)()
    expect(retirer).toHaveBeenCalledWith('abc')
  })
})

describe('VueDeclarer — un mois clôturé (lot 3)', () => {
  it('montre ce qu’on lui donne à la place de la saisie, sans champ, sans « Ajouter », sans corbeille', () => {
    const h = vue(props({ clos: <p>Octobre est clôturé.</p>, saisies: [saisie(47_90)] }))
    expect(texte(h)).toContain('Octobre est clôturé.')
    expect(h).not.toContain('<input')
    expect(h).not.toContain('Nouvelle dépense')
    expect(h.match(/<button[^>]*>\s*Ajouter/g)).toBeNull()
    expect(h).not.toContain('aria-label="Retirer')
    // L'historique reste lisible.
    expect(texte(h)).toContain('Déjà ce mois-ci')
    expect(texte(h)).toContain('47,90 €')
  })
})

describe('VueDeclarer — l’erreur', () => {
  it('une erreur de la base s’affiche telle quelle', () => {
    const h = vue(props({ erreur: new Error('Octobre est clôturé : reviens dessus pour le changer.') }))
    expect(h).toMatch(/<p role="alert"[^>]*>Octobre est clôturé : reviens dessus pour le changer\./)
  })
  it('sans erreur, rien', () => {
    expect(vue(props())).not.toContain('role="alert"')
  })
})

describe('FeuilleDeclarer — la feuille montée, avant toute frappe', () => {
  const monte = (p: Partial<Parameters<typeof FeuilleDeclarer>[0]> = {}) => rends(
    <QueryClientProvider client={new QueryClient()}>
      <FeuilleDeclarer ligne={ligne()} categorie="courses" mois="2026-10-01" moi="u1"
                       foyerId="f1" saisies={[]} membres={[]} fermer={() => {}} {...p} />
    </QueryClientProvider>)

  it('s’ouvre sur « Aujourd’hui », le bouton éteint, sans phrase de reproche', () => {
    const h = monte()
    expect(bouton(h, 'Aujourd’hui')).toContain('aria-checked="true"')
    expect(eteint(bouton(h, 'Ajouter'))).toBe(true)
    expect(h).not.toContain('role="alert"')
    expect(texte(h)).toContain('Octobre · 400 € prévus')
  })

  it('passe le mois clôturé à la vue', () => {
    const h = monte({ clos: <p>Lecture seule.</p> })
    expect(texte(h)).toContain('Lecture seule.')
    expect(h).not.toContain('<input')
  })
})
