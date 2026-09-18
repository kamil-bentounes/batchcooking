-- ═══════════════════════════════════════════════════════════════════════════
-- LES PRIX (lot 5)
--
-- Aucune API de drive n'existe pour un particulier, et les bases communautaires
-- sont trouées. La meilleure source de prix qu'on puisse avoir, c'est le TICKET
-- DE CAISSE : exact, daté, à la bonne enseigne, et déjà dans la poche.
--
-- La boucle : on photographie le ticket → le modèle lit les lignes → on les
-- rapproche des articles de la sortie → `shopping_item.paid_price_eur` se
-- remplit → le foyer APPREND le prix de chaque produit chez chaque enseigne →
-- la liste suivante s'estime toute seule.
--
-- Rien n'est deviné : un produit jamais acheté n'a pas de prix, et l'écran le
-- dit plutôt que d'inventer une moyenne nationale.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.receipt (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  store_id     uuid references public.store(id) on delete set null,
  /** La sortie que ce ticket solde, quand on sait la retrouver. */
  trip_id      uuid references public.shopping_trip(id) on delete set null,
  bought_at    date not null default current_date,
  total_eur    numeric check (total_eur >= 0),
  /** Ce que le modèle a lu, tel quel. Sert à rejouer un rapprochement raté. */
  raw          jsonb,
  created_at   timestamptz not null default now()
);
create index on public.receipt (household_id, bought_at desc);

create table public.receipt_line (
  id           uuid primary key default gen_random_uuid(),
  receipt_id   uuid not null references public.receipt(id) on delete cascade,
  household_id uuid not null references public.household(id) on delete cascade,
  label        text not null,
  quantity     numeric check (quantity > 0),
  unit         text,
  price_eur    numeric not null check (price_eur >= 0),
  /** Rapproché d'un article de la liste, quand le rapprochement est sûr. */
  shopping_item_id uuid references public.shopping_item(id) on delete set null,
  food_id      uuid references public.food(id) on delete set null,
  /** 1 quand le libellé correspond mot pour mot, moins quand on a rapproché. */
  confidence   numeric not null default 0 check (confidence between 0 and 1)
);
create index on public.receipt_line (household_id);
create index on public.receipt_line (receipt_id);

/**
 * Le prix APPRIS d'un produit, chez une enseigne.
 *
 * Une moyenne mobile plutôt qu'un dernier prix : les promotions font tanguer un
 * relevé unique, et ce qu'on veut estimer, c'est ce que ça coûte d'habitude.
 * `last_price_eur` reste à côté, parce que « tu l'as payé 2,30 € la dernière
 * fois » se vérifie, là où une moyenne ne se vérifie pas.
 */
create table public.household_price (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household(id) on delete cascade,
  store_id      uuid references public.store(id) on delete cascade,
  label         text not null,
  food_id       uuid references public.food(id) on delete set null,
  /** Prix au kilo ou au litre quand la quantité est connue ; sinon à l'unité. */
  unit          text not null default 'u',
  avg_price_eur  numeric not null check (avg_price_eur >= 0),
  last_price_eur numeric not null check (last_price_eur >= 0),
  observations  int not null default 1 check (observations > 0),
  last_seen_at  timestamptz not null default now()
);
create unique index household_price_unique
  on public.household_price (household_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(label));
create index on public.household_price (household_id, food_id);

-- RLS : classe C, les quatre verbes, comme tout le reste du foyer.
do $$
declare t text;
begin
  foreach t in array array['receipt', 'receipt_line', 'household_price'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (household_id = public.current_household())', t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (household_id = public.current_household())', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (household_id = public.current_household())
         with check (household_id = public.current_household())', t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (household_id = public.current_household())', t || '_delete', t);
  end loop;
end $$;

create trigger receipt_line_household before insert or update on public.receipt_line
  for each row execute function public.tg_derive_household('receipt', 'receipt_id');

/**
 * Une ligne de ticket enseigne un prix.
 *
 * Moyenne mobile pondérée par le nombre d'observations : les premiers relevés
 * pèsent autant que les suivants, ce qui fait converger vite sans qu'une
 * promotion isolée emporte tout.
 */
create or replace function public.tg_receipt_line_apprend()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  boutique uuid;
  unitaire numeric;
  u        text;
begin
  select store_id into boutique from public.receipt where id = new.receipt_id;

  -- Ramener au kilo ou au litre quand on peut : « 2,30 € » ne veut rien dire
  -- sans savoir si c'est pour 200 g ou pour un kilo.
  if new.quantity is not null and new.quantity > 0
     and new.unit in ('g', 'kg', 'ml', 'l') then
    unitaire := new.price_eur / (case
      when new.unit = 'g'  then new.quantity / 1000.0
      when new.unit = 'ml' then new.quantity / 1000.0
      else new.quantity end);
    u := case when new.unit in ('g', 'kg') then 'kg' else 'l' end;
  else
    unitaire := new.price_eur / coalesce(nullif(new.quantity, 0), 1);
    u := 'u';
  end if;

  insert into public.household_price
    (household_id, store_id, label, food_id, unit, avg_price_eur, last_price_eur)
  values (new.household_id, boutique, new.label, new.food_id, u, unitaire, unitaire)
  on conflict (household_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(label))
  do update set
    avg_price_eur = (household_price.avg_price_eur * household_price.observations
                     + excluded.avg_price_eur) / (household_price.observations + 1),
    last_price_eur = excluded.last_price_eur,
    observations  = household_price.observations + 1,
    last_seen_at  = now(),
    food_id       = coalesce(excluded.food_id, household_price.food_id),
    unit          = excluded.unit;

  -- Le prix payé remonte sur l'article de la liste : c'est lui que le bilan lit.
  if new.shopping_item_id is not null then
    update public.shopping_item set paid_price_eur = new.price_eur
    where id = new.shopping_item_id;
  end if;
  return null;
end $$;

create trigger receipt_line_apprend after insert on public.receipt_line
  for each row execute function public.tg_receipt_line_apprend();

-- Lire un ticket a son propre budget : sinon un mois de photos de frigo
-- empêcherait d'enregistrer ce qu'on a payé, ce qui est le mauvais arbitrage —
-- l'inventaire se saisit à la main, un ticket part à la poubelle.
alter table public.llm_usage drop constraint llm_usage_kind_check;
alter table public.llm_usage add constraint llm_usage_kind_check
  check (kind in ('extraction', 'vision', 'generation', 'ticket'));

/**
 * Ce que le foyer sait des prix, prêt à estimer un panier.
 *
 * Une vue plutôt qu'une requête recopiée dans le client : le jour où l'on
 * voudra ignorer les relevés trop vieux, cela se corrige ici.
 */
create or replace view public.price_knowledge
with (security_invoker = true) as
  select p.household_id, p.store_id, p.label, p.food_id, p.unit,
         p.avg_price_eur, p.last_price_eur, p.observations, p.last_seen_at,
         s.name as store_name
  from public.household_price p
  left join public.store s on s.id = p.store_id;

-- ── L'export RGPD suit le schéma ────────────────────────────────────────────
-- Sans cette mise à jour, « exporte mes données » rendrait un fichier qui ne
-- sait rien de ce qu'on a payé — c'est-à-dire du seul relevé de prix qu'on ait.
create or replace function public.export_my_data()
returns jsonb language sql stable security definer set search_path = public as $$
  with hh as (select public.current_household() as id)
  select jsonb_build_object(
    'exported_at',       now(),
    'household',         (select to_jsonb(h) from public.household h, hh where h.id = hh.id),
    'profiles',          (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                          from public.user_profile p, hh where p.household_id = hh.id),
    'nutrition_targets', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                          from public.nutrition_target t, hh where t.household_id = hh.id),
    'invitations',       (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb)
                          from public.invitation i, hh where i.household_id = hh.id),
    'llm_usage',         (select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
                          from public.llm_usage u, hh where u.household_id = hh.id),
    -- Lot 1
    'cycles',            (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
                          from public.cycle c, hh where c.household_id = hh.id),
    'cycle_recipes',     (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                          from public.cycle_recipe r, hh where r.household_id = hh.id),
    'stores',            (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                          from public.store s, hh where s.household_id = hh.id),
    'aisle_order',       (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                          from public.aisle_order a, hh where a.household_id = hh.id),
    'shopping_items',    (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                          from public.shopping_item s, hh where s.household_id = hh.id),
    'shopping_trips',    (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                          from public.shopping_trip t, hh where t.household_id = hh.id),
    'shopping_habits',   (select coalesce(jsonb_agg(to_jsonb(h2)), '[]'::jsonb)
                          from public.shopping_habit h2, hh where h2.household_id = hh.id),
    'session_tasks',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                          from public.session_task t, hh where t.household_id = hh.id),
    'session_appliances',(select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                          from public.session_appliance a, hh where a.household_id = hh.id),
    'duration_observations', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
                          from public.duration_observation o, hh where o.household_id = hh.id),
    'portions',          (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                          from public.portion p, hh where p.household_id = hh.id),
    'portion_events',    (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
                          from public.portion_event e, hh where e.household_id = hh.id),
    'meal_slots',        (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
                          from public.meal_slot m, hh where m.household_id = hh.id),
    'meal_extras',       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                          from public.meal_extra x, hh where x.household_id = hh.id),
    'frequent_foods',    (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
                          from public.frequent_food f, hh where f.household_id = hh.id),
    'stock_items',       (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                          from public.stock_item s, hh where s.household_id = hh.id),
    -- Lot 5 : ce qu'on a payé, et ce que le foyer en a appris.
    'receipt',           (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                          from public.receipt r, hh where r.household_id = hh.id),
    'receipt_line',      (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
                          from public.receipt_line l, hh where l.household_id = hh.id),
    'household_price',   (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                          from public.household_price p, hh where p.household_id = hh.id)
  )
$$;
revoke execute on function public.export_my_data() from public, anon;
grant   execute on function public.export_my_data() to authenticated;

-- L'introspection ne doit lister que des TABLES : la vue `price_knowledge`
-- porte un household_id, et le test de couverture réclamerait un export de la
-- vue en plus de la table qu'elle lit.
create or replace function public.tables_de_foyer()
returns table (table_name text)
language sql stable security definer set search_path = public, information_schema as $$
  select c.table_name::text
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and c.column_name = 'household_id'
    and t.table_type = 'BASE TABLE'
  union
  select 'household'
  order by 1
$$;
revoke execute on function public.tables_de_foyer() from public, anon, authenticated;
grant   execute on function public.tables_de_foyer() to service_role;
