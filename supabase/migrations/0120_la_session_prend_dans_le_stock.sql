-- ═══════════════════════════════════════════════════════════════════════════
-- 0120 · Les ingrédients d'une session sortent du stock
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Le 25/10/2026, la session de Kamil a cuisiné 1 500 g de poireaux, 750 g de saumon, 20
-- tortillas… et le frigo de l'appli les affichait encore, à plein : rien ne retirait du stock
-- ce que les recettes avaient consommé. « Ce que j'ai » mentait dès le dressage.
--
-- Deux fonctions, et une colonne qui dit « c'est fait » :
--
--   · `ce_que_la_session_prend(cycle)` LIT : pour chaque ligne de stock dont l'aliment est celui
--     d'un ingrédient des recettes du cycle, ce que les recettes en demandent, ce qui reste. C'est
--     ce que l'écran « On range » liste, pour que l'hôte corrige (« il en reste la moitié »).
--   · `retire_du_stock(cycle, restes)` ÉCRIT : applique ce calcul, avec les corrections de l'écran,
--     supprime ce qui tombe à zéro, et note `cycle.stock_retire_le` pour ne jamais retirer deux fois
--     (le dressage se reprend : une écriture ratée n'est pas rejouée en double).
--
-- Ce que « demander » veut dire. Une recette de `yield_servings` parts, cuisinée pour `servings`
-- parts, prend la ligne × servings / yield_servings (un rendement inconnu vaut 1, comme
-- partout dans l'appli) :
--
--   · stock en `g` ou `ml` (les `ml` comptent comme des grammes : c'est ce que fait déjà
--     `grams_reference`) → Σ `grams_reference` ;
--   · stock à l'unité (`unit` nul, ou `u`) → Σ `qty` des lignes à l'unité de la recette ;
--   · tout autre cas (un « pot », une ligne sans poids) → NON CALCULABLE : la ligne reste intacte.
--     Mieux vaut un stock trop plein, que l'hôte voit, qu'un stock vidé sur une devinette.
--
-- ⚠️ Deux lignes de stock du même aliment (la moitié d'un sachet au frigo, un autre au placard) se
--    PARTAGENT le besoin, la plus pressée d'abord : sans cela chacune aurait pris la totalité et
--    la session aurait retiré deux fois ce qu'elle a cuisiné.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cycle add column stock_retire_le timestamptz;
comment on column public.cycle.stock_retire_le is
  'Quand les ingrédients de la session ont été retirés du stock (retire_du_stock). Posée une fois : le dressage se reprend sans retirer deux fois.';

create or replace function public.ce_que_la_session_prend(p_cycle uuid)
returns table (
  stock_item_id uuid,
  libelle       text,
  lieu          text,
  quantite      numeric,
  unite         text,
  prise         numeric,
  reste         numeric,
  calculable    boolean
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with le_cycle as (
    -- Réservé au foyer du cycle : un autre foyer, ou personne, n'obtient aucune ligne.
    select c.id, c.household_id from public.cycle c
    where c.id = p_cycle and c.household_id = public.current_household()
  ),
  besoin as (
    select ri.food_id,
           round(sum(ri.grams_reference * cr.servings::numeric / coalesce(r.yield_servings, 1))
                 filter (where ri.grams_reference is not null), 2) as grammes,
           round(sum(ri.qty * cr.servings::numeric / coalesce(r.yield_servings, 1))
                 filter (where ri.qty is not null and (ri.unit is null or ri.unit = 'u')), 2) as unites
    from le_cycle lc
    join public.cycle_recipe cr on cr.cycle_id = lc.id
    join public.recipe r on r.id = cr.recipe_id
    join public.recipe_ingredient ri on ri.recipe_id = r.id
    where ri.food_id is not null
    group by ri.food_id
  ),
  en_stock as (
    select s.*,
           case when s.unit in ('g', 'ml') then 'masse'
                when s.unit is null or s.unit = 'u' then 'compte' end as genre
    from public.stock_item s
    join le_cycle lc on lc.household_id = s.household_id
    where s.food_id in (select b.food_id from besoin b)
  ),
  partage as (
    select s.*,
           case s.genre when 'masse' then b.grammes when 'compte' then b.unites end as demande,
           -- Ce que les lignes plus pressées du même aliment ont déjà pris en charge.
           coalesce(sum(s.quantity) over (
             partition by s.food_id, s.genre
             order by s.expires_at nulls last, s.created_at, s.id
             rows between unbounded preceding and 1 preceding), 0) as avant
    from en_stock s
    join besoin b on b.food_id = s.food_id
  )
  select p.id, p.label, p.location, p.quantity, p.unit,
         case when p.quantity is not null and p.demande is not null
              then least(p.quantity, greatest(0, p.demande - p.avant)) end,
         case when p.quantity is not null and p.demande is not null
              then p.quantity - least(p.quantity, greatest(0, p.demande - p.avant)) else p.quantity end,
         (p.quantity is not null and p.demande is not null)
  from partage p
  order by p.label, p.id
$$;
revoke execute on function public.ce_que_la_session_prend(uuid) from public, anon;
grant   execute on function public.ce_que_la_session_prend(uuid) to authenticated;

-- ── L'écriture ──────────────────────────────────────────────────────────────
-- `p_restes` : {"<stock_item_id>": <ce qu'il en reste>}, les corrections de l'écran. Rend le
-- nombre de lignes de stock changées ou supprimées ; 0 si la session avait déjà été retirée.
create or replace function public.retire_du_stock(p_cycle uuid, p_restes jsonb default '{}'::jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  foyer uuid := public.current_household();
  deja timestamptz;
  corrections jsonb := coalesce(p_restes, '{}'::jsonb);
  c record;
  nouveau numeric;
  touchees integer := 0;
begin
  if foyer is null then
    raise exception 'Session introuvable.' using errcode = 'no_data_found';
  end if;
  if jsonb_typeof(corrections) <> 'object' then
    raise exception 'Les restes se donnent en objet {ligne: reste}.' using errcode = 'invalid_parameter_value';
  end if;
  for c in select e.key, jsonb_typeof(e.value) as genre from jsonb_each(corrections) e loop
    if c.genre <> 'number' then
      raise exception 'Le reste de % n’est pas un nombre.', c.key using errcode = 'invalid_parameter_value';
    end if;
  end loop;

  -- Verrouillé : deux téléphones qui rangent en même temps ne retirent pas deux fois.
  select y.stock_retire_le into deja
  from public.cycle y where y.id = p_cycle and y.household_id = foyer for update;
  if not found then
    raise exception 'Session introuvable.' using errcode = 'no_data_found';
  end if;
  if deja is not null then return 0; end if;

  for c in select * from public.ce_que_la_session_prend(p_cycle) p where p.calculable loop
    nouveau := c.reste;
    if corrections ? c.stock_item_id::text then
      -- Borné : on ne reste pas avec plus qu'on n'avait, ni avec moins que rien.
      nouveau := least(c.quantite, greatest(0, (corrections ->> c.stock_item_id::text)::numeric));
    end if;
    if nouveau <= 0 then
      delete from public.stock_item where id = c.stock_item_id;
      touchees := touchees + 1;
    elsif nouveau <> c.quantite then
      update public.stock_item set quantity = nouveau where id = c.stock_item_id;
      touchees := touchees + 1;
    end if;
  end loop;

  update public.cycle set stock_retire_le = public.maintenant() where id = p_cycle;
  return touchees;
end $$;
revoke execute on function public.retire_du_stock(uuid, jsonb) from public, anon;
grant   execute on function public.retire_du_stock(uuid, jsonb) to authenticated;
