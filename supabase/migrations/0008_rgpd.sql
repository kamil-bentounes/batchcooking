-- Export et suppression de compte. En usage strictement domestique le RGPD ne
-- s'applique pas (art. 2.2.c) ; ces deux fonctions sont livrées parce qu'elles
-- coûtent 20 lignes, servent de sauvegarde, et éviteront de reprendre le schéma
-- le jour où un foyer tiers se connectera.

create or replace function public.export_my_data()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'exported_at',       now(),
    'household',         (select to_jsonb(h) from public.household h
                          where h.id = public.current_household()),
    'profiles',          (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                          from public.user_profile p
                          where p.household_id = public.current_household()),
    'nutrition_targets', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                          from public.nutrition_target t
                          where t.household_id = public.current_household()),
    'invitations',       (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb)
                          from public.invitation i
                          where i.household_id = public.current_household()),
    'llm_usage',         (select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
                          from public.llm_usage u
                          where u.household_id = public.current_household())
  )
$$;
revoke execute on function public.export_my_data() from public, anon;
grant   execute on function public.export_my_data() to authenticated;

-- Supprime le profil (donc les cibles en cascade), puis le compte d'auth.
-- Le foyer n'est supprimé que s'il ne reste personne dedans.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_hh uuid;
begin
  if v_uid is null then
    raise exception 'non authentifié' using errcode = 'insufficient_privilege';
  end if;

  select household_id into v_hh from public.user_profile where id = v_uid;
  delete from public.user_profile where id = v_uid;

  if v_hh is not null
     and not exists (select 1 from public.user_profile where household_id = v_hh) then
    delete from public.household where id = v_hh;
  end if;

  delete from auth.users where id = v_uid;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant   execute on function public.delete_my_account() to authenticated;
