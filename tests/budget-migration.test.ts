/**
 * La migration des données de prod (§ 5), rejouée sur une copie.
 *
 * Ne tourne QUE derrière `scripts/banc-migration-budget.sh`, qui remet la base à
 * la veille du budget refait, y charge la copie de la prod, puis applique les
 * migrations. Sans lui, la base n'a pas la copie : le banc se tait.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type pg from 'pg'
import { commeLui, connexion } from './helpers/pg'
import { regleLHeure, remetLHeure } from './helpers/horloge'

const ICI = process.env.BANC_MIGRATION === '1'

const ATTENDU: Record<string, { mode: string; categorie?: string }> = {
  'Courses': { mode: 'au_fil', categorie: 'vie_courante' },
  'Restaurants': { mode: 'au_fil', categorie: 'vie_courante' },
  'Sorties et culture': { mode: 'au_fil', categorie: 'vie_courante' },
  'Électricité': { mode: 'facture', categorie: 'maison' },
  'Essence': { mode: 'au_fil', categorie: 'auto' },
  'Péage': { mode: 'au_fil', categorie: 'auto' },
  'Taxe foncière': { mode: 'mis_de_cote', categorie: 'maison' },
  'Entretien Auto': { mode: 'mis_de_cote', categorie: 'auto' },
  'Crédit auto ou LOA': { mode: 'fixe', categorie: 'auto' },
  'Droguerie et hygiène': { mode: 'au_fil', categorie: 'vie_courante' },
  'Coiffeur et soins': { mode: 'au_fil', categorie: 'vie_courante' },
  'Pharmacie': { mode: 'au_fil', categorie: 'sante' },
}

describe.skipIf(!ICI)('la migration des données de prod (§ 5)', () => {
  let c: pg.Client
  let foyer: string
  let kamil: string
  beforeAll(async () => {
    c = await connexion()
    foyer = (await c.query(`select household_id from public.charge
      group by 1 order by count(*) desc limit 1`)).rows[0].household_id
    kamil = (await c.query(`select id from public.user_profile where household_id = $1
      order by created_at limit 1`, [foyer])).rows[0].id
  })
  afterAll(async () => { await c.end(); await remetLHeure() })

  const un = async (sql: string, args: unknown[] = []) => (await c.query(sql, args)).rows

  it('chaque charge a sa façon et sa catégorie', async () => {
    const lues = Object.fromEntries((await un(
      `select libelle, mode, categorie from public.charge where household_id = $1
         and archive_le is null`, [foyer])).map(r => [r.libelle, r]))
    for (const [libelle, attendu] of Object.entries(ATTENDU)) {
      expect(lues[libelle], libelle).toMatchObject(attendu)
    }
    expect(lues['Essence ou recharge'], 'l’enveloppe en doublon est devenue une charge')
      .toBeUndefined()
  })

  it('les trois nouvelles : au mois du déploiement, sur le compte des autres, à Kamil', async () => {
    const nouvelles = await un(`select c.libelle, c.montant_cents, c.commun, c.debut::text,
        (select count(*)::int from public.charge_participant p where p.charge_id = c.id) as qui,
        (select nom from public.compte k where k.id = c.compte_id) as compte
      from public.charge c where c.household_id = $1
        and c.libelle in ('Droguerie et hygiène', 'Coiffeur et soins', 'Pharmacie')
      order by c.libelle`, [foyer])
    expect(nouvelles).toEqual([
      { libelle: 'Coiffeur et soins', montant_cents: 3_000, commun: false,
        debut: '2026-10-01', qui: 1, compte: 'Kamil CA' },
      { libelle: 'Droguerie et hygiène', montant_cents: 6_000, commun: true,
        debut: '2026-10-01', qui: 1, compte: 'Kamil CA' },
      { libelle: 'Pharmacie', montant_cents: 2_000, commun: false,
        debut: '2026-10-01', qui: 1, compte: 'Kamil CA' },
    ])
  })

  it('les relevés sont devenus des factures, et marquent l’année soldée avec leur prévu', async () => {
    const r = await un(`select c.libelle, f.montant_cents, f.origine, ra.prevu_cents::int as prevu
      from public.facture f join public.charge c on c.id = f.charge_id
      join public.releve_annuel ra on ra.charge_id = f.charge_id and ra.annee = f.annee
      where f.household_id = $1 order by c.libelle`, [foyer])
    expect(r.map(x => [x.montant_cents, x.origine, x.prevu]).sort())
      .toEqual([[120_000, 'releve', 120_000], [145_000, 'releve', 144_996]].sort())
  })

  it('septembre : inchangé, et ses trois lignes confirmées ont leur saisie d’amorce', async () => {
    const [s] = await un(`select count(*)::int as n, sum(montant_cents)::int as total
      from public.depense where household_id = $1 and mois = '2026-09-01'`, [foyer])
    expect(s).toEqual({ n: 23, total: 389_824 })
    const amorces = await un(`select d.libelle, s.montant_cents, s.fait_le::text, s.saisi_par
      from public.saisie s join public.depense d on d.id = s.depense_id
      where s.household_id = $1 order by d.libelle`, [foyer])
    expect(amorces).toEqual([
      { libelle: 'Courses', montant_cents: 80_000, fait_le: '2026-09-30', saisi_par: null },
      { libelle: 'Restaurants', montant_cents: 40_000, fait_le: '2026-09-30', saisi_par: null },
      { libelle: 'Sorties et culture', montant_cents: 10_000, fait_le: '2026-09-30',
        saisi_par: null },
    ])
  })

  it('clôturer octobre tout de suite : la clôture l’ouvre, 25 lignes, 316,80 € de reste',
    async () => {
      /* Le cas « sans avoir ouvert /budget » : la clôture fait elle-même la
         première ouverture. Elle vaut donc aussi pour « après la première
         ouverture du mois ». */
      await regleLHeure('2026-11-01T10:00:00+01:00')
      /* `alter database … set` ne vaut que pour les connexions ouvertes APRÈS
         lui : la nôtre, ouverte avant, verrait encore octobre comme le mois
         courant et refuserait de le clôturer. */
      await c.end()
      c = await connexion()
      await commeLui(c, kamil)
      await c.query(`select public.cloture_le_mois('2026-10-01', '[]'::jsonb, '{}'::uuid[], 0, null)`)
      await c.query('commit')
      const [o] = await un(`select count(*)::int as n, sum(montant_cents)::int as total
        from public.depense where household_id = $1 and mois = '2026-10-01'`, [foyer])
      expect(o).toEqual({ n: 25, total: 400_820 })
      const [k] = await un(`select sum(d.montant_cents) filter (where ch.commun)::int as commun,
          sum(d.montant_cents) filter (where not ch.commun)::int as moi
        from public.depense d join public.charge ch on ch.id = d.charge_id
        where d.household_id = $1 and d.mois = '2026-10-01'`, [foyer])
      expect(k).toEqual({ commun: 167_853, moi: 232_967 })
      const [r] = await un(`select reste_cents from public.cloture_choix
        where household_id = $1`, [foyer])
      expect(r.reste_cents).toBe(31_680)
    })

  it('les contraintes sont posées', async () => {
    const noms = (await un(`select conname from pg_constraint
      where conname in ('charge_mode_periodicite', 'depense_modele_a_une_facon')`))
      .map(r => r.conname).sort()
    expect(noms).toEqual(['charge_mode_periodicite', 'depense_modele_a_une_facon'])
  })
})
