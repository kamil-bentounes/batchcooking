-- ═══════════════════════════════════════════════════════════════════════════
-- QUI A LE DROIT DE RÉÉCRIRE UNE RECETTE
--
-- La migration 0035 a fait de `visibility` une colonne de DROITS : elle décide
-- qui voit la recette. Or la policy d'écriture de la classe B, héritée de 0005,
-- est `using (true)` — n'importe qui pouvant LIRE une ligne peut la réécrire.
--
-- C'est-à-dire, précisément, les gens que la fonctionnalité était censée
-- borner. Prouvé : un ami à qui l'on partage une recette peut la passer en
-- « publique », pour tout le monde et définitivement — rompre l'amitié n'y
-- change plus rien. Il peut aussi en réécrire le titre et se déclarer auteur.
-- Et n'importe quel compte pouvait réécrire les 1 426 recettes du catalogue
-- mutualisé, que personne ne possède.
--
-- Deux règles, et elles suffisent :
--
--  · une recette qui APPARTIENT à un foyer ne se modifie que par lui ;
--  · le catalogue mutualisé reste corrigeable par tous — c'est tout l'objet de
--    la classe B (D16), et la correction est tracée. Mais la VISIBILITÉ et
--    l'AUTEUR n'y sont pas des corrections : personne ne les touche.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists recipe_update on public.recipe;
create policy recipe_update on public.recipe
  for update to authenticated
  using (owner_household_id is null
         or owner_household_id = public.current_household())
  with check (owner_household_id is null
              or owner_household_id = public.current_household());

/**
 * Ce qui ne se réécrit pas, même quand on a le droit d'écrire.
 *
 * `tg_recipe_proprietaire` gardait déjà le propriétaire et l'origine. Elle
 * garde désormais aussi ce qui décide de QUI VOIT et de QUI A ÉCRIT. Le reste
 * — titre, ingrédients, étapes — demeure corrigeable par tous sur le catalogue
 * mutualisé : c'est la classe B, et la correction laisse sa trace.
 */
create or replace function public.tg_recipe_proprietaire()
returns trigger language plpgsql as $$
begin
  if current_user = 'service_role' then return new; end if;

  if new.owner_household_id is distinct from old.owner_household_id then
    raise exception 'une recette ne change pas de propriétaire'
      using errcode = 'check_violation';
  end if;
  if new.origin is distinct from old.origin then
    raise exception 'une recette ne change pas d''origine'
      using errcode = 'check_violation';
  end if;

  -- La visibilité et l'auteur n'appartiennent qu'au foyer propriétaire. Sur le
  -- catalogue mutualisé, que personne ne possède, personne ne les touche.
  if old.owner_household_id is distinct from public.current_household() then
    if new.visibility is distinct from old.visibility then
      raise exception 'seul le foyer propriétaire décide de qui voit sa recette'
        using errcode = 'check_violation';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'on ne se déclare pas auteur d''une recette'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

-- ── L'export RGPD avait un trou de la forme exacte de `foyer_ami` ───────────
-- `tables_de_foyer()` cherche les tables portant une colonne NOMMÉE
-- `household_id` : `foyer_ami` porte `invite_par` et `accepte_par`, et passait
-- donc au travers du test censé empêcher l'export de prendre du retard.
create or replace function public.export_my_data()
returns jsonb language sql stable security definer set search_path = public as $$
  with hh as (select public.current_household() as id)
  select public.export_my_data_base() || jsonb_build_object(
    'weighing',            (select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
                            from public.weighing w, hh where w.household_id = hh.id),
    'household_unit_weight', (select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
                            from public.household_unit_weight u, hh where u.household_id = hh.id),
    'household_ingredient_resolution', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                            from public.household_ingredient_resolution r, hh
                            where r.household_id = hh.id),
    'foyer_ami',           (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                            from public.foyer_ami a, hh
                            where a.invite_par = hh.id or a.accepte_par = hh.id),
    'recipes',             (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                            from public.recipe r, hh where r.owner_household_id = hh.id)
  )
$$;
revoke execute on function public.export_my_data() from public, anon;
grant   execute on function public.export_my_data() to authenticated;

/**
 * L'introspection voit désormais les tables qui désignent le foyer AUTREMENT.
 *
 * Le test de couverture n'a de valeur que s'il voit tout ce qu'il doit voir :
 * une table dont la colonne s'appelle `invite_par` lui échappait.
 */
create or replace function public.tables_de_foyer()
returns table (table_name text)
language sql stable security definer set search_path = public, information_schema as $$
  select c.table_name::text
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    and c.column_name in ('household_id', 'invite_par', 'owner_household_id')
  union
  select 'household'
  order by 1
$$;
revoke execute on function public.tables_de_foyer() from public, anon, authenticated;
grant   execute on function public.tables_de_foyer() to service_role;

-- ── Le jeton et l'expiration ne se dictent pas depuis le client ─────────────
-- Le `with check` ne contraignait que les deux foyers : on pouvait poser son
-- propre jeton — donc devinable — et une expiration en 2099. « Valable sept
-- jours » et « non devinable » n'étaient que la politesse du client.
create or replace function public.tg_foyer_ami_pose()
returns trigger language plpgsql as $$
begin
  if current_user = 'service_role' then return new; end if;
  new.jeton := gen_random_uuid();
  new.expire_le := now() + interval '7 days';
  new.accepte_par := null;
  new.accepte_le := null;
  -- On ne crée pas une invitation au nom de quelqu'un d'autre.
  new.cree_par := auth.uid();
  return new;
end $$;

create trigger foyer_ami_pose before insert on public.foyer_ami
  for each row execute function public.tg_foyer_ami_pose();
