-- ═══════════════════════════════════════════════════════════════════════════
-- MAGASINS ET COURSES (D43 à D46, D55 à D59)
--
-- Aucune API de drive n'existe pour un usage particulier : la liste est faite
-- pour être tenue à la main, dans le magasin, une main sur le chariot (D46).
-- D'où : un article porte SON magasin (D56), l'ordre des rayons s'apprend du
-- geste (D58), et cocher remplit l'inventaire (D49).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Classe A : le catalogue du bouton « Compléter ma liste » (D43) ──────────
-- Hors-alimentaire pour l'essentiel : aucun rattachement CIQUAL, donc exclu du
-- calcul nutritionnel mais compté au budget.
create table public.suggested_item (
  id       uuid primary key default gen_random_uuid(),
  category text not null,
  label    text not null,
  position int  not null default 0,
  constraint suggested_item_unique unique (category, label)
);
create index on public.suggested_item (category, position);

alter table public.suggested_item enable row level security;
create policy suggested_item_read on public.suggested_item
  for select to authenticated using (true);

-- ── Classe C ────────────────────────────────────────────────────────────────
create table public.store (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  name         text not null,
  is_default   boolean not null default false,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  constraint store_unique unique (household_id, name)
);
-- Un seul magasin par défaut : c'est celui que prend tout nouvel article.
create unique index store_un_seul_defaut on public.store (household_id)
  where is_default;

-- L'ordre dans lequel le foyer traverse RÉELLEMENT ses rayons, appris en
-- observant l'ordre des cochages (D58). Pas de plan de magasin à maintenir.
create table public.aisle_order (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  store_id     uuid not null references public.store(id) on delete cascade,
  aisle        text not null,
  position     numeric not null,
  updated_at   timestamptz not null default now(),
  constraint aisle_order_unique unique (store_id, aisle)
);
create index on public.aisle_order (household_id);
create trigger aisle_order_touch before update on public.aisle_order
  for each row execute function public.tg_touch_updated_at();

create table public.shopping_item (
  id           uuid primary key default gen_random_uuid(),
  cycle_id     uuid references public.cycle(id) on delete cascade,  -- NULL = hors cycle
  household_id uuid not null references public.household(id) on delete cascade,
  store_id     uuid references public.store(id) on delete set null,
  -- NULL pour le hors-alimentaire : il compte au budget, jamais aux macros (D43).
  food_id      uuid references public.food(id) on delete set null,
  label        text not null,
  aisle        text,
  quantity     numeric check (quantity > 0),
  unit         text,
  est_price_eur  numeric check (est_price_eur >= 0),
  -- Prix réellement payé, saisi au passage en caisse ou jamais. Le bilan
  -- compare l'estimation au réel quand les deux existent, sinon se tait.
  paid_price_eur numeric check (paid_price_eur >= 0),
  source       text not null default 'recette'
               check (source in ('recette','suggestion','manuel','habitude')),
  -- Rang de cochage : c'est LUI qui apprend l'ordre des rayons.
  checked_at   timestamptz,
  checked_rank int,
  created_at   timestamptz not null default now(),
  constraint shopping_item_rank_coherent
    check ((checked_at is null) = (checked_rank is null))
);
create index on public.shopping_item (household_id, cycle_id);
create index on public.shopping_item (cycle_id, store_id, checked_at);

-- Une sortie par magasin (D59) : on ne fait pas trois enseignes d'un trait,
-- et le bilan doit pouvoir dire combien a coûté chacune.
create table public.shopping_trip (
  id           uuid primary key default gen_random_uuid(),
  cycle_id     uuid not null references public.cycle(id) on delete cascade,
  household_id uuid not null references public.household(id) on delete cascade,
  store_id     uuid not null references public.store(id) on delete restrict,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  total_eur    numeric check (total_eur >= 0),
  constraint shopping_trip_unique unique (cycle_id, store_id)
);
create index on public.shopping_trip (household_id);

-- Les articles que ce foyer reprend à presque chaque cycle (D45). Alimenté par
-- l'usage, proposé au moment de la liste, jamais ajouté d'office.
create table public.shopping_habit (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  label        text not null,
  store_id     uuid references public.store(id) on delete set null,
  food_id      uuid references public.food(id) on delete set null,
  times_added  int not null default 1 check (times_added > 0),
  last_added_at timestamptz not null default now()
);
-- Expression : une contrainte de table ne l'accepte pas, un index unique oui.
create unique index shopping_habit_unique
  on public.shopping_habit (household_id, lower(label));
