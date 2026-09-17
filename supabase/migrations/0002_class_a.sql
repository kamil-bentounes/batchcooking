-- Classe A : référentiel immuable et infrastructure.
-- Créées VIDES : leur peuplement est le lot 0a-2.

create table public.food (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('ciqual','off')),
  source_code     text not null,
  name            text not null,
  state           text not null default 'cru' check (state in ('cru','cuit')),
  ciqual_group    text,
  ciqual_subgroup text,
  nutrients       jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (source, source_code)
);
create index on public.food (ciqual_subgroup);
create index on public.food using gin (to_tsvector('french', name));

create table public.food_yield_factor (
  food_id uuid primary key references public.food(id) on delete cascade,
  factor  numeric not null check (factor > 0)
);

create table public.unit_weight (
  id         uuid primary key default gen_random_uuid(),
  food_id    uuid references public.food(id) on delete cascade,
  label      text not null,
  grams      numeric not null check (grams > 0),
  confidence numeric not null default 0.5 check (confidence between 0 and 1),
  source     text not null default 'usda'
);
create index on public.unit_weight (food_id);

create table public.unit_conversion (
  id              uuid primary key default gen_random_uuid(),
  unit_label      text not null,
  ciqual_subgroup text,
  grams           numeric not null check (grams > 0),
  unique (unit_label, ciqual_subgroup)
);

create table public.density (
  food_id      uuid primary key references public.food(id) on delete cascade,
  grams_per_ml numeric not null check (grams_per_ml > 0)
);

create table public.default_temperature (
  id            uuid primary key default gen_random_uuid(),
  preparation   text not null unique,
  temperature_c int not null check (temperature_c between 30 and 300)
);

-- Clé (verbe, appareil), appliquée aux ACTIONS et non aux étapes : seules 28 %
-- des étapes de recette exposent un verbe unique (mesuré sur 308 étapes).
create table public.default_duration (
  id             uuid primary key default gen_random_uuid(),
  verb           text not null,
  appliance_type text,
  base_minutes   numeric not null check (base_minutes > 0),
  load_type      text not null check (load_type in ('actif','passif','bloquant')),
  scaling        text not null default 'constant'
                 check (scaling in ('lineaire_plafonne','constant')),
  unique (verb, appliance_type)
);

-- Borne haute des 16 % de lignes d'ingrédients sans quantité (mesuré sur 475 lignes).
create table public.typical_quantity (
  ciqual_subgroup text primary key,
  grams           numeric not null check (grams > 0)
);

create table public.appliance_catalog (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  label            text not null,
  default_capacity int not null default 1 check (default_capacity >= 1)
);

create table public.ingestion_job (
  id           uuid primary key default gen_random_uuid(),
  url          text not null unique,
  state        text not null default 'queued'
               check (state in ('queued','fetching','extracting','resolving','ready','needs_review','failed')),
  attempts     int not null default 0,
  error        text,
  content_hash text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.ingestion_job (state);

create table public.instance_setting (
  key   text primary key,
  value jsonb not null
);
