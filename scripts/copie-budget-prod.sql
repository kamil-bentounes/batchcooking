-- ═══════════════════════════════════════════════════════════════════════════
-- La copie du budget de la prod, pour le banc de migration (§ 5).
--
-- Se lance EN LECTURE SEULE par l'API de gestion (`q.py`) ; rend une colonne
-- `sql` par ligne, à charger par `supabase_admin` dans une base remise à la
-- veille du budget refait. Ni adresse, ni jeton : les comptes copiés ont une
-- adresse inventée et aucun mot de passe. Les articles du catalogue se
-- retrouvent par (section, libellé) : leurs identifiants diffèrent d'une base
-- à l'autre.
-- ═══════════════════════════════════════════════════════════════════════════
with f as (
  select c.household_id as id from public.charge c
  group by c.household_id order by count(*) desc limit 1
),
morceaux as (
  select 0 as ordre, 'set session_replication_role = replica;' as sql
  union all
  select 1, format('insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values (%L, %L, %L, %L, %L, now(), now());',
    p.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'copie-' || left(p.id::text, 8) || '@test.local')
  from public.user_profile p, f where p.household_id = f.id
  union all
  select 2, format('insert into public.household (id, name) values (%L, %L);', h.id, 'Foyer copié')
  from public.household h, f where h.id = f.id
  union all
  select 3, format('insert into public.user_profile (id, household_id, display_name, entre_le, password_set, created_at) values (%L, %L, %L, %L, true, %L);',
    p.id, p.household_id, split_part(coalesce(p.display_name, 'Kamil'), ' ', 1), p.entre_le, p.created_at)
  from public.user_profile p, f where p.household_id = f.id
  union all
  select 4, format('insert into public.revenu (id, household_id, user_profile_id, net_mensuel_cents, valid_from, created_at) values (%L, %L, %L, %L, %L, %L);',
    v.id, v.household_id, v.user_profile_id, v.net_mensuel_cents, v.valid_from, v.created_at)
  from public.revenu v, f where v.household_id = f.id
  union all
  select 5, format('insert into public.regle_partage (id, household_id, cle, valid_from, created_at) values (%L, %L, %L, %L, %L);',
    r.id, r.household_id, r.cle, r.valid_from, r.created_at)
  from public.regle_partage r, f where r.household_id = f.id
  union all
  select 6, format('insert into public.compte (id, household_id, nom, genre, titulaire_id, matelas_cents, archive_le, created_at) values (%L, %L, %L, %L, %L, %L, %L, %L);',
    c.id, c.household_id, c.nom, c.genre, c.titulaire_id, c.matelas_cents, c.archive_le, c.created_at)
  from public.compte c, f where c.household_id = f.id
  union all
  select 7, format('insert into public.enveloppe (id, household_id, libelle, plafond_cents, report, archive_le, created_at) values (%L, %L, %L, %L, %L, %L, %L);',
    e.id, e.household_id, e.libelle, e.plafond_cents, e.report, e.archive_le, e.created_at)
  from public.enveloppe e, f where e.household_id = f.id
  union all
  select 8, format('insert into public.poche_epargne (id, household_id, libelle, genre, objectif_cents, echeance, cle, compte_id, atteinte_le, created_at) values (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L);',
    p.id, p.household_id, p.libelle, p.genre, p.objectif_cents, p.echeance, p.cle, p.compte_id, p.atteinte_le, p.created_at)
  from public.poche_epargne p, f where p.household_id = f.id
  union all
  select 9, format('insert into public.versement_epargne (id, household_id, poche_id, user_profile_id, montant_cents, motif, fait_le, created_at) values (%L, %L, %L, %L, %L, %L, %L, %L);',
    v.id, v.household_id, v.poche_id, v.user_profile_id, v.montant_cents, v.motif, v.fait_le, v.created_at)
  from public.versement_epargne v, f where v.household_id = f.id
  union all
  select 10, format('insert into public.charge (id, household_id, catalogue_id, libelle, montant_cents, periodicite, variable, cle, compte_id, debut, fin, created_at, archive_le, enveloppe_id, commun, modifie_par, modifie_le) values (%L, %L, %s, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L);',
    c.id, c.household_id,
    coalesce((select format('(select id from public.catalogue_charge where section = %L and libelle = %L)', k.section, k.libelle)
                from public.catalogue_charge k where k.id = c.catalogue_id), 'null'),
    c.libelle, c.montant_cents, c.periodicite, c.variable, c.cle, c.compte_id, c.debut, c.fin,
    c.created_at, c.archive_le, c.enveloppe_id, c.commun, c.modifie_par, c.modifie_le)
  from public.charge c, f where c.household_id = f.id
  union all
  select 11, format('insert into public.charge_participant (charge_id, user_profile_id, household_id) values (%L, %L, %L);',
    cp.charge_id, cp.user_profile_id, cp.household_id)
  from public.charge_participant cp, f where cp.household_id = f.id
  union all
  select 12, format('insert into public.depense (id, household_id, charge_id, mois, libelle, montant_cents, montant_prevu_cents, nature, source, reference_externe, compte_id, paye_par, regle_le, created_at, enveloppe_id, confirme_le, regularise_annee) values (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L);',
    d.id, d.household_id, d.charge_id, d.mois, d.libelle, d.montant_cents, d.montant_prevu_cents,
    d.nature, d.source, d.reference_externe, d.compte_id, d.paye_par, d.regle_le, d.created_at,
    d.enveloppe_id, d.confirme_le, d.regularise_annee)
  from public.depense d, f where d.household_id = f.id
  union all
  select 13, format('insert into public.depense_part (depense_id, user_profile_id, household_id, part_cents, part_bps) values (%L, %L, %L, %L, %L);',
    x.depense_id, x.user_profile_id, x.household_id, x.part_cents, x.part_bps)
  from public.depense_part x, f where x.household_id = f.id
  union all
  select 14, format('insert into public.releve_annuel (id, household_id, charge_id, annee, reel_cents, ecart_cents, saisi_par, saisi_le) values (%L, %L, %L, %L, %L, %L, %L, %L);',
    r.id, r.household_id, r.charge_id, r.annee, r.reel_cents, r.ecart_cents, r.saisi_par, r.saisi_le)
  from public.releve_annuel r, f where r.household_id = f.id
  union all
  select 99, 'set session_replication_role = origin;'
)
select sql from morceaux order by ordre;
