-- ═══════════════════════════════════════════════════════════════════════════
-- 0120 · On range : les barquettes, le stock de la session, et l'étape suivante — d'un seul geste
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Le 25/10/2026, la session de Kamil a cuisiné 1 500 g de poireaux, 750 g de saumon, 20
-- tortillas… et le frigo de l'appli les affichait encore, à plein : rien ne retirait du stock
-- ce que les recettes avaient consommé. « Ce que j'ai » mentait dès le dressage.
--
-- Deux fonctions publiques, et une colonne qui dit « c'est fait » :
--
--   · `ce_que_la_session_prend(cycle)` LIT : pour chaque ligne de stock dont l'aliment est celui
--     d'un ingrédient des recettes du cycle, ce que les recettes en demandent, ce qui reste. C'est
--     ce que l'écran « On range » liste, pour que l'hôte corrige (« il en reste la moitié »).
--   · `range_la_session(cycle, lots, rangé le, restes, retirer)` ÉCRIT, en UNE transaction : les
--     barquettes, le retrait du stock, le passage du cycle à « semaine ».
--
-- Pourquoi une seule fonction. L'écran enchaînait trois écritures côté client (compter les
-- barquettes, les insérer, retirer du stock, changer l'état) : deux membres qui appuyaient sur
-- « Ranger » en même temps passaient tous deux le « il n'y en a pas encore » et créaient les
-- barquettes en double, sans clé unique pour les arrêter. Ici le cycle est VERROUILLÉ (`for update`)
-- avant tout : le second appel attend, voit le cycle déjà à « semaine » et ne fait rien.
--
-- Le retrait du stock n'est plus appelable seul (`retire_du_stock_interne`, sans droit pour les
-- comptes) : appelé hors du rangement il n'avait aucune garde d'état.
--
-- Ce que « demander » veut dire. Une recette de `yield_servings` parts, cuisinée pour `servings`
-- parts, prend la ligne × servings / yield_servings. Un rendement inconnu (ou nul) vaut FACTEUR 1 —
-- exactement la liste de courses (`useGenereListe`) : ce qu'on a acheté pour 1× n'est pas vidé ×
-- servings.
--
--   · stock en `g` ou `ml` (les `ml` comptent comme des grammes : c'est ce que fait déjà
--     `grams_reference`) → Σ des grammes de la ligne : le poids appris par le foyer quand la ligne
--     est un compte nu (« 2 oignons »), sinon `grams_reference`, sinon `qty` quand la ligne est
--     elle-même en g ou ml — l'ordre de la liste de courses ;
--   · stock à l'unité (`unit` nul, ou `u`) → Σ `qty` des lignes à l'unité de la recette, arrondie
--     à l'unité ENTIÈRE vers le bas : on ne retire pas 0,75 oignon, le reste reste au stock ;
--   · tout autre cas → NON CALCULABLE : la ligne reste intacte. Mieux vaut un stock trop plein, que
--     l'hôte voit, qu'un stock vidé sur une devinette. C'est le cas de :
--       – un « pot », une ligne de stock sans quantité ;
--       – un aliment dont UNE ligne de recette ne se laisse pas convertir (pas de poids, pas
--         d'unité compatible) : en retirer la part résolue seulement serait un retrait partiel
--         présenté comme complet ;
--       – un aliment présent au stock sous deux genres de mesure (un sachet en g ET trois pièces) :
--         on ne sait pas lequel la recette a pris, les satisfaire tous deux serait compter deux fois.
--
-- ⚠️ Deux lignes de stock du même aliment (la moitié d'un sachet au frigo, un autre au placard) se
--    PARTAGENT le besoin, la plus pressée d'abord : sans cela chacune aurait pris la totalité et
--    la session aurait retiré deux fois ce qu'elle a cuisiné.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cycle add column stock_retire_le timestamptz;
comment on column public.cycle.stock_retire_le is
  'Quand les ingrédients de la session ont été retirés du stock (range_la_session). Posée une fois : le rangement se reprend sans retirer deux fois. Réservée aux fonctions de la base.';

-- ── Personne ne repose cette colonne à la main ──────────────────────────────
-- La policy `cycle_update` laisse un membre modifier son cycle : sans cette garde, il remettrait
-- `stock_retire_le` à null par PostgREST et le prochain rangement retirerait une seconde fois.
-- `security invoker` : elle juge l'appelant par `current_user`. Sous une fonction `security definer`
-- (range_la_session), c'est le propriétaire : la porte est ouverte à elle seule, pas aux comptes.
create or replace function public.tg_cycle_stock_retire_garde()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.stock_retire_le is not null then
      raise exception 'Cette date est posée par le rangement, pas à la main.' using errcode = 'check_violation';
    end if;
  elsif new.stock_retire_le is distinct from old.stock_retire_le then
    raise exception 'Cette date est posée par le rangement, pas à la main.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger cycle_stock_retire_garde before insert or update on public.cycle
  for each row execute function public.tg_cycle_stock_retire_garde();

-- ── La lecture ──────────────────────────────────────────────────────────────
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
  lignes as (
    -- Une ligne de recette, mise à l'échelle comme la liste de courses : rendement inconnu = × 1.
    select ri.food_id,
           case when r.yield_servings > 0 then cr.servings::numeric / r.yield_servings else 1 end as facteur,
           coalesce(
             -- Le poids appris par le foyer, pour un compte nu (« 2 oignons »).
             case when ri.unit is null and ri.qty is not null then
               ri.qty * (select w.grams from public.household_unit_weight w
                         where w.household_id = lc.household_id and w.food_id = ri.food_id and w.actif
                         order by w.observations desc, w.unit_label limit 1)
             end,
             ri.grams_reference,
             case when ri.unit in ('g', 'ml') then ri.qty end
           ) as grammes,
           case when ri.qty is not null and (ri.unit is null or ri.unit = 'u') then ri.qty end as unites
    from le_cycle lc
    join public.cycle_recipe cr on cr.cycle_id = lc.id
    join public.recipe r on r.id = cr.recipe_id
    join public.recipe_ingredient ri on ri.recipe_id = r.id
    where ri.food_id is not null
  ),
  besoin as (
    -- Un total n'existe que si CHAQUE ligne de l'aliment s'y convertit : sinon, non calculable.
    select l.food_id,
           case when bool_and(l.grammes is not null)
                then round(sum(l.grammes * l.facteur), 2) end as grammes,
           case when bool_and(l.unites is not null)
                then floor(round(sum(l.unites * l.facteur), 2)) end as unites
    from lignes l
    group by l.food_id
  ),
  en_stock as (
    select s.*,
           case when s.unit in ('g', 'ml') then 'masse'
                when s.unit is null or s.unit = 'u' then 'compte' end as genre
    from public.stock_item s
    join le_cycle lc on lc.household_id = s.household_id
    where s.food_id in (select b.food_id from besoin b)
  ),
  genres as (
    -- Les genres de mesure d'un aliment au stock : deux, et on ne sait plus lequel la recette a pris.
    select e.food_id, count(distinct coalesce(e.genre, 'autre')) as n
    from en_stock e
    where e.quantity is not null
    group by e.food_id
  ),
  partage as (
    select s.*,
           case when coalesce(g.n, 1) > 1 then null
                else case s.genre when 'masse' then b.grammes when 'compte' then b.unites end
           end as demande,
           -- Ce que les lignes plus pressées du même aliment ont déjà pris en charge.
           coalesce(sum(s.quantity) over (
             partition by s.food_id, s.genre
             order by s.expires_at nulls last, s.created_at, s.id
             rows between unbounded preceding and 1 preceding), 0) as avant
    from en_stock s
    join besoin b on b.food_id = s.food_id
    left join genres g on g.food_id = s.food_id
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

-- ── Le retrait (interne) ────────────────────────────────────────────────────
-- `p_restes` : {"<stock_item_id>": <ce qu'il en reste>}, les corrections de l'écran. Rend le
-- nombre de lignes de stock changées ou supprimées. Appelée par `range_la_session`, qui a déjà
-- verrouillé le cycle, contrôlé le foyer et l'état : aucun compte ne l'appelle directement.
create or replace function public.retire_du_stock_interne(p_cycle uuid, p_restes jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  corrections jsonb := coalesce(p_restes, '{}'::jsonb);
  c record;
  nouveau numeric;
  touchees integer := 0;
begin
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
revoke execute on function public.retire_du_stock_interne(uuid, jsonb) from public, anon, authenticated;

-- ── L'écriture : on range ───────────────────────────────────────────────────
-- `p_lots`   : un tableau, UNE barquette par élément —
--              {recipe_id, grams, kcal, protein_g, fiber_g, carb_g, fat_g, [kcal_margin],
--               [protein_g_margin], [cost_eur], for_user_id|null, location: frigo|congelateur}.
--              Le titre vient de la recette, la péremption du trigger `portion_peremption` : le
--              client ne dicte ni l'un ni l'autre.
-- `p_range_le` : quand c'est rangé → `prepared_at`, et `frozen_at` des barquettes du congélateur.
--              Au plus quatre jours dans le passé, pas dans le futur.
-- `p_restes` : les corrections de l'écran, {"<stock_item_id>": <reste>}.
-- `p_retirer`: faux quand l'écran n'a pas pu lire ce que la session prend : on range sans toucher
--              au stock, et l'écran le dit.
--
-- Rend {cree, portions, retirees, deja} :
--   · `deja` vrai : le cycle était déjà passé à « semaine » (un autre membre, ou une reprise) ;
--     rien n'est écrit, `portions` dit combien il y en a ;
--   · sinon `cree` dit si les barquettes ont été créées maintenant (elles ne le sont jamais deux
--     fois : si le cycle en a déjà, on les garde telles quelles) ; `retirees` les lignes de stock
--     touchées.
create or replace function public.range_la_session(
  p_cycle uuid, p_lots jsonb, p_range_le timestamptz,
  p_restes jsonb default '{}'::jsonb, p_retirer boolean default true
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  foyer uuid := public.current_household();
  maint timestamptz := public.maintenant();
  etat text;
  deja_retire timestamptz;
  nb integer;
  cree boolean := false;
  retirees integer := 0;
  corrections jsonb := coalesce(p_restes, '{}'::jsonb);
  c record;
  l record;
begin
  if foyer is null then
    raise exception 'Session introuvable.' using errcode = 'no_data_found';
  end if;

  -- Verrouillé AVANT toute lecture des barquettes : deux téléphones qui rangent en même temps se
  -- suivent. Le second reprend ici, trouve « semaine » et les barquettes du premier.
  select y.state, y.stock_retire_le into etat, deja_retire
  from public.cycle y where y.id = p_cycle and y.household_id = foyer for update;
  if not found then
    raise exception 'Session introuvable.' using errcode = 'no_data_found';
  end if;

  select count(*) into nb from public.portion where cycle_id = p_cycle;

  -- Déjà rangé (par l'autre membre, ou par un premier appui dont la réponse s'est perdue) : rien à refaire.
  if etat = 'semaine' and nb > 0 then
    return jsonb_build_object('deja', true, 'cree', false, 'portions', nb, 'retirees', 0);
  end if;
  if etat <> 'dressage' then
    raise exception 'Cette session n’en est pas au rangement.' using errcode = 'object_not_in_prerequisite_state';
  end if;

  if coalesce(p_retirer, true) then
    if jsonb_typeof(corrections) <> 'object' then
      raise exception 'Les restes se donnent en objet {ligne: reste}.' using errcode = 'invalid_parameter_value';
    end if;
    for c in select e.key, jsonb_typeof(e.value) as genre from jsonb_each(corrections) e loop
      if c.genre <> 'number' then
        raise exception 'Le reste de % n’est pas un nombre.', c.key using errcode = 'invalid_parameter_value';
      end if;
    end loop;
  end if;

  -- ── Les barquettes : une fois par cycle ────────────────────────────────────
  if nb = 0 then
    if p_range_le is null then
      raise exception 'Il faut dire quand c’est rangé.' using errcode = 'invalid_parameter_value';
    end if;
    if p_range_le > maint + interval '5 minutes' then
      raise exception 'On ne range pas dans le futur.' using errcode = 'invalid_parameter_value';
    end if;
    if p_range_le < maint - interval '4 days 10 minutes' then
      raise exception 'Le rangement ne peut pas remonter à plus de 4 jours.' using errcode = 'invalid_parameter_value';
    end if;
    if p_lots is null or jsonb_typeof(p_lots) <> 'array' or jsonb_array_length(p_lots) = 0 then
      raise exception 'Rien à dresser.' using errcode = 'invalid_parameter_value';
    end if;
    if jsonb_array_length(p_lots) > 300 then
      raise exception 'Trop de barquettes d’un coup.' using errcode = 'invalid_parameter_value';
    end if;

    begin
      for l in select * from jsonb_to_recordset(p_lots) as x(
        recipe_id uuid, grams numeric, kcal numeric, protein_g numeric, fiber_g numeric,
        carb_g numeric, fat_g numeric, kcal_margin numeric, protein_g_margin numeric,
        cost_eur numeric, for_user_id uuid, location text)
      loop
        if l.recipe_id is null or not exists (
             select 1 from public.cycle_recipe cr where cr.cycle_id = p_cycle and cr.recipe_id = l.recipe_id) then
          raise exception 'Une barquette n’est pas d’une recette de cette session.' using errcode = 'invalid_parameter_value';
        end if;
        if l.location is null or l.location not in ('frigo', 'congelateur') then
          raise exception 'Une barquette va au frigo ou au congélateur.' using errcode = 'invalid_parameter_value';
        end if;
        if l.grams is null or l.grams <= 0 or l.grams > 5000
           or l.kcal is null or l.kcal < 0 or l.kcal > 6000
           or l.protein_g is null or l.protein_g < 0 or l.protein_g > 1000
           or l.fiber_g is null or l.fiber_g < 0 or l.fiber_g > 1000
           or l.carb_g is null or l.carb_g < 0 or l.carb_g > 1000
           or l.fat_g is null or l.fat_g < 0 or l.fat_g > 1000
           or l.kcal_margin < 0 or l.kcal_margin > 6000
           or l.protein_g_margin < 0 or l.protein_g_margin > 1000
           or l.cost_eur < 0 or l.cost_eur > 1000 then
          raise exception 'Le poids ou les valeurs d’une barquette ne sont pas plausibles.'
            using errcode = 'invalid_parameter_value';
        end if;
        if l.for_user_id is not null and not exists (
             select 1 from public.user_profile u where u.id = l.for_user_id and u.household_id = foyer) then
          raise exception 'Une barquette est pour quelqu’un qui n’est pas du foyer.' using errcode = 'invalid_parameter_value';
        end if;
      end loop;
    exception
      when data_exception then
        -- Classe 22 : un uuid ou un nombre illisible, un non-objet… Nos propres messages, déjà
        -- clairs, repartent tels quels ; seuls ceux de Postgres sont remplacés.
        if sqlerrm like 'Une barquette%' or sqlerrm like 'Le poids%' then raise; end if;
        raise exception 'Les barquettes à ranger sont mal formées.' using errcode = 'invalid_parameter_value';
    end;

    insert into public.portion (
      household_id, cycle_id, recipe_id, label, grams, kcal, protein_g, fiber_g, carb_g, fat_g,
      kcal_margin, protein_g_margin, cost_eur, for_user_id, location, prepared_at, frozen_at)
    select foyer, p_cycle, x.recipe_id, r.title, x.grams, x.kcal, x.protein_g, x.fiber_g, x.carb_g, x.fat_g,
           x.kcal_margin, x.protein_g_margin, x.cost_eur, x.for_user_id, x.location, p_range_le,
           case when x.location = 'congelateur' then p_range_le end
    from jsonb_to_recordset(p_lots) as x(
      recipe_id uuid, grams numeric, kcal numeric, protein_g numeric, fiber_g numeric,
      carb_g numeric, fat_g numeric, kcal_margin numeric, protein_g_margin numeric,
      cost_eur numeric, for_user_id uuid, location text)
    join public.recipe r on r.id = x.recipe_id;
    get diagnostics nb = row_count;
    cree := true;
  end if;

  -- ── Le stock : une fois par cycle ──────────────────────────────────────────
  if coalesce(p_retirer, true) and deja_retire is null then
    retirees := public.retire_du_stock_interne(p_cycle, corrections);
  end if;

  -- ── L'étape suivante, par la transition que la machine à états permet (dressage → semaine) ──
  update public.cycle set state = 'semaine' where id = p_cycle;

  return jsonb_build_object('deja', false, 'cree', cree, 'portions', nb, 'retirees', retirees);
end $$;
revoke execute on function public.range_la_session(uuid, jsonb, timestamptz, jsonb, boolean) from public, anon;
grant   execute on function public.range_la_session(uuid, jsonb, timestamptz, jsonb, boolean) to authenticated;
