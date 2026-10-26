/**
 * Ce que la lecture d'une étiquette remplit — et ce qu'elle laisse vide. Un chiffre douteux n'entre jamais : il
 * entrerait dans le bilan sans que personne s'en aperçoive.
 */
import { describe, expect, it } from 'vitest'
import { champsDeLEtiquette, phraseDeLErreur } from './etiquette.ts'
import type { LectureEtiquette } from './etiquette.ts'

const lue = (o: Partial<LectureEtiquette> = {}): LectureEtiquette => ({
  nom: 'Yaourt dessert protéiné', marque: null, poids_g: 125, parts: null,
  kcal_100g: 76, proteines_100g: 10, glucides_100g: 5.6, lipides_100g: 1.4, fibres_100g: 0,
  lisible: true, confiance: 0.9, commentaire: null, ...o,
})

describe('une étiquette nette', () => {
  it('remplit le nom, les valeurs pour 100 g et le poids d’un pot (125 g net, pas de parts)', () => {
    const { champs, notes } = champsDeLEtiquette(lue())
    expect(champs).toEqual({
      label: 'Yaourt dessert protéiné', kcal: '76', proteines: '10', glucides: '5,6', lipides: '1,4', fibres: '0', poids: '125',
    })
    expect(notes).toEqual([])
  })

  it('le nom reçoit la marque quand il ne la dit pas', () => {
    expect(champsDeLEtiquette(lue({ nom: 'Skyr', marque: 'Danone' })).champs.label).toBe('Skyr Danone')
    expect(champsDeLEtiquette(lue({ nom: 'Skyr Danone', marque: 'Danone' })).champs.label).toBe('Skyr Danone')
  })
})

describe('le poids d’une unité', () => {
  it('un paquet de 4 pots, 500 g net : 125 g l’unité, et on le dit', () => {
    const { champs, notes } = champsDeLEtiquette(lue({ poids_g: 500, parts: 4 }))
    expect(champs.poids).toBe('125')
    expect(notes.join(' ')).toMatch(/4 portions de 500 g en tout : je compte 125 g l’unité/)
  })

  it('« 1 portion » annoncée : le poids net est celui de l’unité', () => {
    expect(champsDeLEtiquette(lue({ poids_g: 140, parts: 1 })).champs.poids).toBe('140')
  })

  it('le poids net est illisible : le champ reste vide, et on demande', () => {
    const { champs, notes } = champsDeLEtiquette(lue({ poids_g: null }))
    expect(champs.poids).toBeUndefined()
    expect(notes.join(' ')).toMatch(/combien pèse un pot/)
  })

  it('un poids absurde (plus de 5 kg l’unité) n’est pas repris', () => {
    expect(champsDeLEtiquette(lue({ poids_g: 12_000, parts: null })).champs.poids).toBeUndefined()
  })
})

describe('ce qu’on ne remplit pas', () => {
  it('des kJ lus pour des kcal (au-delà de 900 pour 100 g) : rien n’est rempli, on le dit', () => {
    const { champs, notes } = champsDeLEtiquette(lue({ kcal_100g: 318 * 4.184 + 400 }))
    expect(champs.kcal).toBeUndefined()
    expect(notes.join(' ')).toMatch(/sans doute des kJ/)
  })

  it('des calories illisibles : le champ reste vide, jamais zéro', () => {
    const { champs, notes } = champsDeLEtiquette(lue({ kcal_100g: null }))
    expect(champs.kcal).toBeUndefined()
    expect(notes.join(' ')).toMatch(/calories ne sont pas lisibles/)
  })

  it('des protéines illisibles : vides, et on le dit (c’est ce que le bilan suit)', () => {
    const { champs, notes } = champsDeLEtiquette(lue({ proteines_100g: null }))
    expect(champs.proteines).toBeUndefined()
    expect(notes.join(' ')).toMatch(/protéines ne sont pas lisibles/)
  })

  it('un nutriment hors bornes (150 g pour 100 g) n’est pas repris', () => {
    expect(champsDeLEtiquette(lue({ glucides_100g: 150 })).champs.glucides).toBeUndefined()
    expect(champsDeLEtiquette(lue({ lipides_100g: -3 })).champs.lipides).toBeUndefined()
  })

  it('rien de lisible sur la photo : rien n’est rempli, une seule phrase', () => {
    const { champs, notes } = champsDeLEtiquette(lue({ lisible: false }))
    expect(champs).toEqual({})
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatch(/rien pu lire/)
  })

  it('un tableau flou (confiance basse) : on remplit, mais on dit de tout vérifier', () => {
    const { champs, notes } = champsDeLEtiquette(lue({ confiance: 0.4 }))
    expect(champs.kcal).toBe('76')
    expect(notes.join(' ')).toMatch(/vérifie chaque chiffre/)
  })

  it('le commentaire du modèle est repris tel quel', () => {
    expect(champsDeLEtiquette(lue({ commentaire: 'Le tableau est coupé.' })).notes).toContain('Le tableau est coupé.')
  })
})

describe('les pannes de la fonction', () => {
  it('le corps JSON d’une erreur porte déjà une phrase : on la rend, pas l’accolade', () => {
    expect(phraseDeLErreur(new Error('{"erreur":"Quota atteint : 40 étiquettes par mois. Il repart le 1er.","restantes":0}')))
      .toBe('Quota atteint : 40 étiquettes par mois. Il repart le 1er.')
  })

  it('un message qui n’est pas du JSON reste tel quel ; rien du tout : une phrase par défaut', () => {
    expect(phraseDeLErreur(new Error('Pas de réseau.'))).toBe('Pas de réseau.')
    expect(phraseDeLErreur(undefined)).toBe('La lecture a échoué.')
  })
})
