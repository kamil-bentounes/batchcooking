/**
 * Les calculs qui produisent les chiffres affichés.
 *
 * Aucun de ces trois n'était testé, et ce sont eux qu'on lit : `virements()`
 * rend le seul chiffre sur lequel on peut agir, `enCentimes()` est la ligne
 * exacte où un flottant fabrique un centime faux, et `euros()` est ce qui
 * s'affiche. Une relecture a trouvé trois défauts dedans.
 */
import { describe, expect, it } from 'vitest'
import { virements, euros, eurosRonds, enCentimes, type Depense, type Compte }
  from '../src/lib/donnees/budget.ts'

const MOI = 'moi', ELLE = 'elle'
const prenoms = new Map([[MOI, 'Kamil'], [ELLE, 'Thauba']])

const compte = (o: Partial<Compte> & { id: string }): Compte => ({
  nom: 'Commun', genre: 'commun', titulaire_id: null, matelas_cents: 0, ...o,
})
const depense = (o: Partial<Depense> & { id: string }): Depense => ({
  libelle: 'X', montant_cents: 1000, nature: 'estimee', source: 'modele',
  enveloppe_id: null, compte_id: null, parts: [], ...o,
})

describe('enCentimes', () => {
  it('laisse passer une virgule en cours de frappe', () => {
    // « 3, » est un état de passage vers « 3,50 » : refuser afficherait une
    // erreur à chaque montant décimal, entre deux touches.
    expect(enCentimes('3,')).toBe(300)
  })

  it('accepte ce que l’application affiche elle-même', () => {
    // `toLocaleString('fr-FR')` produit une espace INSÉCABLE : recopier un
    // montant affiché par l'app était rejeté par la première version.
    expect(enCentimes('1 234,56')).toBe(123_456)
    expect(enCentimes('1 234,56')).toBe(123_456)
    expect(enCentimes('1 234,56')).toBe(123_456)
    expect(enCentimes('10,70')).toBe(1_070)
    expect(enCentimes('37')).toBe(3_700)
    expect(enCentimes('0,05')).toBe(5)
    expect(enCentimes('12.5')).toBe(1_250)
  })

  it('ne fabrique pas de centime faux', () => {
    // `Math.round(12.345 * 100)` rend 1234 : le flottant vaut 1234,4999…
    expect(enCentimes('12,34')).toBe(1_234)
    expect(enCentimes('1,15')).toBe(115)
    expect(enCentimes('8,07')).toBe(807)
    expect(enCentimes('1000000')).toBe(100_000_000)
  })

  it('refuse ce qui n’est pas un montant, au lieu de deviner', () => {
    for (const faux of ['', 'abc', '-20', '1,2,3', '1e3', '12,345', ',5', '1..2']) {
      expect(enCentimes(faux), `« ${faux} » a été accepté`).toBeNull()
    }
  })
})

describe('euros', () => {
  it('rend des centimes exacts, et des euros ronds quand on le demande', () => {
    /* On asserte les CHIFFRES, pas les espaces : `toLocaleString` choisit
       lui-même entre espace fine insécable, espace insécable et espace
       ordinaire, et ce choix a déjà changé d'une version de Node à l'autre. */
    const sansEspaces = (s: string) => s.replace(/[\s\u00A0\u202F]/g, '')
    expect(sansEspaces(euros(161_853))).toBe('1618,53€')
    expect(euros(5)).toContain('0,05')
    expect(euros(0)).toContain('0,00')
    expect(sansEspaces(eurosRonds(161_853))).toBe('1619€')
  })
})

describe('virements', () => {
  it('range ce qu’on doit par compte, et rend le plus gros d’abord', () => {
    const commun = compte({ id: 'c1', nom: 'Commun' })
    const v = virements([
      depense({ id: 'd1', compte_id: 'c1', parts: [{ user_profile_id: MOI, part_cents: 60_000 }] }),
      depense({ id: 'd2', compte_id: 'c1', parts: [{ user_profile_id: MOI, part_cents: 3_123 }] }),
    ], MOI, [commun], prenoms)

    expect(v).toHaveLength(1)
    expect(v[0].vers).toBe('Commun')
    expect(v[0].cents, 'les centimes se perdent en route').toBe(63_123)
  })

  it('doit à la PERSONNE quand elle a avancé, pas à son compte', () => {
    const sien = compte({ id: 'c2', nom: 'Compte de Kamil', genre: 'perso', titulaire_id: MOI })
    const v = virements([
      depense({ id: 'd1', compte_id: 'c2', parts: [{ user_profile_id: ELLE, part_cents: 2_200 }] }),
    ], ELLE, [sien], prenoms)

    expect(v[0].vers, 'on doit à un compte au lieu d’une personne').toBe('Kamil')
    expect(v[0].detail).toContain('avancé')
  })

  it('ne demande PAS de se virer de l’argent à soi-même', () => {
    /* Une charge débitée de mon propre compte perso créait une dette envers
       moi, et gonflait le total du hub d'autant. */
    const mien = compte({ id: 'c3', nom: 'Mon compte', genre: 'perso', titulaire_id: MOI })
    const v = virements([
      depense({ id: 'd1', compte_id: 'c3', parts: [{ user_profile_id: MOI, part_cents: 58_000 }] }),
    ], MOI, [mien], prenoms)

    expect(v, 'on se doit de l’argent à soi-même').toHaveLength(0)
  })

  it('ignore les dépenses où l’on n’a aucune part', () => {
    const commun = compte({ id: 'c1' })
    const v = virements([
      depense({ id: 'd1', compte_id: 'c1', parts: [{ user_profile_id: ELLE, part_cents: 9_000 }] }),
    ], MOI, [commun], prenoms)
    expect(v, 'on paie une charge à laquelle on ne participe pas').toHaveLength(0)
  })

  it('ne rend rien pour une part à zéro', () => {
    const commun = compte({ id: 'c1' })
    const v = virements([
      depense({ id: 'd1', compte_id: 'c1', parts: [{ user_profile_id: MOI, part_cents: 0 }] }),
    ], MOI, [commun], prenoms)
    expect(v, 'un virement de zéro euro est proposé').toHaveLength(0)
  })

  it('regroupe sous « à répartir » ce qui n’a pas de compte', () => {
    const v = virements([
      depense({ id: 'd1', compte_id: null, parts: [{ user_profile_id: MOI, part_cents: 1_000 }] }),
      depense({ id: 'd2', compte_id: null, parts: [{ user_profile_id: MOI, part_cents: 500 }] }),
    ], MOI, [], prenoms)
    expect(v, 'les dépenses sans compte se dispersent').toHaveLength(1)
    expect(v[0].cents).toBe(1_500)
  })
})
