/**
 * Les gestes, ce qui reste, l'épargne (2.10).
 *
 * Rendu en chaîne, sans navigateur : on vérifie les mots que l'écran dit, et ce que
 * le balisage promet (noms des boutons, cibles, classes de l'anneau de focus).
 * Les montants s'écrivent avec l'espace fine insécable (U+202F) de `toLocaleString('fr-FR')`.
 */
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { CLE, type Poche } from '../../lib/donnees/budget.ts'
import type { Reste, Segment } from '../../lib/budget/mois.ts'
import { CarteEpargne } from './CarteEpargne.tsx'
import { Gestes } from './Gestes.tsx'
import { Recap } from './Recap.tsx'

const rends = (el: ReactElement) => renderToStaticMarkup(el)
/** Le texte vu, sans balises. `\s` avalerait U+202F et U+00A0 : on ne replie que l'ordinaire. */
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()
const FINE = ' '

describe('Gestes', () => {
  it('dit les quatre gestes, dans l’ordre, chacun dans un vrai bouton', () => {
    const h = rends(<Gestes va={() => {}} declarer={() => {}} />)
    const boutons = [...h.matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map(m => texte(m[1]))
    expect(boutons).toEqual(['Mes charges', 'Déclarer', 'Revenus', 'Épargne'])
    expect(h).toContain('aria-label="Les gestes du mois"')
  })

  it('seul « Déclarer » est en safran : c’est le geste de tous les jours', () => {
    const h = rends(<Gestes va={() => {}} declarer={() => {}} />)
    const pastilles = [...h.matchAll(/<span class="([^"]*rounded-full[^"]*)"/g)].map(m => m[1])
    expect(pastilles).toHaveLength(4)
    expect(pastilles.map(c => c.includes('bg-safran'))).toEqual([false, true, false, false])
  })

  it('chaque bouton tient la cible tactile de 44 px, et la pastille fait 58 px', () => {
    const h = rends(<Gestes va={() => {}} declarer={() => {}} />)
    expect(h.match(/<button[^>]*min-h-11/g)).toHaveLength(4)
    expect(h.match(/w-\[58px\] h-\[58px\]/g)).toHaveLength(4)
  })

  it('les icônes sont décoratives : le nom du bouton, c’est son libellé', () => {
    const h = rends(<Gestes va={() => {}} declarer={() => {}} />)
    expect(h.match(/<svg[^>]*aria-hidden="true"/g)).toHaveLength(4)
  })

  it('mène aux bonnes pages ; « Déclarer » ouvre la feuille, il ne navigue pas', () => {
    const va = vi.fn()
    const declarer = vi.fn()
    // On appelle les gestionnaires posés sur les boutons de l'arbre React rendu.
    const arbre = Gestes({ va, declarer }) as ReactElement<{ children: ReactElement<{ onClick: () => void }>[] }>
    arbre.props.children.forEach(b => b.props.onClick())
    expect(va.mock.calls.map(a => a[0])).toEqual(['/charges', '/budget-reglages', '/epargne'])
    expect(declarer).toHaveBeenCalledTimes(1)
  })
})

describe('Recap', () => {
  const segments: Segment[] = [
    { cle: 'maison', nom: 'Maison', cents: 900_00, pourcent: 60 },
    { cle: 'auto', nom: 'Auto', cents: 300_00, pourcent: 20 },
    { cle: 'reste', nom: 'Reste', cents: 300_00, pourcent: 20 },
  ]
  const avecReste = (reste: Partial<Reste> = {}): Reste =>
    ({ revenu: 4325_00, charges: 1200_00, reste: 3125_00, ...reste })
  const rendsRecap = (reste: Reste, plus: { cloture?: { reste: number | null; misDeCote: number } | null } = {}) =>
    rends(<Recap mois="2026-10-01" reste={reste} segments={segments} va={() => {}} {...plus} />)

  it('le mois ouvert : « Il te reste », le chiffre, les charges, le revenu', () => {
    const t = texte(rendsRecap(avecReste()))
    expect(t).toContain('Il te reste')
    expect(t).toContain(`3${FINE}125 €`)
    expect(t).toContain(`après 1${FINE}200 € de charges prévues`)
    expect(t).toContain(`sur 4${FINE}325 € de revenus`)
  })

  it('un reste négatif : « Il te manque », le chiffre sans signe, toujours en safran', () => {
    const h = rendsRecap(avecReste({ reste: -85_50 }))
    const t = texte(h)
    expect(t).toContain('Il te manque')
    expect(t).not.toContain('Il te reste')
    expect(t).toContain('85,50 €')
    expect(t).not.toContain('−')
    // Le chiffre : safran (l'ocre ne se lit pas sur l'encre, choix 4).
    expect(h).toMatch(/chiffre[^"]*text-safran[^>]*>85,50 €/)
    expect(h).not.toContain('text-ocre')
  })

  it('un reste à zéro n’est pas un manque', () => {
    const t = texte(rendsRecap(avecReste({ reste: 0 })))
    expect(t).toContain('Il te reste')
    expect(t).toContain('0 €')
  })

  it('la barre est décorative ; la légende dit le nom ET le pourcentage de chaque catégorie', () => {
    const h = rendsRecap(avecReste())
    const legende = h.slice(h.indexOf('<ul'))
    expect(texte(legende)).toBe('Maison 60 % Auto 20 % Reste 20 %')
    expect(h).toMatch(/<div aria-hidden="true"[^>]*h-3/)
    // La barre pèse les parts : un segment de 0 % garde un trait visible (grow ≥ 1).
    expect(h).toContain('flex-grow:60')
  })

  it('un segment à 0 % reste visible dans la barre', () => {
    const h = rends(<Recap mois="2026-10-01" reste={avecReste()} va={() => {}}
      segments={[{ cle: 'maison', nom: 'Maison', cents: 1, pourcent: 0 }]} />)
    expect(h).toContain('flex-grow:1')
  })

  it('sans revenu : une invitation et un seul bouton, vers les revenus', () => {
    const va = vi.fn()
    const el = Recap({ mois: '2026-10-01', reste: { revenu: null, charges: 100_00, reste: null }, segments: [], va })
    const h = rends(el)
    expect(texte(h)).toBe('Ajoute ton revenu pour voir ce qu’il te reste. Revenus')
    expect(h.match(/<button/g)).toHaveLength(1)
    expect(h).not.toContain('chiffre')
  })

  it('un revenu connu mais un reste nul (null) dit la même chose que sans revenu', () => {
    const t = texte(rendsRecap({ revenu: 4000_00, charges: 0, reste: null }))
    expect(t).toContain('Ajoute ton revenu')
  })

  it('le bouton « Revenus » de la carte encre a l’anneau de focus lisible sur l’encre', () => {
    // Sans `.sur-encre`, l'anneau `herbe` y fait 1,9:1 : le focus disparaît (anneau.test.ts).
    const h = rendsRecap({ revenu: null, charges: 0, reste: null })
    expect(h).toMatch(/<section[^>]*class="[^"]*\bsur-encre\b/)
    expect(h).toMatch(/<button[^>]*min-h-11/)
  })

  it('un mois clôturé : ce qui est resté, et ce qui est mis de côté', () => {
    const t = texte(rendsRecap(avecReste(), { cloture: { reste: 410_00, misDeCote: 150_00 } }))
    expect(t).toContain('Octobre est clôturé.')
    expect(t).toContain('Il t’est resté')
    expect(t).toContain('410 €')
    expect(t).toContain('dont 150 € mis de côté')
    expect(t).not.toContain('Il te reste')
  })

  it('un mois clôturé sans rien mis de côté ne dit pas « dont 0 € »', () => {
    const t = texte(rendsRecap(avecReste(), { cloture: { reste: 410_00, misDeCote: 0 } }))
    expect(t).not.toContain('dont')
  })

  it('un mois clôturé sans reste connu : un tiret, pas « 0 € » ni « NaN »', () => {
    const t = texte(rendsRecap(avecReste(), { cloture: { reste: null, misDeCote: 0 } }))
    expect(t).toContain('—')
    expect(t).not.toContain('NaN')
  })

  it('un mois clôturé prime, même sans revenu', () => {
    const t = texte(rendsRecap({ revenu: null, charges: 0, reste: null },
      { cloture: { reste: 10_00, misDeCote: 0 } }))
    expect(t).toContain('clôturé')
    expect(t).not.toContain('Ajoute ton revenu')
  })
})

describe('CarteEpargne', () => {
  const poche = (p: Partial<Poche> = {}): Poche =>
    ({ id: 'p1', libelle: 'Vacances', genre: 'projet', objectif_cents: 1000_00,
       echeance: null, cle: null, ...p })
  const rendsCarte = (poches: Poche[], soldes: Record<string, number[]> = {}) => {
    const qc = new QueryClient()
    qc.setQueryData(CLE.poches, poches)
    for (const p of poches) {
      qc.setQueryData(CLE.soldes(p.id),
        (soldes[p.id] ?? []).map((cents, i) => ({ userId: `u${i}`, cents })))
    }
    return rends(<QueryClientProvider client={qc}><CarteEpargne va={() => {}} /></QueryClientProvider>)
  }

  it('sans poche, rien : ni carte ni marge', () => {
    expect(rendsCarte([])).toBe('')
  })

  it('une poche : son nom, « X € mis de côté sur Y € », son pourcentage, sa jauge', () => {
    const h = rendsCarte([poche()], { p1: [250_00, 100_00] })
    const t = texte(h)
    expect(t).toContain('Vacances')
    expect(t).toContain(`350 € mis de côté sur 1${FINE}000 €`)
    expect(t).toContain('35 %')
    expect(h).toContain('role="meter"')
    expect(h).toContain('aria-valuenow="35000"')
  })

  it('le pourcentage s’arrondit vers le bas : 99,9 % n’est pas « 100 % »', () => {
    expect(texte(rendsCarte([poche()], { p1: [999_00] }))).toContain('99 %')
  })

  it('au-delà de l’objectif : 100 % et la jauge s’arrête pleine, jamais en ocre', () => {
    const h = rendsCarte([poche()], { p1: [1500_00] })
    expect(texte(h)).toContain('100 %')
    expect(h).toContain('aria-valuenow="100000"')
    expect(h).not.toContain('var(--color-ocre)')
  })

  it('sans objectif : ni pourcentage ni jauge, juste ce qui est mis de côté', () => {
    const h = rendsCarte([poche({ genre: 'urgence', objectif_cents: null, libelle: 'Urgences' })],
      { p1: [200_00] })
    expect(texte(h)).toContain('200 € mis de côté')
    expect(texte(h)).not.toContain('sur')
    expect(texte(h)).not.toContain('%')
    expect(h).not.toContain('role="meter"')
  })

  it('un objectif à 0 € est traité comme sans objectif (pas de division par zéro)', () => {
    const h = rendsCarte([poche({ objectif_cents: 0 })], { p1: [200_00] })
    expect(texte(h)).not.toContain('NaN')
    expect(texte(h)).not.toContain('Infinity')
    expect(h).not.toContain('role="meter"')
  })

  it('une poche vide dit « 0 € mis de côté » (le solde n’est pas encore chargé)', () => {
    expect(texte(rendsCarte([poche()]))).toContain(`0 € mis de côté sur 1${FINE}000 €`)
  })

  it('un solde négatif n’affiche jamais un pourcentage négatif', () => {
    const h = rendsCarte([poche()], { p1: [-50_00] })
    expect(h).not.toMatch(/−\d+ %|-\d+ %/)
    // Et la jauge ne reçoit pas une valeur négative (un `meter` invalide).
    expect(h).toContain('aria-valuenow="0"')
  })

  it('une carte par poche, chacune un bouton vers /epargne', () => {
    const h = rendsCarte([poche(), poche({ id: 'p2', libelle: 'Urgences', genre: 'urgence' })])
    expect(h.match(/<button/g)).toHaveLength(2)
    expect(h.match(/budget\/epargne\.jpg/g)).toHaveLength(2)
  })
})
