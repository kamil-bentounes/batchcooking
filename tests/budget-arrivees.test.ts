/**
 * Les arrivées : le premier revenu, la date d'entrée.
 *
 * Thauba arrive le 15/11 et pose son revenu le 02/12. Sans la règle du premier
 * revenu, novembre n'aurait jamais de revenu pour elle, et la garde de la
 * clôture l'attendrait pour toujours.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { admin } from './helpers/db'
import { clos, foyerSolo, ligne, membre, ou, ouvre, poseCharge } from './helpers/budget'
import { regleLHeure, remetLHeure } from './helpers/horloge'

afterAll(remetLHeure)

const revenus = async (qui: string) => (ou(await admin().from('revenu')
  .select('valid_from').eq('user_profile_id', qui).order('valid_from')) as
  { valid_from: string }[]).map(r => r.valid_from)

describe('le premier revenu d’un membre compte dès son arrivée', () => {
  it('Thauba arrivée le 15/11, revenu posé le 02/12 : il vaut dès novembre', async () => {
    await regleLHeure('2026-12-02T10:00:00+01:00')
    const f = await foyerSolo('premier-revenu')
    const thauba = await membre(f, 'Thauba', { arrivee: '2026-11-15' })
    ou(await thauba.client.from('revenu').insert({
      household_id: f.householdId, user_profile_id: thauba.userId,
      net_mensuel_cents: 240_000, valid_from: '2026-12-01' }).select())
    expect(await revenus(thauba.userId)).toEqual(['2026-11-01'])

    // Le suivant prend effet au mois de sa saisie.
    ou(await thauba.client.from('revenu').insert({
      household_id: f.householdId, user_profile_id: thauba.userId,
      net_mensuel_cents: 250_000, valid_from: '2027-01-01' }).select())
    expect(await revenus(thauba.userId)).toEqual(['2026-11-01', '2027-01-01'])
  })

  it('sans passer avant le mois qui suit la dernière clôture du foyer', async () => {
    await regleLHeure('2027-01-05T10:00:00+01:00')
    const f = await foyerSolo('premier-revenu-clos')
    await clos(f, '2026-11-01')
    const elle = await membre(f, 'Elle', { arrivee: '2026-10-10' })
    ou(await elle.client.from('revenu').insert({
      household_id: f.householdId, user_profile_id: elle.userId,
      net_mensuel_cents: 200_000, valid_from: '2027-01-01' }).select())
    expect(await revenus(elle.userId)).toEqual(['2026-12-01'])
  })
})

describe('changer sa date d’arrivée', () => {
  it('ne refige que les mois entre les deux dates', async () => {
    await regleLHeure('2026-11-05T10:00:00+01:00')
    const f = await foyerSolo('entre-le', { revenu: 370_000, depuis: '2026-01-01' })
    const thauba = await membre(f, 'Thauba', { revenu: 240_000, depuis: '2026-01-01' })
    const loyer = await poseCharge(f, { libelle: 'Loyer', cents: 167_853, commun: true,
                                        participants: [f.userId, thauba.userId] })
    await ouvre(f, '2026-10-01')
    // Thauba part le 03/11 : ses parts d'octobre sont un fait, elles restent.
    ou(await admin().from('user_profile').delete().eq('id', thauba.userId).select())
    const avant = (await ligne(loyer, '2026-10-01'))!.depense_part.map(p => p.part_cents).sort()
    expect(avant).toHaveLength(2)

    ou(await f.client.from('user_profile').update({ entre_le: '2026-01-15' })
      .eq('id', f.userId).select())
    const apres = (await ligne(loyer, '2026-10-01'))!.depense_part.map(p => p.part_cents).sort()
    expect(apres, 'octobre a été repartagé sur Kamil seul').toEqual(avant)
  })
})
