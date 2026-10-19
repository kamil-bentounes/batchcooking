-- ═══════════════════════════════════════════════════════════════════════════
-- 0090 · Supprimer son compte quand on a déclaré son compte en banque
--
-- Le droit à l'effacement échouait pour tout membre qui avait un compte
-- `perso`. Un compte perso exige un titulaire (`compte_titulaire_coherent`,
-- 0051), et supprimer le profil met `titulaire_id` à null
-- (`on delete set null`, 0049) : la contrainte refusait, et toute la
-- suppression était annulée. Kamil a deux comptes perso, dont un archivé : son
-- effacement échouait en prod. Aucun test ne créait de compte perso.
--
-- Le compte perso de qui part n'appartient plus à personne : il part avec lui,
-- AVANT le profil. Les charges et les lignes qui y étaient payées restent, leur
-- `compte_id` passe à null (0052) ; une poche d'épargne de même (0054).
--
-- Le reste est 0008 à l'identique : le foyer n'est supprimé que s'il ne reste
-- personne dedans.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_hh uuid;
begin
  if v_uid is null then
    raise exception 'non authentifié' using errcode = 'insufficient_privilege';
  end if;

  select household_id into v_hh from public.user_profile where id = v_uid;

  delete from public.compte where genre = 'perso' and titulaire_id = v_uid;
  delete from public.user_profile where id = v_uid;

  if v_hh is not null
     and not exists (select 1 from public.user_profile where household_id = v_hh) then
    delete from public.household where id = v_hh;
  end if;

  delete from auth.users where id = v_uid;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant   execute on function public.delete_my_account() to authenticated;
