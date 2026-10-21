-- ═══════════════════════════════════════════════════════════════════════════
-- 0104 · Confirmer une ligne
--
-- `confirme_la_ligne` (interne) : le corps de `confirme_la_depense` de 0072 —
-- les parts reposées avec les anciens points de base, la nature à `connue`,
-- `confirme_le` — et deux refus. Le corps acceptait le signe (0072) : une
-- facture d'électricité à −50 € grossissait le reste de 100 €. Seuls les
-- ajustements, que la base pose elle-même, sont signés. La clôture l'appelle
-- avant d'insérer la clôture : le refus du mois clôturé ne la gêne pas.
--
-- Comme les autres fonctions internes, elle ne lit pas `current_household()` :
-- son appelant a vérifié le foyer, et elle prend celui de la ligne.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.confirme_la_ligne(la_ligne uuid, reel_cents integer)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  foyer uuid;
  le_mois date;
  nb_parts integer;
begin
  select d.household_id, d.mois into foyer, le_mois
  from public.depense d where d.id = la_ligne;
  if foyer is null then
    raise exception 'Dépense inconnue.' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.cloture k
             where k.household_id = foyer and k.mois = le_mois) then
    raise exception '% est clôturé : reviens dessus pour le changer.',
      initcap(public.nom_du_mois(le_mois)) using errcode = 'check_violation';
  end if;
  if reel_cents is null or reel_cents < 0 or reel_cents > 100000000 then
    raise exception 'Un montant entre 0 € et 1 000 000 €.' using errcode = 'check_violation';
  end if;

  select count(*) into nb_parts from public.depense_part where depense_id = la_ligne;
  if nb_parts = 0 then
    raise exception 'Cette dépense n''est partagée avec personne : il n''y a rien à confirmer.'
      using errcode = 'check_violation';
  end if;

  create temp table if not exists anciennes_parts
    (user_profile_id uuid, part_cents integer, part_bps integer) on commit drop;
  delete from anciennes_parts where true;
  insert into anciennes_parts
    select user_profile_id, part_cents, part_bps
    from public.depense_part where depense_id = la_ligne;

  delete from public.depense_part where depense_id = la_ligne;

  update public.depense
     set montant_cents = reel_cents, nature = 'connue', confirme_le = public.maintenant()
   where id = la_ligne;

  insert into public.depense_part
    (depense_id, user_profile_id, household_id, part_cents, part_bps)
  with total as (
    select coalesce(sum(part_bps), 0) as bps, coalesce(sum(part_cents), 0) as cents
    from anciennes_parts
  ),
  pesee as (
    select a.user_profile_id as uid, a.part_bps,
           case when (select bps from total) > 0 then a.part_bps::bigint
                when (select cents from total) > 0 then abs(a.part_cents::bigint)
                else 1::bigint end as poids
    from anciennes_parts a
  ),
  somme as (select sum(poids)::bigint as t from pesee),
  brut as (
    select p.uid, p.part_bps,
           abs(reel_cents::bigint) * p.poids / s.t as base,
           row_number() over (
             order by (abs(reel_cents::bigint) * p.poids) % s.t desc,
                      md5(p.uid::text || la_ligne::text)) as rang
    from pesee p, somme s where s.t > 0
  ),
  manque as (select abs(reel_cents::bigint) - coalesce(sum(base), 0) as combien from brut)
  select la_ligne, b.uid, foyer,
         (b.base + case when b.rang <= (select combien from manque) then 1 else 0 end)::integer,
         b.part_bps
  from brut b;
end $function$;
revoke execute on function public.confirme_la_ligne(uuid, integer) from public, anon, authenticated;

create or replace function public.confirme_la_depense(la_depense uuid, reel_cents integer)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  foyer uuid := public.current_household();
  l record;
begin
  if foyer is null then
    raise exception 'Dépense inconnue.' using errcode = 'no_data_found';
  end if;
  perform public.verrou_du_foyer(foyer);

  select d.source, d.facon into l
  from public.depense d where d.id = la_depense and d.household_id = foyer;
  if not found then
    raise exception 'Dépense inconnue.' using errcode = 'no_data_found';
  end if;
  /* Seul l'ancien paquet l'appelle ainsi. Sa confirmation, sans saisie, serait
     défaite à la clôture : 780 € confirmés le 30, puis 800 € retenus. */
  if l.facon = 'au_fil' then
    raise exception 'Cette dépense se déclare désormais au fil du mois. Recharge la page.'
      using errcode = 'check_violation';
  end if;
  if l.source <> 'modele' or coalesce(l.facon, '') not in ('facture', 'fixe') then
    raise exception 'Cette ligne ne se confirme pas : une mise de côté se règle facture par facture, et un ajustement ne se touche pas.'
      using errcode = 'check_violation';
  end if;
  perform public.confirme_la_ligne(la_depense, reel_cents);
end $function$;
revoke execute on function public.confirme_la_depense(uuid, integer) from public, anon;
grant execute on function public.confirme_la_depense(uuid, integer) to authenticated, service_role;
