-- ═══════════════════════════════════════════════════════════════════════════
-- LA FRONTIÈRE DU CONVIVE, POUR DE BON
--
-- 0037 annonçait « il cuisine, il ne réécrit pas ». La frontière n'était tenue
-- ni sur les colonnes, ni sur les recettes, ni dans le temps. Quatre trous,
-- chacun ouvert par un raccourci différent :
--
--  · LE GEL DES COLONNES SE CONTOURNAIT EN UNE LIGNE DE PAYLOAD. Le trigger
--    sortait tôt quand `new.household_id` valait le foyer de l'appelant — or
--    c'est le CLIENT qui envoie cette colonne, et `tg_derive_household` ne la
--    repose qu'APRÈS (ordre alphabétique : convive, duree, household). Envoyer
--    son propre foyer suffisait à passer pour l'hôte, puis la colonne était
--    remise en place et le `with check` ne voyait rien.
--  · LES TABLES FILLES DE `recipe` ÉTAIENT RESTÉES EN `using (true)`. 0036 a
--    cadré `recipe`, pas `recipe_ingredient` ni `recipe_step` : ce qui les
--    protégeait n'était que l'impossibilité de LIRE. 0037 a ouvert la lecture
--    aux recettes de la session — donc l'écriture avec. Un simple ami
--    réécrivait déjà les étapes d'une recette partagée.
--  · RIEN NE REFERMAIT LA SESSION. Ni la clôture du cycle, ni la rupture de
--    l'amitié. « On ne convie qu'un ami » n'était vrai qu'à l'INSERT : un ami
--    d'un dimanche lisait les recettes privées de son hôte pour toujours.
--  · LES COLONNES D'EXÉCUTION N'ÉTAIENT PAS PROTÉGÉES. Un convive décochait un
--    geste terminé, dictait `actual_min` — la durée MESURÉE de D48 — et
--    dépossédait l'hôte de son geste.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * 1 · L'hôte se lit dans le CYCLE, jamais dans la ligne qu'on nous envoie.
 *
 * ⚠️ Et la liste gelée porte maintenant les colonnes d'exécution, qui ne sont
 *    pas libres pour autant : on prend ce qui n'est pris par personne, on
 *    termine ce qu'on a pris, et on ne revient pas en arrière. `actual_min` est
 *    posé par `session_task_duree`, qui passe après celui-ci : le convive n'a
 *    donc rien à y écrire.
 */
create or replace function public.tg_session_task_convive()
returns trigger language plpgsql security definer set search_path = public as $$
declare hote uuid;
begin
  if current_user = 'service_role' then return new; end if;

  select c.household_id into hote from public.cycle c where c.id = old.cycle_id;
  if hote = public.current_household() then return new; end if;

  -- ── Le plan ne bouge pas ──────────────────────────────────────────────────
  if new.cycle_id is distinct from old.cycle_id
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

  -- ── Et l'exécution ne se défait pas ───────────────────────────────────────
  if new.actual_min is distinct from old.actual_min then
    raise exception 'la durée se mesure, elle ne se dicte pas'
      using errcode = 'check_violation';
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    if old.assignee_id is not null then
      raise exception 'ce geste est déjà à quelqu''un' using errcode = 'check_violation';
    end if;
    if new.assignee_id is distinct from auth.uid() then
      raise exception 'on ne prend un geste que pour soi' using errcode = 'check_violation';
    end if;
  end if;
  if new.started_at is distinct from old.started_at and old.started_at is not null then
    raise exception 'un geste commencé ne se recommence pas'
      using errcode = 'check_violation';
  end if;
  if new.done_at is distinct from old.done_at then
    if old.done_at is not null then
      raise exception 'un geste fait ne se défait pas' using errcode = 'check_violation';
    end if;
    if coalesce(new.assignee_id, old.assignee_id) is distinct from auth.uid() then
      raise exception 'on ne termine que le geste qu''on a pris'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

/**
 * 2 · Les lignes d'une recette s'écrivent comme la recette.
 *
 * Même prédicat que `recipe_update` (0036) : ce qui est à nous, et le catalogue
 * mutualisé que personne ne possède — c'est tout l'objet de la classe B (D16),
 * et la correction y laisse sa trace. Rien d'autre.
 */
do $$
declare t text;
begin
  foreach t in array array['recipe_ingredient', 'recipe_step', 'recipe_nutrition'] loop
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (exists (select 1 from public.recipe r
                        where r.id = %I.recipe_id
                          and (r.owner_household_id is null
                               or r.owner_household_id = public.current_household())))
         with check (exists (select 1 from public.recipe r
                        where r.id = %I.recipe_id
                          and (r.owner_household_id is null
                               or r.owner_household_id = public.current_household())))',
      t || '_update', t, t, t);
  end loop;
end $$;

/**
 * 3 · Une invitation vaut pour UNE session, et tant qu'on est amis.
 *
 * `session_convive` n'a ni expiration ni lien avec l'état du cycle : la seule
 * façon honnête de refermer est de le demander à chaque lecture. Trois
 * conditions, et elles tiennent ensemble — la session est vivante, on a dit
 * oui, et l'amitié tient encore.
 */
create or replace function public.sessions_partagees()
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.cycle_id
  from public.session_convive c
  join public.cycle y on y.id = c.cycle_id
  where c.invite_id = public.current_household()
    and c.rejoint_le is not null
    and y.state in ('pret', 'en_cuisine', 'dressage')
    and c.hote_id in (select public.foyers_amis())
$$;

create or replace function public.taches_partagees()
returns setof uuid language sql stable security definer set search_path = public as $$
  select t.id from public.session_task t
  where t.cycle_id in (select public.sessions_partagees())
$$;

create or replace function public.recettes_partagees()
returns setof uuid language sql stable security definer set search_path = public as $$
  select r.recipe_id from public.cycle_recipe r
  where r.cycle_id in (select public.sessions_partagees())
$$;

/**
 * 4 · Ce que l'accueil a le droit de montrer.
 *
 * Le convié ne peut pas lire le cycle tant qu'il n'a pas rejoint — c'est voulu.
 * Mais alors il ne peut pas non plus savoir si la session est encore vivante,
 * et l'accueil affichait « Alice t'invite à cuisiner » indéfiniment, y compris
 * sur une session close dont les gestes restaient écrivables.
 */
create or replace function public.invitations_de_session()
returns table (id uuid, cycle_id uuid, hote_id uuid, rejoint boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.cycle_id, c.hote_id, c.rejoint_le is not null
  from public.session_convive c
  join public.cycle y on y.id = c.cycle_id
  where c.invite_id = public.current_household()
    and y.state in ('pret', 'en_cuisine', 'dressage')
    and c.hote_id in (select public.foyers_amis())
  order by c.invite_le
$$;
revoke execute on function public.invitations_de_session() from public, anon;
grant   execute on function public.invitations_de_session() to authenticated;
