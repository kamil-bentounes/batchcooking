-- ═══════════════════════════════════════════════════════════════════════════
-- LES FILTRES DU CATALOGUE (lot 4, §10.0)
--
-- « Le filtre le plus utile, et personne ne l'a » : le TEMPS ACTIF, distinct du
-- temps total. Dix minutes de gestes et quarante de four ne font pas cinquante
-- minutes de travail — et c'est ce chiffre-là qui décide si une recette entre
-- dans un dimanche de deux heures.
--
-- Filtrer exige de PRÉCALCULER : agréger les étapes et les ingrédients à chaque
-- requête de sélection coûterait une seconde par frappe. On matérialise, et on
-- maintient par trigger — jamais à la main, sinon ça diverge.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.recipe
  -- Somme des étapes `actif` et `bloquant`. C'est le temps qui retient
  -- quelqu'un en cuisine, pas celui qui s'écoule.
  add column active_time_min numeric,
  -- Les appareils que la recette exige, pour « sans four quand le four est pris ».
  add column appliances text[] not null default '{}',
  add column step_count int not null default 0;

create index on public.recipe (active_time_min) where plannable;
create index on public.recipe using gin (appliances);

/**
 * Les macros d'une recette, PAR PART, avec leur incertitude (D18).
 *
 * Table séparée et non colonnes : elles n'existent que pour les recettes dont
 * les ingrédients sont assez résolus, et une absence de ligne dit cela mieux
 * qu'une colonne nulle. Les filtres portent sur la BORNE DÉFAVORABLE — pour les
 * protéines, la borne basse ; pour les calories, la borne haute. Filtrer sur la
 * moyenne ferait passer des recettes qui ne tiennent pas la promesse.
 */
create table public.recipe_nutrition (
  recipe_id   uuid primary key references public.recipe(id) on delete cascade,
  grams       numeric not null check (grams > 0),
  kcal        numeric not null check (kcal >= 0),
  protein_g   numeric not null check (protein_g >= 0),
  fiber_g     numeric not null check (fiber_g >= 0),
  carb_g      numeric not null check (carb_g >= 0),
  fat_g       numeric not null check (fat_g >= 0),
  kcal_margin      numeric not null default 0 check (kcal_margin >= 0),
  protein_g_margin numeric not null default 0 check (protein_g_margin >= 0),
  /** Part des lignes d'ingrédients réellement prises en compte, de 0 à 1. */
  coverage    numeric not null check (coverage between 0 and 1),
  computed_at timestamptz not null default now()
);

-- Les bornes défavorables, calculées une fois : c'est sur elles que l'on filtre.
create index on public.recipe_nutrition ((protein_g - protein_g_margin));
create index on public.recipe_nutrition ((kcal + kcal_margin));

alter table public.recipe_nutrition enable row level security;
create policy recipe_nutrition_read on public.recipe_nutrition
  for select to authenticated using (true);

/**
 * Maintient `active_time_min`, `appliances` et `step_count` depuis les étapes.
 *
 * ⚠️ `after` et pas `before` : on agrège les étapes APRÈS leur écriture, sinon
 *    la ligne qui déclenche ne serait pas comptée. Et `statement` plutôt que
 *    `row` serait plus rapide, mais l'ingestion insère les étapes d'une recette
 *    en un lot — un trigger par ligne n'y coûte rien et reste simple à lire.
 */
create or replace function public.tg_recipe_agrege()
returns trigger language plpgsql security definer set search_path = public as $$
declare r uuid := coalesce(new.recipe_id, old.recipe_id);
begin
  update public.recipe set
    active_time_min = (
      select coalesce(sum(duration_min), 0) from public.recipe_step
      where recipe_id = r and load_type in ('actif', 'bloquant')),
    appliances = (
      select coalesce(array_agg(distinct appliance_type), '{}')
      from public.recipe_step
      where recipe_id = r and appliance_type is not null),
    step_count = (select count(*) from public.recipe_step where recipe_id = r)
  where id = r;
  return null;
end $$;

create trigger recipe_agrege after insert or update or delete on public.recipe_step
  for each row execute function public.tg_recipe_agrege();

-- Rattrapage des recettes déjà ingérées.
update public.recipe r set
  active_time_min = (
    select coalesce(sum(duration_min), 0) from public.recipe_step s
    where s.recipe_id = r.id and s.load_type in ('actif', 'bloquant')),
  appliances = (
    select coalesce(array_agg(distinct s.appliance_type), '{}')
    from public.recipe_step s
    where s.recipe_id = r.id and s.appliance_type is not null),
  step_count = (select count(*) from public.recipe_step s where s.recipe_id = r.id);

/**
 * « Se congèle ou non » (D27) : décide si l'on cuisine 6 ou 12 portions.
 *
 * Aucune donnée ne le porte — ni schema.org, ni CIQUAL. On le déduit de la
 * famille du plat, faute de mieux, et la colonne reste corrigeable à la main.
 * `null` veut dire « on ne sait pas », et ne se lit jamais comme « non ».
 */
alter table public.recipe add column freezable boolean;

comment on column public.recipe.freezable is
  'null = inconnu, jamais « non ». Déduit puis corrigeable.';
