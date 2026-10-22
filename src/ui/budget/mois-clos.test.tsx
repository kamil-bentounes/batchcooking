/**
 * Le mois clôturé, à l'écran (3.7) : en lecture SEULE, de bout en bout.
 *
 * Le défaut que ce fichier fige : l'écran ne passait jamais `clos` aux feuilles, la prop
 * `clos` de `Recap` ne servait à rien, et « Déclarer » restait proposé. La base refuse
 * l'écriture, mais l'utilisateur ne doit pas arriver jusque-là.
 *
 * Rendu en chaîne (le dépôt n'a ni jsdom ni Testing Library) : les feuilles se rendent
 * par `FeuillesDuMois`, qui porte la décision « que montre-t-on sur ce mois ? ».
 */
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Choix } from '../../lib/donnees/budget.ts'
import { FINE, OCT, charge, cloture, depense, ecranDuMois, membre, saisie, texte, tout }
  from '../../pages/budget-banc.tsx'
import type { Reste } from '../../lib/budget/mois.ts'
import { FeuillesDuMois, type Ouverte } from './FeuillesDuMois.tsx'
import { Gestes } from './Gestes.tsx'
import { MoisClos } from './MoisClos.tsx'
import { Recap } from './Recap.tsx'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 21, 10, 0, 0))
})
afterEach(() => vi.useRealTimers())

const choix = (p: Partial<Choix> = {}): Choix => ({
  user_profile_id: 'u1', reste_cents: 1234_00, mis_de_cote_cents: 200_00,
  poche_id: null, versement_id: null, ...p,
})
const cloturee = () => ({ ...cloture(OCT), choix: [choix()] })

const fil = depense({ id: 'd1', libelle: 'Courses' })
const facture = depense({ id: 'd2', charge_id: 'c2', libelle: 'Électricité', facon: 'facture',
                          montant_cents: 61_20, montant_prevu_cents: 50_00, confirme_le: null })
const mise = depense({ id: 'd3', charge_id: 'c3', libelle: 'Taxe foncière', facon: 'mis_de_cote',
                       montant_cents: 41_67 })

function feuilles(ouverte: Ouverte, clos: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const lignes = [fil, facture, mise]
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <FeuillesDuMois ouverte={ouverte} clos={clos} misDeCote={200_00} etat="pret"
        lignes={lignes} auFil={[fil]} saisies={[saisie(47_90)]}
        charges={new Map([['c1', charge()], ['c2', charge({ id: 'c2', mode: 'facture' })],
                          ['c3', charge({ id: 'c3', mode: 'mis_de_cote', periodicite: 'annuel' })]])}
        mois={OCT} moi="u1" foyerId="f1" membres={[membre('u1', 'Kamil')]}
        fermer={() => {}} choisir={() => {}} />
    </QueryClientProvider>)
}

/** « Revenir dessus » lit le client de requêtes : tout ce qui le porte se rend dans un fournisseur. */
const dansUnClient = (el: ReactElement) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>)
const nRevenir = (h: string) => (h.match(/Revenir dessus/g) ?? []).length

describe('MoisClos', () => {
  it('dit que le mois est clôturé, avec son nom', () => {
    expect(texte(dansUnClient(<MoisClos mois={OCT} misDeCote={0} />)))
      .toContain('Octobre est clôturé.')
  })

  it('porte « Revenir dessus », le seul geste d’un mois clôturé', () => {
    const h = dansUnClient(<MoisClos mois={OCT} misDeCote={200_00} />)
    expect(nRevenir(h)).toBe(1)
    expect(h).toMatch(/<button[^>]*>Revenir dessus<\/button>/)
    expect(h).not.toContain('<input')
  })
})

describe('Les gestes sur un mois clôturé', () => {
  it('sans « Déclarer » : trois gestes, et la grille suit', () => {
    const h = renderToStaticMarkup(<Gestes va={() => {}} declarer={null} />)
    const boutons = [...h.matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map(m => texte(m[1]))
    expect(boutons).toEqual(['Mes charges', 'Revenus', 'Épargne'])
    expect(h).toContain('grid-cols-3')
    expect(h).not.toContain('grid-cols-4')
  })

  it('avec « Déclarer » : les quatre, comme avant', () => {
    const h = renderToStaticMarkup(<Gestes va={() => {}} declarer={() => {}} />)
    expect(h).toContain('grid-cols-4')
    expect(texte(h)).toContain('Déclarer')
  })
})

describe('Les feuilles sur un mois clôturé : AUCUN geste d’écriture', () => {
  it('Déclarer : la feuille se lit seulement — ni champ, ni « Ajouter », ni corbeille', () => {
    const h = feuilles({ geste: 'declarer', id: 'd1' }, true)
    expect(texte(h)).toContain('Octobre est clôturé.')
    expect(h).not.toContain('Nouvelle dépense')
    expect(h).not.toContain('<input')
    expect(h).not.toContain('Ajouter')
    expect(h).not.toContain('Retirer')
    /* Ce qui a été dit reste lisible. */
    expect(texte(h)).toContain('Déjà ce mois-ci')
    expect(texte(h)).toContain('47,90 €')
  })

  it('Déclarer, mois ouvert : la saisie est là (le test ne passe pas par omission)', () => {
    const h = feuilles({ geste: 'declarer', id: 'd1' }, false)
    expect(h).toContain('Nouvelle dépense')
    expect(h).toContain('Ajouter')
    expect(h).toContain('Retirer')
    expect(texte(h)).not.toContain('est clôturé')
  })

  it('Facture du mois : le montant se lit, sans « C’est ça » ni « Modifier » ni champ', () => {
    const h = feuilles({ geste: 'facture', id: 'd2' }, true)
    expect(texte(h)).toContain('Octobre est clôturé.')
    expect(texte(h)).toContain('Le montant habituel')
    expect(h).not.toContain('C’est ça')
    expect(h).not.toContain('Modifier')
    expect(h).not.toContain('<input')
    expect(h).not.toContain('Valider')
  })

  it('Facture du mois, mois ouvert : les deux boutons sont là', () => {
    const h = feuilles({ geste: 'facture', id: 'd2' }, false)
    expect(h).toContain('C’est ça')
    expect(h).toContain('Modifier')
  })

  it('« Déclarer », depuis les gestes : aucun choix de ligne sur un mois clôturé', () => {
    expect(feuilles({ geste: 'choix' }, true)).toBe('')
    expect(feuilles({ geste: 'choix' }, false)).toContain('Pour quelle ligne ?')
  })

  it('une feuille déjà ouverte quand le mois se clôture se met en lecture seule, d’elle-même', () => {
    /* `clos` vient de la lecture des clôtures, qui se rafraîchit : la même feuille, au
       rendu suivant, change de contenu — l'état « ouverte » n'a pas à être refermé. */
    const avant = feuilles({ geste: 'declarer', id: 'd1' }, false)
    const apres = feuilles({ geste: 'declarer', id: 'd1' }, true)
    expect(avant).toContain('Ajouter')
    expect(apres).not.toContain('Ajouter')
  })

  it('Facture mise de côté : la même sur un mois clôturé (§ 3.4) — elle se saisit au présent', () => {
    /* § 3.4 : « Une facture se saisit toujours au présent : la feuille est la même sur un
       mois clôturé. Son ajustement tombe sur le mois en cours, qui n'est jamais clôturé
       (D78). » Elle n'écrit donc rien dans le mois clôturé. */
    const h = feuilles({ geste: 'mise', id: 'd3' }, true)
    expect(h).not.toBe('')
    expect(texte(h)).not.toContain('est clôturé')
  })

  it('une ligne qui n’est plus au mois n’ouvre rien', () => {
    expect(feuilles({ geste: 'declarer', id: 'inconnue' }, true)).toBe('')
    expect(feuilles(null, true)).toBe('')
  })
})

describe('Recap d’un mois clôturé', () => {
  const reste: Reste = { revenu: 4325_00, reste: 99_00, charges: 1 }
  const rend = (cl: { reste: number | null; misDeCote: number } | null) =>
    texte(dansUnClient(<Recap mois={OCT} reste={reste} segments={[]} va={() => {}}
                              cloture={cl} />))

  it('« Octobre est clôturé. Il t’est resté X », dont Y mis de côté', () => {
    const t = rend({ reste: 1234_00, misDeCote: 200_00 })
    expect(t).toContain('Octobre est clôturé.')
    expect(t).toContain('Il t’est resté')
    expect(t).toContain(`1${FINE}234 €`)
    expect(t).toContain('dont 200 € mis de côté')
    expect(t).not.toContain('Il te reste')
  })

  it('un reste négatif se lit « Il te manque X », comme le mois ouvert — jamais « resté −X »', () => {
    const t = rend({ reste: -120_00, misDeCote: 0 })
    expect(t).toContain('Il te manque')
    expect(t).toContain('120 €')
    expect(t).not.toContain('resté')
    expect(t).not.toContain('−')
    expect(t).not.toContain('-120')
  })

  it('un reste à 0 reste « Il t’est resté 0 € »', () => {
    expect(rend({ reste: 0, misDeCote: 0 })).toContain('Il t’est resté 0 €')
  })

  it('rien mis de côté : pas de « dont »', () => {
    expect(rend({ reste: 50_00, misDeCote: 0 })).not.toContain('dont')
  })

  it('sans choix de ma part : un tiret, jamais un 0 inventé', () => {
    const t = rend({ reste: null, misDeCote: 0 })
    expect(t).toContain('Il t’est resté —')
  })
})

describe('L’écran du mois, clôturé', () => {
  const clos = (p = {}) => ecranDuMois(tout({ clotures: [cloturee()], ...p }))

  it('le chiffre vient de la clôture (cloture_choix.reste_cents), pas du calcul du jour', () => {
    const t = texte(clos())
    expect(t).toContain('Octobre est clôturé.')
    expect(t).toContain(`Il t’est resté 1${FINE}234 €`)
    expect(t).toContain('dont 200 € mis de côté')
    expect(t).not.toContain('Il te reste')
  })

  it('le choix d’un AUTRE membre ne devient pas le mien', () => {
    const autre = { ...cloture(OCT), choix: [choix({ user_profile_id: 'u2', reste_cents: 999_00 })] }
    const t = texte(ecranDuMois(tout({ clotures: [autre] })))
    expect(t).toContain('Il t’est resté —')
    expect(t).not.toContain('999')
  })

  it('« Déclarer » n’est proposé nulle part : ni le geste, ni le bouton d’une ligne', () => {
    const h = clos()
    expect(h).not.toContain('Déclarer')
    expect(h).not.toContain('Nouvelle dépense')
    expect(h).not.toContain('Ajouter')
  })

  it('le même mois, ouvert, propose « Déclarer » (le test ne passe pas par omission)', () => {
    const h = ecranDuMois(tout())
    expect(h).toContain('Déclarer pour Courses')
    expect(texte(h)).toContain('Déclarer')
  })

  /* Ce que l'ÉCRAN fait de `clos` : les feuilles ouvertes par-dessus, rendues par la page. */
  it('une feuille « Déclarer » ouverte sur la page se lit seulement', () => {
    const h = ecranDuMois(tout({ clotures: [cloturee()], saisies: [saisie(47_90)] }),
                          { ouverte: { geste: 'declarer', id: 'd1' } })
    expect(h).toContain('Déjà ce mois-ci')
    expect(h).not.toContain('Nouvelle dépense')
    expect(h).not.toContain('Ajouter')
    expect(h).not.toContain('Retirer')
    expect(texte(h).match(/est clôturé/g)).toHaveLength(2) // la carte encre, et la feuille
  })

  it('une feuille « Facture du mois » ouverte sur la page se lit seulement', () => {
    const lues = tout({ clotures: [cloturee()],
      depenses: [{ ...facture, mois: OCT }], charges: [charge({ id: 'c2', mode: 'facture' })] })
    const h = ecranDuMois(lues, { ouverte: { geste: 'facture', id: 'd2' } })
    expect(h).not.toContain('C’est ça')
    expect(h).not.toContain('Modifier')
    expect(h).not.toContain('<input')
  })

  it('« Déclarer » ouvert avant la clôture ne montre pas son choix de ligne une fois clos', () => {
    const h = ecranDuMois(tout({ clotures: [cloturee()] }), { ouverte: { geste: 'choix' } })
    expect(h).not.toContain('Pour quelle ligne ?')
  })

  it('le même mois, ouvert, laisse saisir (le test ne passe pas par omission)', () => {
    const h = ecranDuMois(tout(), { ouverte: { geste: 'declarer', id: 'd1' } })
    expect(h).toContain('Nouvelle dépense')
    expect(h).toContain('Ajouter')
  })

  it('aucun bandeau de clôture sur un mois clôturé', () => {
    expect(texte(clos())).not.toContain('on le clôture')
  })
})

describe('L’écran du mois : « Revenir dessus » et ce qui n’a pas pu être soldé', () => {
  const clos = (p = {}) => tout({ clotures: [cloturee()], ...p })
  const nonSoldee = { charge: 'c3', libelle: 'Taxe foncière', annee: 2025, raison: 'x' }

  it('« Revenir dessus » est sur la carte encre d’un mois clôturé, une fois', () => {
    expect(nRevenir(ecranDuMois(clos()))).toBe(1)
  })

  it('et dans la feuille en lecture seule : deux, la carte et la feuille', () => {
    const h = ecranDuMois(clos(), { ouverte: { geste: 'declarer', id: 'd1' } })
    expect(nRevenir(h)).toBe(2)
  })

  it('un mois ouvert n’a rien à rouvrir : aucun « Revenir dessus », nulle part', () => {
    expect(nRevenir(ecranDuMois(tout()))).toBe(0)
    expect(nRevenir(ecranDuMois(tout(), { ouverte: { geste: 'declarer', id: 'd1' } }))).toBe(0)
  })

  it('sur un mois clôturé, aucun champ, aucun « Clôturer », aucun « Déclarer » : seul « Revenir dessus » écrit', () => {
    const h = ecranDuMois(clos())
    expect(h).not.toContain('<input')
    expect(h).not.toContain('Clôturer')
    expect(h).not.toContain('Déclarer')
    expect(h).not.toContain('C’est ça')
  })

  it('ce que la clôture n’a pas pu solder se dit sous le chiffre du mois', () => {
    const t = texte(ecranDuMois(clos({ nonSoldees: [nonSoldee] })))
    expect(t).toContain('Taxe foncière : 2025 n’a pas pu être soldée. Elle le sera à la prochaine clôture.')
    expect(t.indexOf('Il t’est resté')).toBeLessThan(t.indexOf('Taxe foncière : 2025'))
  })

  it('une ligne par année non soldée, chacune sous sa charge', () => {
    const t = texte(ecranDuMois(clos({ nonSoldees: [nonSoldee, { ...nonSoldee, annee: 2024 }] })))
    expect(t).toContain('Taxe foncière : 2025 n’a pas pu être soldée.')
    expect(t).toContain('Taxe foncière : 2024 n’a pas pu être soldée.')
  })

  it('rien de non soldé : aucune ligne', () => {
    expect(texte(ecranDuMois(clos({ nonSoldees: [] })))).not.toContain('n’a pas pu être soldée')
    expect(texte(ecranDuMois(clos()))).not.toContain('n’a pas pu être soldée')
  })

  it('un mois rouvert ne garde pas la ligne d’une clôture qui n’existe plus', () => {
    expect(texte(ecranDuMois(tout({ nonSoldees: [nonSoldee] })))).not.toContain('n’a pas pu être soldée')
  })
})
