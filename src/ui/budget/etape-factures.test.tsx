/**
 * Les factures de la clôture (3.3, étape 1), rendues en chaîne : ce qui s'affiche
 * avant lecture, pendant une panne, et pour chaque état d'une carte. Les montants
 * portent l'espace fine insécable (U+202F) de `toLocaleString('fr-FR')`.
 */
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { Depense } from '../../lib/donnees/budget.ts'
import { lisLeMontant } from '../../lib/budget/feuilles.ts'
import { EtapeFactures } from './EtapeFactures.tsx'
import { VueUneFacture } from './VueFacture.tsx'

const FINE = ' '
const rends = (el: ReactElement) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>)
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()
const noms = (h: string) => [...h.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)]
  .map(m => /aria-label="([^"]*)"/.exec(m[1])?.[1] ?? texte(m[2]))
const bouton = (h: string, nom: string): string => {
  const m = [...h.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].find(x => texte(x[2]) === nom)
  if (!m) throw new Error(`pas de bouton « ${nom} » dans ${texte(h)}`)
  return m[1]
}
const eteint = (attrs: string) => /\bdisabled(=|\s|$)/.test(attrs)

const ligne = (p: Partial<Depense> = {}): Depense => ({
  id: 'l1', charge_id: 'c1', libelle: 'Électricité', mois: '2026-09-01',
  montant_cents: 50_00, montant_prevu_cents: 50_00, nature: 'estimee', source: 'modele',
  facon: 'facture', confirme_le: null, regularise_annee: null, regle_le: null,
  enveloppe_id: null, compte_id: null, parts: [], ...p,
})

describe('EtapeFactures — avant toute lecture, jamais un faux constat', () => {
  it('mois pas encore lu : « Un instant… », jamais « Tout est validé. »', () => {
    const t = texte(rends(<EtapeFactures lignes={undefined} />))
    expect(t).toBe('Un instant…')
  })

  it('lecture en panne : le message de la panne, jamais « Tout est validé. »', () => {
    const h = rends(<EtapeFactures lignes={undefined} panne={new Error('JWT expired')} />)
    expect(texte(h)).toBe('Je n’ai pas pu lire le budget : JWT expired')
    expect(h).toContain('role="alert"')
  })

  it('une panne sans message de la base : la phrase générale, pas de « undefined »', () => {
    const t = texte(rends(<EtapeFactures lignes={undefined} panne={{}} />))
    expect(t).toBe('Je n’ai pas pu lire le budget.')
  })

  it('une coupure se nomme', () => {
    const t = texte(rends(<EtapeFactures lignes={undefined} panne={new TypeError('Failed to fetch')} />))
    expect(t).toContain('plus de connexion')
  })
})

describe('EtapeFactures — ce qu’il y a à valider', () => {
  it('rien à valider : l’étape tient en une ligne', () => {
    expect(texte(rends(<EtapeFactures lignes={[]} />))).toBe('Tout est validé.')
  })

  it('seules les factures non validées comptent : ni l’au fil du mois, ni le fixe, ni le validé', () => {
    const h = rends(<EtapeFactures lignes={[
      ligne({ id: 'a', libelle: 'Électricité' }),
      ligne({ id: 'b', libelle: 'Eau', confirme_le: '2026-09-05T10:00:00Z' }),
      ligne({ id: 'c', libelle: 'Courses', facon: 'au_fil' }),
      ligne({ id: 'd', libelle: 'Loyer', facon: 'fixe' }),
      ligne({ id: 'e', libelle: 'Ajustement', facon: null }),
    ]} />)
    expect(noms(h)).toEqual(['C’est ça, Électricité', 'Modifier Électricité'])
    expect(texte(h)).toContain('Le montant habituel est déjà là. Corrige-le seulement s’il a changé.')
  })

  it('tout est déjà validé : « Tout est validé. », sans la consigne', () => {
    const t = texte(rends(<EtapeFactures lignes={[
      ligne({ confirme_le: '2026-09-05T10:00:00Z' })]} />))
    expect(t).toBe('Tout est validé.')
  })

  it('le montant dit les centimes et les milliers, comme l’écran du mois', () => {
    const t = texte(rends(<EtapeFactures lignes={[
      ligne({ id: 'a', libelle: 'Électricité', montant_cents: 52_17, montant_prevu_cents: 52_17 }),
      ligne({ id: 'b', libelle: 'Taxe', montant_cents: 1234_56, montant_prevu_cents: 1234_56 })]} />))
    expect(t).toContain('52,17 €')
    expect(t).toContain(`1${FINE}234,56 €`)
  })

  it('le montant montré est celui que « C’est ça » valide : le prévu', () => {
    const t = texte(rends(<EtapeFactures lignes={[
      ligne({ montant_cents: 52_00, montant_prevu_cents: 50_00 })]} />))
    expect(t).toContain('50 €')
    expect(t).not.toContain('52 €')
  })
})

type Props = Parameters<typeof VueUneFacture>[0]
const vue = (p: Partial<Props> = {}) => rends(
  <ul><VueUneFacture ligne={ligne()} modifie={false} saisi=""
                     montantTape={lisLeMontant('', { zeroOk: true })} enCours={false} erreur={null}
                     cestca={() => {}} modifier={() => {}} tape={() => {}} valider={() => {}} {...p} /></ul>)
const modifie = (saisi: string, p: Partial<Props> = {}) =>
  vue({ modifie: true, saisi, montantTape: lisLeMontant(saisi, { zeroOk: true }), ...p })

describe('VueUneFacture — une carte', () => {
  it('avant « Modifier » : deux boutons, aucun champ', () => {
    const h = vue()
    expect(noms(h)).toEqual(['C’est ça, Électricité', 'Modifier Électricité'])
    expect(h).not.toContain('<input')
  })

  it('un envoi en vol éteint les deux boutons', () => {
    const h = vue({ enCours: true })
    expect(h.match(/<button\b[^>]*>/g)!.every(b => eteint(b))).toBe(true)
  })

  it('« Modifier » ouvre un champ nommé, et « Valider » reste éteint tant qu’il est vide, sans reproche', () => {
    const h = modifie('')
    expect(h).toContain('aria-label="Le montant de Électricité"')
    expect(eteint(bouton(h, 'Valider'))).toBe(true)
    expect(h).not.toContain('role="alert"')
  })

  it('un montant tapé s’annonce sur le bouton, centimes impairs compris', () => {
    const h = modifie('47,91')
    expect(texte(h)).toContain('Valider 47,91 €')
    expect(eteint(bouton(h, 'Valider 47,91 €'))).toBe(false)
  })

  it('0 € se valide : un avoir', () => {
    const h = modifie('0')
    expect(eteint(bouton(h, 'Valider 0 €'))).toBe(false)
  })

  it('un montant illisible dit ce qu’on attend, et éteint « Valider »', () => {
    for (const s of ['abc', '1,2,3', '-5', '1e3']) {
      const h = modifie(s)
      expect(h, s).toContain('role="alert"')
      expect(texte(h), s).toContain('Un montant, de 0 € à 1 000 000 €')
      expect(eteint(bouton(h, 'Valider')), s).toBe(true)
    }
  })

  it('au-delà de 1 000 000 € : refusé avant l’envoi', () => {
    const h = modifie('1000000,01')
    expect(eteint(bouton(h, 'Valider'))).toBe(true)
    expect(texte(modifie('1000000'))).toContain(`Valider 1${FINE}000${FINE}000 €`)
  })

  it('un envoi en vol éteint « Valider » même pour un montant bon', () => {
    expect(eteint(bouton(modifie('47,90', { enCours: true }), 'Valider 47,90 €'))).toBe(true)
  })

  it('l’erreur de la base se dit telle quelle, sur la carte', () => {
    const h = vue({ erreur: new Error('Le mois est clos.') })
    expect(texte(h)).toContain('Le mois est clos.')
  })
})
