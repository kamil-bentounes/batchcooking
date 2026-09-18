-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUE L'APPRENTISSAGE RETENAIT DE TRAVERS
--
-- Trois défauts trouvés à la relecture, tous dans des triggers écrits pour
-- « apprendre de l'usage ». Ils partagent une cause : on n'avait regardé que le
-- chemin nominal, jamais celui de la correction.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * 1 · Deux unités qui alternent jetaient la série entière.
 *
 * La règle « une lecture au kilo remplace une lecture à l'unité » s'appliquait à
 * TOUTE paire d'unités différentes — y compris `kg` contre `l`, qui ne sont pas
 * plus ou moins informatives l'une que l'autre : ce sont deux lectures correctes
 * du même pot de crème, l'une au poids, l'autre au volume.
 *
 * Mesuré : cinq lignes du même produit, quatre en millilitres et une en
 * grammes, laissaient `observations = 1`. La moyenne mobile ne convergeait
 * jamais, et l'écran annonçait « vu 1 fois » en permanence.
 *
 * Une unité est plus informative qu'une autre dans un seul cas : quand on passe
 * de « à la pièce » à « au poids ou au volume ». Entre kilo et litre, on garde
 * ce qu'on avait — on ne sait pas convertir, et repartir de zéro est pire.
 */
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
    if u = 'u' or connue <> 'u' then
      -- Moins informatif (ou simplement AUTRE : kg contre l). On n'apprend
      -- rien, on ne jette rien. Le prix payé remonte quand même, plus bas.
      null;
    else
      -- Le seul cas d'un vrai gain : on passait à la pièce, on sait désormais
      -- peser. On remplace, et la série repart d'une observation.
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

/**
 * 2 · Décocher ne défaisait pas l'habitude.
 *
 * L'en-tête de la migration 0021 promet « décocher défait exactement ce que
 * cocher avait fait ». L'inventaire était bien retiré, pas le compteur
 * d'habitude : un doigt qui glisse dans le magasin doublait le chiffre qui
 * classe les suggestions.
 */
create or replace function public.tg_shopping_check_apres()
returns trigger language plpgsql security definer set search_path = public as $$
declare lissage constant numeric := 0.4;   -- poids de la dernière observation
begin
  if new.checked_at is null then
    if tg_op = 'UPDATE' and old.checked_at is not null then
      delete from public.stock_item where shopping_item_id = new.id;
      -- Défaire l'habitude aussi. On descend d'un, et la ligne disparaît quand
      -- il ne reste rien : une habitude à zéro n'est pas une habitude.
      update public.shopping_habit set times_added = times_added - 1
      where household_id = new.household_id and lower(label) = lower(new.label)
        and times_added > 1;
      delete from public.shopping_habit
      where household_id = new.household_id and lower(label) = lower(new.label)
        and times_added <= 1;
    end if;
    return null;
  end if;
  if tg_op = 'UPDATE' and old.checked_at is not null then return null; end if;

  if new.aisle is not null and exists (
       select 1 from public.store s
       where s.id = new.store_id and s.household_id = new.household_id) then
    insert into public.aisle_order (household_id, store_id, aisle, position)
    values (new.household_id, new.store_id, new.aisle, new.checked_rank)
    on conflict (store_id, aisle) do update
      set position   = aisle_order.position * (1 - lissage) + excluded.position * lissage,
          updated_at = now();
  end if;

  insert into public.stock_item
    (household_id, label, food_id, quantity, unit, location, source, shopping_item_id)
  values (new.household_id, new.label, new.food_id, new.quantity, new.unit,
          public.lieu_du_rayon(new.aisle), 'courses', new.id)
  on conflict (shopping_item_id) where shopping_item_id is not null do nothing;

  insert into public.shopping_habit (household_id, label, store_id, food_id)
  values (new.household_id, new.label,
          (select s.id from public.store s
           where s.id = new.store_id and s.household_id = new.household_id),
          new.food_id)
  on conflict (household_id, lower(label)) do update
    set times_added   = shopping_habit.times_added + 1,
        last_added_at = now(),
        store_id      = coalesce(excluded.store_id, shopping_habit.store_id);
  return null;
end $$;

/**
 * 3 · Régénérer la liste effaçait les cochages et les prix payés.
 *
 * `useGenereListe` supprimait toutes les lignes de source « recette » avant de
 * les réinsérer. Une liste déjà faite en magasin, avec vingt articles cochés,
 * l'inventaire rempli et le ticket enregistré, revenait décochée et sans prix —
 * et les lignes d'inventaire, orphelines, se dédoublaient au cochage suivant.
 *
 * On protège donc en BASE ce qui a déjà servi : une ligne cochée ou payée ne se
 * supprime plus. Le client peut appeler la régénération autant qu'il veut.
 */
create or replace function public.tg_shopping_item_protege()
returns trigger language plpgsql as $$
begin
  if old.checked_at is not null or old.paid_price_eur is not null then
    -- On ne lève pas : la régénération doit pouvoir passer sur le reste. On
    -- refuse simplement CETTE ligne, ce que PostgREST rend comme « 0 ligne
    -- supprimée » — le client compte, il ne lit pas d'erreur.
    return null;
  end if;
  return old;
end $$;

create trigger shopping_item_protege before delete on public.shopping_item
  for each row execute function public.tg_shopping_item_protege();
