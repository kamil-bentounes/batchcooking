-- ═══════════════════════════════════════════════════════════════════════════
-- RLS DU LOT 1
--
-- Même forme que 0005 : classe C, prédicat `household_id = current_household()`
-- des deux côtés (using ET with check). Les quatre verbes sont écrits
-- séparément — jamais `for all`, dont la leçon a déjà été payée sur household :
-- un `for all` inclut DELETE, et on ne s'en aperçoit pas en le relisant.
--
-- Écrire le prédicat en `with check` autant qu'en `using` est ce qui empêche
-- de DÉPLACER une ligne vers un autre foyer par un simple update.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'cycle','cycle_recipe',
    'store','aisle_order','shopping_item','shopping_trip','shopping_habit',
    'session_task','session_task_recipe','session_task_dependency','session_appliance',
    'portion','meal_slot','meal_extra','frequent_food','stock_item'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (household_id = public.current_household())', t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (household_id = public.current_household())', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (household_id = public.current_household())
         with check (household_id = public.current_household())', t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (household_id = public.current_household())', t || '_delete', t);
  end loop;
end $$;

-- ── Les deux journaux : lecture seule ───────────────────────────────────────
-- Ils sont écrits par des triggers SECURITY DEFINER, qui contournent RLS par
-- propriété de table. Un journal qu'on peut réécrire ne prouve rien : ni INSERT
-- ni UPDATE ni DELETE, pour personne.
do $$
declare t text;
begin
  foreach t in array array['portion_event','duration_observation'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (household_id = public.current_household())', t || '_select', t);
  end loop;
end $$;

-- ── Classe A : la machine à états est une donnée de référence ───────────────
alter table public.cycle_transition enable row level security;
create policy cycle_transition_read on public.cycle_transition
  for select to authenticated using (true);

-- ── Le cycle courant, en une fonction ───────────────────────────────────────
-- L'accueil pose cette question à chaque ouverture ; qu'elle soit posée
-- une fois et bien vaut mieux que quinze `select` recopiés dans les écrans.
create or replace function public.current_cycle()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.cycle
  where household_id = public.current_household()
    and state not in ('cloture','interrompue')
  limit 1
$$;
revoke execute on function public.current_cycle() from public, anon;
grant   execute on function public.current_cycle() to authenticated, service_role;

-- ── Ouvrir un cycle ─────────────────────────────────────────────────────────
-- Passe par une fonction et non par un INSERT direct pour que l'unicité du
-- cycle vivant remonte comme un message, pas comme une violation d'index.
create or replace function public.open_cycle(p_week_of date, p_servings int default 10)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  hh   uuid := public.current_household();
  vivant uuid;
  nouveau uuid;
begin
  if hh is null then
    raise exception 'aucun foyer' using errcode = 'insufficient_privilege';
  end if;

  select id into vivant from public.cycle
  where household_id = hh and state not in ('cloture','interrompue');
  if vivant is not null then return vivant; end if;

  -- Une semaine déjà couverte par un cycle CLOS ne se rouvre pas : on
  -- n'efface pas un bilan pour recommencer. Le message doit le dire.
  if exists (select 1 from public.cycle
             where household_id = hh and week_of = p_week_of) then
    raise exception 'la semaine du % a déjà son cycle, clos', p_week_of
      using errcode = 'unique_violation';
  end if;

  insert into public.cycle (household_id, week_of, servings_target, state)
  values (hh, p_week_of, p_servings, 'vide')
  returning id into nouveau;
  return nouveau;
end $$;
revoke execute on function public.open_cycle(date, int) from public, anon;
grant   execute on function public.open_cycle(date, int) to authenticated, service_role;
