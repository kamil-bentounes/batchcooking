-- ═══════════════════════════════════════════════════════════════════════════
-- 0072 · Les résidus qu'une contre-revue de 0069 a trouvés
--
-- C'est le motif de ce dépôt : on migre quatre copies sur cinq, et la
-- cinquième garde le défaut qu'on croit avoir supprimé.
--
-- 1 · `abs(x)::bigint` — la TROISIÈME occurrence. 0064 énonce la règle en
--     toutes lettres — la valeur absolue prise en `integer` déborde sur
--     −2 147 483 648 — et 126 lignes plus bas, dans la même migration, écrit
--     `abs(a.part_cents)::bigint`. 0069 annonçait en avoir chassé deux.
--
-- 2 · `excedent_du_mois` n'a pas la garde de signe que 0069 ajoute à
--     `regularise_annuel`. Mêmes parts mêlées (8 100 / −7 100 sur 1 000),
--     écart d'un centime : l'excédent rend +8 / −7. La somme est juste, les
--     chiffres sont absurdes. C'est le défaut 2 de 0069, mot pour mot, laissé
--     dans la cinquième fonction.
--
-- 3 · L'ORDRE des gardes de `regularise_annuel` : une provision entièrement
--     négative rend « un membre a porté un montant négatif » au lieu de
--     « les provisions ne sont pas positives ». Le second message était
--     inatteignable.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · La valeur absolue, au bon endroit ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirme_la_depense(la_depense uuid, reel_cents integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare foyer uuid := public.current_household();
        ancien integer;
        nb_parts integer;
begin
  select d.montant_cents into ancien from public.depense d
  where d.id = la_depense and d.household_id = foyer;
  if ancien is null then raise exception 'Dépense inconnue.'; end if;

  select count(*) into nb_parts from public.depense_part where depense_id = la_depense;
  if nb_parts = 0 then
    raise exception 'Cette dépense n''est partagée avec personne : il n''y a rien à confirmer.'
      using errcode = 'check_violation';
  end if;

  create temp table if not exists anciennes_parts
    (user_profile_id uuid, part_cents integer, part_bps integer) on commit drop;
  delete from anciennes_parts where true;
  insert into anciennes_parts
    select user_profile_id, part_cents, part_bps
    from public.depense_part where depense_id = la_depense;

  delete from public.depense_part where depense_id = la_depense;

  update public.depense
     set montant_cents = reel_cents, nature = 'connue', confirme_le = now()
   where id = la_depense;

  insert into public.depense_part
    (depense_id, user_profile_id, household_id, part_cents, part_bps)
  with total as (
    select coalesce(sum(part_bps), 0) as bps, coalesce(sum(part_cents), 0) as cents
    from anciennes_parts
  ),
  pesee as (
    select a.user_profile_id as uid, a.part_bps,
           case when (select bps from total) > 0 then a.part_bps::bigint
                /* ⚠️ `abs(x::bigint)`, PAS `abs(x)::bigint` : la valeur absolue prise
                   en `integer` déborde sur −2 147 483 648. La règle est
                   énoncée en toutes lettres 126 lignes plus haut dans la
                   même migration — et enfreinte ici même. */
                when (select cents from total) > 0 then abs(a.part_cents::bigint)
                else 1::bigint end as poids
    from anciennes_parts a
  ),
  /* `::bigint` sur la SOMME : sans lui elle rend un `numeric`, la division
     devient exacte, le reste vaut toujours zéro et l'arrondi au plus proche
     fabrique un centime de trop. */
  somme as (select sum(poids)::bigint as t from pesee),
  brut as (
    select p.uid, p.part_bps,
           case when reel_cents < 0 then -1 else 1 end as signe,
           abs(reel_cents::bigint) * p.poids / s.t as base,
           row_number() over (
             order by (abs(reel_cents::bigint) * p.poids) % s.t desc,
                      md5(p.uid::text || la_depense::text)) as rang
    from pesee p, somme s where s.t > 0
  ),
  manque as (select abs(reel_cents::bigint) - coalesce(sum(base), 0) as combien from brut)
  select la_depense, b.uid, foyer,
         ((b.base + case when b.rang <= (select combien from manque) then 1 else 0 end)
          * b.signe)::integer,
         b.part_bps
  from brut b;
end $function$

;

-- ── 2 · La garde de signe, dans la cinquième fonction ──────────────────────
--
-- 0069 refuse une régularisation dont les parts portées changent de signe :
-- une proportion n'existe pas quand un membre a porté 8 100 et l'autre −7 100.
-- `excedent_du_mois` fait la même division sur les mêmes parts et n'avait pas
-- la garde : sur un écart d'un centime, elle rend +8 et −7. La somme est juste
-- — c'est bien un centime — mais les deux chiffres affichés sont absurdes, et
-- ce sont eux qu'on lit.
--
-- Une lecture ne LÈVE pas : elle écarte la ligne et laisse le reste du mois se
-- calculer. Un écran qui refuse de s'ouvrir pour une ligne douteuse est pire
-- que le chiffre qu'il cache.
create or replace function public.excedent_du_mois(le_mois date)
returns table (user_profile_id uuid, excedent_cents bigint)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with lignes as (
    select d.id,
           d.montant_cents::bigint as montant_cents,
           coalesce(d.montant_prevu_cents, d.montant_cents)::bigint as prevu
    from public.depense d
    where d.household_id = public.current_household()
      and d.mois = date_trunc('month', le_mois)::date
      and d.source = 'modele'
      and d.nature = 'connue'
  ),
  parts as (
    select p.user_profile_id as uid, l.id,
           l.prevu - l.montant_cents as ecart,
           p.part_cents::bigint as part_cents,
           /* ⚠️ Le cast va sur la SOMME, jamais sur ses termes : `sum(bigint)`
              rend du numeric, et la division cesse d'être entière. */
           (sum(p.part_cents) over (partition by l.id))::bigint as total_ligne,
           /* Une ligne dont les parts changent de signe n'a pas de proportion :
              on l'écarte au lieu d'en inventer une. */
           min(p.part_cents) over (partition by l.id) as plus_petite
    from lignes l join public.depense_part p on p.depense_id = l.id
    where l.prevu <> l.montant_cents
  ),
  brut as (
    select uid, id,
           case when ecart < 0 then -1 else 1 end as signe,
           abs(ecart) * part_cents / nullif(total_ligne, 0) as base,
           abs(ecart) as absolu,
           row_number() over (
             partition by id
             order by (abs(ecart) * part_cents) % nullif(total_ligne, 0) desc,
                      md5(uid::text || id::text)
           ) as rang
    from parts where total_ligne > 0 and plus_petite >= 0
  ),
  manque as (select id, max(absolu) - sum(base) as combien from brut group by id)
  select b.uid,
         sum((b.base + case when b.rang <= m.combien then 1 else 0 end) * b.signe)::bigint
  from brut b join manque m on m.id = b.id
  group by b.uid
$$;

revoke execute on function public.excedent_du_mois(date) from public, anon;
grant   execute on function public.excedent_du_mois(date) to authenticated, service_role;

-- ── 3 · L'ordre des gardes ─────────────────────────────────────────────────
--
-- « Les provisions ne sont pas positives » était inatteignable : dès qu'un
-- porté est négatif, le message des signes mêlés sort le premier. Une
-- provision ENTIÈREMENT négative n'est pas un mélange de signes, c'est un
-- total négatif — et ce n'est pas la même chose à corriger.
create or replace function public.regularise_annuel(
  la_charge uuid, annee integer, reel_cents integer)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  foyer   uuid := public.current_household();
  nom_charge text;
  provisionne bigint;
  porte_ici   bigint;
  combien integer;
  negatifs integer;
  ecart   bigint;
  ligne   uuid;
  mois_ci date := date_trunc('month', (now() at time zone 'Europe/Paris'))::date;
begin
  if foyer is null then raise exception 'Aucun foyer.'; end if;

  select c.libelle into nom_charge
  from public.charge c where c.id = la_charge and c.household_id = foyer;
  if nom_charge is null then raise exception 'Charge inconnue.'; end if;

  select count(*), coalesce(max(total_cents), 0) into combien, provisionne
  from public.provisions_de(la_charge, annee);

  if combien = 0 then
    raise exception 'Rien n''a été provisionné sur cette charge en %.', annee
      using errcode = 'check_violation';
  end if;

  select count(*) filter (where v.porte_cents < 0),
         coalesce(sum(v.porte_cents), 0)
    into negatifs, porte_ici
  from public.provisions_de(la_charge, annee) v
  join public.user_profile p on p.id = v.user_profile_id
  where p.household_id = foyer;

  /* ⚠️ Le TOTAL d'abord, le mélange ensuite. Une provision entièrement
     négative n'est pas un mélange de signes, et ce n'est pas la même chose à
     corriger — l'ordre inverse rendait le second message inatteignable. */
  if provisionne <= 0 then
    raise exception 'Les provisions de % ne sont pas positives : l''écart n''a rien à répartir.', annee
      using errcode = 'check_violation';
  end if;
  if negatifs > 0 then
    raise exception 'Les provisions de % ne vont pas toutes dans le même sens : un membre a porté un montant négatif. Une régularisation se répartit au prorata de ce que chacun a porté, et cette proportion n''existe pas ici. Corrige les mois concernés avant de régulariser.', annee
      using errcode = 'check_violation';
  end if;
  if porte_ici <= 0 then
    raise exception 'Personne encore au foyer n''a porté cette charge en % : il n''y a personne à qui répartir.', annee
      using errcode = 'check_violation';
  end if;

  ecart := reel_cents::bigint - provisionne;
  if ecart = 0 then return null; end if;
  if abs(ecart) > 2000000000 then
    raise exception 'Écart hors des bornes raisonnables.' using errcode = 'check_violation';
  end if;

  insert into public.depense
    (household_id, charge_id, mois, libelle, montant_cents, nature, source,
     compte_id, enveloppe_id, regularise_annee)
  select foyer, la_charge, mois_ci,
         nom_charge || ' — régularisation ' || annee,
         ecart::integer, 'connue', 'manuel', c.compte_id, c.enveloppe_id, annee
  from public.charge c where c.id = la_charge
  returning id into ligne;

  insert into public.depense_part
    (depense_id, user_profile_id, household_id, part_cents, part_bps)
  with porte as (
    select v.user_profile_id as uid, v.porte_cents
    from public.provisions_de(la_charge, annee) v
    join public.user_profile p on p.id = v.user_profile_id
    where p.household_id = foyer
  ),
  brut as (
    select uid, porte_cents,
           case when ecart < 0 then -1 else 1 end as signe,
           abs(ecart) * porte_cents / porte_ici as base,
           (porte_cents * 10000) / porte_ici as bps_base,
           row_number() over (
             order by (abs(ecart) * porte_cents) % porte_ici desc,
                      md5(uid::text || ligne::text)) as rang,
           row_number() over (
             order by (porte_cents * 10000) % porte_ici desc,
                      md5(uid::text || ligne::text)) as rang_bps
    from porte
  ),
  manque as (
    select abs(ecart) - coalesce(sum(base), 0) as cents,
           10000 - coalesce(sum(bps_base), 0) as bps
    from brut
  )
  select ligne, b.uid, foyer,
         ((b.base + case when b.rang <= (select cents from manque) then 1 else 0 end)
          * b.signe)::integer,
         (b.bps_base + case when b.rang_bps <= (select bps from manque) then 1 else 0 end)::integer
  from brut b;

  update public.depense set nature = 'connue'
  where charge_id = la_charge and source = 'modele'
    and household_id = foyer
    and extract(year from mois) = annee;

  return ligne;
end $$;

revoke execute on function public.regularise_annuel(uuid, integer, integer) from public, anon;
grant   execute on function public.regularise_annuel(uuid, integer, integer)
  to authenticated, service_role;
