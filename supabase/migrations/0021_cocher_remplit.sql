-- ═══════════════════════════════════════════════════════════════════════════
-- COCHER REMPLIT L'INVENTAIRE (D49) — en base, pas dans l'écran
--
-- C'était écrit côté client. C'était une erreur, pour la raison qui vaut pour
-- tout 0017 : deux téléphones cochent la même liste en même temps (D50), et un
-- client peut être vieux d'une version. Un invariant du produit ne peut pas
-- dépendre de celui des deux qui a appuyé.
--
-- Décocher défait exactement ce que cocher avait fait — d'où le lien explicite
-- entre la ligne de courses et la ligne d'inventaire qu'elle a créée : sans
-- lui, on retrouverait « le » yaourt par son nom, et on effacerait le mauvais.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.stock_item
  add column shopping_item_id uuid references public.shopping_item(id) on delete set null;
create unique index stock_item_depuis_courses
  on public.stock_item (shopping_item_id) where shopping_item_id is not null;

-- Le rayon dit où ça se range. C'est une supposition, corrigeable d'un geste
-- sur « Ce que j'ai » — mieux vaut un placard à corriger qu'une saisie à faire.
create or replace function public.lieu_du_rayon(rayon text)
returns text language sql immutable as $$
  select case
    when rayon = 'Surgelés' then 'congelateur'
    when rayon in ('Frais', 'Fruits et légumes', 'Boucherie, poissonnerie') then 'frigo'
    else 'placard'
  end
$$;

create or replace function public.tg_shopping_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rang int;
  lissage constant numeric := 0.4;   -- poids de la dernière observation
begin
  -- ⚠️ Le trigger est AUSSI sur INSERT : `old` n'existe pas alors, et y toucher
  --    lève « record old is not assigned yet ». D'où le test sur tg_op partout.
  -- ── Décochage : on défait, rang compris ─────────────────────────────────
  if new.checked_at is null then
    new.checked_rank := null;
    if tg_op = 'UPDATE' and old.checked_at is not null then
      delete from public.stock_item where shopping_item_id = new.id;
    end if;
    return new;
  end if;

  -- Un article déjà coché qu'on modifie : rien à refaire.
  if tg_op = 'UPDATE' and old.checked_at is not null then return new; end if;

  select coalesce(max(checked_rank), 0) + 1 into rang
  from public.shopping_item
  where cycle_id is not distinct from new.cycle_id
    and store_id is not distinct from new.store_id
    and household_id = new.household_id;
  new.checked_rank := rang;

  -- ── L'ordre des rayons apprend du geste (D58) ───────────────────────────
  if new.store_id is not null and new.aisle is not null then
    insert into public.aisle_order (household_id, store_id, aisle, position)
    values (new.household_id, new.store_id, new.aisle, rang)
    on conflict (store_id, aisle) do update
      set position   = aisle_order.position * (1 - lissage) + excluded.position * lissage,
          updated_at = now();
  end if;

  -- ── L'article entre à l'inventaire (D49) ────────────────────────────────
  insert into public.stock_item
    (household_id, label, food_id, quantity, unit, location, source, shopping_item_id)
  values (new.household_id, new.label, new.food_id, new.quantity, new.unit,
          public.lieu_du_rayon(new.aisle), 'courses', new.id)
  -- L'index est PARTIEL : sans reprendre son WHERE, Postgres ne le reconnaît
  -- pas et refuse la clause ON CONFLICT.
  on conflict (shopping_item_id) where shopping_item_id is not null do nothing;

  -- ── Ce qu'on reprend à chaque fois finira par se proposer seul (D45) ─────
  insert into public.shopping_habit (household_id, label, store_id, food_id)
  values (new.household_id, new.label, new.store_id, new.food_id)
  on conflict (household_id, lower(label)) do update
    set times_added   = shopping_habit.times_added + 1,
        last_added_at = now(),
        store_id      = coalesce(excluded.store_id, shopping_habit.store_id);

  return new;
end $$;

-- Le trigger écoutait `update of checked_at` : il doit aussi voir les lignes
-- créées déjà cochées (un article ajouté depuis le magasin, pris dans la foulée).
drop trigger if exists shopping_check on public.shopping_item;
create trigger shopping_check before insert or update on public.shopping_item
  for each row execute function public.tg_shopping_check();
