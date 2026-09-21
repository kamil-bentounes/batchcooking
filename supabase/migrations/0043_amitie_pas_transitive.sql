-- ═══════════════════════════════════════════════════════════════════════════
-- L'AMITIÉ N'EST PAS TRANSITIVE, ET LA SESSION NE LA REND PAS TRANSITIVE
--
-- `recettes_partagees()` ouvrait au convive TOUT ce que la session contient :
--
--   select r.recipe_id from cycle_recipe r where r.cycle_id in (sessions…)
--
-- Sans regarder à QUI est la recette. Or une session ne contient pas que les
-- plats de l'hôte : elle contient aussi ce qu'un TROISIÈME foyer lui a prêté.
-- Celui-là n'a rien promis au convive, et ne sait même pas qu'il existe.
--
-- Cuisiner une fois chez quelqu'un donnait donc accès à tout ce que ses autres
-- amis lui avaient montré. Aucune mauvaise intention n'est requise : il suffit
-- que l'hôte ait planifié, le même dimanche, une recette venue d'ailleurs.
--
-- Ce que le convive voit désormais, et c'est exactement ce qu'il cuisine :
--
--  · les recettes de l'HÔTE, quelle que soit leur visibilité — il a choisi de
--    les cuisiner avec nous, c'est le geste même de l'invitation ;
--  · le catalogue mutualisé, que tout le monde lit déjà ;
--  · ce que quelqu'un a rendu public.
--
-- Pour le reste, le geste garde son libellé — « Émincer 200 g d'oignons » — et
-- perd seulement la mention du plat. On ne cuisine pas moins bien ; on lit
-- juste une chose de moins qui ne nous était pas destinée.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.recettes_partagees()
returns setof uuid language sql stable security definer set search_path = public as $$
  select cr.recipe_id
  from public.cycle_recipe cr
  join public.cycle y on y.id = cr.cycle_id
  join public.recipe r on r.id = cr.recipe_id
  where cr.cycle_id in (select public.sessions_partagees())
    and (r.owner_household_id is null                -- le catalogue mutualisé
         or r.owner_household_id = y.household_id    -- ce qui est à l'hôte
         or r.visibility = 'publique')               -- ce qui est ouvert à tous
$$;
