/**
 * La feuille « Facture mise de côté » (2.14).
 *
 * Rendu en chaîne, sans navigateur : `VueMiseDeCote` est le dessin sans état ; on lui
 * donne ce que `etat_de_l_annee` répondrait et chaque état de saisie, et on lit ce que
 * l'écran dit (l'aperçu de ce que la base posera surtout) et ce que les boutons
 * permettent. Les montants portent l'espace fine insécable (U+202F) de
 * `toLocaleString('fr-FR')`.
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Charge, EtatAnnee, Facture } from '../../lib/donnees/budget.ts'
import { lisLeMontant } from '../../lib/budget/feuilles.ts'
import { FeuilleMiseDeCote, VueMiseDeCote, type Correction } from './FeuilleMiseDeCote.tsx'

const rends = (el: ReactElement) => renderToStaticMarkup(el)
/** Le texte vu, sans balises. `\s` avalerait U+202F et U+00A0 : on ne replie que l'ordinaire. */
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()
const FINE = ' '

const charge = (p: Partial<Charge> = {}): Charge => ({
  id: 'c1', libelle: 'Entretien auto', montant_cents: 500_00, commun: true, debut: '2026-01-01',
  modifie_par: null, periodicite: 'annuel', mode: 'mis_de_cote', categorie: 'auto',
  catalogue_id: null, variable: false, cle: null, compte_id: null, enveloppe_id: null,
  archive_le: null, participants: [], ...p,
})
const etat = (p: Partial<EtatAnnee> = {}): EtatAnnee =>
  ({ b: 0, pl: 166_68, pose: 0, soldee: false, premier_mois_suivi: '2026-09-01', ...p })
const facture = (p: Partial<Facture> = {}): Facture => ({
  id: 'f1', charge_id: 'c1', annee: 2026, paye_le: '2026-10-06', montant_cents: 320_00,
  origine: 'saisie', saisi_par: null, ...p,
})
const releve = (p: Partial<Facture> = {}) =>
  facture({ id: 'r1', origine: 'releve', paye_le: '2026-09-01', montant_cents: 1450_00, ...p })

type Props = Parameters<typeof VueMiseDeCote>[0]
const props = (p: Partial<Props> = {}): Props => ({
  charge: charge(), jour: '2026-10-21', moisEnCours: 'octobre', annee: 2026, etat: etat(),
  factures: [], erreur: null, payeLe: '2026-10-21', autre: false, plancher: '2026-09-01',
  jourOk: true, saisi: '', montantTape: lisLeMontant('', { zeroOk: false }), correction: null,
  occupe: { paie: false, retrait: false, correction: false },
  tape: () => {}, aujourdhuiChoisi: () => {}, autreJour: () => {}, ecrisLeJour: () => {},
  paie: () => {}, retirer: () => {}, debuteCorrection: () => {}, tapeCorrection: () => {},
  corrige: () => {}, fermer: () => {}, ...p,
})
const avec = (saisi: string, p: Partial<Props> = {}) =>
  props({ saisi, montantTape: lisLeMontant(saisi, { zeroOk: false }), ...p })
const corrige = (saisi: string, ancien = 1450_00): Correction => ({ id: 'r1', ancien, saisi })
const vue = (p: Props) => rends(<VueMiseDeCote {...p} />)

function bouton(h: string, nom: string): string {
  const m = [...h.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].find(x => texte(x[2]) === nom)
  if (!m) throw new Error(`pas de bouton « ${nom} » dans ${texte(h)}`)
  return m[1]
}
const eteint = (attrs: string) => /\bdisabled(=|\s|$)/.test(attrs)

function trouve(n: ReactNode, ok: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(n)) { for (const x of n) { const r = trouve(x, ok); if (r) return r } return null }
  if (!isValidElement<Record<string, unknown>>(n)) return null
  if (ok(n)) return n
  return trouve(n.props.children as ReactNode, ok)
}
const parLabel = (arbre: ReactNode, label: string) =>
  trouve(arbre, e => e.props['aria-label'] === label)!
const appuie = (e: ReactElement<Record<string, unknown>>) => (e.props.onClick as () => void)()

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 21, 14, 0, 0)) })
afterEach(() => { vi.useRealTimers() })

describe('VueMiseDeCote — la carte de l’année', () => {
  it('dit la charge et ce qu’elle met de côté chaque mois (l’arrondi de la base)', () => {
    const t = texte(vue(props()))
    expect(t).toContain('Entretien auto')
    expect(t).toContain('41,67 € mis de côté chaque mois')
  })

  it('« Prévu pour 2026, depuis septembre » : Popote n’a pas suivi toute l’année (D77)', () => {
    const t = texte(vue(props()))
    expect(t).toContain('Prévu pour 2026, depuis septembre 166,68 €')
    expect(t).toContain('Factures payées en 2026 0 €')
  })

  it('suivie depuis janvier : pas de « depuis »', () => {
    const t = texte(vue(props({ etat: etat({ premier_mois_suivi: '2026-01-01' }) })))
    expect(t).toContain('Prévu pour 2026 166,68 €')
    expect(t).not.toContain('depuis')
  })

  it('une autre année que celle du premier mois suivi : pas de « depuis »', () => {
    const t = texte(vue(props({ annee: 2027, etat: etat() })))
    expect(t).toContain('Prévu pour 2027 166,68 €')
    expect(t).not.toContain('depuis')
  })

  it('année soldée : la carte commence par « 2026 est soldée. »', () => {
    const t = texte(vue(props({ etat: etat({ soldee: true, b: 1200_00, pl: 1200_00 }) })))
    expect(t).toMatch(/^.*2026 est soldée\. Prévu pour 2026/)
    expect(t).toContain(`1${FINE}200 €`)
  })

  it('année ouverte : pas de « soldée »', () => {
    expect(texte(vue(props()))).not.toContain('soldée')
  })

  it('la base n’a pas répondu : « … », aucun chiffre inventé, aucun aperçu', () => {
    const h = vue(avec('320', { etat: undefined }))
    expect(texte(h)).toContain('Prévu pour 2026 …')
    expect(texte(h)).toContain('Factures payées en 2026 …')
    expect(h).not.toContain('bg-sable')
  })

  it('les factures payées sont celles de la base (B), pas une somme refaite', () => {
    const t = texte(vue(props({ etat: etat({ b: 320_00 }), factures: [facture({ montant_cents: 1_00 })] })))
    expect(t).toContain('Factures payées en 2026 320 €')
  })
})

describe('VueMiseDeCote — la liste des factures', () => {
  it('aucune : la phrase le dit', () => {
    expect(texte(vue(props()))).toContain('Aucune facture cette année pour l’instant.')
  })

  it('une facture : sa date, son montant, une corbeille nommée par le montant', () => {
    const h = vue(props({ factures: [facture()] }))
    expect(texte(h)).not.toContain('Aucune facture')
    expect(texte(h)).toContain('Mar. 6 oct. 320 €')
    expect(h).toContain('aria-label="Retirer la facture de 320 €"')
  })

  it('un relevé : « Relevé 2026 — total de l’année », sans date, sans corbeille, corrigeable', () => {
    const h = vue(props({ factures: [releve()] }))
    expect(texte(h)).toContain(`Relevé 2026 — total de l’année 1${FINE}450 €`)
    expect(h).not.toContain('Retirer la facture')
    expect(h).not.toContain('sept.')
    expect(texte(h)).toContain('Corriger le montant')
  })

  it('un relevé et une facture ensemble : seule la facture se retire', () => {
    const h = vue(props({ factures: [releve(), facture()] }))
    expect(h.match(/aria-label="Retirer la facture/g)).toHaveLength(1)
  })

  it('« Retirer » appelle `retirer` avec la facture, pas avec son identifiant seul', () => {
    const retirer = vi.fn()
    const f = facture()
    appuie(parLabel(VueMiseDeCote(props({ factures: [f], retirer })), 'Retirer la facture de 320 €'))
    expect(retirer).toHaveBeenCalledWith(f)
  })

  it('un retrait en vol éteint les corbeilles', () => {
    const h = vue(props({ factures: [facture()], occupe: { paie: false, retrait: true, correction: false } }))
    const corbeille = [...h.matchAll(/<button\b([^>]*)>/g)].map(m => m[1])
      .find(a => a.includes('aria-label="Retirer la facture'))!
    expect(eteint(corbeille)).toBe(true)
    const libre = [...vue(props({ factures: [facture()] })).matchAll(/<button\b([^>]*)>/g)].map(m => m[1])
      .find(a => a.includes('aria-label="Retirer la facture'))!
    expect(eteint(libre)).toBe(false)
  })

  it('« Corriger le montant » appelle `debuteCorrection` avec le relevé', () => {
    const debuteCorrection = vi.fn()
    const r = releve()
    const arbre = VueMiseDeCote(props({ factures: [r], debuteCorrection }))
    appuie(trouve(arbre, e => e.type === 'button' && e.props.children === 'Corriger le montant')!)
    expect(debuteCorrection).toHaveBeenCalledWith(r)
  })
})

describe('VueMiseDeCote — corriger le total d’un relevé', () => {
  const avecCorrection = (saisi: string, p: Partial<Props> = {}) =>
    vue(props({ factures: [releve()], correction: corrige(saisi), ...p }))

  it('le champ prend la place du lien ; « Corriger le relevé » est allumé tant que le montant tient', () => {
    const h = avecCorrection('1450')
    expect(h).toContain('aria-label="Le montant du relevé"')
    expect(h).toContain('value="1450"')
    expect(texte(h)).not.toContain('Corriger le montant')
    expect(eteint(bouton(h, 'Corriger le relevé'))).toBe(false)
  })

  it('le même montant : « Rien ne change. »', () => {
    expect(texte(avecCorrection('1450'))).toContain('Rien ne change.')
  })

  it('plus que le relevé : la différence s’ajoute au mois en cours', () => {
    expect(texte(avecCorrection('1460'))).toContain('10 € de plus que le relevé : ils s’ajoutent à octobre.')
  })

  it('moins que le relevé : la différence revient au mois', () => {
    expect(texte(avecCorrection('1449,96'))).toContain('0,04 € de moins que le relevé : ils reviennent à octobre.')
  })

  it('0 € passe pour un relevé : tout revient', () => {
    const h = avecCorrection('0')
    expect(texte(h)).toContain(`1${FINE}450 € de moins que le relevé : ils reviennent à octobre.`)
    expect(eteint(bouton(h, 'Corriger le relevé'))).toBe(false)
  })

  it('un montant refusé : la phrase, pas d’aperçu, bouton éteint', () => {
    for (const mauvais of ['abc', '-1', '1000000,01', '12,345']) {
      const h = avecCorrection(mauvais)
      expect(texte(h), mauvais).toContain('Un montant, de 0 € à 1 000 000 € : 47 ou 47,90.')
      expect(texte(h), mauvais).not.toContain('que le relevé')
      expect(eteint(bouton(h, 'Corriger le relevé')), mauvais).toBe(true)
    }
  })

  it('un champ vidé : bouton éteint, pas de reproche', () => {
    const h = avecCorrection('')
    expect(eteint(bouton(h, 'Corriger le relevé'))).toBe(true)
    expect(h).not.toContain('role="alert"')
  })

  it('une correction en vol éteint le bouton', () => {
    const h = avecCorrection('1460', { occupe: { paie: false, retrait: false, correction: true } })
    expect(eteint(bouton(h, 'Corriger le relevé'))).toBe(true)
  })

  it('seul le relevé corrigé s’ouvre : un autre garde son lien', () => {
    const h = vue(props({ factures: [releve(), releve({ id: 'r2', annee: 2026 })], correction: corrige('1460') }))
    expect(h.match(/aria-label="Le montant du relevé"/g)).toHaveLength(1)
    expect(texte(h)).toContain('Corriger le montant')
  })

  it('« Corriger le relevé » appelle `corrige` ; la frappe appelle `tapeCorrection`', () => {
    const corrigeur = vi.fn(); const tapeCorrection = vi.fn()
    const arbre = VueMiseDeCote(props({ factures: [releve()], correction: corrige('1460'),
                                        corrige: corrigeur, tapeCorrection }))
    appuie(trouve(arbre, e => e.type === 'button' && e.props.children === 'Corriger le relevé')!)
    ;(parLabel(arbre, 'Le montant du relevé').props.onChange as (e: unknown) => void)({ target: { value: '9' } })
    expect(corrigeur).toHaveBeenCalledTimes(1)
    expect(tapeCorrection).toHaveBeenCalledWith('9')
  })
})

describe('VueMiseDeCote — l’aperçu de ce que la base posera (§ 4.4)', () => {
  const aperçu = (p: Props) => {
    const h = vue(p)
    const m = /<p class="[^"]*bg-sable[^"]*">(.*?)<\/p>/s.exec(h)
    return m ? texte(m[1]) : null
  }

  it('au-delà du prévu : 320 € sur 166,68 €, 153,32 € s’ajoutent à octobre', () => {
    expect(aperçu(avec('320')))
      .toBe('153,32 € de plus que les 166,68 € prévus pour 2026 : ils s’ajoutent à octobre.')
  })

  it('en dessous du prévu : 100 €, il reste 66,68 € de côté', () => {
    expect(aperçu(avec('100'))).toBe('Il restera 66,68 € de côté pour 2026.')
  })

  it('année soldée : « 2026 est soldée : les 320 € s’ajoutent à octobre. »', () => {
    expect(aperçu(avec('320', { etat: etat({ soldee: true, b: 1200_00, pl: 1200_00 }) })))
      .toBe('2026 est soldée : les 320 € s’ajoutent à octobre.')
  })

  it('« 320,50 » et « 320.5 » disent la même chose', () => {
    expect(aperçu(avec('320,50'))).toContain('153,82 €')
    expect(aperçu(avec('320.5'))).toContain('153,82 €')
  })

  it('l’aperçu suit l’année de la facture : celle de sa date de paiement', () => {
    const t = aperçu(avec('320', { annee: 2025, payeLe: '2025-12-30',
                                   etat: etat({ premier_mois_suivi: '2025-01-01' }) }))
    expect(t).toContain('prévus pour 2025')
  })

  it('rien de tapé, 0 €, ou un montant refusé : pas d’aperçu', () => {
    for (const s of ['', '0', 'abc', '1000000,01']) expect(aperçu(avec(s)), s).toBeNull()
  })

  it('un jour refusé : pas d’aperçu, la phrase dit la fenêtre', () => {
    const h = vue(avec('320', { autre: true, payeLe: '2025-12-31', plancher: '2026-09-01', jourOk: false }))
    expect(h).not.toContain('bg-sable')
    expect(texte(h)).toContain('Un jour entre le Mar. 1 sept. et le Mer. 21 oct.')
  })
})

describe('VueMiseDeCote — le montant et « Ajouter la facture »', () => {
  it('rien de tapé : éteint, sans reproche', () => {
    const h = vue(props())
    expect(eteint(bouton(h, 'Ajouter la facture'))).toBe(true)
    expect(h).not.toContain('role="alert"')
    expect(h).toContain('aria-label="Montant de la facture"')
  })

  it('un montant bon : allumé', () => {
    expect(eteint(bouton(vue(avec('320')), 'Ajouter la facture'))).toBe(false)
  })

  it('0 € n’est pas une facture : refusé avec sa phrase', () => {
    const h = vue(avec('0'))
    expect(texte(h)).toContain('Un montant au-dessus de 0 € : 47 ou 47,90.')
    expect(eteint(bouton(h, 'Ajouter la facture'))).toBe(true)
  })

  it('plus de 1 000 000 € : refusé avec la borne', () => {
    const h = vue(avec('1000000,01'))
    expect(texte(h)).toContain('Un montant, au plus 1 000 000 € : 47 ou 47,90.')
    expect(eteint(bouton(h, 'Ajouter la facture'))).toBe(true)
  })

  it('un envoi en vol éteint le bouton : pas de double envoi', () => {
    const h = vue(avec('320', { occupe: { paie: true, retrait: false, correction: false } }))
    expect(eteint(bouton(h, 'Ajouter la facture'))).toBe(true)
  })

  it('un jour refusé éteint le bouton, même avec un bon montant', () => {
    expect(eteint(bouton(vue(avec('320', { autre: true, jourOk: false })), 'Ajouter la facture'))).toBe(true)
  })

  it('« Ajouter la facture » appelle `paie`', () => {
    const paie = vi.fn()
    const arbre = VueMiseDeCote(avec('320', { paie }))
    appuie(trouve(arbre, e => e.type === 'button' && e.props.children === 'Ajouter la facture')!)
    expect(paie).toHaveBeenCalledTimes(1)
  })
})

describe('VueMiseDeCote — « Payée »', () => {
  it('« Aujourd’hui » coché d’abord, pas de champ date', () => {
    const h = vue(props())
    const radios = [...h.matchAll(/<button[^>]*role="radio"[^>]*aria-checked="(true|false)"[^>]*>(.*?)<\/button>/gs)]
      .map(m => [texte(m[2]), m[1]])
    expect(radios).toEqual([['Aujourd’hui', 'true'], ['Autre jour', 'false']])
    expect(h).toContain('aria-label="Payée"')
    expect(h).not.toContain('type="date"')
  })

  it('« Autre jour » : le champ date, borné au premier mois suivi et à aujourd’hui', () => {
    const h = vue(props({ autre: true, payeLe: '2026-09-15' }))
    expect(h).toMatch(/type="date"[^>]*min="2026-09-01"[^>]*max="2026-10-21"/)
    expect(h).toContain('value="2026-09-15"')
    expect(bouton(h, 'Autre jour')).toContain('aria-checked="true"')
    expect(bouton(h, 'Aujourd’hui')).toContain('aria-checked="false"')
  })

  it('un jour de la fenêtre : pas de phrase de reproche', () => {
    expect(texte(vue(props({ autre: true, payeLe: '2026-09-15' })))).not.toContain('Un jour entre')
  })
})

describe('VueMiseDeCote — l’erreur', () => {
  it('l’erreur de la base s’affiche telle quelle, annoncée', () => {
    const h = vue(props({ erreur: new Error('Ajoute ton revenu d’abord.') }))
    expect(h).toMatch(/<p role="alert"[^>]*>Ajoute ton revenu d’abord\./)
  })
})

describe('FeuilleMiseDeCote — la feuille montée, sur les données de la base', () => {
  const monte = (donnees: { etat?: EtatAnnee; factures?: Facture[] }) => {
    const qc = new QueryClient()
    if (donnees.etat) qc.setQueryData(['etat-de-l-annee', 'c1', 2026], donnees.etat)
    qc.setQueryData(['factures', 'c1', 2026], donnees.factures ?? [])
    return rends(<QueryClientProvider client={qc}><FeuilleMiseDeCote charge={charge()} fermer={() => {}} /></QueryClientProvider>)
  }

  it('s’ouvre sur l’année d’aujourd’hui, avec ce que la base a rendu', () => {
    const h = monte({ etat: etat({ b: 320_00 }), factures: [facture()] })
    const t = texte(h)
    expect(t).toContain('Prévu pour 2026, depuis septembre 166,68 €')
    expect(t).toContain('Factures payées en 2026 320 €')
    expect(t).toContain('Mar. 6 oct. 320 €')
    expect(eteint(bouton(h, 'Ajouter la facture'))).toBe(true)
  })

  it('avant la réponse de la base : « … », rien d’autre', () => {
    const t = texte(monte({}))
    expect(t).toContain('Prévu pour 2026 …')
    expect(t).toContain('Aucune facture cette année pour l’instant.')
  })
})
