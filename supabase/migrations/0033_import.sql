-- ═══════════════════════════════════════════════════════════════════════════
-- COLLER SA PROPRE RECETTE (import)
--
-- Le catalogue vient de neuf sites. Il manquait le geste le plus simple :
-- coller la recette d'un carnet, d'un message, d'un site qu'on n'ingère pas.
--
-- Le partage du travail est le point entier : le MODÈLE découpe le texte —
-- titre, parts, lignes d'ingrédients, gestes — et le DÉTERMINISTE fait le reste,
-- avec exactement le code qui fait tourner l'ingestion. Une recette collée a
-- donc la même forme en base qu'une recette ingérée : mêmes filtres, même
-- ordonnanceur, mêmes macros avec leur fourchette (D18).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.llm_usage drop constraint llm_usage_kind_check;
alter table public.llm_usage add constraint llm_usage_kind_check
  check (kind in ('extraction', 'vision', 'generation', 'ticket', 'import'));

/**
 * Ce que la personne a ajouté au prompt, gardé AVEC la recette.
 *
 * « C'est pour 4, pas 6 », « la crème est allégée » : sans cette trace, on ne
 * sait plus dans trois semaines pourquoi la recette est sortie comme ça — ni
 * s'il faut refaire l'import ou corriger à la main.
 */
alter table public.recipe
  add column import_note text;

comment on column public.recipe.import_note is
  'Les précisions données au modèle lors d''un import ou d''une génération. '
  'Gardées pour qu''on sache POURQUOI la recette est ce qu''elle est.';

/**
 * Une recette créée par un foyer lui appartient — et n'appartient qu'à lui.
 *
 * La classe B est partagée en LECTURE, et son trigger de garde interdit
 * l'écriture. Une recette qu'on vient de coller est une exception nécessaire :
 * son auteur doit pouvoir la corriger, la compléter, la supprimer. Personne
 * d'autre, et jamais sur le catalogue partagé.
 */
create policy recipe_insert_sienne on public.recipe
  for insert to authenticated
  with check (owner_household_id = public.current_household()
              and origin in ('generee', 'manuelle'));

create policy recipe_delete_sienne on public.recipe
  for delete to authenticated
  using (owner_household_id = public.current_household());

-- Les lignes suivent leur recette : on ne peut écrire que sous une recette
-- dont on est propriétaire.
do $$
declare t text;
begin
  foreach t in array array['recipe_ingredient', 'recipe_step'] loop
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (exists (select 1 from public.recipe r
                             where r.id = %I.recipe_id
                               and r.owner_household_id = public.current_household()))',
      t || '_insert_sienne', t, t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (exists (select 1 from public.recipe r
                        where r.id = %I.recipe_id
                          and r.owner_household_id = public.current_household()))',
      t || '_delete_sienne', t, t);
  end loop;
end $$;

-- Et les macros, calculées à l'import comme à l'ingestion.
create policy recipe_nutrition_insert_sienne on public.recipe_nutrition
  for insert to authenticated
  with check (exists (select 1 from public.recipe r
                      where r.id = recipe_nutrition.recipe_id
                        and r.owner_household_id = public.current_household()));

create policy recipe_nutrition_delete_sienne on public.recipe_nutrition
  for delete to authenticated
  using (exists (select 1 from public.recipe r
                 where r.id = recipe_nutrition.recipe_id
                   and r.owner_household_id = public.current_household()));
