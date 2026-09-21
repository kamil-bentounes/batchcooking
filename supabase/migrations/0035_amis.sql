-- ═══════════════════════════════════════════════════════════════════════════
-- LES AMIS : PARTAGER SES RECETTES ENTRE FOYERS
--
-- Jusqu'ici il n'y avait que deux niveaux : le catalogue mutualisé, que tout le
-- monde lit, et le foyer, où tout est commun. Rien entre les deux — or ce qui
-- circule vraiment entre gens qui cuisinent, c'est « tiens, essaie ça ».
--
-- Trois principes, et ils décident de tout le reste :
--
--  · L'AMITIÉ EST SYMÉTRIQUE ET EXPLICITE. Elle se demande par un lien, elle
--    s'accepte, et elle se rompt des deux côtés d'un coup. On ne suit pas
--    quelqu'un à son insu.
--  · LE DÉFAUT EST PRIVÉ. Une recette collée reste au foyer tant que personne
--    n'a décidé autre chose. Partager est un geste, pas un réglage oublié.
--  · ON VOIT QUI. Une recette venue d'ailleurs porte le prénom de qui l'a
--    ajoutée — sinon « d'où sort celle-là ? » n'a pas de réponse.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Le lien entre deux foyers ───────────────────────────────────────────────
create table public.foyer_ami (
  id           uuid primary key default gen_random_uuid(),
  /** Celui qui invite. Il existe dès la création du lien. */
  invite_par   uuid not null references public.household(id) on delete cascade,
  /** Celui qui accepte. NULL tant que l'invitation est en attente. */
  accepte_par  uuid references public.household(id) on delete cascade,
  /** Le lien à transmettre. Non devinable, et il ne sert qu'une fois. */
  jeton        uuid not null unique default gen_random_uuid(),
  cree_par     uuid references auth.users(id) on delete set null,
  expire_le    timestamptz not null default now() + interval '7 days',
  accepte_le   timestamptz,
  created_at   timestamptz not null default now(),
  constraint foyer_ami_pas_soi_meme check (accepte_par is distinct from invite_par),
  constraint foyer_ami_accepte_coherent check ((accepte_par is null) = (accepte_le is null))
);
create index on public.foyer_ami (invite_par);
create index on public.foyer_ami (accepte_par);

-- Une seule amitié par paire, quel que soit le sens de la demande.
create unique index foyer_ami_unique on public.foyer_ami (
  least(invite_par, accepte_par), greatest(invite_par, accepte_par)
) where accepte_par is not null;

/**
 * Les foyers amis du mien.
 *
 * `security definer` : la table est lisible par ses deux côtés, mais cette
 * fonction sert dans les policies de LECTURE des recettes, où elle doit pouvoir
 * regarder les deux sens sans dépendre d'elles.
 */
create or replace function public.foyers_amis()
returns setof uuid language sql stable security definer set search_path = public as $$
  select case when a.invite_par = public.current_household()
              then a.accepte_par else a.invite_par end
  from public.foyer_ami a
  where a.accepte_par is not null
    and (a.invite_par = public.current_household()
         or a.accepte_par = public.current_household())
$$;
revoke execute on function public.foyers_amis() from public, anon;
grant   execute on function public.foyers_amis() to authenticated;

/**
 * Accepter une invitation d'amitié.
 *
 * Écrire cette ligne demande de toucher un foyer qui n'est pas le sien : la RLS
 * l'interdit, à raison. La fonction le fait pour nous, et vérifie tout ce
 * qu'une policy ne peut pas dire — le jeton, l'expiration, qu'on n'est pas en
 * train de s'ajouter soi-même, et qu'on n'était pas déjà amis.
 */
create or replace function public.accepter_amitie(p_jeton uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  moi uuid := public.current_household();
  lien public.foyer_ami;
begin
  if moi is null then
    raise exception 'aucun foyer' using errcode = 'insufficient_privilege';
  end if;

  select * into lien from public.foyer_ami where jeton = p_jeton;
  if lien is null then
    raise exception 'invitation inconnue' using errcode = 'no_data_found';
  end if;
  if lien.accepte_par is not null then
    raise exception 'invitation déjà utilisée' using errcode = 'unique_violation';
  end if;
  if lien.expire_le < now() then
    raise exception 'invitation expirée' using errcode = 'check_violation';
  end if;
  if lien.invite_par = moi then
    raise exception 'on ne devient pas ami avec soi-même' using errcode = 'check_violation';
  end if;

  -- La consommation est ATOMIQUE : la condition est dans l'UPDATE, pas avant.
  -- Deux foyers qui ouvrent le même lien en même temps, un seul l'obtient.
  update public.foyer_ami
  set accepte_par = moi, accepte_le = now()
  where id = lien.id and accepte_par is null
  returning invite_par into lien.invite_par;

  if not found then
    raise exception 'invitation déjà utilisée' using errcode = 'unique_violation';
  end if;
  return lien.invite_par;
end $$;
revoke execute on function public.accepter_amitie(uuid) from public, anon;
grant   execute on function public.accepter_amitie(uuid) to authenticated;

-- RLS : chacun voit et gère les liens qui le concernent, des deux côtés.
alter table public.foyer_ami enable row level security;

create policy foyer_ami_select on public.foyer_ami
  for select to authenticated
  using (invite_par = public.current_household()
         or accepte_par = public.current_household());

create policy foyer_ami_insert on public.foyer_ami
  for insert to authenticated
  with check (invite_par = public.current_household() and accepte_par is null);

-- Rompre : des DEUX côtés. Une amitié qu'un seul pourrait défaire n'en est pas
-- une, et une qu'aucun ne peut défaire non plus.
create policy foyer_ami_delete on public.foyer_ami
  for delete to authenticated
  using (invite_par = public.current_household()
         or accepte_par = public.current_household());

-- Pas d'UPDATE depuis le client : l'acceptation passe par `accepter_amitie`,
-- qui seule sait vérifier le jeton. Sans cette absence, on s'ajouterait
-- n'importe quel foyer en écrivant `accepte_par` soi-même.

-- ── Ce qu'une recette peut être ─────────────────────────────────────────────
alter table public.recipe drop constraint recipe_visibility_check;
alter table public.recipe add constraint recipe_visibility_check
  check (visibility in ('privee', 'partagee', 'publique'));

comment on column public.recipe.visibility is
  'privee = le foyer seul · partagee = le foyer et ses amis · publique = tous. '
  'Le défaut est privee : partager est un geste, pas un réglage oublié.';

/**
 * Qui l'a ajoutée.
 *
 * Sans cette colonne, une recette venue d'un foyer ami arrive sans provenance,
 * et « d'où sort celle-là ? » n'a pas de réponse. `on delete set null` : le
 * départ de quelqu'un n'efface pas ce qu'il a apporté.
 */
alter table public.recipe
  add column created_by uuid references public.user_profile(id) on delete set null;

-- ── Qui lit quoi ────────────────────────────────────────────────────────────
drop policy if exists recipe_read on public.recipe;
create policy recipe_read on public.recipe
  for select to authenticated
  using (
    owner_household_id is null                             -- le catalogue mutualisé
    or owner_household_id = public.current_household()     -- ce qui est à nous
    or visibility = 'publique'                             -- ce que quelqu'un a ouvert à tous
    or (visibility = 'partagee'                            -- ce qu'un ami nous montre
        and owner_household_id in (select public.foyers_amis()))
  );

-- Les lignes suivent leur recette, comme avant.
do $$
declare t text;
begin
  foreach t in array array['recipe_ingredient', 'recipe_step', 'recipe_nutrition'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (exists (select 1 from public.recipe r
                        where r.id = %I.recipe_id
                          and (r.owner_household_id is null
                               or r.owner_household_id = public.current_household()
                               or r.visibility = ''publique''
                               or (r.visibility = ''partagee''
                                   and r.owner_household_id in (select public.foyers_amis())))))',
      t || '_read', t, t);
  end loop;
end $$;

/**
 * Le prénom de qui a ajouté une recette qu'on peut voir.
 *
 * `user_profile` est cadrée sur le foyer, et c'est bien : on n'a pas à lire la
 * liste des membres d'un autre foyer. Mais si l'on voit une recette, on doit
 * pouvoir en voir la provenance — sinon l'attribution ne s'affiche jamais.
 *
 * La vue n'expose donc QUE le prénom, et seulement pour les foyers qu'on a le
 * droit de connaître : le sien et ses amis. Ni e-mail, ni identifiant de
 * connexion, ni cibles nutritionnelles.
 */
create or replace view public.profil_visible
with (security_invoker = true) as
  select p.id, p.display_name, p.household_id
  from public.user_profile p
  where p.household_id = public.current_household()
     or p.household_id in (select public.foyers_amis());

-- La vue hérite de la RLS de `user_profile` avec `security_invoker`, qui la
-- restreindrait au seul foyer. On la lit donc par une fonction qui sait voir
-- les amis, et rien d'autre qu'eux.
create or replace function public.prenoms_visibles()
returns table (id uuid, display_name text, household_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.household_id
  from public.user_profile p
  where p.household_id = public.current_household()
     or p.household_id in (select public.foyers_amis())
$$;
revoke execute on function public.prenoms_visibles() from public, anon;
grant   execute on function public.prenoms_visibles() to authenticated;

drop view if exists public.profil_visible;
