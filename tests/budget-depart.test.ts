/**
 * Le départ d'un membre : le détail part, le total reste.
 *
 * Sans cela, après le départ de Thauba, Kamil lisait encore chacun de ses achats
 * « Pharmacie », datés et chiffrés.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { admin } from './helpers/db'
import { connexion, enProprietaire } from './helpers/pg'
import { ajustements, clore, clos, declare, foyerDOctobre, foyerSolo, ligne, membre, ou, ouvre,
         ouvreLAnnee, poseCharge } from './helpers/budget'
import { regleLHeure, remetLHeure } from './helpers/horloge'

beforeAll(() => regleLHeure('2026-11-10T12:00:00+01:00'))
afterAll(remetLHeure)

describe('un membre part, le foyer reste', () => {
  it('ses saisies perso partent, mois clôturés compris ; les montants et ses versements restent',
    async () => {
      const f = await foyerSolo('dep-thauba', { revenu: 300_000 })
      const thauba = await membre(f, 'Thauba', { revenu: 300_000 })
      const pharmacie = await poseCharge(f, { libelle: 'Pharmacie', cents: 2_000, mode: 'au_fil',
                                              participants: [thauba.userId] })
      const courses = await poseCharge(f, { libelle: 'Courses', cents: 80_000, mode: 'au_fil',
        commun: true, participants: [f.userId, thauba.userId] })
      await ouvre(f, '2026-09-01')
      await ouvre(f, '2026-10-01')
      ou(await declare(thauba, (await ligne(pharmacie, '2026-09-01'))!.id, '2026-09-12', 1_200))
      ou(await declare(thauba, (await ligne(pharmacie, '2026-10-01'))!.id, '2026-10-03', 800))
      ou(await declare(thauba, (await ligne(courses, '2026-10-01'))!.id, '2026-10-05', 5_000))
      await clos(f, '2026-09-01')
      // Ses deux comptes perso, l'un archivé : c'est l'état de Kamil en prod.
      ou(await admin().from('compte').insert([
        { household_id: f.householdId, nom: 'CA de Thauba', genre: 'perso', titulaire_id: thauba.userId },
        { household_id: f.householdId, nom: 'Ancien CA', genre: 'perso', titulaire_id: thauba.userId,
          archive_le: '2026-06-01T00:00:00Z' },
      ]).select())
      // Son choix de clôture de septembre, et son versement.
      const poche = ou(await admin().from('poche_epargne').insert({
        household_id: f.householdId, libelle: 'Urgence', genre: 'urgence' }).select().single()) as { id: string }
      const v = ou(await admin().from('versement_epargne').insert({
        household_id: f.householdId, poche_id: poche.id, user_profile_id: thauba.userId,
        montant_cents: 10_000, motif: 'balayage' }).select().single()) as { id: string }
      const k = ou(await admin().from('cloture').select('id').eq('household_id', f.householdId)
        .eq('mois', '2026-09-01').single()) as { id: string }
      ou(await admin().from('cloture_choix').insert({
        cloture_id: k.id, household_id: f.householdId, user_profile_id: thauba.userId,
        reste_cents: 50_000, mis_de_cote_cents: 10_000, poche_id: poche.id, versement_id: v.id,
      }).select())

      const total = async () => (ou(await admin().from('depense').select('montant_cents')
        .eq('household_id', f.householdId)) as { montant_cents: number }[])
        .reduce((s, l) => s + l.montant_cents, 0)
      const avant = await total()

      const { error } = await thauba.client.rpc('delete_my_account')
      expect(error, `départ refusé : ${error?.message}`).toBeNull()
      // Le départ n'efface ni ne crée un centime sur les lignes : seul le détail part.
      expect(await total(), 'un centime perdu ou créé par le départ').toBe(avant)

      for (const m of ['2026-09-01', '2026-10-01']) {
        const l = (await ligne(pharmacie, m))!
        expect((await admin().from('saisie').select('id').eq('depense_id', l.id)).data,
          `ses achats de ${m} se lisent encore`).toEqual([])
      }
      expect((await ligne(pharmacie, '2026-09-01'))!.montant_cents).toBe(2_000)
      const { data: partagee } = await admin().from('saisie').select('saisi_par, montant_cents')
        .eq('depense_id', (await ligne(courses, '2026-10-01'))!.id)
      expect(partagee).toEqual([{ saisi_par: null, montant_cents: 5_000 }])
      /* Les parts de la ligne gelée restent (`depense_part` n'a aucune clé vers
         le profil) : elles font encore 10 000 pb, donc la part de Kamil ne grossit
         pas du départ de Thauba et aucun centime de Courses n'est créé ni perdu. */
      const { data: parts } = await admin().from('depense_part').select('part_bps')
        .eq('depense_id', (await ligne(courses, '2026-10-01'))!.id)
      expect(parts!.reduce((s, p) => s + p.part_bps, 0), 'les parts ne font plus 100 %')
        .toBe(10_000)
      const { data: choix } = await admin().from('cloture_choix')
        .select('reste_cents, versement_id').eq('user_profile_id', thauba.userId)
      expect(choix).toEqual([{ reste_cents: null, versement_id: v.id }])
      expect((await admin().from('compte').select('id').eq('titulaire_id', thauba.userId)).data)
        .toEqual([])
    })

  it('le départ du seul membre qui avait un revenu recale les années ouvertes', async () => {
    const f = await foyerSolo('dep-recale', { revenu: null })
    const thauba = await membre(f, 'Thauba', { arrivee: '2026-09-01', revenu: 240_000 })
    const entretien = await poseCharge(f, { libelle: 'Entretien auto', cents: 50_004,
      mode: 'mis_de_cote', commun: true, participants: [f.userId, thauba.userId] })
    await ouvreLAnnee(f, entretien, 2026)
    ou(await f.client.rpc('paie_une_facture', { la_facture: randomUUID(), la_charge: entretien,
                                                montant_cents: 32_000, paye_le: '2026-11-10' }))
    expect((await ajustements(entretien)).map(l => l.montant_cents)).toEqual([15_332])
    ou(await thauba.client.rpc('delete_my_account'))
    // Plus aucun revenu : plus aucun mois suivi, Pl = 0, toute la facture compte.
    expect((await ajustements(entretien)).map(l => l.montant_cents)).toEqual([15_332, 16_668])
  })
})

/**
 * Une charge perso annuelle de Thauba, dont elle a porté septembre et octobre
 * (2 × 41,67 € = 83,34 €), puis qui part. Ce qu'elle avait mis de côté est parti
 * avec elle : `recale_l_annee` ne le rend pas à Kamil. Mais ce que Kamil a posé
 * LUI-MÊME après son départ lui revient, retirer sa facture comprise.
 */
describe('une charge perso de la membre partie', () => {
  let c: pg.Client
  beforeAll(async () => { c = await connexion() })
  afterAll(async () => { await c.end() })

  async function sansThauba(nom: string) {
    const f = await foyerSolo(nom, { revenu: 300_000 })
    const thauba = await membre(f, 'Thauba', { arrivee: '2026-09-01', revenu: 300_000 })
    const entretien = await poseCharge(f, { libelle: 'Entretien perso', cents: 50_004,
      mode: 'mis_de_cote', participants: [thauba.userId] })
    for (const m of ['2026-09-01', '2026-10-01']) {
      ou(await f.client.rpc('ouvre_la_charge', { la_charge: entretien, foyer: f.householdId,
                                                 le_mois: m }))
    }
    ou(await thauba.client.rpc('delete_my_account'))
    return { f, entretien }
  }
  const somme = async (charge: string) =>
    (await ajustements(charge)).reduce((s, l) => s + l.montant_cents, 0)

  it('la facture de Kamil se pose sur lui, et la retirer la rend : rien ne reste sur novembre',
    async () => {
      const { f, entretien } = await sansThauba('dep-facture-retiree')
      const la = randomUUID()
      ou(await f.client.rpc('paie_une_facture', { la_facture: la, la_charge: entretien,
                                                  montant_cents: 20_000, paye_le: '2026-11-10' }))
      // 200 € moins les 83,34 € que Thauba avait mis de côté, sur Kamil seul.
      expect((await ajustements(entretien)).map(l => [l.mois, l.montant_cents]))
        .toEqual([['2026-11-01', 11_666]])
      ou(await f.client.rpc('retire_une_facture', { la_facture: la }))
      expect(await somme(entretien), 'les 116,66 € de Kamil sont restés sur novembre').toBe(0)
    })

  it('corriger le relevé à la baisse, après le départ, ne laisse rien non plus', async () => {
    const { f, entretien } = await sansThauba('dep-releve-corrige')
    const la = randomUUID()
    ou(await admin().from('releve_annuel').insert({
      household_id: f.householdId, charge_id: entretien, annee: 2026, reel_cents: 20_000,
      prevu_cents: 8_334, ecart_cents: 11_666, saisi_par: f.userId }).select())
    ou(await admin().from('facture').insert({
      id: la, household_id: f.householdId, charge_id: entretien, annee: 2026,
      paye_le: '2026-11-10', montant_cents: 20_000, origine: 'releve', saisi_par: f.userId }).select())
    ou(await f.client.rpc('corrige_le_releve', { la_facture: la, montant_cents: 20_000 }))
    expect(await somme(entretien)).toBe(11_666)
    ou(await f.client.rpc('corrige_le_releve', { la_facture: la, montant_cents: 8_334 }))
    expect(await somme(entretien), 'la correction n’a pas rendu l’écart à Kamil').toBe(0)
  })

  it('le solde de décembre ne rend pas à Kamil ce que Thauba avait mis de côté', async () => {
    const { f, entretien } = await sansThauba('dep-solde-sans-rendre')
    await enProprietaire(c, f.userId)
    try {
      await c.query('select public.solde_l_annee($1, $2, $3)', [entretien, 2026, '2026-12-01'])
      await c.query('commit')
    } catch (e) { await c.query('rollback'); throw e }
    expect(await ajustements(entretien), 'Kamil a reçu 83,34 € qu’il n’avait pas mis de côté')
      .toEqual([])
    const { data: r } = await admin().from('releve_annuel').select('reel_cents, prevu_cents')
      .eq('charge_id', entretien).eq('annee', 2026)
    expect(r).toEqual([{ reel_cents: 0, prevu_cents: 8_334 }])
  })
})

describe('le dernier membre part', () => {
  it('passe avec des saisies dans un mois clôturé, une facture et ses comptes perso', async () => {
    const { f, id, poche } = await foyerDOctobre('dep-dernier')
    ou(await declare(f, (await ligne(id.courses, '2026-10-01'))!.id, '2026-10-04', 6_000))
    ou(await f.client.rpc('paie_une_facture', { la_facture: randomUUID(), la_charge: id.entretien,
                                                montant_cents: 32_000, paye_le: '2026-11-10' }))
    ou(await clore(f, { poche }))
    ou(await admin().from('compte').insert([
      { household_id: f.householdId, nom: 'Mon CA', genre: 'perso', titulaire_id: f.userId },
      { household_id: f.householdId, nom: 'Vieux CA', genre: 'perso', titulaire_id: f.userId,
        archive_le: '2026-06-01T00:00:00Z' },
    ]).select())
    const { error } = await f.client.rpc('delete_my_account')
    expect(error, `départ refusé : ${error?.message}`).toBeNull()
    expect((await admin().from('household').select('id').eq('id', f.householdId)).data).toEqual([])
  })
})
