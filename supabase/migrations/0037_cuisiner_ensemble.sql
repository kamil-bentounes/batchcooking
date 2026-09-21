-- ═══════════════════════════════════════════════════════════════════════════
-- CUISINER À PLUSIEURS, POUR DE BON
--
-- D50 disait déjà « deux téléphones doivent voir la même chose ». C'était vrai
-- au sens du CALCUL — le plan est persisté, pas recalculé — mais faux au sens
-- de l'ÉCRAN : rien ne prévenait le second téléphone qu'une action venait
-- d'être prise. On voyait la même chose à condition de recharger.
--
-- Deux manques, donc, et ils vont ensemble :
--
--  · LE TEMPS RÉEL. `session_task` entre dans la publication : quand quelqu'un
--    prend un geste, l'autre écran le sait dans la seconde. Sans cela, deux
--    personnes prennent la même action et l'une des deux la refait.
--  · L'INVITATION. Jusqu'ici une session appartenait à un foyer et à lui seul.
--    On peut désormais convier un foyer AMI à la sienne : il suit l'avancement
--    et prend des gestes, sans rien pouvoir changer au plan.
--
-- Ce que le convive NE PEUT PAS faire est aussi important que le reste : il ne
-- réordonne pas, ne renomme pas, ne supprime rien, et ne fait pas avancer le
-- cycle de son hôte. Il cuisine.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.session_convive (
  id         uuid primary key default gen_random_uuid(),
  cycle_id   uuid not null references public.cycle(id) on delete cascade,
  /** Le foyer qui cuisine. Dérivé du cycle, jamais dicté. */
  hote_id    uuid not null references public.household(id) on delete cascade,
  /** Le foyer convié. */
  invite_id  uuid not null references public.household(id) on delete cascade,
  invite_le  timestamptz not null default now(),
  /** NULL tant qu'il n'a pas dit oui. Une invitation n'est pas une présence. */
  rejoint_le timestamptz,
  created_at timestamptz not null default now(),
  unique (cycle_id, invite_id),
  constraint session_convive_pas_soi_meme check (hote_id <> invite_id)
);
create index on public.session_convive (invite_id) where rejoint_le is not null;
create index on public.session_convive (cycle_id);

/**
 * Les sessions où je suis convié ET où j'ai dit oui.
 *
 * `security definer` : elle sert dans les policies de `session_task`, où elle
 * doit pouvoir lire `session_convive` sans dépendre des policies de celle-ci.
 */
create or replace function public.sessions_partagees()
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.cycle_id from public.session_convive c
  where c.invite_id = public.current_household() and c.rejoint_le is not null
$$;
revoke execute on function public.sessions_partagees() from public, anon;
grant   execute on function public.sessions_partagees() to authenticated;

/** Les gestes de ces sessions-là. Les tables filles n'ont que `task_id`. */
create or replace function public.taches_partagees()
returns setof uuid language sql stable security definer set search_path = public as $$
  select t.id from public.session_task t
  where t.cycle_id in (
    select c.cycle_id from public.session_convive c
    where c.invite_id = public.current_household() and c.rejoint_le is not null)
$$;
revoke execute on function public.taches_partagees() from public, anon;
grant   execute on function public.taches_partagees() to authenticated;

/** Les recettes qu'on est en train de cuisiner ensemble. */
create or replace function public.recettes_partagees()
returns setof uuid language sql stable security definer set search_path = public as $$
  select r.recipe_id from public.cycle_recipe r
  where r.cycle_id in (
    select c.cycle_id from public.session_convive c
    where c.invite_id = public.current_household() and c.rejoint_le is not null)
$$;
revoke execute on function public.recettes_partagees() from public, anon;
grant   execute on function public.recettes_partagees() to authenticated;

-- ── Poser une invitation, et n'en accepter que ce qui est à soi ─────────────
/**
 * ⚠️ Tout ce qui décide de quelque chose est posé ICI, pas par le client.
 *
 *    L'hôte est dérivé du cycle : on ne convie personne à la session d'un
 *    autre. Et on ne convie qu'un AMI — sinon l'invitation devient un moyen de
 *    faire lire son plan à n'importe quel foyer dont on connaît l'identifiant.
 */
create or replace function public.tg_session_convive_pose()
returns trigger language plpgsql security definer set search_path = public as $$
declare hote uuid;
begin
  if current_user = 'service_role' then return new; end if;

  select c.household_id into hote from public.cycle c where c.id = new.cycle_id;
  if hote is null then
    raise exception 'cycle introuvable' using errcode = 'foreign_key_violation';
  end if;
  if hote is distinct from public.current_household() then
    raise exception 'on ne convie personne à la session d''un autre foyer'
      using errcode = 'check_violation';
  end if;
  if new.invite_id not in (select public.foyers_amis()) then
    raise exception 'on ne convie que ses amis' using errcode = 'check_violation';
  end if;

  new.hote_id := hote;
  new.rejoint_le := null;   -- rejoindre est un geste du convié, pas de l'hôte
  return new;
end $$;

create trigger session_convive_pose before insert on public.session_convive
  for each row execute function public.tg_session_convive_pose();

/** Rejoindre — et rien d'autre. Le convié ne se déplace pas d'une session à l'autre. */
create or replace function public.tg_session_convive_rejoint()
returns trigger language plpgsql as $$
begin
  if current_user = 'service_role' then return new; end if;
  if new.cycle_id  is distinct from old.cycle_id
     or new.hote_id   is distinct from old.hote_id
     or new.invite_id is distinct from old.invite_id then
    raise exception 'une invitation ne change ni de session ni de foyer'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger session_convive_rejoint before update on public.session_convive
  for each row execute function public.tg_session_convive_rejoint();

-- ── Qui voit et qui écrit l'invitation ──────────────────────────────────────
alter table public.session_convive enable row level security;

create policy session_convive_select on public.session_convive
  for select to authenticated
  using (hote_id = public.current_household()
         or invite_id = public.current_household());

create policy session_convive_insert on public.session_convive
  for insert to authenticated
  with check (invite_id in (select public.foyers_amis()));

-- Seul le convié rejoint. L'hôte n'entre personne de force.
create policy session_convive_update on public.session_convive
  for update to authenticated
  using (invite_id = public.current_household())
  with check (invite_id = public.current_household());

-- Les deux peuvent défaire : l'hôte retire, le convié s'en va.
create policy session_convive_delete on public.session_convive
  for delete to authenticated
  using (hote_id = public.current_household()
         or invite_id = public.current_household());

-- ── Ce que le convive voit de la session ────────────────────────────────────
drop policy if exists cycle_select on public.cycle;
create policy cycle_select on public.cycle
  for select to authenticated
  using (household_id = public.current_household()
         or id in (select public.sessions_partagees()));

drop policy if exists session_task_select on public.session_task;
create policy session_task_select on public.session_task
  for select to authenticated
  using (household_id = public.current_household()
         or cycle_id in (select public.sessions_partagees()));

/**
 * Le convive prend et termine des gestes. Il ne touche pas au plan.
 *
 * Le `with check` porte le même prédicat que le `using` : sans cela, un convive
 * pourrait déplacer un geste vers une session à lui.
 */
drop policy if exists session_task_update on public.session_task;
create policy session_task_update on public.session_task
  for update to authenticated
  using (household_id = public.current_household()
         or cycle_id in (select public.sessions_partagees()))
  with check (household_id = public.current_household()
              or cycle_id in (select public.sessions_partagees()));

drop policy if exists session_appliance_select on public.session_appliance;
create policy session_appliance_select on public.session_appliance
  for select to authenticated
  using (household_id = public.current_household()
         or cycle_id in (select public.sessions_partagees()));

do $$
declare t text;
begin
  foreach t in array array['session_task_recipe', 'session_task_dependency'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (household_id = public.current_household()
                or task_id in (select public.taches_partagees()))',
      t || '_select', t);
  end loop;
end $$;

/**
 * Les titres des recettes qu'on cuisine ensemble.
 *
 * Sans cela, l'écran du convive affiche « Émincer 200 g d'oignons » sans
 * pouvoir dire pour quoi — alors que le geste, lui, est déjà sous ses yeux.
 * La lecture s'arrête avec la session : elle passe par `sessions_partagees()`,
 * qui ne rend rien dès que l'invitation est retirée.
 */
drop policy if exists recipe_read on public.recipe;
create policy recipe_read on public.recipe
  for select to authenticated
  using (
    owner_household_id is null                             -- le catalogue mutualisé
    or owner_household_id = public.current_household()     -- ce qui est à nous
    or visibility = 'publique'                             -- ce que quelqu'un a ouvert à tous
    or (visibility = 'partagee'                            -- ce qu'un ami nous montre
        and owner_household_id in (select public.foyers_amis()))
    or id in (select public.recettes_partagees())          -- ce qu'on cuisine ensemble
  );

/**
 * Les lignes suivent leur recette — et le disent en UN endroit.
 *
 * Le prédicat de `recipe_read` était recopié dans les trois policies filles. Il
 * y a maintenant cinq cas : à la sixième recopie, l'une d'elles serait restée
 * en arrière sans que rien ne le dise. Postgres applique la RLS de `recipe`
 * dans cette sous-requête comme ailleurs, donc `exists` suffit et ne peut plus
 * diverger.
 */
do $$
declare t text;
begin
  foreach t in array array['recipe_ingredient', 'recipe_step', 'recipe_nutrition'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (exists (select 1 from public.recipe r where r.id = %I.recipe_id))',
      t || '_read', t, t);
  end loop;
end $$;

-- ── Ce que le convive ne réécrit pas ────────────────────────────────────────
/**
 * Un geste se prend, se termine, et c'est tout.
 *
 * La policy laisse le convive écrire la LIGNE ; elle ne peut pas distinguer les
 * colonnes. Celle-ci le fait : chez un hôte qui n'est pas soi, seules les
 * colonnes d'exécution bougent. Sans elle, un convive renomme les gestes,
 * change les durées et réordonne la session de quelqu'un d'autre.
 *
 * ⚠️ Le nom compte : les triggers BEFORE UPDATE s'exécutent dans l'ordre
 *    alphabétique, et `session_task_convive` doit passer AVANT
 *    `session_task_duree`, qui pose `actual_min`.
 */
create or replace function public.tg_session_task_convive()
returns trigger language plpgsql as $$
begin
  if current_user = 'service_role' then return new; end if;
  if new.household_id = public.current_household() then return new; end if;

  if new.cycle_id is distinct from old.cycle_id
     or new.label is distinct from old.label
     or new.verb is distinct from old.verb
     or new.quantity_g is distinct from old.quantity_g
     or new.appliance_code is distinct from old.appliance_code
     or new.duration_min is distinct from old.duration_min
     or new.is_active is distinct from old.is_active
     or new.planned_start_min is distinct from old.planned_start_min
     or new.position is distinct from old.position then
    raise exception 'un convive cuisine la session, il ne la réécrit pas'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger session_task_convive before update on public.session_task
  for each row execute function public.tg_session_task_convive();

-- ── Le temps réel ───────────────────────────────────────────────────────────
-- La publication porte la RLS : chacun ne reçoit que ce qu'il a le droit de
-- lire. `replica identity full` est nécessaire pour que le filtre par
-- `cycle_id` s'applique aussi aux suppressions.
alter table public.session_task replica identity full;

-- ⚠️ Un bloc PAR table. Un `exception` annule TOUT le bloc qui le porte : les
--    trois ensemble, une table déjà publiée emportait les deux autres avec
--    elle, en silence et sans rien casser de visible.
do $$ begin
  alter publication supabase_realtime add table public.session_task;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.session_convive;
exception when duplicate_object then null; end $$;

-- ── L'export RGPD suit ──────────────────────────────────────────────────────
create or replace function public.export_my_data()
returns jsonb language sql stable security definer set search_path = public as $$
  with hh as (select public.current_household() as id)
  select public.export_my_data_base() || jsonb_build_object(
    'weighing',            (select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
                            from public.weighing w, hh where w.household_id = hh.id),
    'household_unit_weight', (select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
                            from public.household_unit_weight u, hh where u.household_id = hh.id),
    'household_ingredient_resolution', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                            from public.household_ingredient_resolution r, hh
                            where r.household_id = hh.id),
    'foyer_ami',           (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                            from public.foyer_ami a, hh
                            where a.invite_par = hh.id or a.accepte_par = hh.id),
    'recipes',             (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                            from public.recipe r, hh where r.owner_household_id = hh.id),
    'session_convives',    (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                            from public.session_convive s, hh
                            where s.hote_id = hh.id or s.invite_id = hh.id)
  )
$$;
revoke execute on function public.export_my_data() from public, anon;
grant   execute on function public.export_my_data() to authenticated;

-- `session_convive` désigne le foyer par `hote_id` : le test de couverture de
-- l'export doit la voir comme les autres.
create or replace function public.tables_de_foyer()
returns table (table_name text)
language sql stable security definer set search_path = public, information_schema as $$
  select c.table_name::text
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    and c.column_name in ('household_id', 'invite_par', 'owner_household_id', 'hote_id')
  union
  select 'household'
  order by 1
$$;
revoke execute on function public.tables_de_foyer() from public, anon, authenticated;
grant   execute on function public.tables_de_foyer() to service_role;
