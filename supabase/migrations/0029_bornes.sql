-- ═══════════════════════════════════════════════════════════════════════════
-- LES BORNES, FILTRÉES PAR LA BASE (correctif du lot 4)
--
-- `retient()` appliquait les filtres protéines et calories CÔTÉ CLIENT, après
-- un `limit(240)` trié par temps actif croissant. Les deux index créés exprès
-- pour les bornes défavorables ne servaient à rien.
--
-- Le résultat n'était pas seulement tronqué, il était BIAISÉ : « au moins 30 g
-- de protéines » ne cherchait que parmi les 240 recettes les plus rapides,
-- c'est-à-dire surtout des assemblages et des salades. L'écran pouvait afficher
-- « rien » alors que des centaines de recettes qualifiaient.
--
-- PostgREST ne sait pas filtrer sur une expression. On la matérialise donc en
-- colonne générée — ce qui rend aussi les index enfin utilisables.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.recipe_nutrition
  -- La borne DÉFAVORABLE, celle sur laquelle on filtre (D18) : les protéines
  -- par le bas, les calories par le haut.
  add column protein_g_min numeric generated always as (protein_g - protein_g_margin) stored,
  add column kcal_max      numeric generated always as (kcal + kcal_margin) stored;

create index on public.recipe_nutrition (protein_g_min);
create index on public.recipe_nutrition (kcal_max);
