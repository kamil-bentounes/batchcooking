-- ═══════════════════════════════════════════════════════════════════════════
-- LE CATALOGUE PARTAGÉ, PROTÉGÉ POUR DE BON
--
-- La migration 0033 a ouvert `insert` et `delete` sur la classe B pour qu'un
-- foyer puisse garder une recette collée. Deux trous s'en sont suivis, tous
-- deux prouvés :
--
--  1. La policy d'UPDATE préexistante (0005) est `using (true)`, et
--     `tg_class_b_guard` ne refuse que les lignes portant `confidence >= 0.8`
--     — colonne que `recipe` n'a pas. N'importe quel foyer pouvait donc
--     s'attribuer une recette du catalogue (`owner_household_id = le sien`),
--     puis la supprimer par la policy de 0033. Ingrédients, étapes et macros
--     partaient en cascade, POUR TOUT LE MONDE.
--
--  2. La lecture est `using (true)`, et 0005 notait déjà qu'elle ignore
--     `visibility` et `owner_household_id` — « sans effet ici, tables vides ».
--     0033 est précisément ce qui les remplit : la recette collée d'un carnet
--     personnel devenait lisible par tout foyer inscrit.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * 1 · On ne s'attribue pas une recette qui n'est pas à soi.
 *
 * Le propriétaire est posé à la création et ne bouge plus. C'est la seule
 * colonne de la classe B dont dépendent des DROITS : elle ne peut pas rester
 * modifiable par tout le monde.
 */
create or replace function public.tg_recipe_proprietaire()
returns trigger language plpgsql as $$
begin
  if new.owner_household_id is distinct from old.owner_household_id
     and current_user <> 'service_role' then
    raise exception 'une recette ne change pas de propriétaire'
      using errcode = 'check_violation';
  end if;
  -- Et l'origine non plus : elle décide de ce que la recette a le droit d'être.
  if new.origin is distinct from old.origin and current_user <> 'service_role' then
    raise exception 'une recette ne change pas d''origine'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger recipe_proprietaire before update on public.recipe
  for each row execute function public.tg_recipe_proprietaire();

/**
 * 2 · Une recette privée n'est lue que par son foyer.
 *
 * Le catalogue mutualisé (`owner_household_id is null`) reste lisible par
 * tous — c'est tout son objet (D16). Ce qu'un foyer a collé ou fait inventer
 * ne l'est que par lui, tant qu'il ne l'a pas explicitement partagée.
 */
drop policy if exists recipe_read on public.recipe;
create policy recipe_read on public.recipe
  for select to authenticated
  using (owner_household_id is null
         or visibility = 'partagee'
         or owner_household_id = public.current_household());

-- Les lignes suivent leur recette : si on ne voit pas la recette, on ne voit
-- ni ses ingrédients, ni ses étapes, ni ses macros.
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
                               or r.visibility = ''partagee''
                               or r.owner_household_id = public.current_household())))',
      t || '_read', t, t);
  end loop;
end $$;

/**
 * 3 · Les arcs de dépendance manquaient à l'appel.
 *
 * 0033 a ouvert l'écriture sur `recipe`, `recipe_ingredient`, `recipe_step` et
 * `recipe_nutrition` — pas sur `recipe_step_dependency`. L'import écrivait donc
 * son graphe et recevait un 42501, avalé en silence.
 */
create policy recipe_step_dependency_insert_sienne on public.recipe_step_dependency
  for insert to authenticated
  with check (exists (select 1 from public.recipe_step s
                      join public.recipe r on r.id = s.recipe_id
                      where s.id = recipe_step_dependency.after_id
                        and r.owner_household_id = public.current_household()));

create policy recipe_step_dependency_delete_sienne on public.recipe_step_dependency
  for delete to authenticated
  using (exists (select 1 from public.recipe_step s
                 join public.recipe r on r.id = s.recipe_id
                 where s.id = recipe_step_dependency.after_id
                   and r.owner_household_id = public.current_household()));

/**
 * 4 · Les alias de verbes entrent au référentiel.
 *
 * Ils ne vivaient que dans `seed/conversions.json`, lu par le script
 * d'ingestion. Une Edge Function ne lit pas de fichier : celle qui importe une
 * recette collée les passait donc VIDES, et les gestes qui n'existent que comme
 * alias — « fouettez », « concassez », « pochez », « émiettez », « abaissez »,
 * « saupoudrez » — disparaissaient de la recette, puisqu'une étape sans verbe
 * ni durée n'est pas une action et se fait filtrer.
 *
 * Une recette collée n'avait donc pas la même forme qu'une recette ingérée, ce
 * qui est pourtant toute la promesse de cette fonction. Le référentiel vit en
 * base, comme les durées, les conversions et les densités.
 */
create table public.verbe_alias (
  depuis text primary key,
  vers   text not null
);

alter table public.verbe_alias enable row level security;
create policy verbe_alias_read on public.verbe_alias
  for select to authenticated using (true);
