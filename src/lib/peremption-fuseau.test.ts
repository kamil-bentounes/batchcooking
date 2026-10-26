/**
 * Le calcul des dates de péremption à l'écran est celui de la base, au passage de l'heure d'hiver.
 *
 * `tg_portion_peremption` ajoute `4 × 24 h` (frigo) ou `90 × 24 h` (congélateur) à un instant, en UTC.
 * L'écran ajoutait des jours de CALENDRIER en heure locale (`setDate`) : une barquette rangée le
 * dimanche 25 octobre 2026 à 0 h 30 à Paris — l'heure d'hiver revient dans la nuit — se périmait
 * « jeudi 29 » à 0 h 30 à l'écran, quand la base écrit mercredi 28 à 23 h 30 : un jour d'écart.
 *
 * Le fuseau est posé AVANT toute date : d'où un fichier à part, pour ne pas changer celui des autres.
 */
import { describe, expect, it } from 'vitest'

process.env.TZ = 'Europe/Paris'

const { plusDeJours } = await import('./peremption.ts')
const { jourAbrege, phraseDuFrigo, phraseDuCongelo } = await import('./ranger.ts')
const { peremptionApres } = await import('./frigo.ts')

describe('plusDeJours : des jours PLEINS de 24 h, comme la base', () => {
  it('Paris est bien en heure d’été avant le 25 octobre 2026, en heure d’hiver après', () => {
    expect(new Date(2026, 9, 24, 12).getTimezoneOffset()).toBe(-120)
    expect(new Date(2026, 9, 26, 12).getTimezoneOffset()).toBe(-60)
  })

  it('4 jours = 96 h à la milliseconde, par-dessus le changement d’heure', () => {
    const range = new Date(2026, 9, 24, 23, 30) // samedi 24 oct., 23 h 30, heure d'été
    expect(plusDeJours(range, 4).getTime() - range.getTime()).toBe(4 * 86_400_000)
    expect(plusDeJours(range, 90).getTime() - range.getTime()).toBe(90 * 86_400_000)
  })

  it('le jour affiché est celui de l’instant que la base écrit', () => {
    const range = new Date(2026, 9, 24, 23, 30)
    // La base : 2026-10-24T21:30Z + 96 h = 2026-10-28T21:30Z, soit mercredi 28 à 22 h 30 à Paris.
    const base = new Date(Date.parse('2026-10-24T21:30:00Z') + 4 * 86_400_000)
    expect(jourAbrege(plusDeJours(range, 4))).toBe(jourAbrege(base))
    expect(jourAbrege(plusDeJours(range, 4))).toBe('mer. 28 oct.')
  })

  it('un rangement juste après minuit, la nuit du changement d’heure : mercredi 28, pas jeudi 29', () => {
    // Dimanche 25 octobre 2026, 0 h 30 (heure d'été) : 2026-10-24T22:30Z + 96 h = 2026-10-28T22:30Z,
    // soit mercredi 28 à 23 h 30 (heure d'hiver). Un calcul « jours de calendrier » disait jeudi 29, 0 h 30.
    const range = new Date(2026, 9, 25, 0, 30)
    expect(jourAbrege(plusDeJours(range, 4))).toBe('mer. 28 oct.')
    expect(phraseDuFrigo(1, range)).toBe('à manger avant le mer. 28 oct.')
  })

  it('le congélateur : 90 jours pleins', () => {
    const range = new Date(2026, 9, 24, 23, 30)
    expect(phraseDuCongelo(1, range)).toBe(`se garde jusqu’au ${jourAbrege(new Date(Date.parse('2026-10-24T21:30:00Z') + 90 * 86_400_000))}`)
  })

  it('la fiche du frigo recalcule la péremption avec le MÊME calcul', () => {
    const debut = new Date(2026, 9, 25, 0, 30)
    expect(peremptionApres('frigo', 'au_frais', debut)!.getTime()).toBe(plusDeJours(debut, 4).getTime())
    expect(peremptionApres('congelateur', 'au_frais', debut)!.getTime()).toBe(plusDeJours(debut, 90).getTime())
    expect(peremptionApres('frigo', 'decongelee', debut)).toBeNull()
  })
})
