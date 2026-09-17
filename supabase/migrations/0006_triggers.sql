-- PostgREST fait SET ROLE service_role : current_user suffit. Le claim JWT est
-- vérifié en second, par robustesse.
create or replace function public.is_service_role()
returns boolean language sql stable as $$
  select current_user = 'service_role'
      or coalesce(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           '') = 'service_role'
$$;

-- Garde de la classe B : ce que RLS ne peut pas exprimer, la restriction
-- dépendant de la VALEUR de confidence. Générique sur 4 tables aux colonnes
-- différentes : to_jsonb(old) ? 'confidence' saute la vérification sur recipe
-- et recipe_step_dependency, qui n'ont pas cette colonne. Les 4 ont en revanche
-- edited_by_household_id, donc l'affectation est toujours valide.
create or replace function public.tg_class_b_guard()
returns trigger language plpgsql as $$
declare old_conf numeric;
begin
  if public.is_service_role() then
    return new;
  end if;

  if to_jsonb(old) ? 'confidence' then
    old_conf := nullif(to_jsonb(old) ->> 'confidence', '')::numeric;
    if old_conf is not null and old_conf >= 0.8 then
      raise exception 'ligne à confiance élevée (%), non modifiable par un foyer', old_conf
        using errcode = 'check_violation';
    end if;
  end if;

  new.edited_by_household_id := public.current_household();
  new.edited_at := now();
  return new;
end $$;

create trigger class_b_guard before update on public.recipe
  for each row execute function public.tg_class_b_guard();
create trigger class_b_guard before update on public.recipe_ingredient
  for each row execute function public.tg_class_b_guard();
create trigger class_b_guard before update on public.recipe_step
  for each row execute function public.tg_class_b_guard();
create trigger class_b_guard before update on public.recipe_step_dependency
  for each row execute function public.tg_class_b_guard();

-- Dénormalisation de nutrition_target.household_id.
-- SECURITY DEFINER : doit lire user_profile, qui est sous RLS.
-- BEFORE INSERT s'exécute avant la contrainte NOT NULL et avant le WITH CHECK.
create or replace function public.tg_nutrition_target_household()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select household_id into new.household_id
  from public.user_profile where id = new.user_profile_id;
  if new.household_id is null then
    raise exception 'profil % introuvable', new.user_profile_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

create trigger nutrition_target_household
  before insert or update of user_profile_id on public.nutrition_target
  for each row execute function public.tg_nutrition_target_household();

create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger ingestion_job_touch before update on public.ingestion_job
  for each row execute function public.tg_touch_updated_at();
