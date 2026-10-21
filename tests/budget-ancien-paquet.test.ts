/**
 * L'ancien paquet, servi une fois par le service worker après le déploiement.
 * Ses lectures tournent ; ses gestes devenus faux disent « Recharge la page »
 * au lieu d'écrire.
 */
import { describe, expect, it } from 'vitest'
import { admin } from './helpers/db'
import { foyerSolo, ouvre, poseCharge } from './helpers/budget'

describe('l’ancien paquet', () => {
  it('« Le relevé est arrivé ? » : regularise_annuel refuse tout, et n’écrit rien', async () => {
    const f = await foyerSolo('ancien-releve')
    const taxe = await poseCharge(f, { libelle: 'Taxe foncière', cents: 145_000,
                                       mode: 'mis_de_cote' })
    await ouvre(f, '2026-10-01')
    const avant = (await admin().from('depense').select('id').eq('charge_id', taxe)).data!.length
    const { error } = await f.client.rpc('regularise_annuel',
      { la_charge: taxe, annee: 2026, reel_cents: 0 })
    expect(error?.message)
      .toBe('Le relevé annuel se saisit désormais facture par facture. Recharge la page.')
    expect((await admin().from('depense').select('id').eq('charge_id', taxe)).data)
      .toHaveLength(avant)
    expect((await admin().from('releve_annuel').select('id').eq('charge_id', taxe)).data)
      .toEqual([])
  })

  it('ses lectures tournent encore', async () => {
    const f = await foyerSolo('ancien-lectures')
    const taxe = await poseCharge(f, { libelle: 'Taxe foncière', cents: 145_000,
                                       mode: 'mis_de_cote' })
    for (const [fn, args] of [
      ['excedent_du_mois', { le_mois: '2026-10-01' }],
      ['reste_enveloppe', { le_mois: '2026-10-01' }],
      ['provisions_de', { la_charge: taxe, annee: 2026 }],
      ['provisions_a_venir', { la_charge: taxe, annee: 2026 }],
      ['rattrape_les_mois', {}],
      ['refige_le_mois', { le_mois: '2026-10-01' }],
    ] as const) {
      expect((await f.client.rpc(fn, args)).error, fn).toBeNull()
    }
  })
})
