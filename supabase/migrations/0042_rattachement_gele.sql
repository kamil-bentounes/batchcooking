-- ═══════════════════════════════════════════════════════════════════════════
-- LA MÊME RÈGLE, PARTOUT OÙ ELLE S'APPLIQUE
--
-- 0041 a tiré la bonne leçon — « la RLS ne sait pas dire *la même chose
-- qu'avant* » — et l'a appliquée à UNE table. Interdire à l'arc de changer de
-- recette ne sert pourtant à rien tant que l'ÉTAPE peut changer de recette : on
-- réattache l'étape, l'arc suit, et le trigger n'est jamais consulté.
--
-- Le rattachement d'une ligne de classe B à sa recette est mutable sur les
-- trois tables filles, par le même motif exactement : `using` juge l'ancienne
-- ligne (catalogue mutualisé → vrai), `with check` la nouvelle (ma recette →
-- vrai), et personne ne les compare. Un foyer dépouillait ainsi une recette du
-- catalogue de ses étapes, de ses ingrédients ET de ses macros — pour tout le
-- monde, sans avoir jamais eu le droit de la supprimer.
--
-- Trois aggravations qui disparaissent avec la cause :
--
--  · la ligne déménagée devenait INRÉPARABLE : `arc_corrigible` exige la même
--    recette aux deux bouts, donc le `using` tombait faux et l'UPDATE comme le
--    DELETE rendaient zéro ligne sans erreur. Encore un verrou qui cache ce
--    qu'il n'a pas empêché ;
--  · `tg_recipe_agrege` ne recalcule que la recette de DESTINATION : la source
--    gardait un compte d'étapes qui ne correspondait plus à rien ;
--  · l'arc inter-recettes que 0041 interdit se fabriquait quand même, en
--    déplaçant un seul des deux bouts.
--
-- Rien ne s'en trouve empêché : AUCUN code ne modifie `recipe_id`. L'ingestion
-- et l'import insèrent, `recalcule.mjs` ne réécrit que des ordinaux.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Une ligne ne change pas de recette.
 *
 * Ce n'est pas une permission mais ce que la donnée SIGNIFIE : une étape a été
 * écrite pour un plat. Donc aucune exemption, pas même pour le rôle de service
 * — un script qui déplacerait une étape ferait le même dégât qu'un compte mal
 * intentionné, et plus vite.
 */
create or replace function public.tg_rattachement_gele()
returns trigger language plpgsql as $$
begin
  if new.recipe_id is distinct from old.recipe_id then
    raise exception 'une ligne ne change pas de recette'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['recipe_step', 'recipe_ingredient', 'recipe_nutrition'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_rattachement', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.tg_rattachement_gele()',
      t || '_rattachement', t);
  end loop;
end $$;

/**
 * Et l'arc s'ancre sur SES DEUX anciens bouts, pas sur un seul.
 *
 * Sur une ligne saine les deux donnent la même réponse — la règle « même
 * recette » vient de l'imposer. Sur une ligne déjà incohérente, ancrer sur
 * `old.after_id` seul laissait recoller l'arc vers cette recette-là. Sans
 * portée aujourd'hui (la policy refuse déjà ces lignes), mais c'est exactement
 * le genre de reste qui redevient vrai le jour où l'on nettoie.
 */
create or replace function public.tg_arc_meme_recette()
returns trigger language plpgsql security definer set search_path = public as $$
declare avant uuid; apres uuid; jadis_avant uuid; jadis_apres uuid;
begin
  select s.recipe_id into avant from public.recipe_step s where s.id = new.before_id;
  select s.recipe_id into apres from public.recipe_step s where s.id = new.after_id;

  if avant is null or apres is null then
    raise exception 'un arc part d''une étape qui n''existe pas'
      using errcode = 'foreign_key_violation';
  end if;
  if avant is distinct from apres then
    raise exception 'un arc relie deux étapes du même plat'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    select s.recipe_id into jadis_avant from public.recipe_step s where s.id = old.before_id;
    select s.recipe_id into jadis_apres from public.recipe_step s where s.id = old.after_id;
    if jadis_avant is distinct from avant or jadis_apres is distinct from avant then
      raise exception 'un arc ne change pas de recette'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

-- Rejouable : 0041 créait le trigger sans garde.
drop trigger if exists arc_meme_recette on public.recipe_step_dependency;
create trigger arc_meme_recette before insert or update on public.recipe_step_dependency
  for each row execute function public.tg_arc_meme_recette();
