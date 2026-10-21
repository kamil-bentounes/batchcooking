/**
 * Ce qu'une dépense au fil du mois peut, et ce qu'elle ne peut pas.
 *
 * Chaque refus porte une phrase en français que l'écran affiche telle quelle.
 * Et ce que mène une clé étrangère passe toujours : sans cela, « Retirer »
 * échouait en pleine cascade, et `delete_my_account` sur un mois clôturé.
 */
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, type Actor } from './helpers/db'
import { clos, declare, foyerSolo, ligne, membre, ou, ouvre, poseCharge, type Foyer }
  from './helpers/budget'

let f: Foyer
let thauba: Actor
let voisin: Foyer
let courses: string
let internet: string
const lignes: Record<string, string> = {}

beforeAll(async () => {
  f = await foyerSolo('saisies')
  thauba = await membre(f, 'Thauba')
  voisin = await foyerSolo('saisies-voisin')
  courses = await poseCharge(f, { libelle: 'Courses', cents: 80_000, mode: 'au_fil',
                                  commun: true, participants: [f.userId, thauba.userId] })
  internet = await poseCharge(f, { libelle: 'Internet', cents: 3_700 })
  for (const m of ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']) {
    await ouvre(f, m)
    lignes[m] = (await ligne(courses, m))!.id
  }
})

describe('la garde des saisies', () => {
  it('une suppression ordinaire passe VRAIMENT', async () => {
    const id = randomUUID()
    ou(await declare(f, lignes['2026-10-01'], '2026-10-03', 4_790, id))
    ou(await f.client.from('saisie').delete().eq('id', id).select())
    const { data } = await admin().from('saisie').select('id').eq('id', id)
    expect(data, 'la suppression a été annulée en silence').toEqual([])
  })

  it('refuse une ligne qui n’est pas au fil du mois, même si sa charge l’est devenue', async () => {
    await ouvre(f, '2026-10-01')
    const l = (await ligne(internet, '2026-10-01'))!.id
    expect((await declare(f, l, '2026-10-03', 1_000)).error?.message).toMatch(/au fil du mois/)
    ou(await admin().from('charge').update({ mode: 'au_fil' }).eq('id', internet).select())
    expect((await declare(f, l, '2026-10-03', 1_000)).error?.message,
      'la garde a lu la façon de la charge au lieu de celle de la ligne').toMatch(/au fil du mois/)
  })

  it('refuse une dépense sans ligne, ou datée hors du mois de sa ligne', async () => {
    expect((await declare(f, randomUUID(), '2026-10-03', 1_000)).error).not.toBeNull()
    expect((await declare(f, lignes['2026-10-01'], '2026-09-30', 1_000)).error?.message)
      .toMatch(/mois de sa ligne/)
  })

  it('refuse un mois clôturé, à l’insertion, à la modification et à la suppression', async () => {
    const id = randomUUID()
    ou(await declare(f, lignes['2026-09-01'], '2026-09-12', 2_000, id))
    await clos(f, '2026-09-01')
    expect((await declare(f, lignes['2026-09-01'], '2026-09-13', 500)).error?.message)
      .toMatch(/Septembre est clôturé/)
    expect((await f.client.from('saisie').update({ montant_cents: 2_500 }).eq('id', id).select())
      .error?.message).toMatch(/clôturé/)
    expect((await f.client.from('saisie').delete().eq('id', id).select()).error?.message)
      .toMatch(/clôturé/)
  })

  it('un second envoi du même id ne crée rien, même après la clôture du mois', async () => {
    const id = randomUUID()
    ou(await declare(f, lignes['2026-08-01'], '2026-08-20', 3_000, id))
    await clos(f, '2026-08-01')
    const r = await declare(f, lignes['2026-08-01'], '2026-08-20', 3_000, id)
    expect(r.error?.code, 'le renvoi est refusé comme « mois clôturé »').toBe('23505')
    const { data } = await admin().from('saisie').select('id').eq('id', id)
    expect(data).toHaveLength(1)
  })

  it('l’auteur ne se change pas, et ne s’efface pas tant que son compte existe', async () => {
    const id = randomUUID()
    ou(await declare(thauba, lignes['2026-10-01'], '2026-10-04', 1_200, id))
    for (const auteur of [null, f.userId]) {
      const { error } = await f.client.from('saisie').update({ saisi_par: auteur })
        .eq('id', id).select()
      expect(error?.message, `saisi_par → ${auteur}`).toMatch(/auteur/)
    }
    // D80 : le foyer voit tout, et qui l'a saisie.
    const { data } = await f.client.from('saisie').select('saisi_par').eq('id', id).single()
    expect(data!.saisi_par).toBe(thauba.userId)
  })

  it('le total d’une ligne ne dépasse pas 1 000 000 €', async () => {
    ou(await declare(f, lignes['2026-11-01'], '2026-11-02', 99_999_999))
    expect((await declare(f, lignes['2026-11-01'], '2026-11-02', 2)).error?.message)
      .toMatch(/million/)
  })

  it('le voisin n’écrit pas sur notre ligne', async () => {
    expect((await declare(voisin, lignes['2026-10-01'], '2026-10-05', 1_000)).error).not.toBeNull()
  })

  it('la cascade passe, même sur un mois clôturé', async () => {
    const { error } = await admin().from('depense').delete().eq('id', lignes['2026-09-01'])
    expect(error, `la cascade a été refusée : ${error?.message}`).toBeNull()
    const { data } = await admin().from('saisie').select('id').eq('depense_id', lignes['2026-09-01'])
    expect(data).toEqual([])
  })
})
