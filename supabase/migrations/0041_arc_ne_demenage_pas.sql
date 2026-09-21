-- ═══════════════════════════════════════════════════════════════════════════
-- POURQUOI TROIS MIGRATIONS DE SUITE ONT ÉCHOUÉ AU MÊME ENDROIT
--
-- 0039 jugeait chaque bout de l'arc séparément. 0040 a exigé que les deux bouts
-- soient dans la même recette — et n'a fermé que la moitié du geste, parce
-- qu'une policy ne voit jamais l'ancienne et la nouvelle ligne ENSEMBLE : le
-- `using` juge l'ancienne paire, le `with check` la nouvelle, chacune cohérente
-- de son côté. Déplacer les DEUX bouts dans le même UPDATE passait donc, et
-- l'arc déménageait d'une recette à l'autre.
--
-- C'est la leçon, et elle vaut au-delà de cette table : **la RLS ne sait pas
-- dire « la même chose qu'avant »**. Tout invariant qui relie l'état d'avant à
-- l'état d'après demande un trigger. Trois fois de suite j'ai essayé de
-- l'écrire en policy, et trois fois le correctif a laissé passer une variante.
--
-- Ce que le trou donnait, sur le catalogue mutualisé que personne ne possède :
--
--  · emporter un arc du catalogue dans sa propre recette privée — la recette
--    d'origine perdait sa contrainte d'ordre pour tout le monde, sans que
--    personne ait eu le droit de la supprimer ;
--  · le pousser vers une AUTRE recette du catalogue, à l'envers si l'on veut :
--    `ordonnance.ts` lève alors « dépendances circulaires » chez tous les
--    foyers qui planifient cette recette ;
--  · et donc INSÉRER dans le catalogue par la bande, alors que l'INSERT direct
--    y est refusé : on pose l'arc chez soi, puis on le déménage.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Un arc relie deux étapes du même plat, et il y reste.
 *
 * Deux règles, et la seconde est celle qu'aucune policy ne pouvait porter :
 *
 *  · les deux bouts appartiennent à la même recette — sinon l'arc ne veut rien
 *    dire, et il devient invisible dès que l'une des deux recettes ne l'est
 *    pas ;
 *  · un arc ne CHANGE PAS de recette. Les droits d'écriture se décident par
 *    recette (classe B pour le catalogue, classe C pour la sienne) : un arc qui
 *    déménage passe d'un régime de droits à l'autre en cours de route.
 *
 * ⚠️ Aucune exemption pour le rôle de service : ce n'est pas une permission,
 *    c'est ce que la donnée SIGNIFIE. `scripts/ingest.mjs` construit le graphe
 *    à partir des ordinaux d'UNE recette, et l'ordre ENTRE recettes vit dans
 *    `session_task_dependency`, qui est une autre table.
 */
create or replace function public.tg_arc_meme_recette()
returns trigger language plpgsql security definer set search_path = public as $$
declare avant uuid; apres uuid; ancienne uuid;
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
    select s.recipe_id into ancienne from public.recipe_step s where s.id = old.after_id;
    if ancienne is distinct from avant then
      raise exception 'un arc ne change pas de recette'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger arc_meme_recette before insert or update on public.recipe_step_dependency
  for each row execute function public.tg_arc_meme_recette();
