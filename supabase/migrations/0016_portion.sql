-- ═══════════════════════════════════════════════════════════════════════════
-- BARQUETTES, SEMAINE ET REPAS (D24, D25, D28, D33, D36 à D41, D53, D54)
--
-- La session ne produit pas des recettes, elle produit des BARQUETTES : des
-- parts nommées, pesées, datées, chacune avec ses macros et son coût. Manger,
-- c'est cocher une barquette — un geste. C'est ce qui fait tenir le suivi là
-- où tous les journaux alimentaires échouent.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.portion (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  -- NULL = dépannage : une part existe parfois sans session (D42, porte de côté).
  cycle_id     uuid references public.cycle(id) on delete set null,
  recipe_id    uuid references public.recipe(id) on delete set null,
  label        text not null,
  grams        numeric not null check (grams > 0),
  -- Macros de CETTE part, figées au dressage. On ne recalcule jamais depuis la
  -- recette : elle peut être corrigée après coup, la barquette a déjà été mangée.
  kcal         numeric not null check (kcal >= 0),
  protein_g    numeric not null check (protein_g >= 0),
  fiber_g      numeric not null check (fiber_g   >= 0),
  carb_g       numeric not null check (carb_g    >= 0),
  fat_g        numeric not null check (fat_g     >= 0),
  -- D18 : incertitude affichée, jamais masquée. NULL quand la recette est
  -- entièrement quantifiée ; sinon la demi-largeur de l'intervalle.
  kcal_margin      numeric check (kcal_margin >= 0),
  protein_g_margin numeric check (protein_g_margin >= 0),
  cost_eur     numeric check (cost_eur >= 0),
  -- D25 : même plat, portions différentes. NULL = indifférente, n'importe qui.
  for_user_id  uuid references public.user_profile(id) on delete set null,
  location     text not null default 'frigo' check (location in ('frigo','congelateur')),
  state        text not null default 'au_frais'
               check (state in ('au_frais','decongelee','mangee','jetee')),
  prepared_at  timestamptz not null default now(),
  frozen_at    timestamptz,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  constraint portion_congele_date
    check ((location = 'congelateur') = (frozen_at is not null))
);
create index on public.portion (household_id, state, expires_at);
create index on public.portion (cycle_id);

-- Le journal. Toute la traçabilité que réclamait le brief (préparée, congelée,
-- décongelée, mangée) tient ici : la barquette ne porte que son état COURANT.
create table public.portion_event (
  id           uuid primary key default gen_random_uuid(),
  portion_id   uuid not null references public.portion(id) on delete cascade,
  household_id uuid not null references public.household(id) on delete cascade,
  kind         text not null
               check (kind in ('dressee','congelee','decongelee','mangee','jetee','deplacee')),
  by_user_id   uuid references public.user_profile(id) on delete set null,
  at           timestamptz not null default now(),
  note         text
);
create index on public.portion_event (household_id, at desc);
create index on public.portion_event (portion_id, at);

-- ── La semaine (D39) ────────────────────────────────────────────────────────
-- Une case par jour × repas × personne. La distribution se fait à la fin de la
-- session : sans elle, personne ne sait ce qu'on mange ce soir.
create table public.meal_slot (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.household(id) on delete cascade,
  cycle_id        uuid references public.cycle(id) on delete set null,
  user_profile_id uuid not null references public.user_profile(id) on delete cascade,
  day             date not null,
  meal            text not null
                  check (meal in ('petit_dejeuner','dejeuner','diner','collation')),
  portion_id      uuid references public.portion(id) on delete set null,
  -- D33 : trois états, et « vide » n'est PAS « zéro ». L'absence de ligne vaut
  -- « on ne sait pas » ; 'saute' vaut « rien mangé, et c'est su ».
  state           text not null default 'prevu'
                  check (state in ('prevu','mange','saute')),
  eaten_at        timestamptz,
  constraint meal_slot_unique unique (household_id, user_profile_id, day, meal),
  constraint meal_slot_mange_date check ((state = 'mange') = (eaten_at is not null))
);
create index on public.meal_slot (household_id, day);
create index on public.meal_slot (portion_id);

-- Ce qu'on mange EN PLUS de la barquette, ou à la place. Le carré de chocolat
-- va ici : il ne mérite pas une barquette, il mérite d'être compté.
create table public.meal_extra (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.household(id) on delete cascade,
  meal_slot_id    uuid not null references public.meal_slot(id) on delete cascade,
  label           text not null,
  food_id         uuid references public.food(id) on delete set null,
  grams           numeric check (grams > 0),
  kcal            numeric not null default 0 check (kcal >= 0),
  protein_g       numeric not null default 0 check (protein_g >= 0),
  fiber_g         numeric not null default 0 check (fiber_g   >= 0),
  carb_g          numeric not null default 0 check (carb_g    >= 0),
  fat_g           numeric not null default 0 check (fat_g     >= 0),
  created_at      timestamptz not null default now()
);
create index on public.meal_extra (household_id, meal_slot_id);

-- D38 : les aliments qu'on reprend sans cesse, avec leurs macros déjà pesées.
-- Deux gestes pour saisir un skyr, pas douze.
create table public.frequent_food (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  label        text not null,
  food_id      uuid references public.food(id) on delete set null,
  grams        numeric not null check (grams > 0),
  kcal         numeric not null check (kcal >= 0),
  protein_g    numeric not null check (protein_g >= 0),
  fiber_g      numeric not null check (fiber_g   >= 0),
  carb_g       numeric not null check (carb_g    >= 0),
  fat_g        numeric not null check (fat_g     >= 0),
  times_used   int not null default 0 check (times_used >= 0),
  last_used_at timestamptz
);
create unique index frequent_food_unique
  on public.frequent_food (household_id, lower(label));

-- ── L'inventaire hors barquettes (D28, D49, D57) ────────────────────────────
-- Ce qu'il y a au frigo et dans les placards. Rempli à la main d'abord (D57),
-- puis par le cochage des courses (D49), la photo n'étant qu'un accélérateur.
create table public.stock_item (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  label        text not null,
  food_id      uuid references public.food(id) on delete set null,
  quantity     numeric check (quantity > 0),
  unit         text,
  location     text not null default 'frigo'
               check (location in ('frigo','congelateur','placard')),
  source       text not null default 'manuel'
               check (source in ('manuel','courses','photo')),
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.stock_item (household_id, location);
create trigger stock_item_touch before update on public.stock_item
  for each row execute function public.tg_touch_updated_at();
