/**
 * Les charges, et les dépenses qu'elles engendrent.
 *
 * Deux inventions à vérifier plutôt qu'à croire :
 *
 *  · l'ouverture d'un mois est IDEMPOTENTE. Il n'y a pas de `pg_cron` ici, donc
 *    elle est paresseuse : le premier qui ouvre l'app le 1er la déclenche. Si
 *    elle n'était pas idempotente, chaque visite ajouterait un jeu de dépenses.
 *  · la somme des parts figées recompose EXACTEMENT le montant. C'est tout
 *    l'intérêt des centimes entiers ; un budget dont les parts ne se
 *    recomposent pas est abandonné au troisième mois.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, makeActor, type Actor } from './helpers/db'

let moi: Actor
let elle: string
let compteCommun: string

/** Le total des parts d'une dépense, en centimes. */
async function sommeDesParts(depenseId: string): Promise<number> {
  const { data } = await admin().from('depense_part')
    .select('part_cents').eq('depense_id', depenseId)
  return (data ?? []).reduce((s, p) => s + p.part_cents, 0)
}

async function poseCharge(o: {
  libelle: string; cents: number; periodicite: string; participants: string[]
  cle?: string | null
}): Promise<string> {
  const { data: c, error } = await admin().from('charge').insert({
    household_id: moi.householdId, libelle: o.libelle, montant_cents: o.cents,
    periodicite: o.periodicite, cle: o.cle ?? null, compte_id: compteCommun,
    debut: '2026-01-01',
  }).select().single()
  expect(error, `charge refusée : ${error?.message}`).toBeNull()
  await admin().from('charge_participant').insert(
    o.participants.map(u => ({
      charge_id: c!.id, user_profile_id: u, household_id: moi.householdId,
    })))
  return c!.id
}

beforeAll(async () => {
  moi = await makeActor('charges')
  const { data } = await admin().auth.admin.createUser({
    email: `elle-ch-${Date.now()}@fumee.test`, password: 'x'.repeat(12), email_confirm: true,
  })
  elle = data.user!.id
  await admin().from('user_profile').insert({
    id: elle, household_id: moi.householdId, display_name: 'Elle',
  })
  await admin().from('user_profile')
    .update({ entre_le: '2026-01-01' }).in('id', [moi.userId, elle])

  // 3 700 / 2 400 → 60,65 / 39,34, soit 6066 / 3934 points de base.
  await admin().from('revenu').insert([
    { household_id: moi.householdId, user_profile_id: moi.userId,
      net_mensuel_cents: 370_000, valid_from: '2026-01-01' },
    { household_id: moi.householdId, user_profile_id: elle,
      net_mensuel_cents: 240_000, valid_from: '2026-01-01' },
  ])

  const { data: cpt } = await admin().from('compte').insert({
    household_id: moi.householdId, nom: 'Commun', genre: 'commun', matelas_cents: 100_000,
  }).select().single()
  compteCommun = cpt!.id
})

describe('l’ouverture d’un mois', () => {
  it('engendre une dépense par charge active, et fige les parts au centime', async () => {
    await poseCharge({ libelle: 'Internet', cents: 3_700, periodicite: 'mensuel',
                       participants: [moi.userId, elle] })

    const { data: nees, error } = await moi.client.rpc('ouvre_le_mois', { le_mois: '2026-03-01' })
    expect(error, `ouverture refusée : ${error?.message}`).toBeNull()
    expect(nees, 'aucune dépense engendrée').toBeGreaterThan(0)

    const { data: d } = await admin().from('depense')
      .select('id, montant_cents, mois, nature, source')
      .eq('household_id', moi.householdId).eq('mois', '2026-03-01').single()
    expect(d!.montant_cents, 'une charge mensuelle vaut son montant').toBe(3_700)
    expect(d!.source).toBe('modele')

    expect(await sommeDesParts(d!.id),
      'la somme des parts ne recompose pas le montant').toBe(3_700)

    const { data: parts } = await admin().from('depense_part')
      .select('user_profile_id, part_cents, part_bps').eq('depense_id', d!.id)
    const mienne = parts!.find(p => p.user_profile_id === moi.userId)!
    expect(mienne.part_cents, 'le plus gros revenu porte la plus grosse part')
      .toBeGreaterThan(parts!.find(p => p.user_profile_id === elle)!.part_cents)
    expect(mienne.part_bps).toBeGreaterThanOrEqual(6060)
  })

  it('ne double rien quand on la relance — l’ouverture est paresseuse', async () => {
    const avant = await admin().from('depense')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', moi.householdId).eq('mois', '2026-03-01')

    for (let i = 0; i < 3; i++) {
      await moi.client.rpc('ouvre_le_mois', { le_mois: '2026-03-01' })
    }

    const apres = await admin().from('depense')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', moi.householdId).eq('mois', '2026-03-01')
    expect(apres.count, 'rouvrir le mois a dupliqué les dépenses').toBe(avant.count)
  })

  it('donne tout à celui qui paie seul, pas sa part de foyer', async () => {
    // Le piège : les participants d'une charge ne sont pas tout le foyer, donc
    // leurs parts ne font pas 10 000 à elles seules. Sans renormalisation, un
    // payeur unique ne se verrait attribuer que 60 % de ce qu'il paie en entier.
    await poseCharge({ libelle: 'Crédit auto', cents: 25_000, periodicite: 'mensuel',
                       participants: [moi.userId] })
    await moi.client.rpc('ouvre_le_mois', { le_mois: '2026-04-01' })

    const { data: d } = await admin().from('depense').select('id, montant_cents')
      .eq('household_id', moi.householdId).eq('mois', '2026-04-01')
      .eq('libelle', 'Crédit auto').single()
    const { data: parts } = await admin().from('depense_part')
      .select('user_profile_id, part_cents').eq('depense_id', d!.id)

    expect(parts, 'une charge à un seul participant en a produit plusieurs').toHaveLength(1)
    expect(parts![0].part_cents, 'il ne porte pas la totalité de ce qu’il paie seul')
      .toBe(25_000)
  })

  it('ramène une charge annuelle au douzième (D61)', async () => {
    // 1450 € de taxe foncière, ce n'est pas « une dépense en octobre ».
    await poseCharge({ libelle: 'Taxe foncière', cents: 145_000, periodicite: 'annuel',
                       participants: [moi.userId, elle] })
    await moi.client.rpc('ouvre_le_mois', { le_mois: '2026-05-01' })

    const { data: d } = await admin().from('depense').select('id, montant_cents')
      .eq('household_id', moi.householdId).eq('mois', '2026-05-01')
      .eq('libelle', 'Taxe foncière').single()
    expect(d!.montant_cents, '1450 € par an font 120,83 € par mois').toBe(12_083)
    expect(await sommeDesParts(d!.id), 'les parts ne recomposent pas le douzième')
      .toBe(12_083)
  })

  it('ignore quelqu’un qui n’était pas encore là (D71)', async () => {
    await admin().from('user_profile').update({ entre_le: '2026-10-01' }).eq('id', elle)
    await poseCharge({ libelle: 'Électricité', cents: 5_000, periodicite: 'mensuel',
                       participants: [moi.userId, elle] })
    await moi.client.rpc('ouvre_le_mois', { le_mois: '2026-06-01' })

    const { data: d } = await admin().from('depense').select('id')
      .eq('household_id', moi.householdId).eq('mois', '2026-06-01')
      .eq('libelle', 'Électricité').single()
    const { data: parts } = await admin().from('depense_part')
      .select('user_profile_id, part_cents').eq('depense_id', d!.id)

    expect(parts, 'elle paie un mois où elle n’habitait pas là').toHaveLength(1)
    expect(parts![0].user_profile_id).toBe(moi.userId)
    expect(parts![0].part_cents).toBe(5_000)

    await admin().from('user_profile').update({ entre_le: '2026-01-01' }).eq('id', elle)
  })

  it('un montant impair se partage sans perdre le centime', async () => {
    // 10,25 € en 50/50 : 5,125 chacun. Deux parts arrondies feraient 10,26.
    await admin().from('regle_partage').insert({
      household_id: moi.householdId, cle: 'moitie', valid_from: '2026-01-01',
    })
    await poseCharge({ libelle: 'Impair', cents: 1_025, periodicite: 'mensuel',
                       participants: [moi.userId, elle] })
    await moi.client.rpc('ouvre_le_mois', { le_mois: '2026-07-01' })

    const { data: d } = await admin().from('depense').select('id')
      .eq('household_id', moi.householdId).eq('mois', '2026-07-01')
      .eq('libelle', 'Impair').single()
    expect(await sommeDesParts(d!.id), 'le centime s’est perdu ou dupliqué').toBe(1_025)

    await admin().from('regle_partage')
      .delete().eq('household_id', moi.householdId).eq('cle', 'moitie')
  })
})

describe('ce qui ne change pas', () => {
  it('une dépense ne change ni de mois ni de charge', async () => {
    const { data: d } = await admin().from('depense').select('id, mois, charge_id')
      .eq('household_id', moi.householdId).eq('mois', '2026-03-01').limit(1).single()

    const { error: e1 } = await moi.client.from('depense')
      .update({ mois: '2026-02-01' }).eq('id', d!.id)
    expect(e1, 'une dépense a changé de mois').not.toBeNull()

    const { error: e2 } = await moi.client.from('depense')
      .update({ charge_id: null }).eq('id', d!.id)
    expect(e2, 'une dépense a changé de charge').not.toBeNull()
  })

  it('une part figée ne se retouche pas', async () => {
    /* ⚠️ Cadré sur MON foyer. Sans `.eq('household_id', …)`, ce select prenait
       une part au hasard dans toute la base — parfois celle d'un autre foyer,
       où la RLS refuse en silence (`error: null`, zéro ligne). Le test passait
       seul et échouait dans la suite, ce qui est la pire des deux façons. */
    const { data: p } = await admin().from('depense_part')
      .select('depense_id, user_profile_id, part_cents')
      .eq('household_id', moi.householdId).limit(1).single()
    const { error } = await moi.client.from('depense_part')
      .update({ part_cents: 1 })
      .eq('depense_id', p!.depense_id).eq('user_profile_id', p!.user_profile_id)
    expect(error, 'une part figée a été retouchée').not.toBeNull()
  })

  it('l’historique survit à la suppression de sa charge', async () => {
    // On supprime une charge quand elle cesse d'exister, pas pour effacer ce
    // qu'elle a coûté : `on delete set null`, jamais `cascade`.
    const id = await poseCharge({ libelle: 'Éphémère', cents: 1_000,
                                  periodicite: 'mensuel', participants: [moi.userId] })
    await moi.client.rpc('ouvre_le_mois', { le_mois: '2026-08-01' })
    await admin().from('charge').delete().eq('id', id)

    const { data: d } = await admin().from('depense').select('id, charge_id, libelle')
      .eq('household_id', moi.householdId).eq('libelle', 'Éphémère').single()
    expect(d, 'la dépense a disparu avec sa charge').not.toBeNull()
    expect(d!.charge_id, 'le lien n’a pas été dénoué').toBeNull()
  })
})
