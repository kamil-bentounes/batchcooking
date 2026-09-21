-- ═══════════════════════════════════════════════════════════════════════════
-- CE QU'UNE LIGNE DÉSIGNE APPARTIENT AU MÊME FOYER QU'ELLE
--
-- Six correctifs de suite ont fermé le même motif une table à la fois. Celui-ci
-- le ferme à la SOURCE, pour toute la classe C — parce que la raison pour
-- laquelle « ça tient encore » est plus fragile que je ne le croyais.
--
-- Ce qui tenait, et pourquoi ce n'était pas le `with check` : PostgreSQL
-- applique aussi la policy SELECT à la ligne NOUVELLE lors d'un UPDATE. C'est
-- ELLE qui refusait de déplacer une ligne vers un autre foyer, pas le prédicat
-- d'écriture. Sur `nutrition_target`, dont le `with check` ne mentionne même pas
-- `household_id`, c'est la seule chose qui protège. Autrement dit : élargir
-- une policy de LECTURE quelque part rouvre mécaniquement l'écriture ailleurs.
--
-- C'est exactement ce qui est arrivé à `session_task` (voir plus bas), la seule
-- table dont le `with check` porte un disjoint de session — et la seule qui
-- fuyait.
--
-- Ce que ce fichier pose :
--
--  1 · un geste ne change pas de session ;
--  2 · ce qu'une ligne DÉSIGNE est au même foyer qu'elle — au lieu de compter
--      sur chaque consommateur pour le revérifier à l'arrivée ;
--  3 · un convive ne lit pas le nom des plats qu'un tiers a prêtés à son hôte.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * 1 · Un geste ne change pas de session. 🔴
 *
 * `tg_session_task_convive` s'ancre sur `old.cycle_id` : si la ligne PART de
 * mon cycle, il rendait `new` sans rien vérifier. Le convive poussait donc une
 * tâche à lui dans le cycle de son hôte — `tg_derive_household` reposait
 * ensuite `household_id` sur le foyer de l'hôte, et le `with check` passait par
 * son disjoint de session. L'hôte se retrouvait avec un geste au libellé
 * arbitraire qu'il n'avait pas écrit, et dont il devenait propriétaire.
 *
 * Pire : `verb`, `quantity_g` et `duration_min` étant choisis par l'attaquant,
 * la complétion faisait entrer une observation fabriquée dans le journal D48 de
 * l'hôte — celui-là même que 0039 avait refermé, atteint par une autre porte.
 * Et `duration_observation` n'a qu'une policy SELECT : l'hôte ne peut rien y
 * effacer.
 *
 * Aucun code ne déplace une tâche : le plan se réenregistre en entier.
 */
create or replace function public.tg_session_task_ancree()
returns trigger language plpgsql as $$
begin
  if new.cycle_id is distinct from old.cycle_id then
    raise exception 'un geste ne change pas de session'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists session_task_ancree on public.session_task;
-- ⚠️ Le nom compte : les triggers BEFORE s'exécutent dans l'ordre alphabétique,
--    et `session_task_ancree` doit passer AVANT `session_task_convive`, qui
--    sort tôt quand la ligne part de chez nous.
create trigger session_task_ancree before update on public.session_task
  for each row execute function public.tg_session_task_ancree();

/**
 * 2 · Ce qu'une ligne désigne est au même foyer qu'elle.
 *
 * Quinze colonnes de rattachement se repointaient librement vers le foyer d'à
 * côté. Aucune escalade n'en découlait AUJOURD'HUI, parce que chaque
 * consommateur `security definer` revérifie le foyer à l'arrivée — mais c'est
 * une protection au point d'usage, pas à la source. Le premier consommateur
 * écrit sans la clause rouvre tout le lot d'un coup.
 *
 * `food_id`, `recipe_id` et `recipe_ingredient_id` ne sont PAS concernés : ils
 * désignent du référentiel ou du catalogue, qui n'appartiennent à personne.
 *
 * ⚠️ Le rôle de service est exempté, à la différence de `tg_rattachement_gele`
 *    et `tg_arc_meme_recette`, et la nuance n'est pas de confort : là-bas un arc
 *    entre deux recettes est un NON-SENS, ici une ligne qui désigne le magasin
 *    d'un autre foyer est une donnée parfaitement sensée, simplement interdite
 *    au client. C'est une permission, pas une signification — et les tests de
 *    défense en profondeur ont besoin de pouvoir fabriquer l'état pathologique
 *    pour prouver que la seconde barrière tient aussi.
 */
create or replace function public.tg_meme_foyer()
returns trigger language plpgsql security definer set search_path = public as $$
declare colonne text := tg_argv[0];
        parente text := tg_argv[1];
        vise uuid;
        foyer uuid;
begin
  if public.is_service_role() then return new; end if;

  execute format('select ($1).%I', colonne) into vise using new;
  if vise is null then return new; end if;

  execute format('select household_id from public.%I where id = $1', parente)
    into foyer using vise;
  if foyer is null or foyer is distinct from new.household_id then
    raise exception '% désigne quelque chose qui n''est pas au foyer', colonne
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

do $$
declare l text[];
begin
  foreach l slice 1 in array array[
    ['meal_slot',               'cycle_id',          'cycle'],
    ['meal_slot',               'portion_id',        'portion'],
    ['meal_slot',               'user_profile_id',   'user_profile'],
    ['portion',                 'cycle_id',          'cycle'],
    ['portion',                 'for_user_id',       'user_profile'],
    ['shopping_item',           'cycle_id',          'cycle'],
    ['shopping_item',           'store_id',          'store'],
    ['shopping_trip',           'store_id',          'store'],
    ['weighing',                'cycle_id',          'cycle'],
    ['receipt',                 'store_id',          'store'],
    ['receipt',                 'trip_id',           'shopping_trip'],
    ['household_price',         'store_id',          'store'],
    ['shopping_habit',          'store_id',          'store'],
    ['stock_item',              'shopping_item_id',  'shopping_item'],
    ['session_task_dependency', 'depends_on_id',     'session_task']
  ] loop
    -- Le nom porte la colonne : `tg_derive_household` doit passer avant, et il
    -- s'appelle `<table>_household` — « h » vient avant « z_ ».
    execute format('drop trigger if exists %I on public.%I',
                   'z_' || l[2] || '_meme_foyer', l[1]);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.tg_meme_foyer(%L, %L)',
      'z_' || l[2] || '_meme_foyer', l[1], l[2], l[3]);
  end loop;
end $$;

/**
 * 3 · Le convive ne lit pas le nom des plats qu'un tiers a prêtés. 🟠
 *
 * 0043 a fermé `recettes_partagees()` et laissé le motif intact un cran plus
 * loin : `session_task_recipe` rendait le lien geste ↔ recette pour TOUTES les
 * tâches de la session. Le contenu restait fermé, mais l'identifiant de la
 * recette du tiers et le regroupement des gestes par plat, non. 0043 annonçait
 * que le convive « perd la mention du plat » : il ne la perdait pas.
 */
drop policy if exists session_task_recipe_select on public.session_task_recipe;
create policy session_task_recipe_select on public.session_task_recipe
  for select to authenticated
  using (household_id = public.current_household()
         or (task_id in (select public.taches_partagees())
             and recipe_id in (select public.recettes_partagees())));
