/**
 * Un mois clôturé vaut son `reste_cents`, et rien ne le refait.
 *
 * `repartit_les_lignes` ne regarde pas `confirme_le` (0064) : elle donnerait des
 * parts à une ligne qui n'en avait pas, et le mois ne vaudrait plus ce qu'on
 * en a mis de côté.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, type Actor } from './helpers/db'
import { clos, declare, foyerSolo, ligne, membre, ou, ouvre, poseCharge, type Foyer }
  from './helpers/budget'
import { regleLHeure, remetLHeure } from './helpers/horloge'

let f: Foyer
let thauba: Actor
let loyer: string

beforeAll(async () => {
  await regleLHeure('2026-10-15T12:00:00+02:00')
  f = await foyerSolo('gel', { revenu: 370_000, depuis: '2026-01-01' })
  thauba = await membre(f, 'Thauba', { revenu: 240_000, depuis: '2026-01-01' })
  loyer = await poseCharge(f, { libelle: 'Loyer', cents: 100_000, commun: true,
                                participants: [f.userId, thauba.userId] })
})
afterAll(remetLHeure)

const parts = async (charge: string, mois: string) =>
  ((await ligne(charge, mois))?.depense_part ?? [])
    .map(p => `${p.user_profile_id}:${p.part_cents}`).sort()

describe('un mois clôturé ne bouge plus', () => {
  it('rattrape_les_mois ne l’ouvre pas', async () => {
    await clos(f, '2026-03-01')
    ou(await f.client.rpc('rattrape_les_mois'))
    expect(await ligne(loyer, '2026-03-01')).toBeNull()
    expect(await ligne(loyer, '2026-04-01')).not.toBeNull()
  })

  it('un revenu qui change ne le repartage pas ; le mois ouvert, si', async () => {
    await ouvre(f, '2026-09-01')
    await ouvre(f, '2026-10-01')
    await clos(f, '2026-09-01')
    const septembre = await parts(loyer, '2026-09-01')
    const octobre = await parts(loyer, '2026-10-01')
    ou(await admin().from('revenu').insert({
      household_id: f.householdId, user_profile_id: thauba.userId,
      net_mensuel_cents: 380_000, valid_from: '2026-09-01' }).select())
    expect(await parts(loyer, '2026-09-01'), 'septembre clôturé a été repartagé')
      .toEqual(septembre)
    expect(await parts(loyer, '2026-10-01'), 'octobre ouvert n’a pas suivi le revenu')
      .not.toEqual(octobre)
  })

  it('une ligne sans part d’un mois clôturé n’en reçoit pas', async () => {
    const d = ou(await admin().from('depense').insert({
      household_id: f.householdId, charge_id: loyer, mois: '2026-03-01', libelle: 'Loyer',
      montant_cents: 100_000, montant_prevu_cents: 100_000, nature: 'connue',
      source: 'modele', facon: 'fixe' }).select().single()) as { id: string }
    ou(await f.client.rpc('refige_le_mois', { le_mois: '2026-03-01' }))
    await ouvre(f, '2026-03-01')
    const { data } = await admin().from('depense_part').select('part_cents').eq('depense_id', d.id)
    expect(data).toEqual([])
  })

  it('provisions_a_venir ne compte pas un mois clôturé', async () => {
    const taxe = await poseCharge(f, { libelle: 'Taxe', cents: 120_000, mode: 'mis_de_cote',
                                       commun: true, participants: [f.userId, thauba.userId] })
    const avant = Number(ou(await f.client.rpc('provisions_a_venir',
      { la_charge: taxe, annee: 2026 })))
    expect(avant).toBe(30_000)   // octobre, novembre, décembre
    await clos(f, '2026-11-01')
    const apres = Number(ou(await f.client.rpc('provisions_a_venir',
      { la_charge: taxe, annee: 2026 })))
    expect(apres).toBe(20_000)
  })

  it('le refige épargne une ligne orpheline qui a des saisies', async () => {
    const courses = await poseCharge(f, { libelle: 'Courses de Thauba', cents: 20_000,
      mode: 'au_fil', participants: [thauba.userId] })
    const pharmacie = await poseCharge(f, { libelle: 'Pharmacie', cents: 2_000,
      mode: 'au_fil', participants: [thauba.userId] })
    await ouvre(f, '2026-10-01')
    ou(await declare(thauba, (await ligne(courses, '2026-10-01'))!.id, '2026-10-02', 4_500))
    ou(await admin().from('charge_participant').delete()
      .in('charge_id', [courses, pharmacie]).select())
    ou(await f.client.rpc('refige_le_mois', { le_mois: '2026-10-01' }))
    expect(await ligne(courses, '2026-10-01'), 'la ligne et ses saisies sont parties')
      .not.toBeNull()
    expect(await ligne(pharmacie, '2026-10-01')).toBeNull()
  })
})
