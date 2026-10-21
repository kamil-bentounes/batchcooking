-- ═══════════════════════════════════════════════════════════════════════════
-- 0098 · Les lignes naissent avec leur façon, et un mois clôturé n'en gagne plus
--
-- Tout ce qui fait naître une ligne `modele` y écrit `facon` = `charge.mode`.
-- La nature d'une ligne qui naît vaut `estimee` si elle n'est pas fixe : la
-- règle d'aujourd'hui (variable, non mensuelle, ou à enveloppe) le disait déjà,
-- avec d'autres mots.
--
-- La table temporaire `depenses_nees`, que plus rien ne lisait depuis 0063,
-- disparaît.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.ouvre_le_mois(le_mois date, le_foyer uuid default null)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  foyer uuid := case when public.is_service_role() and le_foyer is not null
                     then le_foyer else public.current_household() end;
  debut_mois date := date_trunc('month', le_mois)::date;
  fin_mois   date := (date_trunc('month', le_mois) + interval '1 month - 1 day')::date;
  nees integer := 0;
begin
  if foyer is null then return 0; end if;
  if debut_mois < '2000-01-01'::date
     or debut_mois > (current_date + interval '5 years')::date then
    raise exception 'Mois hors des bornes raisonnables : %', debut_mois
      using errcode = 'check_violation';
  end if;

  /* Le verrou du foyer AVANT la première écriture : une ligne qui naît pendant
     une clôture attend sa fin, puis la voit. Le verrou se reprend sans attendre
     quand l'appelant (la clôture) le tient déjà. */
  perform public.verrou_du_foyer(foyer);

  /* ⚠️ Un mois CLÔTURÉ ne gagne plus de ligne : son reste est déjà mis de côté.
     `useMois` rattrape puis ouvre tout mois passé qu'on regarde, et
     `useAjouteCharge` ouvre les mois écoulés depuis le début d'une charge : les
     deux y faisaient naître des lignes que personne n'avait payées. */
  if exists (select 1 from public.cloture k
             where k.household_id = foyer and k.mois = debut_mois) then
    return 0;
  end if;

  with actives as (
    select c.id, c.libelle, c.compte_id, c.enveloppe_id, c.mode,
           public.provision_mensuelle(c.montant_cents, c.periodicite) as du_mois
    from public.charge c
    where c.household_id = foyer
      and c.archive_le is null
      and c.debut <= fin_mois
      and (c.fin is null or c.fin >= debut_mois)
      and exists (
        select 1 from public.charge_participant cp
        join public.user_profile p on p.id = cp.user_profile_id
        where cp.charge_id = c.id and p.entre_le <= fin_mois)
      /* ⚠️ Une année soldée ne gagne plus de mois (0083) : son prévu est figé. */
      and not exists (
        select 1 from public.releve_annuel r
        where r.charge_id = c.id
          and r.annee = extract(year from debut_mois)::integer)
  )
  insert into public.depense
    (household_id, charge_id, mois, libelle, montant_cents, montant_prevu_cents,
     nature, source, compte_id, enveloppe_id, facon)
  select foyer, a.id, debut_mois, a.libelle, a.du_mois, a.du_mois,
         case when a.mode <> 'fixe' then 'estimee' else 'connue' end,
         'modele', a.compte_id,
         a.enveloppe_id,     -- l'ancien paquet lit encore la jauge de l'enveloppe ici
         a.mode              -- la façon de la ligne, figée à sa naissance
  from actives a
  on conflict do nothing;

  get diagnostics nees = row_count;
  perform public.repartit_les_lignes(foyer, debut_mois);
  return nees;
end $function$;
revoke execute on function public.ouvre_le_mois(date, uuid) from public, anon;
grant execute on function public.ouvre_le_mois(date, uuid) to authenticated, service_role;

create or replace function public.ouvre_la_charge(la_charge uuid, foyer uuid, le_mois date)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  /* ⚠️ Le foyer se REPREND, il ne se croit pas (0081). */
  foyer      uuid := case when public.is_service_role() and ouvre_la_charge.foyer is not null
                          then ouvre_la_charge.foyer else public.current_household() end;
  debut_mois date := date_trunc('month', le_mois)::date;
  fin_mois   date := (date_trunc('month', le_mois) + interval '1 month - 1 day')::date;
  nees integer := 0;
begin
  if foyer is null then return 0; end if;
  if debut_mois < '2000-01-01'::date
     or debut_mois > (current_date + interval '5 years')::date then
    raise exception 'Mois hors des bornes raisonnables : %', debut_mois
      using errcode = 'check_violation';
  end if;
  perform public.verrou_du_foyer(foyer);
  if exists (select 1 from public.cloture k
             where k.household_id = foyer and k.mois = debut_mois) then
    return 0;
  end if;

  /* Le MÊME prédicat qu'`ouvre_le_mois` : chaque divergence a coûté de l'argent. */
  insert into public.depense
    (household_id, charge_id, mois, libelle, montant_cents, montant_prevu_cents,
     nature, source, compte_id, enveloppe_id, facon)
  select foyer, c.id, debut_mois, c.libelle,
         public.provision_mensuelle(c.montant_cents, c.periodicite),
         public.provision_mensuelle(c.montant_cents, c.periodicite),
         case when c.mode <> 'fixe' then 'estimee' else 'connue' end,
         'modele', c.compte_id, c.enveloppe_id, c.mode
  from public.charge c
  where c.id = la_charge
    and c.household_id = foyer
    and c.archive_le is null
    and c.debut <= fin_mois
    and (c.fin is null or c.fin >= debut_mois)
    and exists (
      select 1 from public.charge_participant cp
      join public.user_profile p on p.id = cp.user_profile_id
      where cp.charge_id = c.id and p.entre_le <= fin_mois)
    and not exists (
      select 1 from public.releve_annuel r
      where r.charge_id = c.id
        and r.annee = extract(year from debut_mois)::integer)
  on conflict do nothing;

  get diagnostics nees = row_count;
  perform public.repartit_les_lignes(foyer, debut_mois);
  return nees;
end $function$;
revoke execute on function public.ouvre_la_charge(uuid, uuid, date) from public, anon;
grant execute on function public.ouvre_la_charge(uuid, uuid, date) to authenticated, service_role;
