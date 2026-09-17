-- Porte d'entrée : un utilisateur authentifié SANS profil crée son foyer.
-- SECURITY DEFINER car il doit écrire dans household et user_profile alors que
-- current_household() vaut encore NULL, donc que les policies le bloqueraient.
create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_open boolean;
begin
  if v_uid is null then
    raise exception 'non authentifié' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.user_profile where id = v_uid) then
    raise exception 'déjà rattaché à un foyer' using errcode = 'unique_violation';
  end if;

  -- L'instance est sur invitation. L'auto-inscription reste active (un invité
  -- doit pouvoir créer son compte), mais la création d'un FOYER est bridée par
  -- un réglage d'instance. Ouverte tant qu'aucun foyer n'existe, puis fermable.
  select coalesce((select (value ->> 'enabled')::boolean from public.instance_setting
                   where key = 'allow_household_creation'),
                  not exists (select 1 from public.household))
    into v_open;
  if not v_open then
    raise exception 'création de foyer fermée : cette instance est sur invitation'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.household (name) values (coalesce(nullif(p_name,''), 'Mon foyer'))
    returning id into v_id;
  insert into public.user_profile (id, household_id, display_name)
    values (v_uid, v_id,
            split_part(coalesce((select email from auth.users where id = v_uid), 'moi'), '@', 1));
  return v_id;
end $$;

revoke execute on function public.create_household(text) from public, anon;
grant   execute on function public.create_household(text) to authenticated;

-- Semé explicitement à TRUE : ne pas dépendre du repli `not exists (household)`,
-- qui bascule dès le premier foyer créé et rendrait l'amorçage imprévisible.
-- ⚠️ À passer à false une fois les comptes du foyer en place.
insert into public.instance_setting (key, value)
values ('allow_household_creation', '{"enabled": true}'::jsonb)
on conflict (key) do nothing;
