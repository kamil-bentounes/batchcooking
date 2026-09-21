-- ═══════════════════════════════════════════════════════════════════════════
-- LA QUATRIÈME TABLE, ET LE RÔLE DE SERVICE QUI NE S'ANNONÇAIT PLUS
--
-- 0038 a refermé les tables filles de `recipe` — et en a oublié une. La classe
-- B en compte QUATRE (`docs/schema.md`), pas trois : `recipe_step_dependency`
-- est restée en `using (true)`, en lecture comme en écriture. Un compte qui ne
-- voit pas une étape privée pouvait tout de même repointer l'arc qui la
-- précède : le graphe qui ordonne la session s'en allait chez quelqu'un
-- d'autre. « Trois sur quatre » est la forme que prend ce genre d'oubli.
--
-- Et 0038 a introduit son propre piège. En passant `tg_session_task_convive` en
-- `security definer` — pour lire le cycle hors RLS — `current_user` est devenu
-- le propriétaire de la fonction, jamais `service_role` : le contournement
-- posé pour les scripts était devenu du code mort. Le même motif dormait déjà
-- dans 0037 sur `tg_session_convive_pose`, où il empêchait purement et
-- simplement le rôle de service de créer une invitation.
--
-- `public.is_service_role()` (0006) existe exactement pour ça : elle regarde
-- aussi le claim du jeton, donc elle survit à `security definer`.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * 1 · Les arcs suivent leurs étapes, dans les deux sens.
 *
 * `before_id` autant que `after_id` : sans le premier, on repointe un arc vers
 * une étape qu'on ne voit pas, et l'ordre d'une recette privée se réécrit
 * depuis l'extérieur. Le `with check` porte sur les DEUX bouts de la nouvelle
 * ligne — c'est lui qui empêche de faire entrer un arc chez quelqu'un.
 */
drop policy if exists recipe_step_dependency_read on public.recipe_step_dependency;
create policy recipe_step_dependency_read on public.recipe_step_dependency
  for select to authenticated
  using (exists (select 1 from public.recipe_step s where s.id = after_id)
         and exists (select 1 from public.recipe_step s where s.id = before_id));

/**
 * Une étape qu'on a le droit de corriger : le catalogue mutualisé, que
 * personne ne possède (classe B, D16), ou une recette qui est à nous.
 *
 * ⚠️ `security definer` : la policy de `recipe_step_dependency` ne doit pas
 *    dépendre de la RLS de `recipe_step`, sans quoi le prédicat d'écriture
 *    serait plus permissif que celui de lecture le jour où l'une des deux
 *    change. Elle dit ce qu'elle veut dire, et rien d'autre.
 */
create or replace function public.arc_corrigible(etape uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.recipe_step s
    join public.recipe r on r.id = s.recipe_id
    where s.id = etape
      and (r.owner_household_id is null
           or r.owner_household_id = public.current_household()))
$$;
revoke execute on function public.arc_corrigible(uuid) from public, anon;
grant   execute on function public.arc_corrigible(uuid) to authenticated;

drop policy if exists recipe_step_dependency_update on public.recipe_step_dependency;
create policy recipe_step_dependency_update on public.recipe_step_dependency
  for update to authenticated
  using (public.arc_corrigible(after_id) and public.arc_corrigible(before_id))
  with check (public.arc_corrigible(after_id) and public.arc_corrigible(before_id));

/**
 * 2 · Le rôle de service s'annonce par `is_service_role()`, jamais par
 *     `current_user`.
 *
 * Et trois choses que 0038 laissait passer :
 *
 *  · `id` n'était pas gelé — un convive changeait la clé primaire d'un geste,
 *    qui disparaissait de l'écran de son hôte ;
 *  · `started_at` se DICTAIT. En l'antidatant de cinq heures avant de terminer,
 *    le convive faisait entrer une observation de 300 minutes dans le journal
 *    de durées de son hôte (D48), qui ne peut pas l'effacer. Les horodatages se
 *    MESURENT : on les repose à `now()`, la mesure redevient ce qu'elle dit ;
 *  · on ne pouvait pas RENDRE un geste qu'on avait pris soi-même, alors que la
 *    règle voulait dire « on ne prend pas celui d'un autre ».
 */
create or replace function public.tg_session_task_convive()
returns trigger language plpgsql security definer set search_path = public as $$
declare hote uuid;
begin
  if public.is_service_role() then return new; end if;

  select c.household_id into hote from public.cycle c where c.id = old.cycle_id;
  if hote = public.current_household() then return new; end if;

  -- ── Le plan ne bouge pas ──────────────────────────────────────────────────
  if new.id is distinct from old.id
     or new.cycle_id is distinct from old.cycle_id
     or new.household_id is distinct from old.household_id
     or new.label is distinct from old.label
     or new.verb is distinct from old.verb
     or new.quantity_g is distinct from old.quantity_g
     or new.appliance_code is distinct from old.appliance_code
     or new.duration_min is distinct from old.duration_min
     or new.is_active is distinct from old.is_active
     or new.planned_start_min is distinct from old.planned_start_min
     or new.position is distinct from old.position
     or new.created_at is distinct from old.created_at then
    raise exception 'un convive cuisine la session, il ne la réécrit pas'
      using errcode = 'check_violation';
  end if;

  -- ── La durée se mesure, elle ne se dicte pas (D48) ────────────────────────
  if new.actual_min is distinct from old.actual_min then
    raise exception 'la durée se mesure, elle ne se dicte pas'
      using errcode = 'check_violation';
  end if;

  -- ── Prendre, rendre, terminer. Rien d'autre ───────────────────────────────
  if new.assignee_id is distinct from old.assignee_id then
    if old.done_at is not null then
      raise exception 'un geste fait ne change plus de main' using errcode = 'check_violation';
    elsif old.assignee_id is null then
      if new.assignee_id is distinct from auth.uid() then
        raise exception 'on ne prend un geste que pour soi' using errcode = 'check_violation';
      end if;
    elsif old.assignee_id = auth.uid() then
      if new.assignee_id is not null then
        raise exception 'on ne passe pas son geste à quelqu''un d''autre'
          using errcode = 'check_violation';
      end if;
    else
      raise exception 'ce geste est déjà à quelqu''un' using errcode = 'check_violation';
    end if;
  end if;

  if new.started_at is distinct from old.started_at then
    if old.started_at is null and new.started_at is not null then
      new.started_at := now();                       -- on mesure, on ne croit pas
    elsif new.started_at is null and old.done_at is null
          and old.assignee_id = auth.uid() then
      null;                                          -- rendre son propre geste
    else
      raise exception 'un geste commencé ne se recommence pas'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.done_at is distinct from old.done_at then
    if old.done_at is not null then
      raise exception 'un geste fait ne se défait pas' using errcode = 'check_violation';
    end if;
    if coalesce(new.assignee_id, old.assignee_id) is distinct from auth.uid() then
      raise exception 'on ne termine que le geste qu''on a pris'
        using errcode = 'check_violation';
    end if;
    new.done_at := now();
  end if;
  return new;
end $$;

-- Les deux triggers de 0037, au même motif : `security definer` leur avait pris
-- leur porte de service sans que rien ne le dise.
create or replace function public.tg_session_convive_pose()
returns trigger language plpgsql security definer set search_path = public as $$
declare hote uuid;
begin
  if public.is_service_role() then return new; end if;

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

create or replace function public.tg_session_convive_rejoint()
returns trigger language plpgsql as $$
begin
  if public.is_service_role() then return new; end if;
  if new.cycle_id  is distinct from old.cycle_id
     or new.hote_id   is distinct from old.hote_id
     or new.invite_id is distinct from old.invite_id then
    raise exception 'une invitation ne change ni de session ni de foyer'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

/*
 * ⚠️ `recipe_nutrition` n'est PAS tracée.
 *
 *    0038 annonçait « la correction y laisse sa trace » : c'est vrai des trois
 *    autres tables de la classe B, qui portent `edited_by_household_id` et
 *    passent par `tg_class_b_guard`. Celle-ci n'a ni l'un ni l'autre. Une
 *    correction des macros du catalogue mutualisé reste donc anonyme. C'est
 *    écrit ici plutôt que corrigé à la hâte : ajouter la colonne demande de
 *    reprendre l'agrégat, et personne n'édite ces valeurs à la main aujourd'hui.
 */
