-- ═══════════════════════════════════════════════════════════════════════════
-- LE SACHET DE PETITS POIS N'ENTRE PAS PAR LE FORMULAIRE
--
-- 0046 a donné une date de mise au froid à `stock_item`, et 0047 a fait
-- respecter la péremption qu'on lui donne. Les deux ne servaient qu'au
-- formulaire manuel — or le chemin PRINCIPAL du garde-manger, ce sont les
-- COURSES : cocher un article le range tout seul (D49), et `tg_shopping_check`
-- n'a pas été touché. Un surgelé acheté entrait donc au congélateur sans date
-- de mise au froid ni péremption, c'est-à-dire sans qu'on puisse jamais dire
-- quand il en sort. Exactement ce que la migration précédente disait corriger.
--
-- Et la contrainte était permissive là où celle de `portion` est une ÉGALITÉ :
-- elle interdisait une date hors du congélateur, pas l'absence de date dedans.
-- On la rend symétrique — après avoir réparé les lignes déjà entrées.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * Ranger un article coché, avec ses dates quand il va au froid.
 *
 * ⚠️ `lieu_du_rayon` décide du lieu : un article du rayon « Surgelés » atterrit
 *    au congélateur sans que personne l'ait dit. C'est bien — mais alors les
 *    dates doivent suivre au même endroit, sinon elles ne suivent nulle part.
 */
create or replace function public.tg_shopping_check_apres()
returns trigger language plpgsql security definer set search_path = public as $$
declare lissage constant numeric := 0.4;   -- poids de la dernière observation
        lieu text;
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

  lieu := public.lieu_du_rayon(new.aisle);

  insert into public.stock_item
    (household_id, label, food_id, quantity, unit, location, source, shopping_item_id,
     frozen_at, expires_at)
  values (new.household_id, new.label, new.food_id, new.quantity, new.unit,
          lieu, 'courses', new.id,
          -- Le jour du rangement : c'est le seul qu'on connaisse, et il vaut
          -- mieux que rien. Trois mois ensuite, comme D29 pour une barquette.
          case when lieu = 'congelateur' then now() end,
          case when lieu = 'congelateur' then now() + interval '90 days' end)
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

-- Ce qui est déjà entré au froid sans date : on lui donne celle de son entrée.
-- Sans cette réparation, la contrainte ci-dessous refuserait toute écriture sur
-- ces lignes-là — un verrou qui punit ceux qu'il devait protéger.
update public.stock_item
   set frozen_at  = coalesce(frozen_at, created_at),
       expires_at = coalesce(expires_at, coalesce(frozen_at, created_at) + interval '90 days')
 where location = 'congelateur' and frozen_at is null;

alter table public.stock_item drop constraint stock_item_congele_date;
alter table public.stock_item add constraint stock_item_congele_date
  check ((location = 'congelateur') = (frozen_at is not null));
