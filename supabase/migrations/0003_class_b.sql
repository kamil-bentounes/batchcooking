-- Classe B : catalogue partagé, écriture authentifiée et tracée.
-- Créées vides : l'ingestion est le lot 0b.

create table public.recipe (
  id                 uuid primary key default gen_random_uuid(),
  source_url         text unique,
  source_name        text,
  origin             text not null default 'importee'
                     check (origin in ('importee','generee','manuelle')),
  owner_household_id uuid,   -- NULL = importée ; non-NULL = créée par un foyer
  visibility         text not null default 'privee'
                     check (visibility in ('privee','partagee')),
  title              text,
  yield_servings     int check (yield_servings > 0),
  total_time_min     numeric,
  prep_time_min      numeric,
  cook_time_min      numeric,
  license_note       text,
  -- Maintenue par trigger AU LOT 0b : son calcul dépend des durées des actions,
  -- qui n'existent pas encore. Reste false ici. NE PAS poser de trigger à vide.
  plannable          boolean not null default false,
  edited_by_household_id uuid,
  edited_at          timestamptz,
  created_at         timestamptz not null default now()
);
create index on public.recipe (plannable);
create index on public.recipe (owner_household_id);

create table public.recipe_ingredient (
  id        uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipe(id) on delete cascade,
  ordinal   int not null,
  raw_text  text not null,
  food_id   uuid references public.food(id),
  qty       numeric,
  unit      text,
  grams_reference numeric,
  -- Résolution de RÉFÉRENCE seulement. La résolution par foyer vit en classe C
  -- (household_ingredient_resolution, lot 0c).
  resolution_source text check (resolution_source in ('reference','llm','aucune')),
  confidence numeric check (confidence between 0 and 1),
  edited_by_household_id uuid,
  edited_at timestamptz,
  unique (recipe_id, ordinal)
);
create index on public.recipe_ingredient (recipe_id);

create table public.recipe_step (
  id        uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipe(id) on delete cascade,
  ordinal   int not null,
  text      text not null,
  duration_min       numeric,
  duration_source    text check (duration_source in ('declaree','defaut','llm','confirmee')),
  appliance_type     text,
  temperature_c      int,
  temperature_source text check (temperature_source in ('declaree','defaut','llm','confirmee')),
  load_type          text check (load_type in ('actif','passif','bloquant')),
  confidence numeric check (confidence between 0 and 1),
  edited_by_household_id uuid,
  edited_at timestamptz,
  unique (recipe_id, ordinal)
);
create index on public.recipe_step (recipe_id);

create table public.recipe_step_dependency (
  before_id uuid not null references public.recipe_step(id) on delete cascade,
  after_id  uuid not null references public.recipe_step(id) on delete cascade,
  origin    text not null default 'defaut' check (origin in ('defaut','llm','confirme')),
  edited_by_household_id uuid,
  edited_at timestamptz,
  primary key (before_id, after_id),
  check (before_id <> after_id)
);
