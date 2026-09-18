-- Le verbe de l'étape, extrait à l'ingestion (lot 0b).
--
-- Deux besoins le réclament, tous deux au lot 1 :
--   · la fusion d'actions entre recettes (D35) ne peut rapprocher « émince les
--     oignons » du dahl et de la basquaise qu'en comparant des verbes, pas des
--     phrases entières ;
--   · la mesure des durées (D48) s'agrège par verbe, et non par étape : une
--     étape n'est jamais refaite, un verbe l'est toutes les semaines.
--
-- Nullable : les recettes déjà ingérées n'en ont pas, et une étape sans verbe
-- reconnu reste ordonnançable — elle ne fusionne simplement avec rien.
alter table public.recipe_step
  add column verb       text,
  add column quantity_g numeric check (quantity_g > 0);

create index on public.recipe_step (verb) where verb is not null;
