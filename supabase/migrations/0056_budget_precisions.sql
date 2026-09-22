-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUE LA RELECTURE FINALE A TROUVÉ EN BASE
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Une dépense ne naît plus sans personne pour la payer ───────────────────
--
-- Le générateur ne vérifiait que l'EXISTENCE d'un participant, pas sa PRÉSENCE
-- ce mois-là. Une charge dont l'unique participant entre dans le foyer le mois
-- suivant engendrait donc une dépense sans aucune part : elle pesait dans
-- l'enveloppe et dans « à confirmer », et personne ne la devait.
create or replace function public.ouvre_le_mois(le_mois date, le_foyer uuid default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  foyer uuid := case when public.is_service_role() and le_foyer is not null
                     then le_foyer else public.current_household() end;
  debut_mois date := date_trunc('month', le_mois)::date;
  fin_mois   date := (date_trunc('month', le_mois) + interval '1 month - 1 day')::date;
  nees  integer := 0;
begin
  if foyer is null then return 0; end if;
  if debut_mois < '2000-01-01'::date
     or debut_mois > (current_date + interval '5 years')::date then
    raise exception 'Mois hors des bornes raisonnables : %', debut_mois
      using errcode = 'check_violation';
  end if;

  create temp table depenses_nees (id uuid, charge_id uuid, montant_cents integer)
    on commit drop;

  with actives as (
    select c.id, c.libelle, c.cle, c.compte_id, c.variable, c.periodicite, c.enveloppe_id,
           public.provision_mensuelle(c.montant_cents, c.periodicite) as du_mois
    from public.charge c
    where c.household_id = foyer
      and c.archive_le is null
      and c.debut <= fin_mois
      and (c.fin is null or c.fin >= debut_mois)
      /* PRÉSENT ce mois-là, pas seulement inscrit : sinon on engendre une
         dépense que nul ne porte. */
      and exists (
        select 1 from public.charge_participant cp
        join public.user_profile p on p.id = cp.user_profile_id
        where cp.charge_id = c.id and p.entre_le <= fin_mois)
  )
  insert into public.depense
    (household_id, charge_id, mois, libelle, montant_cents, nature, source, compte_id, enveloppe_id)
  select foyer, a.id, debut_mois, a.libelle, a.du_mois,
         case when a.variable or a.periodicite <> 'mensuel' then 'estimee' else 'connue' end,
         'modele', a.compte_id, a.enveloppe_id
  from actives a
  on conflict do nothing;

  get diagnostics nees = row_count;

  insert into depenses_nees (id, charge_id, montant_cents)
  select d.id, d.charge_id, d.montant_cents
  from public.depense d
  where d.household_id = foyer and d.mois = debut_mois and d.source = 'modele'
    and not exists (select 1 from public.depense_part p where p.depense_id = d.id);

  with pesee as (
    select n.id as depense_id, n.montant_cents, cp.user_profile_id as uid,
           case when sum(p.part_bps) over (partition by n.id) = 0
                then 1 else p.part_bps end as poids
    from depenses_nees n
    join public.charge c on c.id = n.charge_id
    join public.charge_participant cp on cp.charge_id = c.id
    join lateral public.parts_du_foyer(debut_mois, foyer, c.cle) p
      on p.user_profile_id = cp.user_profile_id
  ),
  total as (
    select depense_id, montant_cents, uid, poids,
           sum(poids) over (partition by depense_id) as poids_total
    from pesee
  ),
  brut as (
    select depense_id, uid, montant_cents, poids, poids_total,
           (montant_cents::bigint * poids / poids_total)::integer as cents,
           (poids::bigint * 10000 / poids_total)::integer as bps,
           row_number() over (partition by depense_id order by poids desc, uid) as rang
    from total where poids_total > 0
  ),
  reste as (
    select depense_id, montant_cents - sum(cents) as r
    from brut group by depense_id, montant_cents
  )
  insert into public.depense_part
    (depense_id, user_profile_id, household_id, part_cents, part_bps)
  select b.depense_id, b.uid, foyer,
         b.cents + case when b.rang = 1 then coalesce(r.r, 0) else 0 end,
         b.bps
  from brut b left join reste r on r.depense_id = b.depense_id
  on conflict do nothing;

  return nees;
end $$;

-- ── Une enveloppe archivée ne confisque plus son nom ───────────────────────
-- Le défaut que 0051 avait corrigé pour `compte`, laissé ici.
alter table public.enveloppe drop constraint enveloppe_household_id_libelle_key;
create unique index enveloppe_nom_vivant
  on public.enveloppe (household_id, libelle) where archive_le is null;
