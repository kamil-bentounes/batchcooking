-- ═══════════════════════════════════════════════════════════════════════════
-- 0102 · Les mois suivis (D77), et les parts d'un foyer qu'on nomme
--
-- Un mois est suivi s'il est clôturé, ou si un membre du foyer y a un revenu
-- (le revenu du mois : le `valid_from` le plus récent, sans dépasser le dernier
-- jour). Une provision d'un mois que Popote n'a pas suivi n'a été mise de côté
-- nulle part : elle ne compte pas. Les factures n'entrent pas dans ce critère —
-- une facture d'avant Popote ferait suivre un mois que personne n'a suivi.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.mois_suivi(foyer uuid, le_mois date)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.cloture k
                  where k.household_id = mois_suivi.foyer
                    and k.mois = date_trunc('month', le_mois)::date)
      or exists (select 1 from public.revenu v
                  where v.household_id = mois_suivi.foyer
                    and v.valid_from <= (date_trunc('month', le_mois)
                                         + interval '1 month - 1 day')::date)
$$;
revoke execute on function public.mois_suivi(uuid, date) from public, anon, authenticated;

create or replace function public.premier_mois_suivi(foyer uuid)
returns date language sql stable security definer set search_path = public, pg_temp as $$
  select least(
    (select min(k.mois) from public.cloture k where k.household_id = premier_mois_suivi.foyer),
    (select date_trunc('month', min(v.valid_from))::date
       from public.revenu v where v.household_id = premier_mois_suivi.foyer))
$$;
revoke execute on function public.premier_mois_suivi(uuid) from public, anon, authenticated;

/*
 * La pesée de `parts_du_foyer`, pour un foyer NOMMÉ. Interne.
 *
 * `parts_du_foyer` ne croit le foyer qu'on lui passe que sous la clé de
 * service ; sinon elle lit `current_household()`. Appelée par
 * `delete_my_account` après la suppression du profil, elle rendait zéro ligne,
 * et un ajustement naissait sans part. Le corps est celui de 0064, une fois :
 * `parts_du_foyer` l'appelle désormais.
 */
create or replace function public.parts_du_mois(le_foyer uuid, le_mois date, la_cle text default null)
returns table (user_profile_id uuid, part_bps integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with bornes as (
    select (date_trunc('month', le_mois) + interval '1 month - 1 day')::date as fin,
           parts_du_mois.le_foyer as foyer
  ),
  regle as (
    select coalesce(la_cle, (
      select r.cle from public.regle_partage r, bornes b
      where r.household_id = b.foyer and r.valid_from <= b.fin
      order by r.valid_from desc limit 1
    ), 'prorata') as cle
  ),
  membres as (
    select p.id as uid,
           (select v.net_mensuel_cents
              from public.revenu v, bornes b2
             where v.user_profile_id = p.id
               and v.household_id = b2.foyer
               and v.valid_from <= b2.fin
             order by v.valid_from desc limit 1) as revenu_cents
    from public.user_profile p, bornes b
    where p.household_id = b.foyer and p.entre_le <= b.fin
  ),
  pesee as (
    select uid,
           case when (select cle from regle) = 'moitie'
                     or exists (select 1 from membres where revenu_cents is null)
                     or coalesce((select sum(revenu_cents) from membres), 0) = 0
                then 1::bigint else revenu_cents::bigint end as poids
    from membres
  ),
  somme as (select sum(poids)::bigint as total from pesee),
  brut as (
    select p.uid, p.poids,
           (p.poids * 10000) / s.total as base,
           row_number() over (
             order by (p.poids * 10000) % s.total desc,
                      md5(p.uid::text || le_mois::text)) as rang
    from pesee p, somme s where s.total > 0
  ),
  manque as (select 10000 - coalesce(sum(base), 0) as combien from brut)
  select b.uid,
         (b.base + case when b.rang <= (select combien from manque) then 1 else 0 end)::integer
  from brut b
$$;
revoke execute on function public.parts_du_mois(uuid, date, text) from public, anon, authenticated;

create or replace function public.parts_du_foyer(
  le_mois date, le_foyer uuid default null, la_cle text default null)
returns table (user_profile_id uuid, part_bps integer)
language sql stable security definer set search_path = public, pg_temp as $$
  /* Le foyer demandé n'est honoré que pour le rôle de service (0051). */
  select p.user_profile_id, p.part_bps
  from public.parts_du_mois(
         case when public.is_service_role() and le_foyer is not null
              then le_foyer else public.current_household() end,
         le_mois, la_cle) p
$$;
revoke execute on function public.parts_du_foyer(date, uuid, text) from public, anon;
grant execute on function public.parts_du_foyer(date, uuid, text) to authenticated, service_role;
