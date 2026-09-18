-- ═══════════════════════════════════════════════════════════════════════════
-- LES AUTRES TRIGGERS QUI ÉCRIVAIENT CHEZ LES AUTRES
--
-- La migration 0027 a fermé le cas du ticket. Une relecture à œil frais en a
-- trouvé deux autres, de la MÊME famille, et c'est la leçon qui compte :
--
--   un trigger `security definer` ne doit jamais se fier à un identifiant
--   fourni par le client sans vérifier à qui appartient la ligne visée.
--
-- La RLS protège la table qui déclenche le trigger ; elle ne protège aucune des
-- tables que le trigger touche ensuite.
--
-- Et un troisième défaut du même fichier 0021, sans rapport avec l'isolation :
-- la branche INSERT du trigger de cochage ne pouvait tout simplement pas
-- fonctionner.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Manger la barquette d'un autre foyer ─────────────────────────────────
-- Alice insère dans SA table `meal_slot` une case `mange` dont le `portion_id`
-- désigne une barquette de Bob. La RLS accepte — elle ne regarde que le foyer
-- de la CASE. Le trigger passait alors la part de Bob à « mangée », et
-- `tg_portion_journal` écrivait dans le journal de Bob un événement signé du
-- compte d'Alice. Bob voyait sa part disparaître sans rien pouvoir relire.
create or replace function public.tg_meal_slot_consomme()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.state = 'mange' and new.portion_id is not null
     and (tg_op = 'INSERT' or old.state is distinct from 'mange') then
    update public.portion set state = 'mangee'
    where id = new.portion_id and state <> 'mangee'
      and household_id = new.household_id;   -- ⚠️ le garde-fou
  end if;
  return null;
end $$;

-- ── 2. L'ordre des rayons d'un autre foyer ──────────────────────────────────
-- `aisle_order` est unique sur (store_id, aisle), et `aisle_order_household`
-- redérive le foyer DEPUIS LE MAGASIN : écrire avec le `store_id` de Bob
-- écrivait donc chez Bob. Il suffisait à Alice de créer un article pointant le
-- magasin de Bob et de le cocher pour déplacer son rayon « Frais ».
--
-- ── 3. Un article créé DÉJÀ COCHÉ était refusé ──────────────────────────────
-- Le trigger est `BEFORE INSERT` et insérait dans `stock_item` avec
-- `shopping_item_id = new.id` : la ligne n'existe pas encore, la clé étrangère
-- échouait (23503). C'est exactement le cas que l'en-tête de 0021 disait vouloir
-- couvrir — « un article ajouté depuis le magasin, pris dans la foulée ».
--
-- On coupe donc en deux, ce qui est la forme correcte : le BEFORE pose ce qui
-- appartient à la ligne (son rang), l'AFTER écrit ce qui dépend de son
-- existence (inventaire, rayons, habitude).
create or replace function public.tg_shopping_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare rang int;
begin
  if new.checked_at is null then
    new.checked_rank := null;
    return new;
  end if;
  -- Un article déjà coché qu'on modifie : son rang est acquis.
  if tg_op = 'UPDATE' and old.checked_at is not null then return new; end if;

  select coalesce(max(checked_rank), 0) + 1 into rang
  from public.shopping_item
  where cycle_id is not distinct from new.cycle_id
    and store_id is not distinct from new.store_id
    and household_id = new.household_id;
  new.checked_rank := rang;
  return new;
end $$;

create or replace function public.tg_shopping_check_apres()
returns trigger language plpgsql security definer set search_path = public as $$
declare lissage constant numeric := 0.4;   -- poids de la dernière observation
begin
  -- ── Décochage : on défait exactement ce que cocher avait fait ────────────
  if new.checked_at is null then
    if tg_op = 'UPDATE' and old.checked_at is not null then
      delete from public.stock_item where shopping_item_id = new.id;
    end if;
    return null;
  end if;
  if tg_op = 'UPDATE' and old.checked_at is not null then return null; end if;

  -- ── L'ordre des rayons apprend du geste (D58) ───────────────────────────
  -- ⚠️ Seulement si le magasin est CELUI DU FOYER. `aisle_order` est unique sur
  --    (store_id, aisle) et son trigger redérive le foyer depuis le magasin :
  --    sans cette clause, on apprend chez le voisin.
  if new.aisle is not null and exists (
       select 1 from public.store s
       where s.id = new.store_id and s.household_id = new.household_id) then
    insert into public.aisle_order (household_id, store_id, aisle, position)
    values (new.household_id, new.store_id, new.aisle, new.checked_rank)
    on conflict (store_id, aisle) do update
      set position   = aisle_order.position * (1 - lissage) + excluded.position * lissage,
          updated_at = now();
  end if;

  -- ── L'article entre à l'inventaire (D49) ────────────────────────────────
  insert into public.stock_item
    (household_id, label, food_id, quantity, unit, location, source, shopping_item_id)
  values (new.household_id, new.label, new.food_id, new.quantity, new.unit,
          public.lieu_du_rayon(new.aisle), 'courses', new.id)
  on conflict (shopping_item_id) where shopping_item_id is not null do nothing;

  -- ── Ce qu'on reprend à chaque fois finira par se proposer seul (D45) ─────
  insert into public.shopping_habit (household_id, label, store_id, food_id)
  values (new.household_id, new.label,
          -- Même précaution : on ne retient pas l'enseigne de quelqu'un d'autre.
          (select s.id from public.store s
           where s.id = new.store_id and s.household_id = new.household_id),
          new.food_id)
  on conflict (household_id, lower(label)) do update
    set times_added   = shopping_habit.times_added + 1,
        last_added_at = now(),
        store_id      = coalesce(excluded.store_id, shopping_habit.store_id);
  return null;
end $$;

drop trigger if exists shopping_check on public.shopping_item;
create trigger shopping_check before insert or update on public.shopping_item
  for each row execute function public.tg_shopping_check();
create trigger shopping_check_apres after insert or update on public.shopping_item
  for each row execute function public.tg_shopping_check_apres();

-- ── 4. La moyenne mélangeait des €/kg et des €/article ──────────────────────
-- Le prix est ramené au kilo quand la quantité est lue, et laissé à l'unité
-- sinon. La moyenne mobile additionnait donc des grandeurs de natures
-- différentes, et `unit` était écrasée par la DERNIÈRE lecture.
--
-- Mesuré : « PDT CHARLOTTE 2,5 kg à 3,75 € » apprend 1,50 €/kg ; la semaine
-- suivante le modèle ne lit pas la quantité — cas que le prompt illustre
-- lui-même — et le foyer « sait » désormais que les pommes de terre valent
-- 2,63 € l'unité. Une seule lecture incomplète corrompt durablement un prix.
--
-- La règle : on ne moyenne JAMAIS entre deux unités. Une lecture au kilo est
-- plus informative qu'une lecture à l'unité ; elle remplace, et recommence la
-- série. L'inverse ne s'apprend pas du tout — un prix pour une quantité
-- inconnue n'enseigne rien sur le prix au kilo.
create or replace function public.tg_receipt_line_apprend()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  boutique uuid;
  unitaire numeric;
  u        text;
  connue   text;
begin
  select r.store_id into boutique
  from public.receipt r
  left join public.store s on s.id = r.store_id
  where r.id = new.receipt_id
    and (r.store_id is null or s.household_id = new.household_id);

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

  select hp.unit into connue from public.household_price hp
  where hp.household_id = new.household_id
    and coalesce(hp.store_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(boutique, '00000000-0000-0000-0000-000000000000'::uuid)
    and lower(hp.label) = lower(new.label);

  if connue is not null and connue <> u then
    if u = 'u' then
      -- Moins informatif que ce qu'on sait déjà : on n'apprend rien, mais on
      -- reporte quand même le prix payé plus bas. Ne rien faire ici vaut mieux
      -- que d'abîmer un prix au kilo avec un prix de sac.
      null;
    else
      -- Plus informatif : on remplace et on repart d'une observation.
      update public.household_price set
        unit = u, avg_price_eur = unitaire, last_price_eur = unitaire,
        observations = 1, last_seen_at = now(),
        food_id = coalesce(new.food_id, food_id)
      where household_id = new.household_id
        and coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = coalesce(boutique, '00000000-0000-0000-0000-000000000000'::uuid)
        and lower(label) = lower(new.label);
    end if;
  else
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
      food_id       = coalesce(excluded.food_id, household_price.food_id);
  end if;

  if new.shopping_item_id is not null then
    update public.shopping_item set paid_price_eur = new.price_eur
    where id = new.shopping_item_id
      and household_id = new.household_id;
  end if;
  return null;
end $$;
