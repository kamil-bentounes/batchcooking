-- Celui qui crée le foyer choisit son prénom, comme l'invitée.
--
-- `create_household` fabriquait le prénom depuis l'adresse : `kamil-1790147184836`
-- pour `kamil-1790147184836@…`. Le même défaut avait été corrigé pour l'invitée
-- (son prénom part vide, et l'application la mène à son profil) : il restait
-- chez celui qui crée le foyer, qui arrivait au hub sous ce prénom-là, sans
-- jamais passer par l'écran où l'on dit son prénom, son revenu et sa date
-- d'arrivée. Vide, l'application le mène au profil après son mot de passe.
create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
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
  insert into public.user_profile (id, household_id, display_name) values (v_uid, v_id, '');
  return v_id;
end $$;
