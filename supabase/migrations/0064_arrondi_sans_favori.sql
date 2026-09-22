-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUE MA PROPRE CORRECTION AVAIT CASSÉ
--
-- 0063 remplaçait « le reliquat au plus gros contributeur » par la méthode des
-- plus forts restes. La méthode est juste — vérifiée exacte sur 640 lignes
-- contre une référence en arithmétique rationnelle. Mais recopiée dans deux
-- autres fonctions, elle y est tombée dans un piège de typage ; une troisième
-- n'a pas été migrée du tout ; et le départage des égalités restait biaisé.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · `sum(bigint)` rend un NUMERIC, donc la division n'est plus entière ─
--
-- Le piège est silencieux et coûteux. `sum()` sur des `bigint` rend un
-- `numeric` : `abs(montant) * poids / sum(poids)` devient une division EXACTE,
-- le reste vaut toujours zéro, personne ne reçoit jamais le centime résiduel,
-- et le `::integer` final ARRONDIT au plus proche.
--
-- Mesuré : Netflix à 15,99 € en moitié-moitié donne 800 + 800 = 1600 pour une
-- dépense de 1599. Le contrôle de somme refuse, et confirmer une ligne à
-- montant impair échouait — toujours. Sur 200 montants à poids égaux : la
-- moitié cassés à deux participants, les trois quarts à quatre.
--
-- `repartit_les_lignes` y échappait par hasard : elle somme des `integer`, ce
-- qui rend un `bigint`, donc une division entière. Le `::bigint` explicite
-- rend la chose indépendante du type des colonnes.

-- ── 2 · L'égalité de reste était départagée par l'identifiant ─────────────
--
-- À moitié-moitié et montant impair, les deux restes valent exactement la
-- moitié du total : il y a TOUJOURS égalité, et `uid` tranchait — un uuid tiré
-- une fois, figé à vie. Douze mois sur douze, le même recevait le centime.
-- C'est mot pour mot ce que 0063 prétendait corriger.
--
-- On départage donc par une empreinte qui dépend AUSSI de la ligne : même
-- montant, même clé, mais une autre dépense — et l'autre reçoit. C'est
-- reproductible (on peut refaire le calcul et retomber dessus) sans être
-- constant (personne n'est favorisé par son identifiant).

create or replace function public.repartit_les_lignes(foyer uuid, le_mois date)
returns void
language sql security definer set search_path = public as $$
  with a_refaire as (
    select d.id, d.charge_id, d.montant_cents
    from public.depense d
    where d.household_id = foyer and d.mois = le_mois and d.source = 'modele'
      and d.charge_id is not null
      and not exists (select 1 from public.depense_part p where p.depense_id = d.id)
  ),
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
    /* Une FENÊTRE, pas un `group by` : chaque participant garde sa ligne et
       reçoit le total de la sienne. Un `group by` les écrasait. Le `::bigint`
       porte sur le résultat de la fenêtre — `sum()` sur des `integer` rend déjà
       un `bigint`, mais l'écrire rend la division entière indépendante du type
       des colonnes, qui est précisément ce qui a piégé les trois autres copies. */
    select depense_id, montant_cents, uid, poids,
           (sum(poids) over (partition by depense_id))::bigint as poids_total
    from pesee
  ),
  brut as (
    select depense_id, uid, poids, poids_total,
           case when montant_cents < 0 then -1 else 1 end as signe,
           /* `abs(x::bigint)` et non `abs(x)::bigint` : la valeur absolue de
              −2 147 483 648 déborde un entier signé, et le cast arrivait après. */
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

-- ── `parts_du_foyer` : 9999 au lieu de 10000, même cause ─────────────────
create or replace function public.parts_du_foyer(
  le_mois date, le_foyer uuid default null, la_cle text default null)
returns table (user_profile_id uuid, part_bps integer)
language sql stable security definer set search_path = public as $$
  with bornes as (
    select (date_trunc('month', le_mois) + interval '1 month - 1 day')::date as fin,
           case when public.is_service_role() and le_foyer is not null
                then le_foyer else public.current_household() end as foyer
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
                      /* Le mois entre dans le départage : à revenus égaux, ce
                         n'est pas toujours le même qui reçoit le point. */
                      md5(p.uid::text || le_mois::text)) as rang
    from pesee p, somme s where s.total > 0
  ),
  manque as (select 10000 - coalesce(sum(base), 0) as combien from brut)
  select b.uid,
         (b.base + case when b.rang <= (select combien from manque) then 1 else 0 end)::integer
  from brut b
$$;
revoke execute on function public.parts_du_foyer(date, uuid, text) from public, anon;
grant   execute on function public.parts_du_foyer(date, uuid, text) to authenticated, service_role;

-- ── `confirme_la_depense` : la régression bloquante ──────────────────────
create or replace function public.confirme_la_depense(la_depense uuid, reel_cents integer)
returns void
language plpgsql security definer set search_path = public as $$
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
                when (select cents from total) > 0 then abs(a.part_cents)::bigint
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
end $$;
revoke execute on function public.confirme_la_depense(uuid, integer) from public, anon;
grant   execute on function public.confirme_la_depense(uuid, integer) to authenticated, service_role;

-- ── `regularise_annuel` : la quatrième copie, jamais migrée ──────────────
--
-- Elle gardait « le reliquat entier au plus gros contributeur », sans
-- traitement du signe, et ses points de base sommaient à 9 999. Le message de
-- commit de 0063 affirmait le contraire pour ce chemin ; il avait tort.
create or replace function public.regularise_annuel(
  la_charge uuid, annee integer, reel_cents integer)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  foyer   uuid := public.current_household();
  nom_charge text;
  provisionne bigint;
  combien integer;
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
  if provisionne = 0 then
    raise exception 'Les provisions de % sont à zéro : l''écart n''a rien à répartir.', annee
      using errcode = 'check_violation';
  end if;

  ecart := reel_cents::bigint - provisionne;
  if ecart = 0 then return null; end if;

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
  with brut as (
    select v.user_profile_id as uid, v.porte_cents,
           case when ecart < 0 then -1 else 1 end as signe,
           abs(ecart) * v.porte_cents / provisionne as base,
           (v.porte_cents * 10000) / provisionne as bps_base,
           row_number() over (
             order by (abs(ecart) * v.porte_cents) % provisionne desc,
                      md5(v.user_profile_id::text || ligne::text)) as rang,
           row_number() over (
             order by (v.porte_cents * 10000) % provisionne desc,
                      md5(v.user_profile_id::text || ligne::text)) as rang_bps
    from public.provisions_de(la_charge, annee) v
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
grant   execute on function public.regularise_annuel(uuid, integer, integer) to authenticated, service_role;
