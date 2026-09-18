-- ═══════════════════════════════════════════════════════════════════════════
-- LES RÈGLES QUI NE DOIVENT PAS DÉPENDRE DU CLIENT
--
-- Tout ce qui est ici tient parce que deux téléphones écrivent en même temps
-- (D50) et qu'un client peut être vieux d'une version. Les invariants du
-- produit — péremption, journal, rattachement au foyer — vivent en base.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Rattachement au foyer ───────────────────────────────────────────────────
-- RLS empêche d'écrire une ligne au nom d'un AUTRE foyer, pas de rattacher sa
-- propre ligne au cycle d'un autre foyer. Ce trigger dérive household_id du
-- parent : la ligne devient alors invisible à son auteur, ce qui est le
-- comportement correct — on ne laisse pas de trace chez les autres.
create or replace function public.tg_derive_household()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  parent_table constant text := tg_argv[0];
  fk_column    constant text := tg_argv[1];
  fk_value     uuid;
  parent_hh    uuid;
begin
  execute format('select ($1).%I', fk_column) into fk_value using new;
  if fk_value is null then return new; end if;

  execute format('select household_id from public.%I where id = $1', parent_table)
    into parent_hh using fk_value;

  if parent_hh is null then
    raise exception 'parent % introuvable : %', parent_table, fk_value
      using errcode = 'foreign_key_violation';
  end if;

  new.household_id := parent_hh;
  return new;
end $$;

create trigger cycle_recipe_household before insert or update on public.cycle_recipe
  for each row execute function public.tg_derive_household('cycle','cycle_id');
create trigger shopping_trip_household before insert or update on public.shopping_trip
  for each row execute function public.tg_derive_household('cycle','cycle_id');
create trigger session_task_household before insert or update on public.session_task
  for each row execute function public.tg_derive_household('cycle','cycle_id');
create trigger session_appliance_household before insert or update on public.session_appliance
  for each row execute function public.tg_derive_household('cycle','cycle_id');
create trigger session_task_recipe_household before insert or update on public.session_task_recipe
  for each row execute function public.tg_derive_household('session_task','task_id');
create trigger session_task_dependency_household before insert or update on public.session_task_dependency
  for each row execute function public.tg_derive_household('session_task','task_id');
create trigger meal_extra_household before insert or update on public.meal_extra
  for each row execute function public.tg_derive_household('meal_slot','meal_slot_id');
create trigger portion_event_household before insert or update on public.portion_event
  for each row execute function public.tg_derive_household('portion','portion_id');
create trigger aisle_order_household before insert or update on public.aisle_order
  for each row execute function public.tg_derive_household('store','store_id');

-- ── Péremption (D29) ────────────────────────────────────────────────────────
-- Des seuils ABSOLUS par lieu, jamais un pourcentage : 20 % de trois mois ne
-- veut rien dire. Le client n'a qu'à comparer expires_at à maintenant.
create or replace function public.tg_portion_peremption()
returns trigger language plpgsql as $$
declare
  jours_frigo    constant int := 4;
  jours_congele  constant int := 90;
  heures_decongele constant int := 24;
  lieu_change    boolean := tg_op = 'INSERT' or new.location is distinct from old.location;
begin
  if new.location = 'congelateur' then
    new.frozen_at := coalesce(new.frozen_at, now());
    -- Sortir puis remettre au congélateur ne rallonge pas la vie de la part :
    -- on repart de la date de congélation, pas de maintenant.
    if lieu_change or new.expires_at is null then
      new.expires_at := new.frozen_at + make_interval(days => jours_congele);
    end if;
    if tg_op = 'UPDATE' and old.state = 'decongelee' then
      new.state := 'au_frais';   -- recongeler n'est pas conseillé, mais se fait
    end if;
  else
    -- Retour au frigo depuis le congélateur : c'est une décongélation, et une
    -- part décongelée se mange le lendemain, pas dans quatre jours.
    if tg_op = 'UPDATE' and old.location = 'congelateur' then
      new.state      := 'decongelee';
      new.frozen_at  := null;
      new.expires_at := now() + make_interval(hours => heures_decongele);
    elsif new.expires_at is null then
      new.expires_at := case new.state
        when 'decongelee' then now() + make_interval(hours => heures_decongele)
        else new.prepared_at + make_interval(days => jours_frigo)
      end;
    end if;
  end if;
  return new;
end $$;

create trigger portion_peremption before insert or update on public.portion
  for each row execute function public.tg_portion_peremption();

-- ── Journal (traçabilité complète réclamée au brief) ────────────────────────
create or replace function public.tg_portion_journal()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if tg_op = 'INSERT' then
    k := 'dressee';
  elsif new.state is distinct from old.state then
    k := case new.state
           when 'mangee' then 'mangee'
           when 'jetee'  then 'jetee'
           when 'decongelee' then 'decongelee'
           else null end;
  elsif new.location is distinct from old.location then
    k := case when new.location = 'congelateur' then 'congelee' else 'decongelee' end;
  end if;

  if k is null then return null; end if;
  insert into public.portion_event (portion_id, household_id, kind, by_user_id)
  values (new.id, new.household_id, k, auth.uid());
  return null;
end $$;

create trigger portion_journal after insert or update on public.portion
  for each row execute function public.tg_portion_journal();

-- ── L'ordre des rayons s'apprend du geste (D58) ─────────────────────────────
-- Personne ne saisira jamais le plan de son Lidl. On observe l'ordre des
-- cochages et on s'en sert la fois d'après : une moyenne mobile suffit, et
-- elle encaisse le jour où le magasin réorganise ses gondoles.
create or replace function public.tg_shopping_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rang int;
  lissage constant numeric := 0.4;   -- poids de la dernière observation
begin
  if new.checked_at is null or old.checked_at is not null then
    if new.checked_at is null then new.checked_rank := null; end if;
    return new;
  end if;

  select coalesce(max(checked_rank), 0) + 1 into rang
  from public.shopping_item
  where cycle_id is not distinct from new.cycle_id
    and store_id is not distinct from new.store_id
    and household_id = new.household_id;
  new.checked_rank := rang;

  if new.store_id is not null and new.aisle is not null then
    insert into public.aisle_order (household_id, store_id, aisle, position)
    values (new.household_id, new.store_id, new.aisle, rang)
    on conflict (store_id, aisle) do update
      set position   = aisle_order.position * (1 - lissage) + excluded.position * lissage,
          updated_at = now();
  end if;
  return new;
end $$;

create trigger shopping_check before update of checked_at on public.shopping_item
  for each row execute function public.tg_shopping_check();

-- ── Un repas mangé consomme sa barquette (D49 en miroir) ────────────────────
-- Cocher « je l'ai mangé » dans la semaine ne doit pas laisser la part au frigo.
create or replace function public.tg_meal_slot_consomme()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.state = 'mange' and new.portion_id is not null
     and (tg_op = 'INSERT' or old.state is distinct from 'mange') then
    update public.portion set state = 'mangee'
    where id = new.portion_id and state <> 'mangee';
  end if;
  return null;
end $$;

create trigger meal_slot_consomme after insert or update on public.meal_slot
  for each row execute function public.tg_meal_slot_consomme();

-- ── Durée mesurée, pas confirmée (D48) ──────────────────────────────────────
-- Deux temps : BEFORE pose actual_min sur la ligne (un AFTER ne le peut pas),
-- AFTER en tire l'observation.
create or replace function public.tg_session_task_mesure()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.done_at is null or old.done_at is not null or new.actual_min is null then
    return null;
  end if;

  if new.verb is not null and new.actual_min > 0 then
    insert into public.duration_observation
      (household_id, verb, appliance_code, quantity_g, planned_min, actual_min)
    values (new.household_id, new.verb, new.appliance_code, new.quantity_g,
            new.duration_min, new.actual_min);
  end if;
  return null;
end $$;

create or replace function public.tg_session_task_duree()
returns trigger language plpgsql as $$
begin
  if new.done_at is not null and old.done_at is null and new.started_at is not null then
    new.actual_min := greatest(
      extract(epoch from (new.done_at - new.started_at)) / 60.0, 0.01);
  end if;
  return new;
end $$;

create trigger session_task_duree before update on public.session_task
  for each row execute function public.tg_session_task_duree();
create trigger session_task_mesure after update on public.session_task
  for each row execute function public.tg_session_task_mesure();
