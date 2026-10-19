-- ═══════════════════════════════════════════════════════════════════════════
-- 0089 · Le lien suffit
--
-- Cinq invitées réelles n'ont jamais dépassé la création de compte. Le mail
-- d'invitation portait un lien de connexion Supabase : il mourait au bout
-- d'UNE heure, ne servait qu'une fois — les antivirus de messagerie le
-- « cliquent » avant la personne —, et partait par un serveur limité à deux
-- mails par heure, souvent rangé en indésirables. Le 30 septembre, l'invitée
-- a ouvert un mail vieux de huit jours : lien mort.
--
-- Décision du 19/10/2026 : le lien `/invite/<jeton>` — trente jours, usage
-- unique — suffit. L'invitée y choisit son mot de passe, et `accept-invite`
-- crée son compte sur place. Il faut pour cela deux lectures que la RLS ne
-- permet pas : celle de l'invitée, qui n'a pas encore de compte, et celle de
-- la fonction, qui doit savoir si l'adresse en a déjà un.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · Ce que l'invitée lit avant d'avoir un compte ──────────────────────
--
-- Le jeton est le secret : qui l'a voit QUI l'invite, pour QUELLE adresse, et
-- si le lien vaut encore. Rien d'autre du foyer. Un jeton inconnu ne rend
-- aucune ligne, comme un jeton qu'on aurait mal recopié.
create or replace function public.invitation_par_jeton(jeton uuid)
returns table (email text, invite_par text, expire_le timestamptz, etat text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.email,
         -- Le prénom de qui a invité. Parti depuis, ou sans prénom : le foyer
         -- invite toujours (0032), on le dit sans nom.
         coalesce(nullif(btrim(p.display_name), ''), 'Ton foyer') as invite_par,
         i.expires_at as expire_le,
         case when i.accepted_at is not null then 'utilisee'
              when i.expires_at < now()      then 'expiree'
              else 'valide' end as etat
    from public.invitation i
    left join public.user_profile p on p.id = i.created_by
   where i.token = jeton
$$;
revoke execute on function public.invitation_par_jeton(uuid) from public;
grant  execute on function public.invitation_par_jeton(uuid) to anon, authenticated;

-- ── 2 · Ce que la fonction doit savoir de l'adresse ───────────────────────
--
-- Trois cas, et un seul refus :
--   · pas de compte          → on le crée ;
--   · un compte SANS profil  → on lui pose le mot de passe. C'est l'état que
--     laissait l'ancien mail (`inviteUserByEmail` créait le compte à l'envoi,
--     jamais confirmé) ou un lien de connexion suivi sans jamais rejoindre :
--     un compte qui ne porte rien, ni foyer ni donnée ;
--   · un compte AVEC profil  → il est déjà dans un foyer. On ne touche ni à
--     son mot de passe ni à son foyer : elle se connecte, et l'écran le lui dit.
--
-- `auth.users` n'est pas exposée : la fonction est réservée au rôle de service.
create or replace function public.compte_pour_invitation(adresse text)
returns table (id uuid, a_un_profil boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, exists (select 1 from public.user_profile p where p.id = u.id)
    from auth.users u
   where lower(u.email) = lower(btrim(adresse))
$$;
revoke execute on function public.compte_pour_invitation(text) from public, anon, authenticated;
grant  execute on function public.compte_pour_invitation(text) to service_role;
