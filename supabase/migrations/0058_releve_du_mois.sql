-- ═══════════════════════════════════════════════════════════════════════════
-- LE RELEVÉ DU MOIS, ET L'EXCÉDENT
--
-- Vers le 27, on saisit ce qu'on a RÉELLEMENT payé sur tout ce qui n'était
-- qu'une prévision : restaurant, culture, énergie, courses. L'écart entre le
-- provisionné et le payé est l'EXCÉDENT — et il se calcule sans connaître le
-- solde bancaire, ce que je croyais nécessaire à tort : chacun a viré sa part
-- des provisions, on sait maintenant ce qui est parti, la différence est là.
--
-- Encore faut-il garder ce qui avait été PRÉVU. La confirmation d'un montant
-- réel écrase `montant_cents` et repose les parts : sans mémoire du prévu, la
-- comparaison disparaît au moment même où elle devient possible.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.depense
  add column montant_prevu_cents integer;

comment on column public.depense.montant_prevu_cents is
  'Ce que le générateur avait provisionné, gelé. `montant_cents` devient le réel '
  'à la confirmation ; sans cette colonne, l''écart s''effacerait au moment de '
  'servir. NULL pour une ligne saisie à la main, qui n''a jamais été une prévision.';

-- Les lignes déjà engendrées n'ont jamais été confirmées : leur montant EST
-- encore le prévu.
update public.depense set montant_prevu_cents = montant_cents
 where source = 'modele' and montant_prevu_cents is null;

-- ── Le prévu ne bouge plus ────────────────────────────────────────────────
create or replace function public.tg_prevu_gele()
returns trigger language plpgsql as $$
begin
  if public.is_service_role() then return new; end if;
  if new.montant_prevu_cents is distinct from old.montant_prevu_cents then
    raise exception 'Ce qui avait été prévu ne se réécrit pas.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger tg_depense_prevu_gele before update on public.depense
  for each row execute function public.tg_prevu_gele();

-- ── L'excédent du mois, par personne ──────────────────────────────────────
--
-- Chacun a viré sa part des PROVISIONS ; on connaît maintenant le RÉEL. La
-- différence lui revient — et elle se répartit selon la part qu'il portait,
-- pas selon la clé du jour.
--
-- Positif = trop versé, à lui rendre ou à mettre de côté.
-- Négatif = il reste à payer, ça s'ajoutera au virement suivant.
create or replace function public.excedent_du_mois(le_mois date)
returns table (user_profile_id uuid, excedent_cents bigint)
language sql stable security definer set search_path = public as $$
  with lignes as (
    select d.id, d.montant_cents, coalesce(d.montant_prevu_cents, d.montant_cents) as prevu
    from public.depense d
    where d.household_id = public.current_household()
      and d.mois = date_trunc('month', le_mois)::date
      and d.source = 'modele'
      and d.nature = 'connue'          -- seules les lignes confirmées comptent
  ),
  /* La part de chacun est prise sur la ligne elle-même : c'est le RATIO qui
     compte, et il ne change pas à la confirmation — seuls les montants
     changent. */
  parts as (
    select p.user_profile_id as uid, l.id,
           l.prevu - l.montant_cents as ecart,
           p.part_cents,
           sum(p.part_cents) over (partition by l.id) as total_ligne
    from lignes l join public.depense_part p on p.depense_id = l.id
  )
  select uid, sum(ecart * part_cents / nullif(total_ligne, 0))::bigint
  from parts
  group by uid
$$;

comment on function public.excedent_du_mois(date) is
  'Par personne : ce qu''elle a versé en trop (positif) ou qu''il lui reste à '
  'verser (négatif) sur les lignes du mois déjà confirmées. Ne demande AUCUN '
  'solde bancaire — l''écart entre le prévu et le payé suffit.';

revoke execute on function public.excedent_du_mois(date) from public, anon;
grant   execute on function public.excedent_du_mois(date) to authenticated, service_role;

-- ── Le générateur gèle le prévu dès la naissance de la ligne ──────────────
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
      and exists (
        select 1 from public.charge_participant cp
        join public.user_profile p on p.id = cp.user_profile_id
        where cp.charge_id = c.id and p.entre_le <= fin_mois)
  )
  insert into public.depense
    (household_id, charge_id, mois, libelle, montant_cents, montant_prevu_cents,
     nature, source, compte_id, enveloppe_id)
  select foyer, a.id, debut_mois, a.libelle, a.du_mois, a.du_mois,
         /* Une charge portée par une ENVELOPPE est une prévision au même titre
            qu'une charge variable : le restaurant à 400 € n'est pas un montant
            connu, c'est un plafond qu'on confirmera. */
         case when a.variable or a.periodicite <> 'mensuel' or a.enveloppe_id is not null
              then 'estimee' else 'connue' end,
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
