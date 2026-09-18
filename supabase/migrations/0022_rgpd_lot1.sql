-- L'export doit suivre le schéma. Sans cette mise à jour, « exporte mes
-- données » rendrait un fichier qui ignore tout du cycle, des courses et des
-- barquettes — c'est-à-dire l'essentiel de ce que le foyer a produit.
create or replace function public.export_my_data()
returns jsonb language sql stable security definer set search_path = public as $$
  with hh as (select public.current_household() as id)
  select jsonb_build_object(
    'exported_at',       now(),
    'household',         (select to_jsonb(h) from public.household h, hh where h.id = hh.id),
    'profiles',          (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                          from public.user_profile p, hh where p.household_id = hh.id),
    'nutrition_targets', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                          from public.nutrition_target t, hh where t.household_id = hh.id),
    'invitations',       (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb)
                          from public.invitation i, hh where i.household_id = hh.id),
    'llm_usage',         (select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
                          from public.llm_usage u, hh where u.household_id = hh.id),
    -- Lot 1
    'cycles',            (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
                          from public.cycle c, hh where c.household_id = hh.id),
    'cycle_recipes',     (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                          from public.cycle_recipe r, hh where r.household_id = hh.id),
    'stores',            (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                          from public.store s, hh where s.household_id = hh.id),
    'aisle_order',       (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                          from public.aisle_order a, hh where a.household_id = hh.id),
    'shopping_items',    (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                          from public.shopping_item s, hh where s.household_id = hh.id),
    'shopping_trips',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                          from public.shopping_trip t, hh where t.household_id = hh.id),
    'shopping_habits',   (select coalesce(jsonb_agg(to_jsonb(h2)), '[]'::jsonb)
                          from public.shopping_habit h2, hh where h2.household_id = hh.id),
    'session_tasks',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                          from public.session_task t, hh where t.household_id = hh.id),
    'session_appliances',(select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                          from public.session_appliance a, hh where a.household_id = hh.id),
    'duration_observations', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
                          from public.duration_observation o, hh where o.household_id = hh.id),
    'portions',          (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                          from public.portion p, hh where p.household_id = hh.id),
    'portion_events',    (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
                          from public.portion_event e, hh where e.household_id = hh.id),
    'meal_slots',        (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
                          from public.meal_slot m, hh where m.household_id = hh.id),
    'meal_extras',       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                          from public.meal_extra x, hh where x.household_id = hh.id),
    'frequent_foods',    (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
                          from public.frequent_food f, hh where f.household_id = hh.id),
    'stock_items',       (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                          from public.stock_item s, hh where s.household_id = hh.id)
  )
$$;
revoke execute on function public.export_my_data() from public, anon;
grant   execute on function public.export_my_data() to authenticated;

-- Sert au test qui garantit que l'export ne prend plus de retard sur le schéma.
-- Réservé au rôle de service : c'est de l'introspection, pas une donnée d'usage.
create or replace function public.tables_de_foyer()
returns table (table_name text)
language sql stable security definer set search_path = public, information_schema as $$
  select c.table_name::text
  from information_schema.columns c
  where c.table_schema = 'public' and c.column_name = 'household_id'
  union
  select 'household'
  order by 1
$$;
revoke execute on function public.tables_de_foyer() from public, anon, authenticated;
grant   execute on function public.tables_de_foyer() to service_role;
