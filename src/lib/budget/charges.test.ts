import { describe, expect, it, vi } from 'vitest'
import { departDeLaCharge, enVigueur, ceQuiChange, communeDeLaCharge, debutDuChamp, ditLaCorrection, lisLeDebut, peutCorriger, peutPoser, pourquoiElleNeComptePas,
         periodiciteDeLaFacon, phraseDuTotal, plancherDuDebut, retireesEncoreAReg, sousTitreDeLaFacon,
         suiteDuRetrait, texteDeLaRetiree } from './charges.ts'
import { montant } from './mois.ts'

describe('enVigueur : une charge qui ne démarre pas encore ne pèse pas dans le mois', () => {
  it('en vigueur dès le mois de son départ, pas avant', () => {
    expect(enVigueur({ debut: '2026-10-01' }, '2026-10-01')).toBe(true)
    expect(enVigueur({ debut: '2026-09-01' }, '2026-10-01')).toBe(true)
    expect(enVigueur({ debut: '2026-11-01' }, '2026-10-01')).toBe(false)
    expect(enVigueur({ debut: '2031-01-01' }, '2026-10-15')).toBe(false)
  })
  it('une charge à venir dit sa date de début, une charge en vigueur ne dit rien', () => {
    expect(departDeLaCharge({ debut: '2031-01-01' }, '2026-10-01')).toBe('commence en janvier 2031')
    expect(departDeLaCharge({ debut: '2026-12-01' }, '2026-10-01')).toBe('commence en décembre 2026')
    expect(departDeLaCharge({ debut: '2026-10-01' }, '2026-10-01')).toBeNull()
  })
})

describe('suiteDuRetrait : « Retirer » demande d’abord quand des dépenses sont déclarées', () => {
  it('la base accepte : on le dit, sans rien demander', () => {
    const confirmer = vi.fn(() => true)
    const s = suiteDuRetrait({ sort: 'supprimee' }, 'Netflix', confirmer)
    expect(s).toEqual({ dit: '« Netflix » retirée.' })
    expect(confirmer).not.toHaveBeenCalled()
  })

  it('archivée : on dit que les mois confirmés ou réglés la gardent', () => {
    const s = suiteDuRetrait({ sort: 'archivee' }, 'Loyer', () => true)
    expect(s).toEqual({ dit: '« Loyer » retirée. Les mois que tu as confirmés ou réglés la gardent : c’est de l’argent sorti.' })
  })

  it('la base veut confirmation : on pose la question avec le total, puis on rappelle', () => {
    const confirmer = vi.fn(() => true)
    const s = suiteDuRetrait({ aConfirmer: { cents: 43_000, message: 'x' } }, 'Courses', confirmer)
    expect(s).toEqual({ rappeler: true })
    expect(confirmer).toHaveBeenCalledTimes(1)
    expect(confirmer).toHaveBeenCalledWith(`Retirer Courses et ses ${montant(43_000)} déclarés ?`)
  })

  it('un refus ne rappelle pas : la saisie ne part pas sans qu’on l’ait vue', () => {
    const s = suiteDuRetrait({ aConfirmer: { cents: 43_000, message: 'x' } }, 'Courses', () => false)
    expect(s).toEqual({ rien: true })
  })
})

describe('retireesEncoreAReg : une mise de côté retirée garde sa feuille jusqu’au 31 décembre suivant', () => {
  const c = (archive_le: string | null, mode: 'fixe' | 'mis_de_cote' = 'mis_de_cote') => ({ archive_le, mode })

  it('retirée cette année ou l’an dernier : elle reste', () => {
    expect(retireesEncoreAReg([c('2026-03-01'), c('2025-12-01')], 2026)).toHaveLength(2)
  })
  it('retirée il y a deux ans : elle part', () => {
    expect(retireesEncoreAReg([c('2024-12-31')], 2026)).toHaveLength(0)
  })
  it('une charge vivante, ou qui n’était pas mise de côté, n’y est pas', () => {
    expect(retireesEncoreAReg([c(null), c('2026-03-01', 'fixe')], 2026)).toHaveLength(0)
  })
})

describe('texteDeLaRetiree : l’année du retrait', () => {
  it('encore ouverte : « reste à régler »', () => {
    expect(texteDeLaRetiree(false, 2026)).toBe('2026 reste à régler')
  })
  it('soldée : « Retirée en »', () => {
    expect(texteDeLaRetiree(true, 2026)).toBe('Retirée en 2026')
  })
  it('l’état pas encore lu ne prétend pas qu’elle est soldée', () => {
    expect(texteDeLaRetiree(undefined, 2026)).toBe('2026 reste à régler')
  })
})

describe('periodiciteDeLaFacon : seule la mise de côté sort du mensuel', () => {
  it('fixe, facture, au fil : mensuel, quel que soit le rythme laissé en mémoire', () => {
    for (const m of ['fixe', 'facture', 'au_fil'] as const) {
      expect(periodiciteDeLaFacon(m, 'annuel')).toBe('mensuel')
    }
  })
  it('mise de côté : le rythme choisi', () => {
    expect(periodiciteDeLaFacon('mis_de_cote', 'trimestriel')).toBe('trimestriel')
    expect(periodiciteDeLaFacon('mis_de_cote', 'annuel')).toBe('annuel')
  })
})

describe('sousTitreDeLaFacon : la catégorie toujours, la façon quand elle n’est pas « fixe »', () => {
  it('fixe : la catégorie seule', () => {
    expect(sousTitreDeLaFacon({ categorie: 'maison', mode: 'fixe' })).toBe(' · Maison')
  })
  it('les trois autres façons se disent, en minuscules', () => {
    expect(sousTitreDeLaFacon({ categorie: 'vie_courante', mode: 'au_fil' }))
      .toBe(' · Vie courante · plusieurs dépenses dans le mois')
    expect(sousTitreDeLaFacon({ categorie: 'maison', mode: 'facture' }))
      .toBe(' · Maison · une facture chaque mois')
    expect(sousTitreDeLaFacon({ categorie: 'impots', mode: 'mis_de_cote' }))
      .toBe(' · Impôts · mise de côté')
  })
  it('une catégorie inconnue tombe sur « Autre »', () => {
    expect(sousTitreDeLaFacon({ categorie: 'zzz', mode: 'fixe' })).toBe(' · Autre')
  })
})

describe('ceQuiChange : changer de catégorie seule ne touche pas à l’argent', () => {
  const charge = { libelle: 'Courses', montant_cents: 40_000, mode: 'au_fil' as const,
                   periodicite: 'mensuel' as const, debut: '2026-01-01', categorie: 'vie_courante' as const }
  const saisie = { libelle: 'Courses', cents: 40_000, mode: 'au_fil' as const,
                   periodicite: 'mensuel' as const, debut: '2026-01-01', categorie: 'vie_courante' as const }

  it('rien n’a bougé : rien à enregistrer', () => {
    expect(ceQuiChange(charge, saisie)).toEqual({ argent: false, categorie: false })
  })
  it('la catégorie seule : pas d’argent, donc pas de `corrige_la_charge`', () => {
    expect(ceQuiChange(charge, { ...saisie, categorie: 'maison' })).toEqual({ argent: false, categorie: true })
  })
  it.each([
    ['le nom', { libelle: 'Supermarché' }], ['le montant', { cents: 45_000 }],
    ['la façon', { mode: 'fixe' as const }], ['le rythme', { periodicite: 'annuel' as const }],
    ['le début', { debut: '2026-03-01' }],
  ])('%s : c’est de l’argent', (_nom, changement) => {
    expect(ceQuiChange(charge, { ...saisie, ...changement }).argent).toBe(true)
  })
  it('les espaces autour du nom ne comptent pas', () => {
    expect(ceQuiChange(charge, { ...saisie, libelle: '  Courses ' }).argent).toBe(false)
  })
})

describe('ditLaCorrection', () => {
  it('aucun mois refait : « corrigée »', () => {
    expect(ditLaCorrection('Loyer', 0)).toBe('« Loyer » corrigée.')
  })
  it('un mois, puis plusieurs : « refait » prend le pluriel', () => {
    expect(ditLaCorrection('Loyer', 1)).toBe('« Loyer » corrigée, 1 mois refait.')
    expect(ditLaCorrection('Loyer', 3)).toBe('« Loyer » corrigée, 3 mois refaits.')
  })
})

describe('« Elle court depuis » — un champ vidé ne part pas comme « -01 »', () => {
  // `<input type="month">` rend « » quand on l'efface (ou qu'on n'a tapé qu'une partie) :
  // l'écran écrivait `${''}-01`, soit « -01 », et l'envoyait à la base.
  it('debutDuChamp : un mois complet devient son premier jour, le reste devient vide', () => {
    expect(debutDuChamp('2026-09')).toBe('2026-09-01')
    expect(debutDuChamp('')).toBe('')
    expect(debutDuChamp('2026-9')).toBe('')
    expect(debutDuChamp('2026-13')).toBe('')
    expect(debutDuChamp('2026-00')).toBe('')
  })

  const plancher = plancherDuDebut(new Date(2026, 9, 21))
  it('le plancher est janvier de l’année précédente (la base refuse avant, 0096)', () => {
    expect(plancher).toBe('2025-01-01')
  })

  it('lisLeDebut : vide, mal formé ou avant le plancher ne passent pas, et le disent', () => {
    for (const d of ['', '-01', '0002-05-01', '2024-12-01']) {
      const r = lisLeDebut(d, { plancher })
      expect(r.valide, d).toBe(false)
      expect(r.refus, d).toBeTypeOf('string')
    }
    expect(lisLeDebut('2025-01-01', { plancher })).toEqual({ valide: true, refus: null })
    expect(lisLeDebut('2026-10-01', { plancher }).valide).toBe(true)
  })

  it('lisLeDebut : le départ DÉJÀ posé reste accepté, même antérieur au plancher (corriger un libellé ne le réécrit pas)', () => {
    expect(lisLeDebut('2024-03-01', { plancher, garde: '2024-03-01' }).valide).toBe(true)
    expect(lisLeDebut('2024-04-01', { plancher, garde: '2024-03-01' }).valide).toBe(false)
  })
})

describe('peutPoser — l’ajout d’une charge ne part qu’avec un montant ET un départ acceptés', () => {
  const plancher = '2025-01-01'
  const base = { libelle: 'Loyer', montant: '800', qui: 1, debut: '2026-10-01', plancher }

  it('un cas ordinaire est prêt, en centimes', () => {
    expect(peutPoser(base)).toMatchObject({ pret: true, cents: 80_000, refusMontant: null, refusDebut: null })
  })

  it('le plafond de 1 000 000 € se refuse, avec sa phrase (comme les feuilles)', () => {
    const r = peutPoser({ ...base, montant: '1000000,01' })
    expect(r.pret).toBe(false)
    expect(r.refusMontant).toContain('1 000 000')
    expect(peutPoser({ ...base, montant: '1000000' }).pret).toBe(true)
    expect(peutPoser({ ...base, montant: '99999999' }).pret).toBe(false)
  })

  it('0 €, vide et illisible ne passent pas ; le vide ne gronde pas encore', () => {
    expect(peutPoser({ ...base, montant: '0' }).pret).toBe(false)
    expect(peutPoser({ ...base, montant: '' })).toMatchObject({ pret: false, refusMontant: null })
    expect(peutPoser({ ...base, montant: '4,5,6' }).refusMontant).toBeTypeOf('string')
  })

  it('un départ vidé ou avant le plancher bloque, et se dit', () => {
    expect(peutPoser({ ...base, debut: '' })).toMatchObject({ pret: false })
    expect(peutPoser({ ...base, debut: '' }).refusDebut).toBeTypeOf('string')
    expect(peutPoser({ ...base, debut: '0002-05-01' }).pret).toBe(false)
  })

  it('un libellé de plus de 80 caractères ne part pas, et se dit en français', () => {
    /* Grand test, parcours budget : 81 caractères laissaient le bouton actif, et la base répondait
       « new row for relation "charge" violates check constraint "charge_libelle_check" ». */
    const long = 'x'.repeat(81)
    const r = peutPoser({ ...base, libelle: long })
    expect(r.pret).toBe(false)
    expect(r.refusLibelle).toBe('Un nom de 80 caractères au plus.')
    expect(peutPoser({ ...base, libelle: 'x'.repeat(80) })).toMatchObject({ pret: true, refusLibelle: null })
    /* Les espaces autour ne comptent pas : la base les retire (`btrim`). */
    expect(peutPoser({ ...base, libelle: `  ${'x'.repeat(80)}  ` }).pret).toBe(true)
  })

  it('sans libellé ou sans participant, non', () => {
    expect(peutPoser({ ...base, libelle: '  ' }).pret).toBe(false)
    expect(peutPoser({ ...base, qui: 0 }).pret).toBe(false)
  })
})

describe('peutCorriger — corriger ne contourne ni le plafond ni la date', () => {
  const plancher = '2025-01-01'
  const base = { libelle: 'Taxe foncière', montant: '1450', mode: 'mis_de_cote' as const,
                 debut: '2026-01-01', garde: '2026-01-01', plancher }

  it('un cas ordinaire est prêt', () => {
    expect(peutCorriger(base)).toMatchObject({ pret: true, cents: 145_000 })
  })

  it('le plafond de 1 000 000 € se refuse aussi', () => {
    const r = peutCorriger({ ...base, montant: '1000000,01' })
    expect(r.pret).toBe(false)
    expect(r.refusMontant).toContain('1 000 000')
  })

  it('un départ vidé bloque une mise de côté — il n’est pas lu pour les autres façons (le champ est caché)', () => {
    expect(peutCorriger({ ...base, debut: '' }).pret).toBe(false)
    expect(peutCorriger({ ...base, debut: '' }).refusDebut).toBeTypeOf('string')
    expect(peutCorriger({ ...base, mode: 'fixe', debut: '' }).pret).toBe(true)
  })

  it('corriger refuse aussi un nom de plus de 80 caractères', () => {
    const r = peutCorriger({ ...base, libelle: 'y'.repeat(81) })
    expect(r.pret).toBe(false)
    expect(r.refusLibelle).toBe('Un nom de 80 caractères au plus.')
  })

  it('le départ ancien déjà posé ne bloque pas un simple changement de libellé', () => {
    expect(peutCorriger({ ...base, debut: '2024-03-01', garde: '2024-03-01' }).pret).toBe(true)
  })
})

describe('communeDeLaCharge : une charge n’est commune que si elle se partage', () => {
  /* Grand test, parcours « nouveau venu » (22/10) : Thauba pose « Salle de sport » (catalogue : perso),
     seule participante, dans un foyer de deux. Elle était enregistrée COMMUNE : « Commun »
     comptait son abonnement pour Kamil, et toute troisième personne y serait entrée à son
     arrivée (`tg_membre_rejoint_les_communes`). */
  it('à deux dans le foyer, une seule participante : perso, quoi que le catalogue pré-coche', () => {
    expect(communeDeLaCharge({ qui: 1, membres: 2, intention: true })).toBe(false)
    expect(communeDeLaCharge({ qui: 1, membres: 2, intention: false })).toBe(false)
  })

  it('à plusieurs participants : commune', () => {
    expect(communeDeLaCharge({ qui: 2, membres: 2, intention: false })).toBe(true)
  })

  it('seul dans le foyer, la case « Elle se partagera avec le foyer » dit l’intention', () => {
    expect(communeDeLaCharge({ qui: 1, membres: 1, intention: true })).toBe(true)
    expect(communeDeLaCharge({ qui: 1, membres: 1, intention: false })).toBe(false)
  })
})

describe('phraseDuTotal : un total qu’on n’a pas lu n’est pas zéro', () => {
  it('se tait tant que les charges ne sont pas lues', () => {
    expect(phraseDuTotal({ lu: false, total: '0,00 €', avance: null, pourToi: false })).toBeNull()
  })

  it('dit le total du foyer, ou le sien', () => {
    expect(phraseDuTotal({ lu: true, total: '3 978,57 €', avance: null, pourToi: false }))
      .toBe('3 978,57 € par mois pour le foyer, une fois tout ramené au mois.')
    expect(phraseDuTotal({ lu: true, total: '1 200,00 €', avance: null, pourToi: true }))
      .toBe('1 200,00 € par mois pour toi, une fois tout ramené au mois.')
  })

  it('ajoute ce qu’on paie de son propre compte, seulement s’il y en a', () => {
    expect(phraseDuTotal({ lu: true, total: '2 964,00 €', avance: '86,00 €', pourToi: false }))
      .toBe('2 964,00 € par mois pour le foyer, une fois tout ramené au mois. Dont 86,00 € que tu paies depuis ton propre compte.')
  })
})

describe('pourquoiElleNeComptePas — un seul prédicat pour la liste, le mois type et le tableau', () => {
  const c = (debut: string, participants: string[]) => ({ debut, participants })
  const presents = new Set(['thauba'])
  it('elle compte : en vigueur, et l’un de ses participants est là', () => {
    expect(pourquoiElleNeComptePas(c('2026-01-01', ['thauba']), '2026-10-01', presents)).toBeNull()
    expect(pourquoiElleNeComptePas(c('2026-01-01', ['kamil', 'thauba']), '2026-10-01', presents)).toBeNull()
  })
  it('« arrivee » : aucun participant n’est encore là (la charge de Kamil seul, vue par Thauba en octobre)', () => {
    expect(pourquoiElleNeComptePas(c('2026-01-01', ['kamil']), '2026-10-01', presents)).toBe('arrivee')
    expect(pourquoiElleNeComptePas(c('2026-01-01', []), '2026-10-01', presents)).toBe('arrivee')
  })
  it('« debut » passe avant « arrivee »', () => {
    expect(pourquoiElleNeComptePas(c('2031-01-01', ['kamil']), '2026-10-01', presents)).toBe('debut')
  })
})

describe('un départ ne précède pas l’arrivée de qui corrige', () => {
  const plancher = '2025-01-01'
  it('refuse une date avant l’arrivée, avec sa phrase ; accepte l’arrivée et après', () => {
    const r = lisLeDebut('2026-10-01', { plancher, arrivee: '2026-11-01' })
    expect(r.valide).toBe(false)
    expect(r.refus).toBe('Pas avant ton arrivée, en novembre 2026.')
    expect(lisLeDebut('2026-11-01', { plancher, arrivee: '2026-11-01' }).valide).toBe(true)
    expect(lisLeDebut('2027-01-01', { plancher, arrivee: '2026-11-15' }).valide).toBe(true)
  })
  it('sans arrivée connue, rien ne change', () => {
    expect(lisLeDebut('2026-01-01', { plancher, arrivee: null }).valide).toBe(true)
    expect(lisLeDebut('2026-01-01', { plancher }).valide).toBe(true)
  })
  it('le départ déjà posé reste accepté, même avant l’arrivée (corriger un nom ne le réécrit pas)', () => {
    expect(lisLeDebut('2026-01-01', { plancher, garde: '2026-01-01', arrivee: '2026-11-01' }).valide).toBe(true)
    expect(lisLeDebut('2026-02-01', { plancher, garde: '2026-01-01', arrivee: '2026-11-01' }).valide).toBe(false)
  })
  it('peutCorriger bloque une mise de côté qui démarrerait avant l’arrivée, pas une autre façon', () => {
    const base = { libelle: 'Taxe', montant: '1200', mode: 'mis_de_cote' as const, debut: '2026-10-01',
                   garde: '2026-12-01', plancher, arrivee: '2026-11-01' }
    expect(peutCorriger(base)).toMatchObject({ pret: false, refusDebut: 'Pas avant ton arrivée, en novembre 2026.' })
    expect(peutCorriger({ ...base, mode: 'fixe' }).pret).toBe(true)
  })
})
