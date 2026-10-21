-- ═══════════════════════════════════════════════════════════════════════════
-- 0100 · Un mois clôturé est gelé
--
-- « Revenir dessus » seul le rouvre. Aucun chemin ne lui ajoute une ligne, ni
-- ne refait ses parts : `repartit_les_lignes` et les refiges s'arrêtent avant.
-- Et le mois courant se lit à l'heure de Paris, après le verrou (0093).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.rattrape_les_mois()
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  foyer uuid := public.current_household();
  depuis date;
  jusqua date;
  m date;
  rattrapes integer := 0;
begin
  if foyer is null then return 0; end if;
  perform public.verrou_du_foyer(foyer);                       -- 0100
  jusqua := public.mois_courant();                             -- 0100 : après le verrou

  /* Du plus ancien départ de charge vivante au mois courant. */
  select date_trunc('month', min(c.debut))::date into depuis
  from public.charge c
  where c.household_id = foyer and c.archive_le is null;
  if depuis is null then return 0; end if;
  /* Deux ans en arrière au maximum : au-delà, c'est une reconstruction. */
  depuis := greatest(depuis, (jusqua - interval '2 years')::date);

  for m in
    select d.mois::date
    from generate_series(depuis, jusqua, interval '1 month') as d(mois)
    /* 0100 : un mois clôturé ne se rattrape pas. */
    where not exists (select 1 from public.cloture k
                      where k.household_id = foyer and k.mois = d.mois::date)
      /* ⚠️ « Manquant » se mesure PAR CHARGE, pas par foyer (0083). */
      and exists (
        select 1 from public.charge c
        where c.household_id = foyer and c.archive_le is null
          and c.debut <= (d.mois + interval '1 month - 1 day')::date
          and (c.fin is null or c.fin >= d.mois::date)
          and exists (
            select 1 from public.charge_participant cp
            join public.user_profile p on p.id = cp.user_profile_id
            where cp.charge_id = c.id
              and p.entre_le <= (d.mois + interval '1 month - 1 day')::date)
          and not exists (
            select 1 from public.releve_annuel rr
            where rr.charge_id = c.id
              and rr.annee = extract(year from d.mois)::integer)
          and not exists (
            select 1 from public.depense x
            where x.charge_id = c.id and x.mois = d.mois::date and x.source = 'modele'))
    order by 1
  loop
    perform public.ouvre_le_mois(m, foyer);
    rattrapes := rattrapes + 1;
  end loop;
  return rattrapes;
end $function$;
revoke execute on function public.rattrape_les_mois() from public, anon;
grant execute on function public.rattrape_les_mois() to authenticated, service_role;

create or replace function public.provisions_a_venir(la_charge uuid, annee integer)
returns bigint
language sql stable security definer set search_path = public, pg_temp
as $function$
  with c as (
    select montant_cents, periodicite, debut, fin, archive_le, household_id
    from public.charge
    where id = la_charge and household_id = public.current_household()
  )
  select coalesce(sum(public.provision_mensuelle(c.montant_cents, c.periodicite)), 0)::bigint
  from c,
       generate_series(make_date(annee, 1, 1), make_date(annee, 12, 1),
                       interval '1 month') as m(mois)
  where c.archive_le is null
    and m.mois::date >= '2000-01-01'::date
    and m.mois::date <= (current_date + interval '5 years')::date
    and c.debut <= (m.mois + interval '1 month - 1 day')::date
    and (c.fin is null or c.fin >= m.mois::date)
    and m.mois::date >= public.mois_courant()                  -- 0100 : l'heure de Paris
    and not exists (
      select 1 from public.depense d
      where d.charge_id = la_charge and d.source = 'modele' and d.mois = m.mois::date)
    and not exists (
      select 1 from public.releve_annuel r
      where r.charge_id = la_charge and r.annee = provisions_a_venir.annee)
    /* 0100 : un mois clôturé n'a rien à venir, comme une année soldée. */
    and not exists (
      select 1 from public.cloture k
      where k.household_id = c.household_id and k.mois = m.mois::date)
    and exists (
      select 1 from public.charge_participant cp
      join public.user_profile up on up.id = cp.user_profile_id
      where cp.charge_id = la_charge
        and up.entre_le <= (m.mois + interval '1 month - 1 day')::date)
$function$;
revoke execute on function public.provisions_a_venir(uuid, integer) from public, anon;
grant execute on function public.provisions_a_venir(uuid, integer) to authenticated, service_role;

create or replace function public.repartit_les_lignes(foyer uuid, le_mois date)
returns void
language sql security definer set search_path = public, pg_temp
as $$
  with a_refaire as (
    select d.id, d.charge_id, d.montant_cents
    from public.depense d
    where d.household_id = foyer and d.mois = le_mois and d.source = 'modele'
      and d.charge_id is not null
      and not exists (select 1 from public.depense_part p where p.depense_id = d.id)
      /* 0100 : une ligne sans part d'un mois clôturé n'en reçoit pas. Le mois ne
         vaudrait plus son `reste_cents`. */
      and not exists (select 1 from public.cloture k
                      where k.household_id = foyer and k.mois = le_mois)
  ),
  -- (la suite, de `pesee` à l'`insert`, est celle de 0064, à l'identique)
  pesee as (
    select n.id as depense_id, n.montant_cents, cp.user_profile_id as uid,
           case when sum(p.part_bps) over (partition by n.id) = 0
                then 1 else p.part_bps end as poids
    from a_refaire n
    join public.charge c on c.id = n.charge_id
    join public.charge_participant cp on cp.charge_id = c.id
    join lateral public.parts_du_foyer(le_mois, foyer, c.cle) p
      on p.user_profile_id = cp.user_profile_id
  ),
  total as (
    select depense_id, montant_cents, uid, poids,
           (sum(poids) over (partition by depense_id))::bigint as poids_total
    from pesee
  ),
  brut as (
    select depense_id, uid, poids, poids_total,
           case when montant_cents < 0 then -1 else 1 end as signe,
           abs(montant_cents::bigint) * poids / poids_total as base,
           row_number() over (
             partition by depense_id
             order by (abs(montant_cents::bigint) * poids) % poids_total desc,
                      md5(uid::text || depense_id::text)
           ) as rang,
           abs(montant_cents::bigint) as absolu,
           (poids::bigint * 10000) / poids_total as bps_base,
           row_number() over (
             partition by depense_id
             order by (poids::bigint * 10000) % poids_total desc,
                      md5(uid::text || depense_id::text)
           ) as rang_bps
    from total where poids_total > 0
  ),
  manque as (
    select depense_id, max(absolu) - sum(base) as cents,
           10000 - sum(bps_base) as bps
    from brut group by depense_id
  )
  insert into public.depense_part
    (depense_id, user_profile_id, household_id, part_cents, part_bps)
  select b.depense_id, b.uid, foyer,
         (b.base + case when b.rang <= m.cents then 1 else 0 end)::integer * b.signe,
         (b.bps_base + case when b.rang_bps <= m.bps then 1 else 0 end)::integer
  from brut b join manque m on m.depense_id = b.depense_id
$$;
revoke execute on function public.repartit_les_lignes(uuid, date) from public, anon, authenticated;

create or replace function public.refige_pour(foyer uuid, le_mois date)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  debut_mois date := date_trunc('month', le_mois)::date;
  fin_mois   date := (date_trunc('month', le_mois) + interval '1 month - 1 day')::date;
begin
  if foyer is null then return; end if;
  perform public.verrou_du_foyer(foyer);                       -- 0100
  /* 0100 : un mois clôturé ne se repartage pas — il vaut son `reste_cents`. */
  if exists (select 1 from public.cloture k
             where k.household_id = foyer and k.mois = debut_mois) then
    return;
  end if;

  /* D'ABORD les orphelines : une ligne dont la charge n'a plus de participant
     arrivé ne se repeuplera jamais. */
  delete from public.depense d
  where d.household_id = foyer and d.mois = debut_mois and d.source = 'modele'
    and d.charge_id is not null
    and d.regle_le is null and d.confirme_le is null
    and not exists (
      select 1 from public.charge_participant cp
      join public.user_profile up on up.id = cp.user_profile_id
      where cp.charge_id = d.charge_id and up.entre_le <= fin_mois)
    and not exists (
      select 1 from public.releve_annuel r
      where r.charge_id = d.charge_id
        and r.annee = extract(year from d.mois)::integer)
    /* 0100 : une ligne qui a des saisies reste. C'est de l'argent dont on a dit
       qu'il était sorti ; supprimée ici, ses dépenses partaient en cascade. */
    and not exists (select 1 from public.saisie s where s.depense_id = d.id);

  delete from public.depense_part p
  where p.depense_id in (
    select d.id from public.depense d
    where d.household_id = foyer and d.mois = debut_mois and d.source = 'modele'
      and d.charge_id is not null
      and d.regle_le is null and d.confirme_le is null
      and exists (
        select 1 from public.charge_participant cp
        join public.user_profile up on up.id = cp.user_profile_id
        where cp.charge_id = d.charge_id and up.entre_le <= fin_mois)
      and not exists (
        select 1 from public.releve_annuel r
        where r.charge_id = d.charge_id
          and r.annee = extract(year from d.mois)::integer));

  perform public.repartit_les_lignes(foyer, debut_mois);
end $function$;
revoke execute on function public.refige_pour(uuid, date) from public, anon, authenticated;
