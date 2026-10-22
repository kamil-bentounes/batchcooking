/**
 * On ne retire pas de l'épargne plus que ce qu'on y a versé.
 *
 * Trouvé au grand test : « Je retire 100 000 € » sur 380 € versés laissait la poche à
 * −99 620 €. L'écran le refuse ; la base, elle, ne l'empêchait pas : un appel REST direct
 * passait.
 */
import { describe, expect, it } from 'vitest'
import { admin } from './helpers/db'
import { foyerSolo, membre, ou } from './helpers/budget'

async function unePoche(foyerId: string) {
  return (ou(await admin().from('poche_epargne').insert({
    household_id: foyerId, libelle: 'Urgence', genre: 'urgence' }).select().single()) as { id: string }).id
}
const ecrit = (f: { client: ReturnType<typeof admin>; householdId: string }, uid: string,
               poche: string, cents: number, motif: string) =>
  f.client.from('versement_epargne').insert({
    household_id: f.householdId, poche_id: poche, user_profile_id: uid, montant_cents: cents, motif })
const solde = async (poche: string, uid: string) =>
  ((ou(await admin().from('versement_epargne').select('montant_cents')
    .eq('poche_id', poche).eq('user_profile_id', uid)) as { montant_cents: number }[])
    .reduce((s, v) => s + v.montant_cents, 0))

describe('le plancher de l’épargne', () => {
  it('un retrait va jusqu’au dernier centime versé, jamais au-delà', async () => {
    const f = await foyerSolo('plancher-solo')
    const poche = await unePoche(f.householdId)
    ou(await ecrit(f, f.userId, poche, 38_000, 'mensuel').select())
    ou(await ecrit(f, f.userId, poche, -3_000, 'retrait').select())
    const { error } = await ecrit(f, f.userId, poche, -35_001, 'retrait')
    expect(error?.message, 'un retrait de trop est passé').toBe(
      'Tu n’as versé que 350 € ici : tu ne peux pas en retirer plus.')
    expect(await solde(poche, f.userId), 'le refus a laissé une trace').toBe(35_000)
    ou(await ecrit(f, f.userId, poche, -35_000, 'retrait').select())
    expect(await solde(poche, f.userId)).toBe(0)
    expect((await ecrit(f, f.userId, poche, -1, 'retrait')).error, 'un centime sous zéro').not.toBeNull()
  })

  it('l’argent d’un autre n’est pas le sien, et la clé de service n’y échappe pas', async () => {
    const f = await foyerSolo('plancher-duo')
    const thauba = await membre(f, 'Thauba', { revenu: 200_000 })
    const poche = await unePoche(f.householdId)
    ou(await ecrit(f, f.userId, poche, 38_000, 'mensuel').select())
    // Kamil a versé 380 € : Thauba, qui n'a rien versé, ne retire rien.
    const sienne = await ecrit({ client: thauba.client, householdId: f.householdId },
                               thauba.userId, poche, -100, 'retrait')
    expect(sienne.error, 'Thauba a retiré l’argent de Kamil').not.toBeNull()
    const service = await admin().from('versement_epargne').insert({
      household_id: f.householdId, poche_id: poche, user_profile_id: f.userId,
      montant_cents: -10_000_000, motif: 'retrait' })
    expect(service.error, 'la clé de service a creusé la poche').not.toBeNull()
    expect(await solde(poche, f.userId)).toBe(38_000)
  })

  it('un versement positif passe toujours, même sur un solde hérité négatif', async () => {
    const f = await foyerSolo('plancher-herite')
    const poche = await unePoche(f.householdId)
    // Un solde négatif d'avant le plancher : posé en désactivant le déclencheur le temps d'une écriture.
    const c = await (await import('./helpers/pg')).connexion()
    try {
      await c.query('alter table public.versement_epargne disable trigger tg_versement_plancher')
      await c.query(`insert into public.versement_epargne
        (household_id, poche_id, user_profile_id, montant_cents, motif) values ($1,$2,$3,-500,'retrait')`,
        [f.householdId, poche, f.userId])
    } finally {
      await c.query('alter table public.versement_epargne enable trigger tg_versement_plancher')
      await c.end()
    }
    ou(await ecrit(f, f.userId, poche, 1_000, 'mensuel').select())
    expect(await solde(poche, f.userId)).toBe(500)
  })
})
