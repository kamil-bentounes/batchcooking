/**
 * Le filtre, la catégorie, la ligne (2.11).
 *
 * Rendu en chaîne, sans navigateur : les mots de chaque état, les noms accessibles,
 * les cibles tactiles (≥ 44 px, `min-h-11`), et le geste que chaque façon ouvre.
 * Les montants portent l'espace fine insécable (U+202F) de `toLocaleString('fr-FR')`.
 */
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Charge, Depense, Saisie } from '../../lib/donnees/budget.ts'
import type { CategorieDuMois, Filtre } from '../../lib/budget/mois.ts'
import { CLE_LOCALE } from '../../lib/budget/ouvertes.ts'
import { Categorie } from './Categorie.tsx'
import { FiltreDuMois } from './Filtre.tsx'
import { LigneDuMois, type Geste } from './Ligne.tsx'

const rends = (el: ReactElement) => renderToStaticMarkup(el)
/** Le texte vu, sans balises. `\s` avalerait U+202F et U+00A0 : on ne replie que l'ordinaire. */
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()
const FINE = ' '

const ligne = (p: Partial<Depense> = {}): Depense => ({
  id: 'l1', charge_id: null, libelle: 'Courses', mois: '2026-10-01',
  montant_cents: 400_00, montant_prevu_cents: null, nature: 'estimee', source: 'charge',
  facon: 'fixe', confirme_le: null, regularise_annee: null, regle_le: null,
  enveloppe_id: null, compte_id: null, parts: [], ...p,
})
const saisie = (cents: number, depense_id = 'l1'): Saisie => ({
  id: `s${cents}`, depense_id, fait_le: '2026-10-05', montant_cents: cents,
  saisi_par: null, created_at: '2026-10-05T10:00:00Z',
})
const charge = (p: Partial<Charge> = {}): Charge => ({
  id: 'c1', libelle: 'Taxe foncière', montant_cents: 900_00, commun: true, debut: '2026-01-01',
  modifie_par: null, periodicite: 'mensuel', mode: 'fixe', categorie: 'impots',
  catalogue_id: null, variable: false, cle: null, compte_id: null, enveloppe_id: null,
  archive_le: null, participants: [], ...p,
})
/** Tous les `<button …>` d'un balisage, avec leur attribut class. */
const boutons = (h: string) => [...h.matchAll(/<button\b([^>]*)>/g)].map(m => m[1])
const ouvrirEspion = () => vi.fn<(g: Geste, l: Depense) => void>()
const rendsLigne = (l: Depense, o: { c?: Charge; saisies?: Saisie[]; clos?: boolean } = {}) =>
  rends(<ul><LigneDuMois ligne={l} charge={o.c} saisies={o.saisies ?? []}
                         clos={o.clos ?? false} ouvrir={ouvrirEspion()} /></ul>)

describe('FiltreDuMois', () => {
  const totaux: Record<Filtre, number> = { tout: 1850_00, commun: 1200_50, moi: 650_00 }
  const rendsFiltre = (filtre: Filtre) =>
    rends(<FiltreDuMois filtre={filtre} totaux={totaux} choisir={() => {}} />)

  it('trois choix, dans l’ordre, chacun avec son total', () => {
    const h = rendsFiltre('tout')
    const radios = [...h.matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map(m => texte(m[1]))
    expect(radios).toEqual([
      `Tout 1${FINE}850 €`, `Commun 1${FINE}200,50 €`, 'Moi 650 €',
    ])
  })

  it('c’est un groupe de boutons radio nommé, dont un seul est coché', () => {
    for (const f of ['tout', 'commun', 'moi'] as const) {
      const h = rendsFiltre(f)
      expect(h).toContain('role="radiogroup"')
      expect(h).toContain('aria-label="Filtrer les lignes"')
      const coches = [...h.matchAll(/aria-checked="(true|false)"/g)].map(m => m[1])
      expect(coches).toHaveLength(3)
      expect(coches.filter(c => c === 'true')).toHaveLength(1)
      expect(coches[['tout', 'commun', 'moi'].indexOf(f)]).toBe('true')
    }
  })

  it('le choix actif se distingue autrement que par la couleur : une surface et une ombre', () => {
    const h = rendsFiltre('commun')
    const [tout, commun] = boutons(h)
    expect(commun).toContain('bg-surface')
    expect(commun).toContain('shadow-carte')
    expect(tout).not.toContain('bg-surface')
  })

  it('chaque choix tient la cible tactile de 44 px', () => {
    expect(boutons(rendsFiltre('moi')).every(b => b.includes('min-h-11'))).toBe(true)
  })

  it('les sous-totaux sont en encre : le doux sur la piste est sous le seuil (choix 24)', () => {
    expect(rendsFiltre('tout')).not.toContain('text-doux')
  })

  it('un total négatif (un avoir) garde son signe', () => {
    const h = rends(<FiltreDuMois filtre="tout" choisir={() => {}}
                                  totaux={{ tout: -20_00, commun: 0, moi: -20_00 }} />)
    expect(texte(h)).toContain('Tout −20 €')
    expect(texte(h)).toContain('Commun 0 €')
  })

  it('un clic choisit le bon filtre', () => {
    const choisir = vi.fn()
    const arbre = FiltreDuMois({ filtre: 'tout', totaux, choisir }) as ReactElement<{
      children: ReactElement<{ onClick: () => void }>[] }>
    arbre.props.children.forEach(b => b.props.onClick())
    expect(choisir.mock.calls.map(a => a[0])).toEqual(['tout', 'commun', 'moi'])
  })
})

describe('LigneDuMois · au fil du mois', () => {
  const unFil = ligne({ facon: 'au_fil', montant_cents: 400_00, montant_prevu_cents: 400_00 })

  it('dit « déclaré sur prévu » et porte la jauge', () => {
    const h = rendsLigne(unFil, { saisies: [saisie(120_50)] })
    expect(texte(h)).toContain('120,50 € sur 400 €')
    expect(h).toContain('role="meter"')
    expect(h).toContain('aria-valuenow="12050"')
    expect(h).toContain('aria-valuemax="40000"')
  })

  it('sans saisie : « 0 € sur 400 € », et le geste « Déclarer » est là', () => {
    const t = texte(rendsLigne(unFil))
    expect(t).toContain('0 € sur 400 €')
    expect(t).toContain('Déclarer')
  })

  it('ne compte que les saisies de CETTE ligne', () => {
    const t = texte(rendsLigne(unFil, { saisies: [saisie(50_00), saisie(999_00, 'autre')] }))
    expect(t).toContain('50 € sur 400 €')
  })

  it('au-delà du prévu : la jauge passe à l’ocre et le texte dit toujours le vrai chiffre', () => {
    const h = rendsLigne(unFil, { saisies: [saisie(450_00)] })
    expect(texte(h)).toContain('450 € sur 400 €')
    expect(h).toContain('var(--color-ocre)')
  })

  it('les deux boutons portent des noms qui disent la ligne (et pas deux « Déclarer »)', () => {
    const h = rendsLigne(unFil, { saisies: [saisie(120_50)] })
    expect(h).toContain('aria-label="Courses : 120,50 € sur 400 €"')
    expect(h).toContain('aria-label="Déclarer pour Courses"')
  })

  it('mois clôturé : plus de bouton « Déclarer », mais la ligne reste ouvrable en lecture', () => {
    const h = rendsLigne(unFil, { clos: true, saisies: [saisie(120_50)] })
    expect(texte(h)).not.toContain('Déclarer')
    expect(boutons(h)).toHaveLength(1)
    expect(h).toContain('aria-label="Courses : 120,50 € sur 400 €"')
  })

  it('les deux boutons tiennent la cible tactile de 44 px', () => {
    expect(boutons(rendsLigne(unFil)).every(b => b.includes('min-h-11'))).toBe(true)
  })

  it('ouvre la feuille « Déclarer » de CETTE ligne, par l’un comme par l’autre bouton', () => {
    const ouvrir = ouvrirEspion()
    const arbre = LigneDuMois({ ligne: unFil, saisies: [], clos: false, ouvrir }) as ReactElement<{
      children: [ReactElement<{ onClick: () => void }>, ReactElement<{ onClick: () => void }>] }>
    arbre.props.children.forEach(b => b.props.onClick())
    expect(ouvrir.mock.calls).toEqual([['declarer', unFil], ['declarer', unFil]])
  })

  it('sans prévu (0 €) : pas de division par zéro', () => {
    const h = rendsLigne(ligne({ facon: 'au_fil', montant_cents: 0, montant_prevu_cents: 0 }))
    expect(texte(h)).toContain('0 € sur 0 €')
    expect(texte(h)).not.toMatch(/NaN|Infinity/)
  })
})

describe('LigneDuMois · une facture du mois', () => {
  const facture = ligne({ facon: 'facture', libelle: 'Électricité', montant_cents: 87_40 })

  it('dit son libellé et son montant, dans un seul bouton', () => {
    const h = rendsLigne(facture)
    expect(texte(h)).toBe('Électricité 87,40 €')
    expect(boutons(h)).toHaveLength(1)
    expect(boutons(h)[0]).toContain('min-h-11')
  })

  it('reste ouvrable dans un mois clôturé (la feuille s’y lit)', () => {
    expect(boutons(rendsLigne(facture, { clos: true }))).toHaveLength(1)
  })

  it('ouvre la feuille de la facture', () => {
    const ouvrir = ouvrirEspion()
    const li = LigneDuMois({ ligne: facture, saisies: [], clos: false, ouvrir }) as ReactElement<{
      children: ReactElement<{ onClick: () => void }> }>
    li.props.children.props.onClick()
    expect(ouvrir.mock.calls).toEqual([['facture', facture]])
  })
})

describe('LigneDuMois · une mise de côté', () => {
  const mise = ligne({ facon: 'mis_de_cote', libelle: 'Taxe foncière', montant_cents: 75_00 })

  it('sans la charge sous la main : « mis de côté chaque mois »', () => {
    expect(texte(rendsLigne(mise))).toBe('Taxe foncière mis de côté chaque mois 75 €')
  })

  it('une charge annuelle : le rythme dit le montant de l’année', () => {
    const t = texte(rendsLigne(mise, { c: charge({ periodicite: 'annuel', montant_cents: 900_00 }) }))
    expect(t).toContain('900 € par an, mis de côté chaque mois')
    expect(t).toContain('75 €')
  })

  it('une charge trimestrielle : « par trimestre »', () => {
    const t = texte(rendsLigne(mise, { c: charge({ periodicite: 'trimestriel', montant_cents: 225_00 }) }))
    expect(t).toContain('225 € par trimestre, mis de côté chaque mois')
  })

  it('une charge devenue mensuelle (mais la ligne garde sa façon) ne répète pas « par mois »', () => {
    const t = texte(rendsLigne(mise, { c: charge({ periodicite: 'mensuel' }) }))
    expect(t).toContain('mis de côté chaque mois')
    expect(t).not.toContain('par mois')
  })

  it('un seul bouton de 44 px qui ouvre la feuille de mise de côté', () => {
    const h = rendsLigne(mise)
    expect(boutons(h)).toHaveLength(1)
    expect(boutons(h)[0]).toContain('min-h-11')
    const ouvrir = ouvrirEspion()
    const li = LigneDuMois({ ligne: mise, saisies: [], clos: false, ouvrir }) as ReactElement<{
      children: ReactElement<{ onClick: () => void }> }>
    li.props.children.props.onClick()
    expect(ouvrir.mock.calls).toEqual([['mise', mise]])
  })
})

describe('LigneDuMois · fixe, ou ajustement : rien à faire ici', () => {
  it('une fixe ne se règle pas d’un geste : aucun bouton', () => {
    const h = rendsLigne(ligne({ facon: 'fixe', libelle: 'Loyer', montant_cents: 950_00 }))
    expect(texte(h)).toBe('Loyer 950 €')
    expect(boutons(h)).toHaveLength(0)
  })

  it('un ajustement (façon nulle) : le libellé tel qu’en base, le montant signé', () => {
    const h = rendsLigne(ligne({ facon: null, libelle: 'Régularisation 2025', montant_cents: -42_00 }))
    expect(texte(h)).toBe('Régularisation 2025 −42 €')
    expect(boutons(h)).toHaveLength(0)
  })

  it('une ligne n’est jamais réglée selon la façon de sa CHARGE : celle de la ligne fait foi', () => {
    // La charge est « au fil », la ligne est née « fixe » : l'écran lit la ligne.
    const h = rendsLigne(ligne({ facon: 'fixe' }), { c: charge({ mode: 'au_fil' }) })
    expect(boutons(h)).toHaveLength(0)
    expect(h).not.toContain('role="meter"')
  })
})

describe('Categorie', () => {
  const cat = (p: Partial<CategorieDuMois<Depense>> = {}): CategorieDuMois<Depense> => ({
    cle: 'maison', nom: 'Maison', total: 1250_00, aDire: 0,
    lignes: [ligne({ id: 'a', libelle: 'Loyer', montant_cents: 950_00 }),
             ligne({ id: 'b', libelle: 'Électricité', facon: 'facture', montant_cents: 300_00 })],
    ...p,
  })
  const rendsCat = (c: CategorieDuMois<Depense>, o: { clos?: boolean; charges?: Map<string, Charge> } = {}) =>
    rends(<Categorie categorie={c} saisies={[]} charges={o.charges ?? new Map()}
                     clos={o.clos ?? false} ouvrir={() => {}} />)

  afterEach(() => { vi.unstubAllGlobals() })
  const memoire = (contenu: Record<string, boolean>) =>
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(contenu), setItem: () => {} })

  it('le titre : la photo, le nom, le total, et la région est nommée', () => {
    const h = rendsCat(cat())
    expect(h).toContain('aria-label="Catégorie Maison"')
    expect(h).toContain('budget/maison.jpg')
    expect(h).toContain('data-total="125000"')
    expect(texte(h)).toContain(`Maison 2 lignes 1${FINE}250 €`)
  })

  it('une catégorie sans montant à dire est repliée d’office : ses lignes ne sont pas rendues', () => {
    const h = rendsCat(cat({ aDire: 0 }))
    expect(h).toContain('aria-expanded="false"')
    expect(h).not.toContain('Loyer')
  })

  it('une catégorie qui a des montants à dire est ouverte d’office', () => {
    const h = rendsCat(cat({ aDire: 1 }))
    expect(h).toContain('aria-expanded="true"')
    expect(texte(h)).toContain('Loyer')
    expect(texte(h)).toContain('Électricité')
  })

  it('le sous-titre : « 1 montant à dire », « 2 montants à dire » — au pluriel seulement', () => {
    expect(texte(rendsCat(cat({ aDire: 1 })))).toContain('1 montant à dire')
    expect(texte(rendsCat(cat({ aDire: 1 })))).not.toContain('1 montants')
    expect(texte(rendsCat(cat({ aDire: 2 })))).toContain('2 montants à dire')
  })

  it('le sous-titre sans montant à dire : « 1 ligne », « 2 lignes »', () => {
    expect(texte(rendsCat(cat({ lignes: [ligne()] })))).toContain('1 ligne')
    expect(texte(rendsCat(cat({ lignes: [ligne()] })))).not.toContain('1 lignes')
    expect(texte(rendsCat(cat()))).toContain('2 lignes')
  })

  it('« à dire » est en ocre (5,6:1 sur la carte), le reste en doux', () => {
    expect(rendsCat(cat({ aDire: 1 }))).toContain('color:var(--color-ocre)')
    const calme = rendsCat(cat({ aDire: 0 }))
    expect(calme).toContain('color:var(--color-doux)')
    expect(calme).not.toContain('var(--color-ocre)')
  })

  it('la pastille est décorative : la couleur ne parle jamais seule, le nom est dit', () => {
    const h = rendsCat(cat())
    expect(h).toMatch(/<span aria-hidden="true"[^>]*background:#2F5D45/)
    expect(texte(h)).toContain('Maison')
  })

  it('l’en-tête est un bouton qui dit s’il est déplié, et sa taille dépasse 44 px (la photo en fait 54)', () => {
    const h = rendsCat(cat())
    expect(h).toMatch(/<button[^>]*aria-expanded/)
    expect(h).toContain('width="54"')
  })

  it('une catégorie inconnue se range sous « Autre » plutôt que de casser', () => {
    const h = rends(<Categorie categorie={{ ...cat(), cle: 'zzz' as never }} saisies={[]}
                               charges={new Map()} clos={false} ouvrir={() => {}} />)
    expect(h).toContain('aria-label="Catégorie Autre"')
  })

  it('ce que l’appareil a retenu l’emporte : fermée alors qu’elle a des montants à dire', () => {
    memoire({ maison: false })
    const h = rendsCat(cat({ aDire: 3 }))
    expect(h).toContain('aria-expanded="false"')
    expect(h).not.toContain('Loyer')
  })

  it('ce que l’appareil a retenu l’emporte : ouverte alors qu’elle n’a rien à dire', () => {
    memoire({ maison: true })
    expect(rendsCat(cat({ aDire: 0 }))).toContain('aria-expanded="true"')
  })

  it('ce qui est retenu pour une catégorie ne touche pas les autres', () => {
    memoire({ auto: true })
    expect(rendsCat(cat({ aDire: 0 }))).toContain('aria-expanded="false"')
  })

  it('une clé de stockage stable : on ne perd pas ce que l’appareil a retenu à une mise à jour', () => {
    expect(CLE_LOCALE).toBe('popote.budget.ouvertes')
  })

  it('ouverte, elle passe la charge de chaque ligne : le rythme d’une mise de côté s’y lit', () => {
    const mise = ligne({ id: 'm', charge_id: 'c1', facon: 'mis_de_cote', libelle: 'Taxe foncière', montant_cents: 75_00 })
    const h = rendsCat(cat({ cle: 'impots', nom: 'Impôts', aDire: 1, lignes: [mise] }),
      { charges: new Map([['c1', charge({ periodicite: 'annuel', montant_cents: 900_00 })]]) })
    expect(texte(h)).toContain('900 € par an, mis de côté chaque mois')
  })

  it('une ligne dont la charge a disparu de la table ne casse pas', () => {
    const mise = ligne({ id: 'm', charge_id: 'fantome', facon: 'mis_de_cote', montant_cents: 75_00 })
    expect(texte(rendsCat(cat({ aDire: 1, lignes: [mise] })))).toContain('mis de côté chaque mois')
  })

  it('les lignes d’une catégorie sont une liste', () => {
    const h = rendsCat(cat({ aDire: 1 }))
    expect(h).toContain('<ul')
    expect(h.match(/<li\b/g)).toHaveLength(2)
  })
})
