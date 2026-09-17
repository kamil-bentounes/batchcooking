-- SECURITY DEFINER : la fonction s'exécute avec les droits de son propriétaire
-- (postgres, propriétaire des tables), et le propriétaire d'une table n'est pas
-- soumis à sa RLS. C'est ce qui évite la récursion de policy.
--
-- ⚠️ Cela cesse d'être vrai si l'on pose FORCE ROW LEVEL SECURITY sur
--    user_profile, ou si l'on change le propriétaire de la fonction.
create or replace function public.current_household()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.user_profile where id = auth.uid()
$$;

revoke execute on function public.current_household() from public, anon;
grant   execute on function public.current_household() to authenticated, service_role;
