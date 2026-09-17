-- Les TROIS formes de prédicat RLS.

-- ── Classe A : lecture pour tout authentifié. AUCUNE policy d'écriture :
-- seul le rôle de service, qui contourne RLS, peut écrire.
do $$
declare t text;
begin
  foreach t in array array[
    'food','food_yield_factor','unit_weight','unit_conversion','density',
    'default_temperature','default_duration','typical_quantity',
    'appliance_catalog','ingestion_job','instance_setting'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_read', t);
  end loop;
end $$;

-- ── Classe B : lecture par tous, UPDATE par tout authentifié.
-- Pas de policy INSERT ni DELETE : le catalogue est alimenté par le worker (0b).
-- La restriction aux champs peu sûrs n'est PAS exprimable en RLS : trigger (0006).
--
-- ⚠️ `using (true)` en lecture ignore visibility et owner_household_id. Sans effet
--    ici (tables vides) ; à resserrer au lot 4, quand des recettes privées existeront.
do $$
declare t text;
begin
  foreach t in array array[
    'recipe','recipe_ingredient','recipe_step','recipe_step_dependency'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_read', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (true) with check (true)',
      t || '_update', t);
  end loop;
end $$;

-- ⚠️⚠️ NE JAMAIS écrire `for all` sur household ni user_profile : `for all` inclut
--    DELETE, donc un simple membre pourrait supprimer son foyer — la cascade
--    effacerait TOUS les profils et TOUTES les cibles — ou supprimer son propre
--    profil, ce qui remettrait current_household() à NULL et lui permettrait de
--    recréer un foyer pour s'échapper du sien. La suppression passe EXCLUSIVEMENT
--    par delete_my_account() (migration 0008).

-- ── Forme 1 : la clé EST le foyer. Lecture et mise à jour seulement.
alter table public.household enable row level security;
create policy household_select on public.household
  for select to authenticated using (id = public.current_household());
create policy household_update on public.household
  for update to authenticated
  using (id = public.current_household())
  with check (id = public.current_household());

-- ── Forme 2 : colonne household_id directe.
alter table public.user_profile enable row level security;
create policy user_profile_select on public.user_profile
  for select to authenticated using (household_id = public.current_household());
-- Mise à jour : SON PROPRE profil seulement. Cadrée sur le foyer, un membre
-- pourrait renommer son conjoint. Le WITH CHECK interdit en outre de se déplacer.
create policy user_profile_update on public.user_profile
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and household_id = public.current_household());

-- L'invitation se révoque légitimement : DELETE autorisé, portée foyer.
alter table public.invitation enable row level security;
create policy invitation_all on public.invitation
  for all to authenticated
  using (household_id = public.current_household())
  with check (household_id = public.current_household());

-- ── Forme 3 : household_id dénormalisé (rempli par trigger, migration 0006).
--
-- ⚠️ PORTÉE PERSONNE, PAS FOYER. Une policy cadrée sur le foyer laisserait un
--    membre SUPPRIMER et MODIFIER les cibles de son conjoint. La lecture reste au
--    foyer — le bilan nutritionnel du lot 1 en a besoin — mais toute écriture est
--    limitée à soi.
alter table public.nutrition_target enable row level security;
create policy nutrition_target_select on public.nutrition_target
  for select to authenticated using (household_id = public.current_household());
create policy nutrition_target_insert on public.nutrition_target
  for insert to authenticated with check (user_profile_id = auth.uid());
create policy nutrition_target_update on public.nutrition_target
  for update to authenticated
  using (user_profile_id = auth.uid()) with check (user_profile_id = auth.uid());
create policy nutrition_target_delete on public.nutrition_target
  for delete to authenticated using (user_profile_id = auth.uid());
