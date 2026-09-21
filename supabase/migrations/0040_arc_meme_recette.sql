-- ═══════════════════════════════════════════════════════════════════════════
-- UN ARC RELIE DEUX ÉTAPES DU MÊME PLAT
--
-- 0039 a refermé `recipe_step_dependency` en vérifiant chaque bout de l'arc —
-- SÉPARÉMENT. Or ce qu'on voulait dire n'est pas « ces deux étapes sont
-- corrigibles », c'est « cet arc appartient à une recette qu'on a le droit de
-- corriger ». La nuance laissait deux gestes ouverts à n'importe quel compte :
--
--  · repointer un arc du catalogue vers une étape d'une AUTRE recette du
--    catalogue. `ordonnance.ts` lève alors « dépendances circulaires » chez
--    tous les foyers qui planifient ces deux recettes ensemble ;
--  · le tirer vers une étape de sa PROPRE recette privée. L'arc devient
--    invisible pour tout le monde — la policy de lecture, elle, exige les deux
--    bouts visibles — et une contrainte d'ordre du catalogue disparaît sans
--    que personne n'ait eu le droit de la supprimer.
--
-- Le second est le plus vicieux : c'est la nouvelle policy de lecture qui rend
-- le dégât muet. Un verrou qui cache ce qu'il n'a pas empêché.
--
-- Au passage, l'INSERT et le DELETE (0034) ne regardaient eux aussi qu'un seul
-- bout : on pouvait poser un arc dont l'origine est l'étape privée de
-- quelqu'un d'autre. Les quatre verbes disent maintenant la même chose.
--
-- Un arc INTER-recettes n'a jamais existé : `scripts/ingest.mjs` construit le
-- graphe à partir des ordinaux d'UNE recette, et l'ordre entre recettes vit
-- dans `session_task_dependency`, qui est une autre table.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists recipe_step_dependency_update on public.recipe_step_dependency;
drop policy if exists recipe_step_dependency_insert_sienne on public.recipe_step_dependency;
drop policy if exists recipe_step_dependency_delete_sienne on public.recipe_step_dependency;
drop function if exists public.arc_corrigible(uuid);

/**
 * L'arc `avant → après` tient-il dans UNE recette, et laquelle ?
 *
 * Les deux fonctions ne diffèrent que par la propriété exigée, et c'est la
 * seule différence qui compte :
 *
 *  · `arc_corrigible` — le catalogue mutualisé, que personne ne possède
 *    (classe B, D16), ou ce qui est à nous : on CORRIGE ;
 *  · `arc_sien` — ce qui est à nous, et rien d'autre : on POSE et on RETIRE.
 *
 * ⚠️ `security definer` : le prédicat d'écriture ne doit pas dépendre de la RLS
 *    de `recipe_step`, sans quoi les deux divergeraient le jour où l'une des
 *    deux change. La jointure sur `a.recipe_id = b.recipe_id` est le cœur du
 *    correctif — sans elle, chaque bout était jugé dans son coin.
 */
create or replace function public.arc_corrigible(avant uuid, apres uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.recipe_step a
    join public.recipe_step b on b.recipe_id = a.recipe_id
    join public.recipe r on r.id = a.recipe_id
    where a.id = avant and b.id = apres
      and (r.owner_household_id is null
           or r.owner_household_id = public.current_household()))
$$;
revoke execute on function public.arc_corrigible(uuid, uuid) from public, anon;
grant   execute on function public.arc_corrigible(uuid, uuid) to authenticated;

create or replace function public.arc_sien(avant uuid, apres uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.recipe_step a
    join public.recipe_step b on b.recipe_id = a.recipe_id
    join public.recipe r on r.id = a.recipe_id
    where a.id = avant and b.id = apres
      and r.owner_household_id = public.current_household())
$$;
revoke execute on function public.arc_sien(uuid, uuid) from public, anon;
grant   execute on function public.arc_sien(uuid, uuid) to authenticated;

create policy recipe_step_dependency_update on public.recipe_step_dependency
  for update to authenticated
  using (public.arc_corrigible(before_id, after_id))
  with check (public.arc_corrigible(before_id, after_id));

create policy recipe_step_dependency_insert_sienne on public.recipe_step_dependency
  for insert to authenticated
  with check (public.arc_sien(before_id, after_id));

create policy recipe_step_dependency_delete_sienne on public.recipe_step_dependency
  for delete to authenticated
  using (public.arc_sien(before_id, after_id));
