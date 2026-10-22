-- ═══════════════════════════════════════════════════════════════════════════
-- 0117 · Quatre défauts de base trouvés par le grand test « cuisine »
--
-- Rejouable : `create or replace` partout, triggers recréés, remplissage idempotent.
--
--  1. 0013/0018 — une session INTERROMPUE est invisible : `current_cycle()` l'écarte
--     et `open_cycle` refuse sa semaine (« a déjà son cycle, clos »). L'écran la
--     retrouvait par un `select` borné par une date calculée côté client, c'est-à-dire
--     avec l'horloge du téléphone. `cycle_a_reprendre()` la rend, avec l'horloge de la
--     base ; `open_cycle` dit quoi faire.
--  2. 0031 — `shopping_item_protege` répondait « 0 ligne » : le client ne pouvait pas
--     distinguer « refusé » de « rien à supprimer ». Il lève maintenant une exception
--     lisible… mais seulement pour une suppression DIRECTE. En cascade (suppression d'un
--     cycle, d'un foyer, `delete_my_account`), il laissait la ligne en place : la clé
--     étrangère restait pendante (mesuré : une ligne cochée survivait à son foyer
--     effacé, orpheline). La cascade passe désormais.
--  3. 0021/0028/0048 — cocher remplissait le stock même pour le non-alimentaire
--     (« Papier toilette » rangé au frigo). On ne range plus un article des rayons
--     Entretien et Hygiène, ni un article « Autre » sans aliment rattaché.
--     ⚠️ Pas de fusion avec une ligne de stock existante : « décocher défait exactement
--     ce que cocher a fait » repose sur le lien `shopping_item_id` ; fusionner le casserait.
--  4. `cycle_recipe.position` n'était jamais renseignée (tout à 0).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. La session à reprendre ───────────────────────────────────────────────
/**
 * La dernière session interrompue du foyer dont la semaine est la courante, la
 * dernière, ou une à venir (un cycle ouvert un dimanche couvre le lundi suivant) ;
 * `null` sinon. Au-delà de la semaine dernière, ce n'est plus « la session qu'on
 * vient d'interrompre » mais un plan d'il y a un mois, dont les barquettes sont
 * mangées ou périmées.
 *
 * `security definer` : `current_household()` reste celui de l'appelant (il lit
 * `auth.uid()`), exactement comme `current_cycle()`.
 */
create or replace function public.cycle_a_reprendre()
returns uuid language sql security definer set search_path = public, pg_temp as $$
  select id from public.cycle
  where household_id = public.current_household()
    and state = 'interrompue'
    and week_of >= (date_trunc('week', public.aujourdhui()) - interval '7 days')::date
  order by week_of desc, created_at desc
  limit 1
$$;
revoke execute on function public.cycle_a_reprendre() from public, anon;
grant   execute on function public.cycle_a_reprendre() to authenticated, service_role;

create or replace function public.open_cycle(p_week_of date, p_servings int default 10)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  hh   uuid := public.current_household();
  vivant uuid;
  nouveau uuid;
begin
  if hh is null then
    raise exception 'aucun foyer' using errcode = 'insufficient_privilege';
  end if;

  select id into vivant from public.cycle
  where household_id = hh and state not in ('cloture','interrompue');
  if vivant is not null then return vivant; end if;

  -- Une semaine dont la session est INTERROMPUE se reprend, elle ne se rouvre pas : on
  -- le dit, quand l'écran sait la proposer (`cycle_a_reprendre`).
  if exists (select 1 from public.cycle
             where household_id = hh and week_of = p_week_of and state = 'interrompue'
               and id = public.cycle_a_reprendre()) then
    raise exception 'la semaine du % a une session interrompue : reprends-la', p_week_of
      using errcode = 'unique_violation';
  end if;

  -- Une semaine déjà couverte par un cycle CLOS ne se rouvre pas : on
  -- n'efface pas un bilan pour recommencer. Le message doit le dire.
  if exists (select 1 from public.cycle
             where household_id = hh and week_of = p_week_of) then
    raise exception 'la semaine du % a déjà son cycle, clos', p_week_of
      using errcode = 'unique_violation';
  end if;

  insert into public.cycle (household_id, week_of, servings_target, state)
  values (hh, p_week_of, p_servings, 'vide')
  returning id into nouveau;
  return nouveau;
end $$;
revoke execute on function public.open_cycle(date, int) from public, anon;
grant   execute on function public.open_cycle(date, int) to authenticated, service_role;

-- ── 2. Une ligne protégée se refuse à voix haute ────────────────────────────
/**
 * `pg_trigger_depth() = 1` : la suppression vient d'une instruction, pas d'une action
 * référentielle. Une cascade (`on delete cascade`) exécute son DELETE depuis un trigger
 * interne : profondeur 2 ou plus, la ligne part avec son parent.
 */
create or replace function public.tg_shopping_item_protege()
returns trigger language plpgsql as $$
begin
  if old.checked_at is not null or old.paid_price_eur is not null then
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'Cette ligne est cochée ou payée : décoche-la et efface son prix pour la supprimer.'
      using errcode = 'restrict_violation';
  end if;
  return old;
end $$;

drop trigger if exists shopping_item_protege on public.shopping_item;
create trigger shopping_item_protege before delete on public.shopping_item
  for each row execute function public.tg_shopping_item_protege();

-- ── 3. Cocher ne range que de l'alimentaire ─────────────────────────────────
/** Reprise de la définition de 0048, avec une seule différence : le bloc du stock. */
create or replace function public.tg_shopping_check_apres()
returns trigger language plpgsql security definer set search_path = public as $$
declare lissage constant numeric := 0.4;   -- poids de la dernière observation
        lieu text;
        alimentaire boolean;
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

  -- Entretien et Hygiène ne se mangent pas ; « Autre » sans aliment rattaché non plus
  -- (piles, croquettes, sacs poubelle).
  alimentaire := not (new.aisle in ('Entretien', 'Hygiène')
                      or (new.aisle = 'Autre' and new.food_id is null));

  if alimentaire then
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
  end if;

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

-- ── 4. La position des recettes du cycle ────────────────────────────────────
create or replace function public.tg_cycle_recipe_position()
returns trigger language plpgsql as $$
begin
  -- La première reçoit 0, les suivantes `max + 1` : retirer une recette laisse un trou,
  -- sans conséquence — l'écran trie par `position`, il ne l'affiche pas.
  select coalesce(max(position) + 1, 0) into new.position
  from public.cycle_recipe where cycle_id = new.cycle_id;
  return new;
end $$;

drop trigger if exists cycle_recipe_position on public.cycle_recipe;
create trigger cycle_recipe_position before insert on public.cycle_recipe
  for each row execute function public.tg_cycle_recipe_position();

-- L'existant : l'ordre où chaque recette a été retenue.
update public.cycle_recipe cr set position = n.rang
from (select id, (row_number() over (partition by cycle_id order by created_at, id) - 1)::int as rang
      from public.cycle_recipe) n
where n.id = cr.id and cr.position is distinct from n.rang;
