-- ═══════════════════════════════════════════════════════════════════════════
-- LE CYCLE (D42, D52)
--
-- Tout le lot 1 pend à cet objet. Un cycle couvre UNE semaine et traverse
-- toujours la même séquence ; l'accueil n'est rien d'autre que la vue de
-- l'état courant. Les transitions sont contraintes par trigger : une erreur
-- de code ne doit pas pouvoir laisser un foyer dans un état impossible
-- (« en_cuisine » sans liste de courses, « semaine » sans barquettes).
-- ═══════════════════════════════════════════════════════════════════════════

create table public.cycle (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.household(id) on delete cascade,
  -- Lundi de la semaine COUVERTE par les barquettes, pas de la session.
  -- On choisit le mercredi, on cuisine le dimanche, on mange la semaine d'après.
  week_of         date not null,
  state           text not null default 'vide'
                  check (state in ('vide','selection','courses','pret',
                                   'en_cuisine','dressage','semaine',
                                   'cloture','interrompue')),
  -- Quand on cuisine. Sert d'horloge à l'optimiseur (D47) : le plan est calé
  -- sur une heure réelle, pas sur un « t0 » abstrait.
  cook_at         timestamptz,
  -- Nombre de parts à couvrir, toutes personnes confondues.
  servings_target int not null default 10 check (servings_target > 0),
  -- Budget actif au moment du choix, figé pour que le bilan compare
  -- à ce qui était visé et non à ce qui a été reparamétré depuis.
  budget_eur      numeric check (budget_eur >= 0),
  created_at      timestamptz not null default now(),
  started_at      timestamptz,   -- entrée en en_cuisine
  closed_at       timestamptz,
  constraint cycle_unique_week unique (household_id, week_of)
);
create index on public.cycle (household_id, state);

-- Un seul cycle vivant à la fois. Deux cycles ouverts, c'est deux accueils
-- possibles pour le même jour : la question « et maintenant ? » n'aurait plus
-- de réponse unique, ce qui est tout l'inverse de ce que l'app promet.
create unique index cycle_un_seul_vivant on public.cycle (household_id)
  where state not in ('cloture','interrompue');

create table public.cycle_recipe (
  id           uuid primary key default gen_random_uuid(),
  cycle_id     uuid not null references public.cycle(id) on delete cascade,
  household_id uuid not null references public.household(id) on delete cascade,
  recipe_id    uuid not null references public.recipe(id) on delete restrict,
  servings     int  not null check (servings > 0),
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  constraint cycle_recipe_unique unique (cycle_id, recipe_id)
);
create index on public.cycle_recipe (household_id);

-- ── La machine à états ──────────────────────────────────────────────────────
-- Écrite en table plutôt qu'en cascade de `if` : la séquence est une donnée du
-- produit, pas un détail d'implémentation, et elle se lit d'un coup d'œil.
create table public.cycle_transition (
  from_state text not null,
  to_state   text not null,
  primary key (from_state, to_state)
);
insert into public.cycle_transition (from_state, to_state) values
  ('vide','selection'),
  ('selection','courses'),   ('selection','vide'),
  ('courses','pret'),        ('courses','selection'),
  ('pret','en_cuisine'),     ('pret','courses'),
  ('en_cuisine','dressage'),
  ('dressage','semaine'),
  ('semaine','cloture'),
  -- On peut interrompre n'importe quoi sauf ce qui est déjà fini,
  -- et reprendre là où l'on s'était arrêté.
  ('vide','interrompue'), ('selection','interrompue'), ('courses','interrompue'),
  ('pret','interrompue'),  ('en_cuisine','interrompue'), ('dressage','interrompue'),
  ('semaine','interrompue'),
  ('interrompue','en_cuisine'), ('interrompue','semaine'), ('interrompue','cloture');

create or replace function public.tg_cycle_transition()
returns trigger language plpgsql as $$
begin
  if new.state = old.state then return new; end if;

  if not exists (select 1 from public.cycle_transition
                 where from_state = old.state and to_state = new.state) then
    raise exception 'transition de cycle interdite : % -> %', old.state, new.state
      using errcode = 'check_violation';
  end if;

  -- L'horodatage suit l'état, jamais l'inverse : personne n'a à le poser à la main.
  if new.state = 'en_cuisine' and new.started_at is null then
    new.started_at := now();
  end if;
  if new.state = 'cloture' then
    new.closed_at := coalesce(new.closed_at, now());
  end if;
  return new;
end $$;

create trigger cycle_transition before update of state on public.cycle
  for each row execute function public.tg_cycle_transition();
