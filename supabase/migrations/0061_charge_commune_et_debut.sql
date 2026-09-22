-- ═══════════════════════════════════════════════════════════════════════════
-- CE QU'UNE REVUE GLOBALE A TROUVÉ, ET QUI CASSE LE PREMIER USAGE
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · Une charge se souvient qu'elle est COMMUNE ────────────────────────
--
-- Le défaut est sournois : une charge posée pendant qu'on est seul dans le
-- foyer n'a qu'un participant, et rien ne garde l'intention. Quand le deuxième
-- membre arrive, le mois se refige (0060) et ne change RIEN — `charge_participant`
-- ne contient toujours qu'une personne. Il fallait rouvrir les quinze charges
-- une par une, et la case « commun » pré-cochée du catalogue était perdue.
alter table public.charge add column commun boolean not null default false;
comment on column public.charge.commun is
  'L''INTENTION : cette charge se partage avec tout le foyer. Elle survit au fait '
  'qu''il n''y ait qu''une personne au moment de la poser — sans quoi inviter '
  'quelqu''un ensuite n''y changerait rien.';

-- Les charges déjà posées : communes si elles ont plus d'un participant, ou si
-- le foyer n'en compte qu'un — auquel cas on ne peut pas distinguer, et
-- l'intention la plus probable est le partage.
update public.charge c set commun = true
where (select count(*) from public.charge_participant cp where cp.charge_id = c.id) > 1
   or (select count(*) from public.user_profile p where p.household_id = c.household_id) = 1;

-- ── Un nouveau membre entre dans toutes les charges communes ──────────────
create or replace function public.tg_membre_rejoint_les_communes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.charge_participant (charge_id, user_profile_id, household_id)
  select c.id, new.id, c.household_id
  from public.charge c
  where c.household_id = new.household_id
    and c.commun
    and c.archive_le is null
  on conflict do nothing;

  /* Et le mois en cours se repose, s'il n'a encore rien coûté : sinon la
     personne serait dans les charges sans être dans les parts. */
  perform public.refige_pour(new.household_id,
    date_trunc('month', (now() at time zone 'Europe/Paris'))::date);
  return null;
end $$;

create trigger tg_profil_rejoint_les_communes
  after insert on public.user_profile
  for each row execute function public.tg_membre_rejoint_les_communes();

-- ── 2 · Un mois confirmé le DIT, au lieu d'être deviné ───────────────────
--
-- 0060 devinait qu'un mois avait été vécu en comparant `montant_cents` à
-- `montant_prevu_cents`. Or confirmer une ligne au montant exactement prévu ne
-- change rien : le mois restait ouvert, et un changement de revenu repartageait
-- une ligne déjà réglée — D60 défait dans un cas parfaitement atteignable.
--
-- Un marqueur explicite, donc. Une heuristique d'égalité de montants ne dit pas
-- « quelqu'un a confirmé », elle dit « le montant n'a pas bougé ».
alter table public.depense add column confirme_le timestamptz;
comment on column public.depense.confirme_le is
  'Quand quelqu''un a dit « c''est ça ». C''est LUI qui clôt le mois, pas une '
  'comparaison de montants : confirmer un relevé égal à la provision est le cas '
  'le plus fréquent, et il ne changeait rien.';

-- ── 3 · Une dépense ne reste JAMAIS sans part ─────────────────────────────
--
-- `refige_pour` supprimait les parts de toutes les lignes `modele` mais n'en
-- reposait que pour celles qui ont encore une charge : une dépense dénouée les
-- perdait définitivement, et le contrôle différé l'acceptait — « zéro part »
-- étant un état de passage légitime pour la saisie. Même effet en décochant le
-- dernier participant d'une charge.
--
-- On ne touche donc qu'aux lignes qu'on saura repeupler.
create or replace function public.refige_pour(foyer uuid, le_mois date)
returns void
language plpgsql security definer set search_path = public as $$
declare debut_mois date := date_trunc('month', le_mois)::date;
begin
  if foyer is null then return; end if;
  if exists (
    select 1 from public.depense d
    where d.household_id = foyer and d.mois = debut_mois
      and (d.regle_le is not null
           or d.source <> 'modele'
           or d.confirme_le is not null)
  ) then return; end if;

  /* ⚠️ Seulement les lignes qui ont une charge ET au moins un participant
     PRÉSENT ce mois-là. Les autres gardent les parts qu'elles ont : mieux vaut
     un partage figé qu'une dépense que personne ne doit. */
  with repeuplables as (
    select d.id from public.depense d
    where d.household_id = foyer and d.mois = debut_mois and d.source = 'modele'
      and d.charge_id is not null
      and exists (
        select 1 from public.charge_participant cp
        join public.user_profile p on p.id = cp.user_profile_id
        where cp.charge_id = d.charge_id and p.entre_le <= debut_mois)
  )
  delete from public.depense_part p
  where p.depense_id in (select id from repeuplables);

  with a_refaire as (
    select d.id, d.charge_id, d.montant_cents from public.depense d
    where d.household_id = foyer and d.mois = debut_mois and d.source = 'modele'
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
  from brut b left join reste r on r.depense_id = b.depense_id;
end $$;
revoke execute on function public.refige_pour(uuid, date) from public, anon, authenticated;

-- La même règle dans `refige_le_mois`, appelée depuis l'app quand on change
-- les participants d'une charge.
create or replace function public.refige_le_mois(le_mois date)
returns integer
language plpgsql security definer set search_path = public as $$
declare foyer uuid := public.current_household();
begin
  if foyer is null then return 0; end if;
  perform public.refige_pour(foyer, le_mois);
  return 1;
end $$;
revoke execute on function public.refige_le_mois(date) from public, anon;
grant   execute on function public.refige_le_mois(date) to authenticated, service_role;

-- ── 4 · Le relevé pose le marqueur ────────────────────────────────────────
-- Sans lui, confirmer ne clôt rien et le mois reste repartageable.
create or replace function public.confirme_la_depense(la_depense uuid, reel_cents integer)
returns void
language plpgsql security definer set search_path = public as $$
declare foyer uuid := public.current_household();
        ancien integer;
begin
  select d.montant_cents into ancien from public.depense d
  where d.id = la_depense and d.household_id = foyer;
  if ancien is null then raise exception 'Dépense inconnue.'; end if;

  /* L'ordre est imposé par le contrôle de somme différé, qui n'admet que zéro
     part ou un total exact : retirer, changer, reposer — en UNE transaction,
     ce qui règle aussi la coupure réseau de la version en trois requêtes. */
  create temp table anciennes_parts on commit drop as
    select user_profile_id, part_cents, part_bps
    from public.depense_part where depense_id = la_depense;

  delete from public.depense_part where depense_id = la_depense;

  update public.depense
     set montant_cents = reel_cents, nature = 'connue', confirme_le = now()
   where id = la_depense;

  insert into public.depense_part
    (depense_id, user_profile_id, household_id, part_cents, part_bps)
  with total as (select coalesce(sum(part_cents), 0) as t, count(*) as n from anciennes_parts),
  brut as (
    select a.user_profile_id as uid, a.part_bps,
           case when (select t from total) = 0
                then reel_cents / greatest((select n from total), 1)
                else (reel_cents::bigint * a.part_cents / (select t from total))::integer
           end as cents,
           row_number() over (order by a.part_cents desc, a.user_profile_id) as rang
    from anciennes_parts a
  ),
  manque as (select reel_cents - coalesce(sum(cents), 0) as r from brut)
  select la_depense, b.uid, foyer,
         b.cents + case when b.rang = 1 then (select r from manque)::integer else 0 end,
         b.part_bps
  from brut b;
end $$;

comment on function public.confirme_la_depense(uuid, integer) is
  'Saisit le montant réel d''une ligne : elle devient connue, porte son marqueur '
  'de confirmation, et ses parts se reposent dans les mêmes proportions — le tout '
  'en une transaction, là où trois requêtes pouvaient laisser une dépense sans part.';

revoke execute on function public.confirme_la_depense(uuid, integer) from public, anon;
grant   execute on function public.confirme_la_depense(uuid, integer) to authenticated, service_role;
