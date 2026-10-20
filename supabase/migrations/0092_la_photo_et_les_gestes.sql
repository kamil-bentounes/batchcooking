-- ═══════════════════════════════════════════════════════════════════════════
-- LES RECETTES, REFAITES (spec du 19/10/2026 : R3, R6, et « avec ce que j'ai »)
--
-- Trois choses, toutes au service du nouvel écran « Choisir » :
--
--  1. la PHOTO de chaque recette, en lien vers celle du site — jamais copiée ;
--  2. les GESTES d'une étape : « Dans un mixeur, versez le lait… Mixez »
--     comptait zéro minute de travail, parce que le verbe qui mobilise un
--     appareil l'emporte et qu'il est passif. 73 recettes affichaient
--     « 0 min actives » et passaient en tête du tri ;
--  3. « Avec ce que j'ai » cherché sur TOUT le catalogue, et non plus parmi les
--     quatre-vingts recettes les plus rapides.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · La photo ────────────────────────────────────────────────────────────
alter table public.recipe
  add column image_url text
    check (image_url is null
           or (image_url ~ '^https://' and length(image_url) <= 2048));

comment on column public.recipe.image_url is
  'La photo du site d''origine, en LIEN : rien n''est copié chez nous. Lue dans '
  'le JSON-LD (champ image). Écrite par le rôle de service seul (tg_recipe_photo).';

/**
 * La photo ne se saisit pas.
 *
 * Chaque foyer charge la photo de chaque recette qu'il voit. Une adresse posée
 * par un compte — sur le catalogue, que tous peuvent corriger (classe B), ou
 * sur une recette « publique » — ferait charger à tous une image de son choix,
 * et lui dirait qui regarde et quand. Seule l'ingestion l'écrit, depuis la page
 * de la recette.
 *
 * `is_service_role()` et pas `current_user` : la fonction n'est pas `security
 * definer`, mais elle ne doit pas se taire le jour où elle le deviendrait.
 */
create or replace function public.tg_recipe_photo()
returns trigger language plpgsql as $$
begin
  if public.is_service_role() then return new; end if;
  if tg_op = 'INSERT' then
    if new.image_url is not null then
      raise exception 'la photo d''une recette vient de sa page, pas d''une saisie'
        using errcode = 'check_violation';
    end if;
  elsif new.image_url is distinct from old.image_url then
    raise exception 'la photo d''une recette vient de sa page, pas d''une saisie'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger recipe_photo before insert or update of image_url on public.recipe
  for each row execute function public.tg_recipe_photo();

/**
 * La source d'une recette du catalogue ne se réécrit pas.
 *
 * `scripts/relis-photos.mjs` tourne avec le rôle de service et se fie à
 * `source_url` pour savoir quelle page relire. Si un compte pouvait la changer
 * sur le catalogue (que tous corrigent, classe B), il ferait écrire par le
 * service, dans le catalogue partagé, la photo de la page de son choix — et
 * contournerait `tg_recipe_photo`. La garde de la photo et la source de la
 * photo sont une seule chaîne de confiance.
 *
 * Le titre, les ingrédients et les étapes restent corrigeables par tous ; une
 * recette DE FOYER garde sa source modifiable par son foyer (l'Importer).
 *
 * Même porte que `tg_recipe_photo` : `is_service_role()`, pas `current_user`.
 */
create or replace function public.tg_recipe_source()
returns trigger language plpgsql as $$
begin
  if public.is_service_role() then return new; end if;
  if old.owner_household_id is null
     and (new.source_url is distinct from old.source_url
          or new.source_name is distinct from old.source_name) then
    raise exception 'la source d''une recette du catalogue ne se réécrit pas'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger recipe_source before update of source_url, source_name on public.recipe
  for each row execute function public.tg_recipe_source();

-- ── 2 · Les gestes d'une étape ──────────────────────────────────────────────
alter table public.recipe_step
  add column gesture_min numeric check (gesture_min >= 0);

comment on column public.recipe_step.gesture_min is
  'Minutes de gestes que l''étape conjugue (« versez », « mélangez »), quel que '
  'soit le verbe retenu. NULL = non mesuré : l''étape compte comme avant 0092.';

/**
 * Le temps actif compte AU MOINS les gestes de chaque étape (R6).
 *
 * Une étape active ou bloquante compte sa durée, ou ses gestes s'ils la
 * dépassent. Une étape passive ne compte que ses gestes : le four cuit seul,
 * mais quelqu'un a versé la pâte dans le moule.
 *
 * `gesture_min` nul laisse le calcul d'avant intact : les recettes collées et
 * inventées, et tout ce qui n'a pas encore été recalculé.
 *
 * La même règle vit dans `src/lib/recettes/temps.ts` (`minutesDeMains`) ; un
 * banc vérifie que les deux disent la même chose.
 */
create or replace function public.tg_recipe_agrege()
returns trigger language plpgsql security definer set search_path = public as $$
declare r uuid := coalesce(new.recipe_id, old.recipe_id);
begin
  update public.recipe set
    active_time_min = (
      select coalesce(sum(case
               when load_type in ('actif', 'bloquant')
                 then greatest(coalesce(duration_min, 0), coalesce(gesture_min, 0))
               else coalesce(gesture_min, 0)
             end), 0)
      from public.recipe_step where recipe_id = r),
    appliances = (
      select coalesce(array_agg(distinct appliance_type), '{}')
      from public.recipe_step
      where recipe_id = r and appliance_type is not null),
    step_count = (select count(*) from public.recipe_step where recipe_id = r)
  where id = r;
  return null;
end $$;

-- ── 3 · « Avec ce que j'ai », sur tout le catalogue ─────────────────────────
/**
 * Les recettes que le foyer peut faire avec ce qu'il a.
 *
 * L'écran filtrait côté client, sur les quatre-vingts recettes les plus
 * rapides : le même biais que 0029 a retiré des macros. La liste est désormais
 * entière côté client, mais les ingrédients de 1 400 recettes n'y ont pas leur
 * place : c'est la base qui répond.
 *
 * Une ligne non rattachée à un aliment ne compte pas : on ne sait pas, on se
 * tait. Mais une recette dont AUCUNE ligne n'est rattachée n'est pas faisable
 * pour autant : on ne promet pas ce qu'on ne sait pas.
 *
 * Les identifiants sortent triés (`order by r.id`) : PostgREST plafonne une
 * réponse à 1 000 lignes, le client lit par tranches, et sans ordre stable deux
 * tranches pourraient se chevaucher ou se manquer.
 *
 * `security invoker` : la RLS de `recipe` et de `stock_item` s'applique telle
 * quelle, et rien ne se lit qu'on n'aurait pas pu lire soi-même.
 */
create or replace function public.recettes_faisables()
returns setof uuid language sql stable security invoker set search_path = public as $$
  with placard as (
    select distinct food_id from public.stock_item
    where household_id = public.current_household() and food_id is not null
  )
  select r.id from public.recipe r
  where r.plannable
    and exists (select 1 from public.recipe_ingredient i
                where i.recipe_id = r.id and i.food_id is not null)
    and not exists (select 1 from public.recipe_ingredient i
                    where i.recipe_id = r.id and i.food_id is not null
                      and i.food_id not in (select food_id from placard))
  order by r.id
$$;

revoke execute on function public.recettes_faisables() from public, anon;
grant execute on function public.recettes_faisables() to authenticated;
