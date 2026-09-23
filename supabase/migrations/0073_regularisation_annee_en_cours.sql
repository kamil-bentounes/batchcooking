-- ═══════════════════════════════════════════════════════════════════════════
-- 0073 · Régulariser une année EN COURS facturait la charge une fois et demie
--
-- Mesuré deux fois, sur le geste le plus ordinaire qui soit : l'avis de taxe
-- foncière arrive fin août ou en septembre, on le saisit, et l'app facture
-- 1 812 € pour une facture de 1 450 €.
--
-- La cause : l'écart se calculait sur les mois DÉJÀ provisionnés. Au 23
-- septembre, neuf mois sont ouverts — 1 087,47 € — donc l'écart posé vaut
-- 362,53 €. Puis octobre, novembre et décembre engendrent chacun leur
-- douzième, 362,49 € de plus, que personne n'annule. L'année en cours est
-- pré-sélectionnée dans l'écran, et la phrase rassurante sous le bouton parle
-- du seul point qui n'était pas le problème.
--
-- Ce qu'il faut comparer au montant réel, c'est ce que l'année ENTIÈRE va
-- provisionner : les mois ouverts, plus ceux qui restent à ouvrir tant que la
-- charge court. Sur une année complète l'écart retombe alors à zéro, ce qui
-- est la vérité — on a provisionné exactement ce qu'on devait.
--
-- Pour une année révolue, rien ne change : il ne reste aucun mois à provisionner.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Ce qu'une charge provisionnera ENCORE sur une année, après le dernier mois
 * ouvert. Zéro pour une année révolue, zéro pour une charge archivée ou finie.
 */
create or replace function public.provisions_a_venir(la_charge uuid, annee integer)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  /* ⚠️ « À venir » se définit par l'ABSENCE DE DÉPENSE, pas par la date du
     jour. Une première version bornait au mois suivant aujourd'hui : sur une
     année future dont des mois avaient déjà été ouverts, elle comptait ces
     mois-là DEUX FOIS. Le bon critère est celui qu'`ouvre_le_mois` applique —
     un mois compte s'il n'a pas encore engendré sa ligne. */
  with c as (
    select montant_cents, periodicite, debut, fin, archive_le, household_id
    from public.charge where id = la_charge
  )
  select coalesce(sum(public.provision_mensuelle(c.montant_cents, c.periodicite)), 0)::bigint
  from c,
       generate_series(make_date(annee, 1, 1), make_date(annee, 12, 1),
                       interval '1 month') as m(mois)
  where c.archive_le is null
    and c.debut <= (m.mois + interval '1 month - 1 day')::date
    and (c.fin is null or c.fin >= m.mois::date)
    and not exists (
      select 1 from public.depense d
      where d.charge_id = la_charge and d.source = 'modele'
        and d.mois = m.mois::date)
$$;

revoke execute on function public.provisions_a_venir(uuid, integer) from public, anon;
grant   execute on function public.provisions_a_venir(uuid, integer) to authenticated, service_role;

-- ── L'écart se mesure sur l'année entière ──────────────────────────────────
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
  a_venir     bigint;
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

  /* ⚠️ L'année ENTIÈRE, pas les mois déjà ouverts.
     Comparer le réel aux seules provisions faites facturait la charge une fois
     et demie : au 23 septembre neuf mois sont ouverts, l'écart posé valait donc
     un quart de la facture, puis octobre, novembre et décembre engendraient
     chacun leur douzième par-dessus. Sur une année complète l'écart retombe à
     zéro, ce qui est la vérité — on a provisionné exactement ce qu'on devait. */
  a_venir := public.provisions_a_venir(la_charge, annee);
  ecart := reel_cents::bigint - provisionne - a_venir;
  /* Rien à régulariser : le provisionnement de l'année tombe juste. C'est le
     cas NORMAL d'une charge annuelle dont on saisit le montant attendu, et il
     ne doit pas produire de ligne. */
  if ecart = 0 then
    update public.depense set nature = 'connue'
    where charge_id = la_charge and source = 'modele'
      and household_id = foyer and extract(year from mois) = annee;
    return null;
  end if;
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

-- ── Se retirer quand on est le dernier retire vraiment ─────────────────────
--
-- Mesuré : on décoche tout le monde d'une charge, la ligne affiche « personne
-- n'y participe », et elle continue de facturer. `refige_pour` ne supprimait
-- les parts que des lignes qu'il saurait repeupler — l'`exists` sur un
-- participant déjà arrivé — donc une charge que plus personne ne porte gardait
-- les siennes telles quelles.
--
-- L'intention était bonne : ne pas laisser une dépense sans parts, ce que le
-- contrôle de somme refuse. La conclusion était fausse. Une charge que
-- personne ne porte n'engendre RIEN — `ouvre_le_mois` ne la crée même pas — et
-- sa dépense du mois doit donc disparaître, parts comprises.
--
-- Un mois réglé ou confirmé garde ce qu'il a : c'est ce qu'on a réellement payé.
create or replace function public.refige_pour(foyer uuid, le_mois date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare debut_mois date := date_trunc('month', le_mois)::date;
begin
  if foyer is null then return; end if;

  /* ⚠️ D'ABORD les orphelines. Une dépense dont la charge n'a plus AUCUN
     participant arrivé ne se repeuplera jamais : on la supprime, au lieu de
     lui laisser des parts que plus personne ne doit. */
  delete from public.depense d
  where d.household_id = foyer and d.mois = debut_mois and d.source = 'modele'
    and d.charge_id is not null
    and d.regle_le is null and d.confirme_le is null
    and not exists (
      select 1 from public.charge_participant cp
      join public.user_profile up on up.id = cp.user_profile_id
      where cp.charge_id = d.charge_id and up.entre_le <= debut_mois);

  /* On ne retire QUE les parts des lignes qu'on saura repeupler, et qui ne
     sont ni réglées ni confirmées. Le reste garde ce qu'il a. */
  delete from public.depense_part p
  where p.depense_id in (
    select d.id from public.depense d
    where d.household_id = foyer and d.mois = debut_mois and d.source = 'modele'
      and d.charge_id is not null
      and d.regle_le is null and d.confirme_le is null
      and exists (
        select 1 from public.charge_participant cp
        join public.user_profile up on up.id = cp.user_profile_id
        where cp.charge_id = d.charge_id and up.entre_le <= debut_mois));

  perform public.repartit_les_lignes(foyer, debut_mois);
end $$;
