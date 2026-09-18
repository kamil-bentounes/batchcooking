-- ═══════════════════════════════════════════════════════════════════════════
-- LE PLAN DE LA SESSION (D5, D30, D31, D35, D47, D48, D50)
--
-- Le plan est calculé côté client (RCPSP, cf. src/lib/plan/) puis PERSISTÉ :
-- deux téléphones doivent voir la même chose (D50), et la reprise après
-- interruption ne doit rien recalculer.
--
-- Une action peut servir PLUSIEURS recettes (D35 : « émince 500 g d'oignons »
-- pour le dahl et la basquaise à la fois) — d'où la table de liaison plutôt
-- qu'une colonne recipe_id.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.session_task (
  id             uuid primary key default gen_random_uuid(),
  cycle_id       uuid not null references public.cycle(id) on delete cascade,
  household_id   uuid not null references public.household(id) on delete cascade,
  label          text not null,
  verb           text,
  quantity_g     numeric check (quantity_g > 0),
  -- NULL = aucun appareil mobilisé (un geste à la main). Sinon la ressource
  -- que l'action occupe, et que l'optimiseur doit se garder de sur-réserver.
  appliance_code text references public.appliance_catalog(code) on delete set null,
  duration_min   numeric not null check (duration_min > 0),
  -- D30 : le temps ACTIF est ce qui coûte à l'humain. Une cuisson au four
  -- dure 40 min mais n'occupe personne : elle ne compte pas dans « 2 h dispo ».
  is_active      boolean not null default true,
  -- Offset en minutes depuis cycle.cook_at, produit par l'optimiseur.
  planned_start_min numeric not null check (planned_start_min >= 0),
  -- Qui fait quoi (D50). NULL = indifférent, le premier qui le voit le prend.
  assignee_id    uuid references public.user_profile(id) on delete set null,
  position       int not null default 0,
  -- ── Exécution ─────────────────────────────────────────────────────────────
  started_at     timestamptz,
  done_at        timestamptz,
  -- D48 : la durée réelle est MESURÉE, pas confirmée par une question.
  -- Personne ne répond honnêtement à « ça t'a pris combien ? » les mains grasses.
  actual_min     numeric check (actual_min > 0),
  created_at     timestamptz not null default now(),
  constraint session_task_chronologie
    check (done_at is null or started_at is not null)
);
create index on public.session_task (cycle_id, planned_start_min);
create index on public.session_task (household_id);

create table public.session_task_recipe (
  task_id      uuid not null references public.session_task(id) on delete cascade,
  recipe_id    uuid not null references public.recipe(id) on delete cascade,
  household_id uuid not null references public.household(id) on delete cascade,
  primary key (task_id, recipe_id)
);
create index on public.session_task_recipe (household_id);

create table public.session_task_dependency (
  task_id       uuid not null references public.session_task(id) on delete cascade,
  depends_on_id uuid not null references public.session_task(id) on delete cascade,
  household_id  uuid not null references public.household(id) on delete cascade,
  primary key (task_id, depends_on_id),
  constraint session_task_pas_de_boucle_triviale check (task_id <> depends_on_id)
);
create index on public.session_task_dependency (household_id);

-- L'équipement retenu POUR CETTE SESSION. Il change d'une session à l'autre
-- (on ne cuisine pas chez soi le dimanche où l'on cuisine chez sa mère), donc
-- il est attaché au cycle, pas au foyer.
create table public.session_appliance (
  id             uuid primary key default gen_random_uuid(),
  cycle_id       uuid not null references public.cycle(id) on delete cascade,
  household_id   uuid not null references public.household(id) on delete cascade,
  appliance_code text not null references public.appliance_catalog(code) on delete cascade,
  capacity       int not null default 1 check (capacity >= 1),
  constraint session_appliance_unique unique (cycle_id, appliance_code)
);
create index on public.session_appliance (household_id);

-- D48 : chaque exécution mesurée nourrit la durée par défaut du verbe. On garde
-- la trace brute ici ; l'agrégat vers default_duration est recalculé par le
-- worker, jamais en ligne (une médiane sur trois points ne vaut rien).
create table public.duration_observation (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.household(id) on delete cascade,
  verb           text not null,
  appliance_code text references public.appliance_catalog(code) on delete set null,
  quantity_g     numeric check (quantity_g > 0),
  planned_min    numeric not null check (planned_min > 0),
  actual_min     numeric not null check (actual_min > 0),
  observed_at    timestamptz not null default now()
);
create index on public.duration_observation (verb, appliance_code);
create index on public.duration_observation (household_id);
