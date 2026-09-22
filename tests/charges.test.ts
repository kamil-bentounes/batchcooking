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
let voisin: Actor
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
  voisin = await makeActor('charges-voisin')
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

    /* Dénouer le lien est permis — une régularisation manuelle le fait. Le
       DÉPLACER vers une autre charge, non : c'est ça, l'ancrage. */
    const autre = await poseCharge({ libelle: 'Ailleurs', cents: 100,
                                     periodicite: 'mensuel', participants: [moi.userId] })
    const { error: e2 } = await moi.client.from('depense')
      .update({ charge_id: autre }).eq('id', d!.id)
    expect(e2, 'une dépense a été déplacée vers une autre charge').not.toBeNull()
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

  it('une charge qui a une histoire ne se supprime pas : elle s’archive', async () => {
    /* `on delete set null` avait deux défauts. Il émettait un UPDATE que
       `tg_depense_ancree` refusait — un membre ne pouvait pas supprimer sa
       propre charge, et le test d'origine ne le voyait pas parce qu'il
       supprimait en rôle de service. Et l'unicité étant `nulls distinct`,
       supprimer puis recréer une charge facturait le mois deux fois. */
    const id = await poseCharge({ libelle: 'Éphémère', cents: 1_000,
                                  periodicite: 'mensuel', participants: [moi.userId] })
    await moi.client.rpc('ouvre_le_mois', { le_mois: '2026-08-01' })

    const { error } = await moi.client.from('charge').delete().eq('id', id)
    expect(error, 'une charge avec des dépenses a été supprimée').not.toBeNull()

    // On l'archive : elle cesse d'engendrer, son histoire reste.
    await moi.client.from('charge').update({ archive_le: new Date().toISOString() }).eq('id', id)
    await moi.client.rpc('ouvre_le_mois', { le_mois: '2026-09-01' })

    const { data: apres } = await admin().from('depense').select('mois')
      .eq('household_id', moi.householdId).eq('libelle', 'Éphémère')
    expect(apres!.map(d => d.mois), 'une charge archivée engendre encore')
      .toEqual(['2026-08-01'])
  })

  it('une charge vierge, elle, se supprime sans façon', async () => {
    const id = await poseCharge({ libelle: 'Jamais ouverte', cents: 100,
                                  periodicite: 'mensuel', participants: [moi.userId] })
    const { error } = await moi.client.from('charge').delete().eq('id', id)
    expect(error, 'une charge sans histoire refuse de partir').toBeNull()
  })
})

describe('la clé propre à une charge', () => {
  it('l’emporte sur celle du foyer (« Netflix à 50/50 »)', async () => {
    /* ⚠️ Ce test n'existait pas, et la colonne `charge.cle` n'était JAMAIS lue :
       `ouvre_le_mois` ne consultait que la règle du foyer. Deux charges
       identiques, l'une `moitie` et l'autre non, donnaient exactement le même
       partage — la seule fonctionnalité explicitement demandée était morte. */
    await poseCharge({ libelle: 'Au prorata', cents: 10_000, periodicite: 'mensuel',
                       participants: [moi.userId, elle] })
    await poseCharge({ libelle: 'À la moitié', cents: 10_000, periodicite: 'mensuel',
                       cle: 'moitie', participants: [moi.userId, elle] })
    await moi.client.rpc('ouvre_le_mois', { le_mois: '2026-11-01' })

    const part = async (libelle: string) => {
      const { data: d } = await admin().from('depense').select('id')
        .eq('household_id', moi.householdId).eq('mois', '2026-11-01')
        .eq('libelle', libelle).single()
      const { data: p } = await admin().from('depense_part')
        .select('part_cents').eq('depense_id', d!.id).eq('user_profile_id', moi.userId).single()
      return p!.part_cents
    }

    expect(await part('À la moitié'), 'la clé de la charge est ignorée').toBe(5_000)
    expect(await part('Au prorata'), 'le prorata ne s’applique plus').toBeGreaterThan(5_500)
  })

  it('renormalise vraiment sur les participants, à trois dans le foyer', async () => {
    /* L'ancien test de renormalisation était tautologique : un seul
       participant, donc le centime résiduel lui reversait tout l'écart. En
       remplaçant la renormalisation par une division par 10000, il restait
       vert. À trois membres et deux participants, la faute se voit. */
    const { data: u } = await admin().auth.admin.createUser({
      email: `tiers-${Date.now()}@fumee.test`, password: 'x'.repeat(12), email_confirm: true,
    })
    const tiers = u.user!.id
    await admin().from('user_profile').insert({
      id: tiers, household_id: moi.householdId, display_name: 'Tiers', entre_le: '2026-01-01',
    })
    await admin().from('revenu').insert({
      household_id: moi.householdId, user_profile_id: tiers,
      net_mensuel_cents: 390_000, valid_from: '2026-01-01',
    })

    await poseCharge({ libelle: 'À deux sur trois', cents: 10_000, periodicite: 'mensuel',
                       participants: [moi.userId, elle] })
    await moi.client.rpc('ouvre_le_mois', { le_mois: '2026-12-01' })

    const { data: d } = await admin().from('depense').select('id, montant_cents')
      .eq('household_id', moi.householdId).eq('mois', '2026-12-01')
      .eq('libelle', 'À deux sur trois').single()
    const { data: parts } = await admin().from('depense_part')
      .select('user_profile_id, part_cents, part_bps').eq('depense_id', d!.id)

    expect(parts, 'le tiers paie une charge à laquelle il ne participe pas').toHaveLength(2)
    expect(await sommeDesParts(d!.id), 'les deux parts ne font pas le montant').toBe(10_000)

    /* AU CENTIME, et pas « supérieur à ». Une première version bornait par le
       bas : en remplaçant la renormalisation par une division par 10 000, le
       reliquat reversait tout l'écart au plus gros contributeur et le test
       restait vert — 76,00 € au lieu de 60,66 € passaient tous les deux.
       Les valeurs exactes : 3700 et 2400 points de base sur 6100 de total,
       donc 6065 et 3934 centimes, plus le centime résiduel au premier. */
    const mienne = parts!.find(p => p.user_profile_id === moi.userId)!
    const sienne = parts!.find(p => p.user_profile_id === elle)!
    expect(mienne.part_cents, 'la renormalisation ne se fait pas sur les participants')
      .toBe(6_066)
    expect(sienne.part_cents, 'sa part n’est pas celle de leur duo').toBe(3_934)
    expect(mienne.part_bps, 'le bps figé n’explique pas la part en centimes').toBe(6_065)

    await admin().from('revenu').delete().eq('user_profile_id', tiers)
    await admin().from('user_profile').delete().eq('id', tiers)
  })
})

describe('la somme des parts ne peut pas mentir', () => {
  it('ni en reposant des parts fausses', async () => {
    const { data: d } = await admin().from('depense').select('id, montant_cents')
      .eq('household_id', moi.householdId).eq('mois', '2026-03-01').limit(1).single()

    await moi.client.from('depense_part').delete().eq('depense_id', d!.id)
    const { error } = await moi.client.from('depense_part').insert({
      depense_id: d!.id, user_profile_id: moi.userId,
      household_id: moi.householdId, part_cents: 1, part_bps: 10_000,
    })
    expect(error, 'on a reposé des parts qui ne font pas le montant').not.toBeNull()
  })

  it('ni en changeant le montant sans reposer les parts', async () => {
    const { data: d } = await admin().from('depense').select('id, montant_cents')
      .eq('household_id', moi.householdId).eq('mois', '2026-04-01')
      .eq('libelle', 'Crédit auto').single()
    const { error } = await moi.client.from('depense')
      .update({ montant_cents: 1 }).eq('id', d!.id)
    expect(error, 'le montant a changé en laissant les parts d’avant').not.toBeNull()
  })
})

describe('la régularisation de D62', () => {
  it('peut poser une seconde ligne sur la même charge et le même mois', async () => {
    /* L'unicité `(charge_id, mois)` interdisait toute ligne d'ajustement — la
       régularisation annoncée par D62 était impossible. Elle ne porte plus que
       sur ce que le générateur produit. */
    const { data: d } = await admin().from('depense').select('id, charge_id, mois')
      .eq('household_id', moi.householdId).eq('mois', '2026-05-01')
      .eq('libelle', 'Taxe foncière').single()

    const { data: ajout, error } = await moi.client.from('depense').insert({
      household_id: moi.householdId, charge_id: d!.charge_id, mois: d!.mois,
      libelle: 'Taxe foncière — régularisation', montant_cents: 2_000,
      nature: 'connue', source: 'manuel',
    }).select()
    expect(error, `la régularisation est refusée : ${error?.message}`).toBeNull()
    expect(ajout ?? [], 'aucune ligne de régularisation créée').toHaveLength(1)
  })
})

describe('ce que la relecture finale a trouvé', () => {
  it('ramène une charge trimestrielle au tiers, pas au mois', async () => {
    /* ⚠️ `provision_mensuelle('trimestriel')` n'était couvert par AUCUN test :
       en remplaçant `round(montant/3.0)` par le montant entier, les 728 tests
       restaient verts. La copro à 300 € le trimestre — le cas réel de ce
       foyer — pouvait être facturée 300 € par mois sans que rien ne rougisse. */
    await poseCharge({ libelle: 'Copropriété', cents: 30_000, periodicite: 'trimestriel',
                       participants: [moi.userId] })
    await moi.client.rpc('ouvre_le_mois', { le_mois: '2027-02-01' })

    const { data: d } = await admin().from('depense').select('id, montant_cents')
      .eq('household_id', moi.householdId).eq('mois', '2027-02-01')
      .eq('libelle', 'Copropriété').single()
    expect(d!.montant_cents, '300 € par trimestre font 100 € par mois').toBe(10_000)
    expect(await sommeDesParts(d!.id)).toBe(10_000)
  })

  it('n’engendre rien pour quelqu’un qui n’est pas encore là', async () => {
    /* Le générateur ne vérifiait que l'EXISTENCE d'un participant, pas sa
       PRÉSENCE : une charge dont l'unique participant arrive le mois suivant
       produisait une dépense SANS AUCUNE PART. Elle pesait dans l'enveloppe et
       dans « à confirmer », et personne ne la devait. */
    const { data: u } = await admin().auth.admin.createUser({
      email: `futur-${Date.now()}@fumee.test`, password: 'x'.repeat(12), email_confirm: true,
    })
    const futur = u.user!.id
    await admin().from('user_profile').insert({
      id: futur, household_id: moi.householdId, display_name: 'Futur', entre_le: '2027-10-01',
    })

    await poseCharge({ libelle: 'Pas encore là', cents: 5_000, periodicite: 'mensuel',
                       participants: [futur] })
    await moi.client.rpc('ouvre_le_mois', { le_mois: '2027-03-01' })

    const { data: d } = await admin().from('depense').select('id')
      .eq('household_id', moi.householdId).eq('mois', '2027-03-01')
      .eq('libelle', 'Pas encore là').maybeSingle()
    expect(d, 'une dépense est née sans personne pour la payer').toBeNull()

    await admin().from('user_profile').delete().eq('id', futur)
  })

  it('un compte perso exige un titulaire, un compte commun n’en a pas', async () => {
    const { error: e1 } = await admin().from('compte').insert({
      household_id: moi.householdId, nom: 'Perso sans nom', genre: 'perso',
    })
    expect(e1, 'un compte perso sans titulaire est accepté').not.toBeNull()

    const { error: e2 } = await admin().from('compte').insert({
      household_id: moi.householdId, nom: 'Commun avec titulaire', genre: 'commun',
      titulaire_id: moi.userId,
    })
    expect(e2, 'un compte commun avec titulaire est accepté').not.toBeNull()
  })

  it('un nom de compte se réutilise une fois le compte archivé', async () => {
    const { data: c } = await admin().from('compte').insert({
      household_id: moi.householdId, nom: 'Livret', genre: 'epargne',
    }).select().single()
    await admin().from('compte')
      .update({ archive_le: new Date().toISOString() }).eq('id', c!.id)

    const { error } = await admin().from('compte').insert({
      household_id: moi.householdId, nom: 'Livret', genre: 'epargne',
    })
    expect(error, 'un compte archivé confisque son nom pour toujours').toBeNull()
  })
})

describe('la régularisation annuelle (D62)', () => {
  it('répartit l’écart selon ce que chacun a PORTÉ sur l’année', async () => {
    /* Le cas réel : la taxe foncière provisionnée au douzième toute l'année, le
       relevé qui arrive en septembre. L'écart ne s'impute pas au mois courant
       avec la clé du jour — il se répartit selon ce que chacun a effectivement
       porté, mois par mois. Quelqu'un arrivé en cours d'année ne porte donc que
       ses mois, sans qu'aucune règle de date soit écrite. */
    const id = await poseCharge({ libelle: 'Foncier 2028', cents: 120_000,
                                  periodicite: 'annuel', participants: [moi.userId, elle] })
    for (const m of ['2028-01-01', '2028-02-01', '2028-03-01']) {
      await moi.client.rpc('ouvre_le_mois', { le_mois: m })
    }

    const { data: prov } = await admin().from('depense')
      .select('montant_cents').eq('charge_id', id).eq('source', 'modele')
    const provisionne = prov!.reduce((s, d) => s + d.montant_cents, 0)
    expect(provisionne, 'trois mois au douzième').toBe(3 * 10_000)

    // Le vrai montant : 340 € pour ces trois mois au lieu de 300.
    const { data: ligne, error } = await moi.client.rpc('regularise_annuel', {
      la_charge: id, annee: 2028, reel_cents: 34_000,
    })
    expect(error, `régularisation refusée : ${error?.message}`).toBeNull()
    expect(ligne, 'aucune ligne d’ajustement créée').not.toBeNull()

    const { data: parts } = await admin().from('depense_part')
      .select('user_profile_id, part_cents').eq('depense_id', ligne!)
    const total = parts!.reduce((s, p) => s + p.part_cents, 0)
    expect(total, 'l’écart ne se recompose pas').toBe(4_000)

    // Et la répartition suit les parts de l'année, pas une clé fraîche.
    const mienne = parts!.find(p => p.user_profile_id === moi.userId)!
    expect(mienne.part_cents, 'le plus gros contributeur porte le plus gros écart')
      .toBeGreaterThan(parts!.find(p => p.user_profile_id === elle)!.part_cents)

    // Les provisions cessent d'être des estimations.
    const { data: apres } = await admin().from('depense')
      .select('nature').eq('charge_id', id).eq('source', 'modele')
    expect(apres!.every(d => d.nature === 'connue'),
      'les provisions restent des estimations après le relevé').toBe(true)
  })

  it('sait rendre de l’argent quand on a trop provisionné', async () => {
    /* Une dépense NÉGATIVE est un remboursement, pas une anomalie : une année
       douce, l'énergie provisionnée dépasse l'énergie payée. L'interdire
       obligeait à écraser la ligne du mois, donc à perdre la trace de ce qui
       avait été prévu. */
    const id = await poseCharge({ libelle: 'Énergie 2028', cents: 60_000,
                                  periodicite: 'annuel', participants: [moi.userId] })
    await moi.client.rpc('ouvre_le_mois', { le_mois: '2028-04-01' })

    const { data: ligne } = await moi.client.rpc('regularise_annuel', {
      la_charge: id, annee: 2028, reel_cents: 3_000,
    })
    const { data: d } = await admin().from('depense')
      .select('montant_cents').eq('id', ligne!).single()
    expect(d!.montant_cents, 'un trop-perçu ne se rend pas').toBe(-2_000)

    const { data: parts } = await admin().from('depense_part')
      .select('part_cents').eq('depense_id', ligne!)
    expect(parts!.reduce((s, p) => s + p.part_cents, 0),
      'les parts d’un remboursement ne le recomposent pas').toBe(-2_000)
  })

  it('ne pose rien quand le relevé tombe juste', async () => {
    const id = await poseCharge({ libelle: 'Juste 2028', cents: 120_000,
                                  periodicite: 'annuel', participants: [moi.userId] })
    await moi.client.rpc('ouvre_le_mois', { le_mois: '2028-05-01' })
    const { data: ligne } = await moi.client.rpc('regularise_annuel', {
      la_charge: id, annee: 2028, reel_cents: 10_000,
    })
    expect(ligne, 'une ligne d’ajustement à zéro a été créée').toBeNull()
  })

  it('le voisin ne régularise pas une charge qui n’est pas la sienne', async () => {
    const { data: sienne } = await admin().from('charge').insert({
      household_id: voisin.householdId, libelle: 'Chez le voisin',
      montant_cents: 1_000, periodicite: 'annuel', debut: '2028-01-01',
    }).select().single()

    const { error } = await moi.client.rpc('regularise_annuel', {
      la_charge: sienne!.id, annee: 2028, reel_cents: 99_999,
    })
    expect(error, 'on régularise la charge du foyer d’à côté').not.toBeNull()
  })
})
