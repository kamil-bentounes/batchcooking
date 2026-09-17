-- Classe C : données de foyer, RLS stricte.
-- Première migration : le socle de test insère dans household et user_profile.

create extension if not exists "pgcrypto";

create table public.household (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  llm_monthly_cap_eur numeric not null default 5 check (llm_monthly_cap_eur >= 0),
  created_at          timestamptz not null default now()
);

create table public.user_profile (
  id           uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.household(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);
create index on public.user_profile (household_id);

-- household_id est DÉNORMALISÉ : rempli par un trigger BEFORE INSERT (migration 0006).
-- BEFORE s'exécute avant la vérification NOT NULL et avant le WITH CHECK de la
-- policy, donc un insert client sans household_id fonctionne une fois le trigger posé.
create table public.nutrition_target (
  id              uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references public.user_profile(id) on delete cascade,
  household_id    uuid not null references public.household(id) on delete cascade,
  kcal      numeric not null check (kcal > 0),
  protein_g numeric not null check (protein_g >= 0),
  fiber_g   numeric not null check (fiber_g   >= 0),
  carb_g    numeric not null check (carb_g    >= 0),
  fat_g     numeric not null check (fat_g     >= 0),
  valid_from timestamptz not null default now()
);
create index on public.nutrition_target (household_id);
create index on public.nutrition_target (user_profile_id, valid_from desc);

create table public.invitation (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  email        text not null,
  token        uuid not null unique default gen_random_uuid(),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index on public.invitation (household_id);
create unique index invitation_pending_unique
  on public.invitation (household_id, lower(email)) where accepted_at is null;
