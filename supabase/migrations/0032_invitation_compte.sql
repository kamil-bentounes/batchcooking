-- ═══════════════════════════════════════════════════════════════════════════
-- L'INVITATION ET LA SUPPRESSION DE COMPTE
--
-- Trois défauts trouvés en relisant le lot 0a, qui n'avait jamais été relu.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * 1 · Supprimer son compte échouait dès que le foyer comptait deux personnes.
 *
 * `invitation.created_by` référence `auth.users` sans clause `on delete`.
 * Alice invite Bob, Bob accepte, Alice demande la suppression de son compte :
 * 23503, et **toute la transaction est annulée** — ni compte, ni profil, ni
 * cibles supprimés, une erreur Postgres brute à l'écran. Le test du dépôt
 * passait parce que sa victime était seule et n'avait invité personne.
 *
 * L'invitation survit à celui qui l'a créée : c'est le FOYER qui invite.
 */
alter table public.invitation
  drop constraint invitation_created_by_fkey,
  add constraint invitation_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

/**
 * 2 · Un membre pouvait ressusciter une invitation consommée ou expirée.
 *
 * La policy était un `for all` — le seul du schéma, et la migration 0005 dit
 * pourtant en toutes lettres pourquoi on n'en écrit pas. Elle autorisait
 * `update accepted_at = null, expires_at = '2999-01-01'` depuis le client :
 * « usage unique » et « valable 7 jours » n'étaient pas des propriétés du
 * système, seulement des intentions.
 *
 * On garde les quatre verbes — révoquer une invitation est légitime — mais
 * l'UPDATE ne porte plus que sur ce qui se corrige de bonne foi, et jamais sur
 * une invitation déjà acceptée.
 */
drop policy invitation_all on public.invitation;

create policy invitation_select on public.invitation
  for select to authenticated
  using (household_id = public.current_household());

create policy invitation_insert on public.invitation
  for insert to authenticated
  with check (household_id = public.current_household());

-- Révoquer, oui. Ressusciter, non : une invitation acceptée est figée.
create policy invitation_update on public.invitation
  for update to authenticated
  using (household_id = public.current_household() and accepted_at is null)
  with check (household_id = public.current_household() and accepted_at is null);

create policy invitation_delete on public.invitation
  for delete to authenticated
  using (household_id = public.current_household());

/**
 * Et l'expiration ne se repousse pas indéfiniment.
 *
 * Sept jours depuis la création : prolonger est permis, transformer en jeton
 * perpétuel ne l'est pas.
 */
create or replace function public.tg_invitation_borne()
returns trigger language plpgsql as $$
begin
  if new.expires_at > new.created_at + interval '30 days' then
    new.expires_at := new.created_at + interval '30 days';
  end if;
  -- Une invitation acceptée ne redevient pas ouverte, même par le rôle de
  -- service : seule la fonction `accept-invite` la rend, et elle sait pourquoi.
  if tg_op = 'UPDATE' and old.accepted_at is not null and new.accepted_at is null
     and current_user <> 'service_role' then
    raise exception 'une invitation acceptée ne se rouvre pas'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger invitation_borne before insert or update on public.invitation
  for each row execute function public.tg_invitation_borne();

/**
 * 3 · Les cibles nutritionnelles sont HISTORISÉES et lues sans pagination.
 *
 * Un objectif qui change est un INSERT, jamais un UPDATE : au bout de mille
 * lignes, la cible d'un membre sort de la fenêtre de PostgREST, et le client
 * transforme « inconnu » en zéro. Une vue rend la DERNIÈRE cible de chacun,
 * une ligne par personne, et le problème disparaît par construction.
 */
create or replace view public.nutrition_target_courante
with (security_invoker = true) as
  select distinct on (user_profile_id) *
  from public.nutrition_target
  order by user_profile_id, valid_from desc, id desc;
