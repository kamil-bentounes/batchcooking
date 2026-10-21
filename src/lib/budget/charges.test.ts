import { describe, expect, it, vi } from 'vitest'
import { ceQuiChange, ditLaCorrection, periodiciteDeLaFacon, retireesEncoreAReg, sousTitreDeLaFacon,
         suiteDuRetrait, texteDeLaRetiree } from './charges.ts'
import { montant } from './mois.ts'

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
