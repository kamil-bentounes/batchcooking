-- ═══════════════════════════════════════════════════════════════════════════
-- LA PESÉE (lot 0c, §5.2.1)
--
-- C'est ce qui rend la promesse « strict » vraie. Aujourd'hui, « 2 oignons »
-- ne se convertit pas en grammes : `enGrammes()` rend `null` plutôt qu'un
-- chiffre inventé, et les macros de la recette s'affichent en fourchette large.
-- Une table de référence USDA améliore la situation ; elle ne la règle pas,
-- parce qu'un oignon de Kamil n'est pas un oignon médian américain.
--
-- La boucle : on pèse ce qu'on a en main, le foyer apprend SES poids, et la
-- friction DÉCROÎT — on ne pèse un aliment que jusqu'à ce qu'on le connaisse.
--
-- Quatre règles, toutes en base parce qu'un invariant ne peut pas dépendre du
-- téléphone qui a saisi (D50) :
--
--   1. poids unitaire dérivé = grams / qty_observed, si l'unité est un COMPTE ;
--   2. rejet des aberrantes hors [0,4× ; 2,5×] la référence. Sans référence —
--      précisément le cas où l'apprentissage sert le plus — aucun filtre, mais
--      le seuil d'activation passe de 3 à 5 observations ;
--   3. la valeur retenue est la MÉDIANE, robuste aux fautes de frappe ;
--   4. activation à 3 observations (5 sans référence). En dessous, la référence
--      prime et le compteur s'affiche.
-- ═══════════════════════════════════════════════════════════════════════════

-- Le seed charge les poids de référence par (aliment, libellé) : sans unicité,
-- relancer le seed les empilerait.
alter table public.unit_weight
  add constraint unit_weight_unique unique (food_id, label);

-- ── Classe C ────────────────────────────────────────────────────────────────

/**
 * Une pesée : ce qu'on avait en main, et ce que la balance a dit.
 *
 * On garde l'OBSERVATION, pas seulement sa conclusion. Une médiane se recalcule ;
 * une observation jetée est perdue, et c'est elle qui permettra un jour de
 * corriger la règle sans redemander à personne de peser quoi que ce soit.
 */
create table public.weighing (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  food_id      uuid not null references public.food(id) on delete cascade,
  /** La ligne de recette qui a provoqué la pesée, quand il y en a une. */
  recipe_ingredient_id uuid references public.recipe_ingredient(id) on delete set null,
  /** Le cycle pendant lequel on a pesé. Null : pesée hors cycle (lot 0c
      précède le lot 1, et on pèse aussi en rangeant les courses). */
  cycle_id     uuid references public.cycle(id) on delete set null,
  /** « 2 » de « 2 oignons ». */
  qty_observed numeric not null check (qty_observed > 0),
  /** « oignon », « gousse », « tranche ». Un COMPTE, jamais une masse : peser
      « 200 g de carottes » n'enseigne rien. */
  unit_observed text not null,
  grams        numeric not null check (grams > 0),
  at           timestamptz not null default now()
);
create index on public.weighing (household_id, food_id);

/**
 * Ce que le foyer sait peser, matérialisé.
 *
 * Recalculer la médiane à chaque conversion coûterait une requête par ligne
 * d'ingrédient. On la matérialise, et le trigger la tient à jour — y compris
 * quand une pesée est SUPPRIMÉE, parce qu'une faute de frappe se corrige en
 * effaçant, pas en pesant trois fois de plus.
 */
create table public.household_unit_weight (
  household_id uuid not null references public.household(id) on delete cascade,
  food_id      uuid not null references public.food(id) on delete cascade,
  unit_label   text not null,
  /** La médiane des observations RETENUES. */
  grams        numeric not null check (grams > 0),
  observations int not null check (observations > 0),
  /** Combien il en faut pour que ce poids prime sur la référence : 3, ou 5
      quand aucune référence n'existait pour filtrer les aberrantes. */
  seuil        int not null check (seuil in (3, 5)),
  /** Faux tant que le compte n'atteint pas le seuil : la référence prime, et
      l'écran affiche « 2 pesées sur 3 ». */
  actif        boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (household_id, food_id, unit_label)
);
create index on public.household_unit_weight (household_id) where actif;

/**
 * Le rattachement d'un ingrédient à un aliment, corrigé PAR CE FOYER (D3, D16).
 *
 * Le rattachement de référence est partagé et parfois faux — « crème » tombe
 * sur la crème dessert. Corriger dans le catalogue partagé changerait la
 * recette pour tout le monde ; corriger ici ne change rien pour personne
 * d'autre, ce qui est la seule façon d'oser corriger.
 */
create table public.household_ingredient_resolution (
  household_id uuid not null references public.household(id) on delete cascade,
  recipe_ingredient_id uuid not null references public.recipe_ingredient(id) on delete cascade,
  food_id      uuid references public.food(id) on delete cascade,
  /** Grammes posés à la main, quand aucun aliment ne convient. */
  grams        numeric check (grams > 0),
  updated_at   timestamptz not null default now(),
  primary key (household_id, recipe_ingredient_id),
  constraint resolution_dit_quelque_chose check (food_id is not null or grams is not null)
);

-- RLS : classe C, les quatre verbes écrits séparément.
do $$
declare t text;
begin
  foreach t in array array['weighing', 'household_unit_weight',
                           'household_ingredient_resolution'] loop
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

create trigger household_unit_weight_touch before update on public.household_unit_weight
  for each row execute function public.tg_touch_updated_at();
create trigger household_ingredient_resolution_touch
  before update on public.household_ingredient_resolution
  for each row execute function public.tg_touch_updated_at();

/**
 * La règle d'apprentissage, §5.2.1.
 *
 * Elle tourne sur (foyer, aliment, unité) après chaque pesée insérée, modifiée
 * ou supprimée. Le calcul repart des observations à chaque fois : une médiane
 * incrémentale serait plus rapide et fausse dès la première suppression.
 */
create or replace function public.tg_pesee_apprend()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  foyer    uuid := coalesce(new.household_id, old.household_id);
  aliment  uuid := coalesce(new.food_id, old.food_id);
  unite    text := coalesce(new.unit_observed, old.unit_observed);
  ref      numeric;
  mediane  numeric;
  retenues int;
  minimum  int;
begin
  -- La référence la plus sûre pour cet aliment, s'il en existe une. C'est elle
  -- qui borne les aberrantes — et son absence qui durcit le seuil.
  select w.grams into ref from public.unit_weight w
  where w.food_id = aliment order by w.confidence desc, w.grams limit 1;

  minimum := case when ref is null then 5 else 3 end;

  -- Les observations retenues : le poids unitaire dérivé, borné à [0,4× ; 2,5×]
  -- la référence quand elle existe. Sans référence, on ne filtre rien : filtrer
  -- sur la médiane des observations écarterait la deuxième d'une série de deux.
  with obs as (
    select w.grams / w.qty_observed as unitaire
    from public.weighing w
    where w.household_id = foyer and w.food_id = aliment and w.unit_observed = unite
  ), gardees as (
    select unitaire from obs
    where ref is null or (unitaire >= ref * 0.4 and unitaire <= ref * 2.5)
  )
  select percentile_cont(0.5) within group (order by unitaire), count(*)
  into mediane, retenues from gardees;

  if retenues = 0 or mediane is null then
    delete from public.household_unit_weight
    where household_id = foyer and food_id = aliment and unit_label = unite;
    return null;
  end if;

  insert into public.household_unit_weight
    (household_id, food_id, unit_label, grams, observations, seuil, actif)
  values (foyer, aliment, unite, round(mediane, 1), retenues, minimum, retenues >= minimum)
  on conflict (household_id, food_id, unit_label) do update set
    grams        = excluded.grams,
    observations = excluded.observations,
    seuil        = excluded.seuil,
    actif        = excluded.actif,
    updated_at   = now();
  return null;
end $$;

create trigger weighing_apprend after insert or update or delete on public.weighing
  for each row execute function public.tg_pesee_apprend();

/**
 * Combien pèse une unité de cet aliment, pour CE foyer.
 *
 * L'ordre est la règle : le poids appris s'il est actif, sinon la référence,
 * sinon rien. Rendre `null` plutôt qu'un chiffre inventé est délibéré — c'est
 * ce qui fait afficher une fourchette au lieu d'une fausse précision (D18).
 */
create or replace function public.poids_unitaire(p_food_id uuid, p_unit text default null)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select h.grams from public.household_unit_weight h
     where h.household_id = public.current_household()
       and h.food_id = p_food_id and h.actif
       and (p_unit is null or h.unit_label = p_unit)
     order by h.observations desc limit 1),
    (select w.grams from public.unit_weight w
     where w.food_id = p_food_id
       and (p_unit is null or w.label = p_unit)
     order by w.confidence desc limit 1)
  )
$$;
revoke execute on function public.poids_unitaire(uuid, text) from public, anon;
grant   execute on function public.poids_unitaire(uuid, text) to authenticated;

-- ── L'export RGPD suit ──────────────────────────────────────────────────────
-- L'export a déjà pris du retard sur le schéma une fois, et chaque lot le
-- recopiait en entier pour y ajouter trois clés. On le coupe en deux : une
-- BASE figée, et l'export qui la complète. Les lots suivants n'écriront plus
-- que leurs propres lignes.
create or replace function public.export_my_data_base()
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
revoke execute on function public.export_my_data_base() from public, anon, authenticated;

create or replace function public.export_my_data()
returns jsonb language sql stable security definer set search_path = public as $$
  with hh as (select public.current_household() as id)
  select public.export_my_data_base() || jsonb_build_object(
    -- Lot 0c : la boucle de pesée.
    'weighing',            (select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
                            from public.weighing w, hh where w.household_id = hh.id),
    'household_unit_weight', (select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
                            from public.household_unit_weight u, hh where u.household_id = hh.id),
    'household_ingredient_resolution', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                            from public.household_ingredient_resolution r, hh
                            where r.household_id = hh.id)
  )
$$;
revoke execute on function public.export_my_data() from public, anon;
grant   execute on function public.export_my_data() to authenticated;
