/**
 * Le départ d'un membre : le détail part, le total reste.
 *
 * Sans cela, après le départ de Thauba, Kamil lisait encore chacun de ses achats
 * « Pharmacie », datés et chiffrés.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin } from './helpers/db'
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
