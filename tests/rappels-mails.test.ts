/**
 * Les mails de rappel : le gabarit (HTML valide, texte brut, espaces insécables), les accords au nombre, les
 * liens (jamais un autre domaine que `APP_BASE_URL`), l'échappement, les dates de Paris, et l'ordre
 * réserver → envoyer → libérer de la fonction. Pur : ni base, ni réseau.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { construis, contenuDe, NOM_DU_RAPPEL } from '../supabase/functions/_shared/rappels/mails.ts'
import { baseSure, illustration, lien, photoSure } from '../supabase/functions/_shared/rappels/liens.ts'
import { envoieLesRappels, MAXIMUM_PAR_PASSAGE } from '../supabase/functions/_shared/rappels/orchestre.ts'
import { secretValide } from '../supabase/functions/_shared/rappels/secret.ts'
import { exemple } from '../supabase/functions/_shared/rappels/exemples.ts'
import {
  barquettes, deMois, echappe, euros, insecables, jourEnToutesLettres, laBarquetteDe, momentDePeremption, pourDit,
  quandEnvoye, quoi,
} from '../supabase/functions/_shared/rappels/texte.ts'
import { TYPES_DE_RAPPEL } from '../supabase/functions/_shared/rappels/types.ts'
import type { Contexte, RappelDu, TypeDeRappel } from '../supabase/functions/_shared/rappels/types.ts'

const BASE = 'https://kamil-bentounes.github.io/batchcooking'
/** Mardi 11 juin 2030, 19 h à Paris. */
const MAINTENANT = new Date('2030-06-11T17:00:00Z')
const ctx: Contexte = { base: BASE, maintenant: MAINTENANT, prenom: 'Kamil' }

// ── Des données comme la base les rend ──────────────────────────────────────

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function donneesDe(type: TypeDeRappel): Record<string, unknown> {
  switch (type) {
    case 'sortir_du_congelateur':
      return {
        jour: '2030-06-12',
        plats: [{
          label: 'Wraps poulet', recipe_id: null, image_url: null, n: 4, portion_ids: [ID(1), ID(2), ID(3), ID(4)], restant: 3,
          repas: [{ meal: 'dejeuner', pour: ['Kamil', 'Thauba'] }, { meal: 'diner', pour: ['Kamil', 'Thauba'] }],
        }],
      }
    case 'barquette_perime':
      return {
        label: 'Lasagnes au saumon-poireaux', recipe_id: null, image_url: 'https://exemple.test/lasagnes.jpg', n: 1,
        portion_ids: [ID(5)], expire: '2030-06-12T19:00:00Z',
        frigo: [{ label: 'Lasagnes au saumon-poireaux', n: 5, libres: 1 }, { label: 'Pizza', n: 2, libres: 0 }],
      }
    case 'choisir_les_repas':
      return {
        semaine: '2030-W24', vides: 6, congelateur: 0, frigo: 8,
        jours: Array.from({ length: 7 }, (_, i) => ({
          jour: `2030-06-${String(10 + i).padStart(2, '0')}`,
          midi: i === 0 ? 'congelateur' : 'vide', soir: i === 0 ? 'congelateur' : 'vide',
        })),
      }
    case 'noter_les_depenses':
      return { mois: '2030-06-01', semaine: '2030-W23', depuis_jours: 9, lignes: 2 }
    case 'confirmer_les_charges':
      return {
        mois: '2030-06-01', n: 2,
        lignes: [{ libelle: 'Électricité', montant_cents: 8240 }, { libelle: 'Internet', montant_cents: 3700 }],
      }
    case 'cloturer_le_mois':
      return { mois: '2030-06-01', lignes: 18, a_confirmer: 2 }
    case 'facture_annuelle':
      return {
        charge_id: ID(9), libelle: 'Taxe foncière', annee: 2030, mois: '2030-09-01',
        derniere_paye_le: '2029-09-14', derniere_montant_cents: 142_000,
      }
  }
}

// ── Un contrôle de structure : chaque balise ouverte est refermée, dans l'ordre ─────

const VIDES = new Set(['meta', 'img', 'br', 'hr', 'input', 'link'])
function structure(html: string): string | null {
  const pile: string[] = []
  const sans = html.replace(/<!doctype[^>]*>/i, '').replace(/<style[\s\S]*?<\/style>/g, '<style></style>')
  for (const m of sans.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
    const [, fermante, nom] = m
    const n = nom.toLowerCase()
    if (VIDES.has(n)) continue
    if (!fermante) { pile.push(n); continue }
    const haut = pile.pop()
    if (haut !== n) return `</${n}> ferme <${haut}>`
  }
  return pile.length ? `non refermées : ${pile.join(', ')}` : null
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map(m => m[1].replace(/&amp;/g, '&'))
const srcs = (html: string) => [...html.matchAll(/src="([^"]*)"/g)].map(m => m[1])

describe('chaque type rend un mail complet', () => {
  for (const type of TYPES_DE_RAPPEL) {
    it(type, () => {
      const m = construis(type, donneesDe(type), ctx)
      expect(m.sujet.length).toBeGreaterThan(8)
      expect(m.preEntete.length).toBeGreaterThan(8)
      expect(m.html.startsWith('<!doctype html>')).toBe(true)
      expect(m.html).toContain('<html lang="fr">')
      expect(m.html).toContain('<meta charset="utf-8">')
      expect(m.html.replace(/&nbsp;/g, ' ')).toContain(`<title>${echappe(m.sujet)}</title>`)
      expect(structure(m.html), 'balises mal refermées').toBeNull()
      expect(m.html, 'une valeur absente a fuité dans le mail').not.toMatch(/undefined|NaN|\[object|null</)
      // Le héros porte un seul h1, un bouton, et le coin daté.
      expect(m.html.match(/<h1/g)).toHaveLength(1)
      expect(m.html).toContain('mardi 11&nbsp;juin, 19&nbsp;h')
      expect(m.html).toContain('Régler mes rappels')
      expect(m.html).toContain(`le rappel «&nbsp;${NOM_DU_RAPPEL[type]}&nbsp;» est activé pour toi`)
      // Le pré-en-tête est caché, avant tout le reste.
      expect(m.html.indexOf('display:none')).toBeLessThan(m.html.indexOf('Popote<span'))
      // Le repli en texte brut dit la même chose, sans balise.
      expect(m.texte).not.toMatch(/<[a-z/]/i)
      expect(m.texte).toContain(contenuDe(type, donneesDe(type), ctx).titre)
      expect(m.texte).toContain(`Régler mes rappels : ${BASE}/rappels`)
      expect(m.texte.endsWith('\n')).toBe(true)
    })
  }
})

describe('les liens', () => {
  const attendus: Record<TypeDeRappel, string[]> = {
    sortir_du_congelateur: [
      `/frigo?sortir=${ID(1)},${ID(2)},${ID(3)},${ID(4)}`, '/semaine?jour=2030-06-12', '/rappels',
    ],
    barquette_perime: ['/semaine', '/frigo', '/rappels'],
    choisir_les_repas: ['/semaine', '/cuisine-accueil', '/rappels'],
    noter_les_depenses: ['/budget', '/charges', '/rappels'],
    confirmer_les_charges: ['/budget/2030-06', '/charges', '/rappels'],
    cloturer_le_mois: ['/budget/2030-06', '/charges', '/rappels'],
    facture_annuelle: ['/budget', '/charges', '/rappels'],
  }
  for (const type of TYPES_DE_RAPPEL) {
    it(`${type} : les bons écrans, et rien d'autre`, () => {
      const m = construis(type, donneesDe(type), ctx)
      expect(hrefs(m.html)).toEqual(attendus[type].map(p => BASE + p))
      /* Aucun lien vers un autre domaine, quel que soit le contenu. */
      for (const h of hrefs(m.html)) expect(new URL(h).origin + new URL(h).pathname.split('/').slice(0, 2).join('/')).toBe(BASE)
      /* Les illustrations viennent du site, pas d'ailleurs (la photo d'un plat est celle de la recette). */
      for (const s of srcs(m.html).filter(x => !x.includes('exemple.test'))) expect(s.startsWith(`${BASE}/mail/`)).toBe(true)
    })
  }

  it('« Régler mes rappels » mène à /rappels', () => {
    expect(hrefs(construis('noter_les_depenses', donneesDe('noter_les_depenses'), ctx).html).at(-1)).toBe(`${BASE}/rappels`)
  })

  it('la base peut finir par une barre ; une base fausse arrête le mail', () => {
    expect(baseSure('https://exemple.fr/app/')).toBe('https://exemple.fr/app')
    expect(lien('https://exemple.fr/app//', '/frigo')).toBe('https://exemple.fr/app/frigo')
    for (const mauvaise of ['', 'frigo', 'javascript:alert(1)', 'https://a.fr/?x=1', 'https://u:p@a.fr', undefined]) {
      expect(() => baseSure(mauvaise as string), String(mauvaise)).toThrow()
    }
    expect(() => construis('noter_les_depenses', donneesDe('noter_les_depenses'), { ...ctx, base: 'pas une adresse' })).toThrow()
  })

  it('les paramètres sont encodés, la liste d’identifiants s’écrit a,b', () => {
    expect(lien(BASE, '/frigo', { sortir: ['a b', 'c&d'] })).toBe(`${BASE}/frigo?sortir=a%20b,c%26d`)
    expect(lien(BASE, '/frigo', { sortir: [] })).toBe(`${BASE}/frigo`)
    expect(() => lien(BASE, 'frigo')).toThrow()
    expect(illustration(BASE, 'congelateur')).toBe(`${BASE}/mail/congelateur.png`)
  })

  it('la photo d’un plat : https seulement', () => {
    expect(photoSure('https://exemple.test/a.jpg')).toBe('https://exemple.test/a.jpg')
    expect(photoSure('http://127.0.0.1:54321/storage/v1/a.jpg')).toBeNull()
    expect(photoSure('javascript:alert(1)')).toBeNull()
    expect(photoSure(null)).toBeNull()
    const sans = construis('barquette_perime', { ...donneesDe('barquette_perime'), image_url: 'http://x.test/a.jpg' }, ctx)
    expect(sans.html).not.toContain('x.test')
    const avec = construis('barquette_perime', donneesDe('barquette_perime'), ctx)
    expect(avec.html).toContain('src="https://exemple.test/lasagnes.jpg"')
  })
})

describe('le texte s’accorde au nombre', () => {
  it('sortir : « 1 wrap », « 2 wraps », « 4 wraps »', () => {
    const un = construis('sortir_du_congelateur', {
      jour: '2030-06-12',
      plats: [{ label: 'Wraps poulet', recipe_id: null, image_url: null, n: 1, portion_ids: [ID(1)], restant: 0,
        repas: [{ meal: 'diner', pour: ['Kamil'] }] }],
    }, ctx)
    expect(un.sujet).toBe('Ce soir, sors 1 wrap du congélateur')
    expect(un.texte).toContain('Il n’en restera plus au congélateur.')
    expect(un.texte).toContain('pour toi')

    const deux = construis('sortir_du_congelateur', {
      jour: '2030-06-12',
      plats: [{ label: 'Burger de feuilles de riz', recipe_id: null, image_url: null, n: 2, portion_ids: [ID(1), ID(2)], restant: 1,
        repas: [{ meal: 'diner', pour: ['Kamil', 'Thauba'] }] }],
    }, ctx)
    expect(deux.sujet).toBe('Ce soir, sors 2 burgers du congélateur')
    expect(deux.texte).toContain('Il restera ensuite 1 burger au congélateur.')
    expect(deux.texte).toContain('pour vous deux')

    const quatre = construis('sortir_du_congelateur', donneesDe('sortir_du_congelateur'), ctx)
    expect(quatre.sujet).toBe('Ce soir, sors 4 wraps du congélateur')
    expect(quatre.texte).toContain('demain midi et soir, pour vous deux')
    expect(quatre.texte).toContain('Il restera ensuite 3 wraps au congélateur.')
    // Le détail : une ligne par repas, deux personnes.
    expect(quatre.texte).toContain('- Midi : Wraps poulet, pour vous deux (2)')
    expect(quatre.texte).toContain('- Soir : Wraps poulet, pour vous deux (2)')
  })

  it('plusieurs plats : on compte les barquettes', () => {
    const m = construis('sortir_du_congelateur', {
      jour: '2030-06-12',
      plats: [
        { label: 'Pizza', recipe_id: null, image_url: null, n: 2, portion_ids: [ID(1), ID(2)], restant: 0, repas: [{ meal: 'dejeuner', pour: ['Kamil', 'Thauba'] }] },
        { label: 'Burger', recipe_id: null, image_url: null, n: 1, portion_ids: [ID(3)], restant: 4, repas: [{ meal: 'diner', pour: ['Kamil'] }] },
      ],
    }, ctx)
    expect(m.sujet).toBe('Ce soir, sors 3 barquettes du congélateur')
    expect(m.texte).toContain(`/frigo?sortir=${ID(1)},${ID(2)},${ID(3)}`)
    expect(m.texte).not.toContain('Il restera ensuite')
  })

  it('périme : « la barquette de petit salé aux lentilles », « les 3 barquettes d’agneau »', () => {
    expect(laBarquetteDe('Petit salé aux lentilles', 1)).toBe('la barquette de petit salé aux lentilles')
    expect(laBarquetteDe('Agneau aux olives', 3)).toBe('les 3 barquettes d’agneau aux olives')
    expect(barquettes(1)).toBe('1 barquette')
    expect(barquettes(2)).toBe('2 barquettes')
    expect(quoi('Wraps poulet', 1)).toBe('1 wrap')
    expect(quoi('Wraps poulet', 2)).toBe('2 wraps')

    const un = construis('barquette_perime', { ...donneesDe('barquette_perime'), label: 'Petit salé aux lentilles' }, ctx)
    expect(un.sujet).toBe('La barquette de petit salé aux lentilles périme demain soir')
    expect(un.texte).toContain('Une barquette n’est prévue nulle part')
    expect(un.texte).toContain('Elle tient jusqu’à demain soir. Mange-la avant, ou congèle-la aujourd’hui')
    expect(un.texte).toContain('La prévoir pour un repas')
    expect(un.texte).toContain('La congeler')

    const trois = construis('barquette_perime', { ...donneesDe('barquette_perime'), label: 'Lasagnes au saumon', n: 3 }, ctx)
    expect(trois.sujet).toBe('Les 3 barquettes de lasagnes au saumon périment demain soir')
    expect(trois.texte).toContain('3 barquettes ne sont prévues nulle part')
    expect(trois.texte).toContain('Elles tiennent jusqu’à demain soir. Mange-les avant, ou congèle-les aujourd’hui')
    expect(trois.texte).toContain('Les prévoir pour un repas')
  })

  it('choisir : « 1 dîner », « 6 dîners »', () => {
    expect(construis('choisir_les_repas', { ...donneesDe('choisir_les_repas'), vides: 1 }, ctx).sujet).toBe('1 dîner à choisir cette semaine')
    expect(construis('choisir_les_repas', donneesDe('choisir_les_repas'), ctx).sujet).toBe('6 dîners à choisir cette semaine')
    // Rien au congélateur : on ne le dit pas. Le frigo : 8 barquettes.
    expect(construis('choisir_les_repas', donneesDe('choisir_les_repas'), ctx).texte).toContain('Il reste 8 barquettes au frigo.')
    expect(construis('choisir_les_repas', { ...donneesDe('choisir_les_repas'), congelateur: 1, frigo: 1 }, ctx).texte)
      .toContain('Il reste 1 barquette au congélateur et 1 barquette au frigo.')
    expect(construis('choisir_les_repas', { ...donneesDe('choisir_les_repas'), congelateur: 0, frigo: 0 }, ctx).texte)
      .toContain('Il ne reste rien au frigo ni au congélateur')
  })

  it('budget : factures, lignes et jours', () => {
    expect(construis('confirmer_les_charges', { mois: '2030-06-01', n: 1, lignes: [{ libelle: 'Électricité', montant_cents: 8240 }] }, ctx).sujet)
      .toBe('1 facture à confirmer pour juin')
    expect(construis('confirmer_les_charges', donneesDe('confirmer_les_charges'), ctx).sujet).toBe('2 factures à confirmer pour juin')
    const plus = construis('confirmer_les_charges', {
      mois: '2030-04-01', n: 9, lignes: Array.from({ length: 6 }, (_, i) => ({ libelle: `Facture ${i}`, montant_cents: 1000 })),
    }, ctx)
    expect(plus.texte).toContain('Et 3 autres sur l’écran du mois.')
    expect(construis('noter_les_depenses', donneesDe('noter_les_depenses'), ctx).sujet).toBe('Rien de noté depuis 9 jours')
    expect(construis('noter_les_depenses', { ...donneesDe('noter_les_depenses'), depuis_jours: null }, ctx).sujet)
      .toBe('Aucune dépense notée pour l’instant')
    expect(construis('noter_les_depenses', { ...donneesDe('noter_les_depenses'), mois: '2030-08-01' }, ctx).texte).toContain('Le budget d’août est ouvert.')
    const clot = construis('cloturer_le_mois', { mois: '2030-06-01', lignes: 1, a_confirmer: 0 }, ctx)
    expect(clot.texte).toContain('1 ligne à ton nom')
    expect(clot.texte).toContain('Toutes les factures sont confirmées')
    expect(construis('cloturer_le_mois', donneesDe('cloturer_le_mois'), ctx).texte).toContain('2 factures à confirmer')
    expect(construis('cloturer_le_mois', donneesDe('cloturer_le_mois'), ctx).sujet).toBe('Juin se termine : demain, on le clôture')
    const fa = construis('facture_annuelle', donneesDe('facture_annuelle'), ctx)
    expect(fa.sujet).toBe('Taxe foncière : la facture approche')
    expect(fa.texte).toContain('Taxe foncière : la facture arrive en septembre')
    expect(fa.texte).toContain('le 14 septembre 2029')
    expect(fa.texte.replace(/\s/g, ' ')).toContain('1 420 €')
  })

  it('les mots de la langue : montants, dates, personnes', () => {
    expect(euros(8240).replace(/\s/g, ' ')).toBe('82,40 €')
    expect(euros(142_000).replace(/\s/g, ' ')).toBe('1 420 €')
    expect(euros(0).replace(/\s/g, ' ')).toBe('0 €')
    expect(jourEnToutesLettres('2030-06-12')).toBe('mercredi 12 juin')
    expect(jourEnToutesLettres('2030-09-01')).toBe('dimanche 1er septembre')
    expect(deMois('2030-04-01')).toBe('d’avril')
    expect(deMois('2030-06-01')).toBe('de juin')
    expect(pourDit(['Kamil', 'Thauba'], 'Kamil')).toBe('pour vous deux')
    expect(pourDit(['Thauba'], 'Kamil')).toBe('pour Thauba')
    expect(pourDit(['Kamil'], 'Kamil')).toBe('pour toi')
    expect(pourDit(['Léa', 'Max', 'Zoé'], 'Kamil')).toBe('pour Léa, Max et Zoé')
    expect(pourDit([], 'Kamil')).toBe('')
  })
})

describe('l’heure de Paris', () => {
  it('le coin du mail : heure d’été, heure d’hiver, le 1er du mois', () => {
    expect(quandEnvoye(new Date('2030-06-11T17:00:00Z'))).toBe('mardi 11 juin, 19 h')
    expect(quandEnvoye(new Date('2030-01-15T18:05:00Z'))).toBe('mardi 15 janv., 19 h')
    expect(quandEnvoye(new Date('2030-07-01T07:05:00Z'))).toBe('lundi 1er juil., 9 h')
    // Le dimanche du changement d'heure : 3 h devient 2 h.
    expect(quandEnvoye(new Date('2030-10-27T17:00:00Z'))).toBe('dimanche 27 oct., 18 h')
    expect(quandEnvoye(new Date('2030-03-31T16:00:00Z'))).toBe('dimanche 31 mars, 18 h')
  })

  it('« ce soir », « demain matin », « jeudi soir » : le moment où une barquette périme', () => {
    const m = new Date('2030-06-11T06:05:00Z') // mardi 8 h
    expect(momentDePeremption(new Date('2030-06-11T19:00:00Z'), m).mots).toBe('ce soir')
    expect(momentDePeremption(new Date('2030-06-11T10:00:00Z'), m).mots).toBe('cet après-midi')
    expect(momentDePeremption(new Date('2030-06-12T07:00:00Z'), m)).toEqual({ mots: 'demain matin', pastille: 'Demain, 9 h' })
    expect(momentDePeremption(new Date('2030-06-12T19:00:00Z'), m)).toEqual({ mots: 'demain soir', pastille: 'Demain, 21 h' })
    expect(momentDePeremption(new Date('2030-06-13T19:00:00Z'), m).mots).toBe('jeudi soir')
    // 23 h 30 à Paris est encore « demain » : 21 h 30 UTC.
    expect(momentDePeremption(new Date('2030-06-12T21:30:00Z'), m).mots).toBe('demain soir')
  })
})

describe('le texte inséré est échappé', () => {
  const piege = '<script>alert("x")</script>'
  it('un nom de plat avec un script', () => {
    for (const [type, d] of [
      ['sortir_du_congelateur', { ...donneesDe('sortir_du_congelateur'), plats: [{ ...(donneesDe('sortir_du_congelateur').plats as any[])[0], label: piege }] }],
      ['barquette_perime', { ...donneesDe('barquette_perime'), label: piege, frigo: [{ label: piege, n: 1, libres: 1 }] }],
      ['confirmer_les_charges', { ...donneesDe('confirmer_les_charges'), lignes: [{ libelle: piege, montant_cents: 100 }] }],
      ['facture_annuelle', { ...donneesDe('facture_annuelle'), libelle: piege }],
    ] as [TypeDeRappel, Record<string, unknown>][]) {
      const m = construis(type, d, ctx)
      expect(m.html, type).not.toContain('<script')
      expect(m.html, type).toContain('&lt;script&gt;')
      expect(structure(m.html), type).toBeNull()
    }
  })

  it('un prénom et une photo piégés', () => {
    const m = construis('sortir_du_congelateur', donneesDe('sortir_du_congelateur'), { ...ctx, prenom: '"><img src=x onerror=alert(1)>' })
    expect(m.html).not.toContain('<img src=x')
    const p = construis('barquette_perime', { ...donneesDe('barquette_perime'), image_url: 'https://a.test/x.jpg" onerror="alert(1)' }, ctx)
    expect(p.html).not.toMatch(/src="https:\/\/a\.test\/x\.jpg" onerror/)
    expect(echappe(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
  })
})

describe('les espaces insécables', () => {
  it('dans le texte, jamais dans une balise ni dans le style', () => {
    const m = construis('noter_les_depenses', donneesDe('noter_les_depenses'), ctx).html
    expect(m).toContain('Rien de noté depuis 9&nbsp;jours')
    expect(m).toContain('«&nbsp;Déclarer&nbsp;»')
    expect(m).toContain('!important')               // la feuille de style est intacte
    expect(m).not.toContain('&nbsp;!important')
    expect(m).toContain('margin:12px 0 22px')       // les valeurs des styles aussi
    expect(m).not.toMatch(/style="[^"]*&nbsp;/)
  })

  it('« 4 wraps », « 16 wraps », « 19 h », « Oublié ? »', () => {
    const m = construis('sortir_du_congelateur', donneesDe('sortir_du_congelateur'), ctx).html
    expect(m).toContain('Ce soir, sors 4&nbsp;wraps du congélateur')
    expect(m).toContain('Oublié&nbsp;?')
    expect(insecables('<p>16 wraps à 19 h : fini !</p>')).toBe('<p>16&nbsp;wraps à 19&nbsp;h&nbsp;: fini&nbsp;!</p>')
    expect(insecables('<p style="margin:0 auto">x</p>')).toBe('<p style="margin:0 auto">x</p>')
  })
})

describe('le gabarit', () => {
  it('une famille, un héros : bleu, encre, herbe, sable', () => {
    const fond = (type: TypeDeRappel) => construis(type, donneesDe(type), ctx).html
    expect(fond('sortir_du_congelateur')).toContain('background:#2C4A58;border-radius:28px')
    expect(fond('barquette_perime')).toContain('background:#1C2B23;border-radius:28px')
    expect(fond('choisir_les_repas')).toContain('background:#2F5D45;border-radius:28px')
    for (const t of ['noter_les_depenses', 'confirmer_les_charges', 'cloturer_le_mois', 'facture_annuelle'] as const) {
      expect(fond(t), t).toContain('background:#F6EAD2;border-radius:28px')
    }
  })

  it('le bouton est « bulletproof » : une table, un lien plein', () => {
    const m = construis('noter_les_depenses', donneesDe('noter_les_depenses'), ctx).html
    expect(m).toMatch(/<table role="presentation"[^>]*class="bouton"><tr>\s*<td style="border-radius:16px;background:#1C2B23"><a href="[^"]+" style="display:inline-block;padding:16px 26px/)
  })

  it('les illustrations viennent du site', () => {
    expect(construis('sortir_du_congelateur', donneesDe('sortir_du_congelateur'), ctx).html).toContain(`src="${BASE}/mail/congelateur.png"`)
    expect(construis('noter_les_depenses', donneesDe('noter_les_depenses'), ctx).html).toContain(`src="${BASE}/mail/ticket.png"`)
  })

  it('un plat sans photo : la pastille seule, pas d’image cassée', () => {
    const m = construis('barquette_perime', { ...donneesDe('barquette_perime'), image_url: null }, ctx).html
    expect(m).not.toContain('<img')
    expect(m).toContain('Demain, 21&nbsp;h')
  })

  it('la semaine : sept jours, deux points chacun, le premier surligné', () => {
    const m = construis('choisir_les_repas', donneesDe('choisir_les_repas'), ctx).html
    expect(m.match(/width="14%"/g)).toHaveLength(7)
    expect(m).toContain('lun.')
    expect(m).toContain('dim.')
    expect(m.match(/background:#F6EAD2;border-radius:14px/g)).toHaveLength(1)
    expect(m).toContain('rien de prévu')
  })

  it('le texte brut : la semaine en toutes lettres', () => {
    const t = construis('choisir_les_repas', donneesDe('choisir_les_repas'), ctx).texte
    expect(t).toContain('lun. 10 : midi du congélateur, soir du congélateur')
    expect(t).toContain('mar. 11 : midi rien de prévu, soir rien de prévu')
  })
})

describe('les exemples', () => {
  for (const type of TYPES_DE_RAPPEL) {
    it(`${type} : un exemple complet, qui se dit exemple`, () => {
      const m = construis(type, exemple(type, MAINTENANT, 'Kamil', BASE), { ...ctx, exemple: true })
      expect(m.sujet.startsWith('[Exemple] ')).toBe(true)
      expect(m.html).toContain('Ceci est un exemple, envoyé à ta demande&nbsp;: rien n’est à faire.')
      expect(m.html).not.toContain('est activé pour toi')
      expect(structure(m.html)).toBeNull()
      expect(m.html).not.toMatch(/undefined|NaN|\[object/)
      for (const h of hrefs(m.html)) expect(h.startsWith(BASE + '/')).toBe(true)
      // Pas de photo prise ailleurs dans un exemple.
      for (const s of srcs(m.html)) expect(s.startsWith(`${BASE}/mail/`)).toBe(true)
    })
  }

  it('« C’est fait » d’un exemple ne sort aucune barquette (aucun identifiant)', () => {
    const m = construis('sortir_du_congelateur', exemple('sortir_du_congelateur', MAINTENANT, 'Kamil', BASE), { ...ctx, exemple: true })
    expect(hrefs(m.html)[0]).toBe(`${BASE}/frigo`)
  })
})

describe('les types sont les mêmes partout', () => {
  it('la migration et le gabarit connaissent les mêmes sept types', () => {
    const sql = readFileSync(new URL('../supabase/migrations/0126_rappels.sql', import.meta.url), 'utf8')
    const bloc = sql.slice(sql.indexOf('check (type in ('), sql.indexOf('actif      boolean'))
    const dansLeSql = [...bloc.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
    expect(dansLeSql.sort()).toEqual([...TYPES_DE_RAPPEL].sort())
    expect(Object.keys(NOM_DU_RAPPEL).sort()).toEqual([...TYPES_DE_RAPPEL].sort())
  })

  it('chaque type du gabarit est dans la fonction SQL', () => {
    const sql = readFileSync(new URL('../supabase/migrations/0126_rappels.sql', import.meta.url), 'utf8')
    for (const t of TYPES_DE_RAPPEL) expect(sql, t).toContain(`'${t}'::text`)
  })
})

describe('le secret', () => {
  it('égal : oui ; différent, plus court, plus long, vide, absent : non', async () => {
    const attendu = 'un-secret-assez-long-0123456789'
    expect(await secretValide(attendu, attendu)).toBe(true)
    expect(await secretValide('un-secret-assez-long-012345678', attendu)).toBe(false)
    expect(await secretValide(attendu + 'x', attendu)).toBe(false)
    expect(await secretValide('Un-secret-assez-long-0123456789', attendu)).toBe(false)
    expect(await secretValide('', attendu)).toBe(false)
    expect(await secretValide(null, attendu)).toBe(false)
  })

  it('sans secret posé, personne n’entre — pas même un secret vide', async () => {
    expect(await secretValide('', '')).toBe(false)
    expect(await secretValide('x', undefined)).toBe(false)
    expect(await secretValide('', null)).toBe(false)
  })
})

describe('réserver, envoyer, libérer', () => {
  const du = (i: number, type = 'sortir_du_congelateur'): RappelDu => ({
    user_id: ID(100 + i), email: `membre${i}@exemple.test`, prenom: 'Kamil', type, cle: `cle-${i}`, cles: [`cle-${i}`],
    donnees: type === 'sortir_du_congelateur' ? donneesDe('sortir_du_congelateur') : donneesDe(type as TypeDeRappel),
  })

  function banc(dus: RappelDu[], o: { envoiEchoue?: (r: string) => boolean; reservations?: Set<string> } = {}) {
    const journal: string[] = []
    const envoyes: string[] = []
    const pris = o.reservations ?? new Set<string>()
    return {
      journal, envoyes, pris,
      dep: {
        base: BASE,
        maintenant: () => MAINTENANT,
        dus: async () => dus,
        reserve: async (r: RappelDu) => {
          journal.push(`reserve ${r.cle}`)
          const k = `${r.user_id}|${r.type}|${r.cles.join(',')}`
          if (pris.has(k)) return false
          pris.add(k); return true
        },
        libere: async (r: RappelDu) => { journal.push(`libere ${r.cle}`); pris.delete(`${r.user_id}|${r.type}|${r.cles.join(',')}`) },
        envoie: async (m: { a: string }) => {
          journal.push(`envoie ${m.a}`)
          if (o.envoiEchoue?.(m.a)) throw new Error('SMTP en panne')
          envoyes.push(m.a)
        },
      },
    }
  }

  it('réserve AVANT d’envoyer, et n’envoie qu’une fois', async () => {
    const b = banc([du(1)])
    const bilan = await envoieLesRappels(b.dep)
    expect(bilan).toEqual({ envoyes: 1, ignores: 0, echecs: 0 })
    expect(b.journal).toEqual(['reserve cle-1', 'envoie membre1@exemple.test'])
  })

  it('un second passage ne renvoie rien (la réservation tient)', async () => {
    const b = banc([du(1), du(2)])
    expect((await envoieLesRappels(b.dep)).envoyes).toBe(2)
    const encore = await envoieLesRappels(b.dep)
    expect(encore).toEqual({ envoyes: 0, ignores: 2, echecs: 0 })
    expect(b.envoyes).toHaveLength(2)
  })

  it('un envoi qui échoue rend sa réservation : l’heure suivante réessaie', async () => {
    let panne = true
    const b = banc([du(1), du(2)], { envoiEchoue: a => panne && a.startsWith('membre1') })
    const premier = await envoieLesRappels(b.dep)
    expect(premier).toEqual({ envoyes: 1, ignores: 0, echecs: 1 })
    expect(b.journal).toEqual([
      'reserve cle-1', 'envoie membre1@exemple.test', 'libere cle-1',   // rendu
      'reserve cle-2', 'envoie membre2@exemple.test',                   // l'autre part quand même
    ])
    panne = false
    const second = await envoieLesRappels(b.dep)
    expect(second).toEqual({ envoyes: 1, ignores: 1, echecs: 0 })
    expect(b.envoyes).toEqual(['membre2@exemple.test', 'membre1@exemple.test'])
  })

  it('un gabarit qui lève (données fausses) rend aussi la réservation, sans rien envoyer', async () => {
    const faux = { ...du(1), donnees: { jour: '2030-06-12', plats: 'pas une liste' } }
    const b = banc([faux])
    const bilan = await envoieLesRappels(b.dep)
    expect(bilan.echecs).toBe(1)
    expect(b.envoyes).toEqual([])
    expect(b.journal).toContain('libere cle-1')
  })

  it('un type que cette version ne connaît pas est ignoré, sans réservation', async () => {
    const b = banc([{ ...du(1), type: 'nouveau_rappel' }, du(2)])
    expect(await envoieLesRappels(b.dep)).toEqual({ envoyes: 1, ignores: 1, echecs: 0 })
    expect(b.journal).not.toContain('reserve cle-1')
  })

  it('plus de cent rappels dans un passage : on s’arrête à cent', async () => {
    const tous = Array.from({ length: MAXIMUM_PAR_PASSAGE + 20 }, (_, i) => du(i))
    const b = banc(tous)
    expect((await envoieLesRappels(b.dep)).envoyes).toBe(MAXIMUM_PAR_PASSAGE)
  })

  it('le journal ne porte ni adresse ni contenu', async () => {
    const lignes: string[] = []
    const b = banc([du(1), { ...du(2), type: 'inconnu' }])
    await envoieLesRappels({ ...b.dep, journal: l => lignes.push(l) })
    expect(lignes.join('\n')).not.toMatch(/@|Wraps|Kamil/)
  })
})
