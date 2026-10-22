/**
 * La page de clôture (3.5), rendue en chaîne avec un cache de requêtes REMPLI À LA MAIN :
 * une lecture posée, c'est une lecture revenue ; une lecture absente, une lecture qui n'est
 * pas revenue ; une lecture en `rate`, un réseau qui tombe. Le défaut que ce fichier garde :
 * un chiffre ou un bouton « Clôturer » calculé sur un morceau de ce que la page doit lire —
 * un faux écart sans les saisies, un « Ajoute ton revenu » sans les revenus, un envoi de 0 €
 * sans les poches. Le 21 octobre 2026 : octobre est le mois courant, septembre se clôture.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Cloture as UneCloture } from '../lib/donnees/budget.ts'
import {
  FINE, OCT, SEPT, bouton, charge, depense, ecranDeLaCloture, foyer, membre, poche, revenu, texte,
  type LecturesDeLaCloture,
} from './budget-banc.tsx'
import type { Saisie } from '../lib/donnees/budget.ts'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 21, 10, 0, 0))
})
afterEach(() => vi.useRealTimers())

const courses = depense({ id: 'd1', mois: SEPT })
const resto = depense({ id: 'd2', charge_id: 'c2', libelle: 'Restaurant', mois: SEPT,
                        montant_cents: 400_00, montant_prevu_cents: 400_00,
                        parts: [{ user_profile_id: 'u1', part_cents: 400_00, part_bps: 10000 }] })
const elec = depense({ id: 'd3', charge_id: 'c3', libelle: 'Électricité', mois: SEPT, facon: 'facture',
                       montant_cents: 50_00, montant_prevu_cents: 50_00,
                       parts: [{ user_profile_id: 'u1', part_cents: 50_00, part_bps: 10000 }] })
const saisie = (depenseId: string, cents: number): Saisie => ({
  id: `s-${depenseId}-${cents}`, depense_id: depenseId, fait_le: '2026-09-05', montant_cents: cents,
  saisi_par: 'u1', created_at: '2026-09-05T10:00:00Z',
})
const cloturee = (): UneCloture => ({ id: 'k1', mois: SEPT, cloture_le: '2026-10-01T08:00:00Z',
  choix: [{ user_profile_id: 'u1', reste_cents: 1234_00, mis_de_cote_cents: 200_00,
            poche_id: 'p1', versement_id: 'v1' }] })

/** Tout est revenu : trois lignes de septembre, un revenu, une poche d'urgence à 800 €. */
const tout = (p: Partial<LecturesDeLaCloture> = {}): LecturesDeLaCloture => ({
  foyer: foyer(), depenses: [courses, resto, elec], saisies: [], clotures: [],
  charges: [charge(), charge({ id: 'c2', libelle: 'Restaurant', categorie: 'maison' })],
  revenus: [revenu()], poches: [poche()], apercu: [],
  soldes: { p1: [{ userId: 'u1', cents: 800_00 }] }, ...p,
})
const page = (p: Partial<LecturesDeLaCloture> = {}, o: Parameters<typeof ecranDeLaCloture>[1] = {}) =>
  ecranDeLaCloture(tout(p), o)
const clore = (h: string) => bouton(h, 'Clôturer septembre')
/** L'attribut `disabled` du balisage — et non la classe `disabled:opacity-50`, que tout bouton porte. */
const eteint = (ouverture: string | null) => /(^|\s)disabled=""/.test(ouverture ?? '')

describe('les gardes', () => {
  it('le mois en cours ne se clôture pas : la phrase, un retour, aucun bouton « Clôturer »', () => {
    const h = page({}, { mois: OCT })
    expect(texte(h)).toContain('On clôture octobre une fois fini, à partir du 1er novembre.')
    expect(bouton(h, 'Revenir au mois')).not.toBeNull()
    expect(bouton(h, 'Clôturer octobre')).toBeNull()
    expect(h).not.toContain('Les factures du mois')
  })

  it('un mois à venir non plus, même quand aucune lecture n’est revenue', () => {
    const h = ecranDeLaCloture({}, { mois: '2026-12-01' })
    expect(texte(h)).toContain('On clôture décembre une fois fini, à partir du 1er janvier 2027.')
    expect(bouton(h, 'Clôturer décembre')).toBeNull()
  })

  it('sans revenu : « Ajoute ton revenu de septembre », et le bouton « Revenus » — pas de clôture', () => {
    const h = page({ revenus: [] })
    expect(texte(h)).toContain('Ajoute ton revenu de septembre pour clôturer septembre.')
    expect(bouton(h, 'Revenus')).not.toBeNull()
    expect(clore(h)).toBeNull()
    expect(h).not.toContain('Les factures du mois')
  })

  it('un revenu qui ne commence qu’après le mois ne compte pas pour lui', () => {
    const h = page({ revenus: [{ ...revenu(), valid_from: '2026-10-01' }] })
    expect(texte(h)).toContain('Ajoute ton revenu de septembre')
  })

  it('un mois clôturé à reste négatif : « Il te manque X € », pas « Il t’est resté −X € »', () => {
    const k = { ...cloturee(), choix: [{ ...cloturee().choix[0], reste_cents: -120_00, mis_de_cote_cents: 0 }] }
    const t = texte(page({ clotures: [k] }))
    expect(t).toContain('Il te manque 120 €')
    expect(t).not.toContain('resté')
    expect(t).not.toContain('−')
  })

  it('un mois déjà clôturé : il se lit, et « Revenir dessus » est le seul geste', () => {
    const h = page({ clotures: [cloturee()] })
    const t = texte(h)
    expect(t).toContain('Septembre est clôturé le 01/10.')
    /* `texte` met une espace derrière chaque balise : « 1 234 € , dont ». */
    expect(t.replace(' ,', ',')).toContain(`Il t’est resté 1${FINE}234 €, dont 200 € mis de côté.`)
    expect(bouton(h, 'Revenir dessus')).not.toBeNull()
    expect(clore(h)).toBeNull()
    expect(h).not.toContain('<input')
    expect(h).not.toContain('Déclarer pour')
    expect(h).not.toContain('Les factures du mois')
    expect(h).toContain('>Septembre</h1>')
  })

  it('un mois clôturé se lit sans attendre le reste (les lignes pas revenues)', () => {
    const h = ecranDeLaCloture({ clotures: [cloturee()] })
    expect(texte(h)).toContain('Septembre est clôturé le 01/10.')
    expect(bouton(h, 'Revenir dessus')).not.toBeNull()
  })
})

describe('une adresse d’une autre année : le titre nomme l’année', () => {
  const An = '2025-09-01'
  const sept25 = depense({ id: 'a1', mois: An })
  const revenu25 = { ...revenu(), valid_from: '2025-01-01' }

  it('/cloture/2025-09 : « Clôturer septembre 2025 », titre et bouton', () => {
    const h = ecranDeLaCloture({ ...tout(), depenses: [sept25], revenus: [revenu25] }, { mois: An })
    expect(h).toContain('>Clôturer septembre 2025</h1>')
    expect(bouton(h, 'Clôturer septembre 2025')).not.toBeNull()
  })

  it('sans revenu : « Ajoute ton revenu de septembre 2025 pour clôturer septembre 2025 »', () => {
    const h = ecranDeLaCloture({ ...tout(), depenses: [sept25], revenus: [] }, { mois: An })
    expect(texte(h)).toContain('Ajoute ton revenu de septembre 2025 pour clôturer septembre 2025.')
  })

  it('clôturé : « Septembre 2025 est clôturé le … », titre daté', () => {
    const h = ecranDeLaCloture({ ...tout(), depenses: [sept25], revenus: [revenu25],
      clotures: [{ ...cloturee(), mois: An }] }, { mois: An })
    expect(h).toContain('>Septembre 2025</h1>')
    expect(texte(h)).toContain('Septembre 2025 est clôturé le')
  })

  it('un mois à venir d’une autre année : « mai 2030 », « à partir du 1er juin 2030 »', () => {
    const h = ecranDeLaCloture({}, { mois: '2030-05-01' })
    expect(texte(h)).toContain('On clôture mai 2030 une fois fini, à partir du 1er juin 2030.')
  })

  it('l’année courante ne s’écrit pas (le titre de septembre 2026 reste « Clôturer septembre »)', () => {
    expect(page()).toContain('>Clôturer septembre</h1>')
  })
})

describe('le mois courant est celui de la base (Paris), pas celui de l’appareil', () => {
  /* 31/10 23:30 UTC = 01/11 00:30 à Paris : octobre est FINI pour la base, qui le clôture. Un
     appareil à Los Angeles (UTC-7 : le 31 à 16:30) croyait octobre encore en cours. */
  it('à minuit passé à Paris, octobre se clôture — quel que soit le fuseau de l’appareil', () => {
    const avant = process.env.TZ
    process.env.TZ = 'America/Los_Angeles'
    try {
      vi.setSystemTime(new Date('2026-10-31T23:30:00Z'))
      expect(new Date().getDate(), 'le fuseau du test n’a pas pris').toBe(31)
      const h = ecranDeLaCloture(tout({ depenses: [depense({ id: 'o1', mois: OCT })],
        revenus: [revenu()] }), { mois: OCT })
      expect(texte(h)).not.toContain('On clôture octobre une fois fini')
      expect(bouton(h, 'Clôturer octobre')).not.toBeNull()
    } finally {
      if (avant === undefined) delete process.env.TZ
      else process.env.TZ = avant
    }
  })

  it('avant minuit à Paris, octobre est encore en cours', () => {
    vi.setSystemTime(new Date('2026-10-31T22:30:00Z'))
    const h = ecranDeLaCloture({}, { mois: OCT })
    expect(texte(h)).toContain('On clôture octobre une fois fini, à partir du 1er novembre.')
  })
})

describe('l’accessibilité de la page', () => {
  it('les deux « Réessayer » ont chacun leur nom — un lecteur d’écran les liste, il doit les distinguer', () => {
    const noms = new Set([
      ...[...page({ clotures: undefined }, { rate: { clotures: 'x' } })
        .matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map(m => texte(m[1])),
      ...[...page({ apercu: undefined }, { rate: { apercu: 'x' } })
        .matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map(m => texte(m[1])),
    ])
    expect(noms.has('Réessayer la lecture du mois')).toBe(true)
    expect(noms.has('Réessayer la lecture du reste')).toBe(true)
    expect(noms.has('Réessayer')).toBe(false)
  })

  it('« Revenir dessus » dit de quel mois il parle : « Revenir dessus, Septembre »', () => {
    const h = page({ clotures: [cloturee()] })
    expect(h).toMatch(/<button[^>]*aria-label="Revenir dessus, Septembre"[^>]*>Revenir dessus<\/button>/)
  })

  it('le titre reçoit le focus à l’arrivée : il est focalisable (tabindex -1) — rien ne le décrit sinon', () => {
    for (const h of [page(), page({ clotures: [cloturee()] }), ecranDeLaCloture({}, { mois: OCT })]) {
      expect(h).toMatch(/<h1[^>]*tabindex="-1"/)
    }
  })
})

describe('rien avant d’avoir tout lu', () => {
  it('les clôtures pas revenues : « Un instant… », ni formulaire ni « Clôturer » (le mois est peut-être clos)', () => {
    const h = page({ clotures: undefined })
    expect(texte(h)).toContain('Un instant…')
    expect(clore(h)).toBeNull()
    expect(h).not.toContain('Les factures du mois')
  })

  it('les clôtures en panne : la panne et « Réessayer », jamais « Clôturer »', () => {
    const h = page({ clotures: undefined }, { rate: { clotures: 'permission denied' } })
    expect(texte(h)).toContain('Je n’ai pas pu lire le budget : permission denied')
    expect(bouton(h, 'Réessayer la lecture du mois')).not.toBeNull()
    expect(clore(h)).toBeNull()
  })

  it('les revenus pas revenus : pas de « Ajoute ton revenu » (il l’a peut-être posé)', () => {
    const h = page({ revenus: undefined })
    expect(texte(h)).toContain('Un instant…')
    expect(texte(h)).not.toContain('Ajoute ton revenu')
    expect(clore(h)).toBeNull()
  })

  it('les saisies pas revenues : aucune ligne ne dit « Rien de déclaré », aucun écart', () => {
    const h = page({ saisies: undefined })
    expect(texte(h)).toContain('Un instant…')
    expect(texte(h)).not.toContain('Rien de déclaré')
    expect(texte(h)).not.toContain('de moins que prévu')
    expect(clore(h)).toBeNull()
  })

  it('les lignes en panne : la panne, de quoi réessayer', () => {
    const h = page({ depenses: undefined }, { rate: { depenses: 'coupure' } })
    expect(texte(h)).toContain('Je n’ai pas pu lire le budget : coupure')
    expect(bouton(h, 'Réessayer la lecture du mois')).not.toBeNull()
    expect(clore(h)).toBeNull()
  })

  it('les soldes d’année pas revenus : les étapes 1 et 2 se lisent, l’étape 3 attend — sans faux chiffre, sans envoi', () => {
    const h = page({ apercu: undefined })
    const t = texte(h)
    expect(t).toContain('Tes dépenses du mois')
    expect(h).toContain('aria-label="Déclarer pour Courses"')
    expect(t).not.toContain('Il te reste ce mois-ci')
    expect(t).not.toContain('Tu as dépensé')
    expect(t).toContain('Un instant…')
    expect(eteint(clore(h))).toBe(true)
  })

  it('les soldes d’année en panne : la panne, « Réessayer », et « Clôturer » reste éteint', () => {
    const h = page({ apercu: undefined }, { rate: { apercu: 'pas de réponse' } })
    expect(texte(h)).toContain('Je n’ai pas pu lire le budget : pas de réponse')
    expect(bouton(h, 'Réessayer la lecture du reste')).not.toBeNull()
    expect(eteint(clore(h))).toBe(true)
  })

  it('les poches pas revenues : « Clôturer » reste éteint — il enverrait 0 € à qui veut tout mettre de côté', () => {
    const h = page({ poches: undefined })
    expect(texte(h)).not.toContain('Il te reste ce mois-ci')
    expect(eteint(clore(h))).toBe(true)
  })

  it('les poches en panne : la panne se dit, « Clôturer » reste éteint', () => {
    const h = page({ poches: undefined }, { rate: { poches: 'hors ligne' } })
    expect(texte(h)).toContain('Je n’ai pas pu lire le budget : hors ligne')
    expect(eteint(clore(h))).toBe(true)
  })
})

describe('les trois étapes, tout lu', () => {
  it('les trois titres, les libellés que l’e2e attend, et « Clôturer septembre » allumé', () => {
    const h = page()
    const t = texte(h)
    expect(t).toContain('Trois étapes, et le mois est fait.')
    for (const titre of ['Les factures du mois', 'Tes dépenses du mois', 'Ce qui reste']) {
      expect(h).toContain(`aria-label="${titre}"`)
    }
    expect(h).toContain('aria-label="Déclarer pour Courses"')
    expect(h).toContain('aria-label="Rien dépensé : Restaurant"')
    expect(h).toContain('aria-label="C’est ça, Électricité"')
    expect(texte(h)).toContain('Le mettre de côté')
    expect(h).toMatch(/role="radio" aria-checked="true"[^>]*>(?:(?!<\/button>).)*Le mettre de côté/s)
    expect(clore(h)).not.toBeNull()
    expect(eteint(clore(h))).toBe(false)
    expect(t).toContain('Tu pourras revenir dessus depuis le mois.')
    expect(t).not.toContain('Clôturer octobre')
  })

  it('le chiffre : revenu moins ce que la clôture retiendra (courses prévues, facture à son montant)', () => {
    /* 4 325 − 800 (courses, prévu) − 400 (restaurant, prévu) − 50 (électricité) = 3 075 */
    const t = texte(page())
    expect(t).toContain(`3${FINE}075 €`)
    expect(t).toContain('Il te reste ce mois-ci')
  })

  it('« Ton épargne d’urgence passe à … » : le solde lu, plus ce qui part', () => {
    expect(texte(page())).toContain(`Ton épargne d’urgence passe à 3${FINE}875 € sur 4${FINE}000 €.`)
  })

  it('47,90 € déclarés : l’écart se dit (X + Y fait le chiffre), le reste monte d’autant', () => {
    const t = texte(page({ saisies: [saisie('d1', 47_90)] }))
    expect(t).toContain('47,90 € sur 800 €')
    expect(t).toContain('Tu as dépensé 752,10 € de moins que prévu.')
    expect(t).toContain(`3${FINE}827,10 €`)
    expect(t).toContain('3 075 € prévus, plus 752,10 € dépensés en moins'.replace('3 075', `3${FINE}075`))
  })

  it('« Rien dépensé » basculé d’office sur une ligne déjà confirmée à 0 € (une reclôture)', () => {
    /* Confirmée à 0 €, la ligne a aussi des parts à 0 (la base les refait à la confirmation). */
    const zero = { ...resto, confirme_le: '2026-10-01T00:00:00Z', montant_cents: 0,
                   parts: [{ user_profile_id: 'u1', part_cents: 0, part_bps: 10000 }] }
    const h = page({ depenses: [courses, zero, elec] })
    expect(h).toMatch(/aria-checked="true" aria-label="Rien dépensé : Restaurant"/)
    expect(h).toMatch(/aria-checked="false" aria-label="Rien dépensé : Courses"/)
    /* 4 325 − 800 − 0 − 50 = 3 475 */
    expect(texte(h)).toContain(`3${FINE}475 €`)
  })

  it('une facture à valider : « C’est ça » et « Modifier » ; confirmée, « Tout est validé »', () => {
    expect(texte(page())).not.toContain('Tout est validé')
    const confirmee = { ...elec, confirme_le: '2026-10-01T00:00:00Z' }
    expect(texte(page({ depenses: [courses, resto, confirmee] }))).toContain('Tout est validé.')
  })

  it('un solde d’année qui revient se dit dans la carte, et entre dans le chiffre', () => {
    const t = texte(page({ apercu: [{ charge: 'c1', libelle: 'Taxe foncière', annee: 2025, cents: -120_00 }] }))
    expect(t).toContain('Taxe foncière : 120 € non dépensés en 2025 reviennent.')
    expect(t).toContain(`3${FINE}195 €`)
  })

  it('un solde d’année à deux : le total du foyer se dit, MA part non — « avant les soldes d’année »', () => {
    const deux = foyer([membre('u1', 'Kamil'), membre('u2', 'Thauba')])
    const soldes = [{ charge: 'c1', libelle: 'Entretien auto', annee: 2026, cents: -166_68 }]
    const t = texte(page({ foyer: deux, apercu: soldes }))
    expect(t).toContain('Entretien auto : 166,68 € non dépensés en 2026 reviennent.')
    expect(t).toContain('Il te reste, avant les soldes d’année')
    expect(t).not.toContain('Il te reste ce mois-ci')
    expect(t).not.toContain('passe à')
    expect(eteint(clore(page({ foyer: deux, apercu: soldes })))).toBe(false)
  })

  it('le foyer pas lu, avec un solde : on ne sait pas si l’on est seul, donc pas de part annoncée', () => {
    const t = texte(page({ foyer: undefined,
      apercu: [{ charge: 'c1', libelle: 'Taxe foncière', annee: 2025, cents: -120_00 }] }))
    expect(t).toContain('Il te reste, avant les soldes d’année')
  })

  it('le même solde, seul au foyer : la part est sûre, rien ne change', () => {
    const t = texte(page({ apercu: [{ charge: 'c1', libelle: 'Taxe foncière', annee: 2025, cents: -120_00 }] }))
    expect(t).toContain('Il te reste ce mois-ci')
    expect(t).not.toContain('avant les soldes')
  })

  it('à deux sans solde (onze mois sur douze) : « Il te reste ce mois-ci » comme avant', () => {
    const deux = foyer([membre('u1', 'Kamil'), membre('u2', 'Thauba')])
    expect(texte(page({ foyer: deux }))).toContain('Il te reste ce mois-ci')
  })

  it('sans poche : « Le mettre de côté » est grisé, la clôture reste permise (elle ne bloque jamais)', () => {
    const h = page({ poches: [] })
    expect(texte(h)).toContain('Il n’y a pas encore de poche d’épargne.')
    expect(clore(h)).not.toBeNull()
    expect(eteint(clore(h))).toBe(false)
  })

  it('un reste négatif : « Il te manque », rien à mettre de côté, la clôture reste permise', () => {
    const h = page({ revenus: [revenu('u1', 100_00)] })
    expect(texte(h)).toContain('Il te manque ce mois-ci')
    expect(texte(h)).toContain('Il ne reste rien à mettre de côté ce mois-ci.')
    expect(clore(h)).not.toBeNull()
    expect(eteint(clore(h))).toBe(false)
  })

  it('à deux, le revenu et les parts sont les MIENS', () => {
    const deux = foyer([membre('u1', 'Kamil'), membre('u2', 'Thauba')])
    const partage = (id: string, dep: ReturnType<typeof depense>) => ({
      ...dep, parts: [{ user_profile_id: 'u1', part_cents: dep.montant_cents / 2, part_bps: 5000 },
                      { user_profile_id: 'u2', part_cents: dep.montant_cents / 2, part_bps: 5000 }], id })
    const t = texte(page({ foyer: deux, revenus: [revenu('u1'), revenu('u2', 9000_00)],
                           depenses: [partage('d1', courses)] }))
    /* Mon revenu 4 325 − ma moitié de 800 = 3 925, pas le revenu de l'autre. */
    expect(t).toContain(`3${FINE}925 €`)
  })
})
