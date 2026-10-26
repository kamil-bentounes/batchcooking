-- ═══════════════════════════════════════════════════════════════════════════
-- 0124 · NOS ALIMENTS : ce que le foyer mange, avec ses vraies valeurs
--
-- « Là je vois Yaourt mais les calories et le protéine ne vont pas du tout. » Le repère « Yaourt » vaut 60 kcal
-- et 4 g de protéines ; le yaourt dessert protéiné du foyer en vaut 95 et 12,5. Un repère est un ordre de grandeur
-- (`src/lib/reperes.ts`) : il ne se corrige pas, il se REMPLACE par un aliment à soi.
--
-- Une ligne = un aliment du foyer, tel que l'étiquette le donne : les valeurs POUR 100 G (c'est la forme légale, la
-- seule qu'on lit sur un emballage), plus l'unité qu'on mange (« pot », « part ») et ce qu'elle pèse. Une unité =
-- valeurs × poids / 100 : c'est ce que « La semaine » et « en plus » écrivent en UN geste (`meal_extra`).
--
-- Ce que `meal_extra` reçoit est une COPIE des valeurs de l'unité, pas une référence : corriger un aliment demain ne
-- réécrit pas le bilan d'hier. Rien ne change donc dans `meal_extra` ni dans `choisir_un_repas` (0123).
--
-- `source` dit d'où viennent les chiffres : `main` (tapés), `etiquette` (lus sur une photo de l'emballage par la
-- fonction `etiquette`, que la personne vérifie), `code_barres` (Open Food Facts). Elle ne garantit rien : elle dit
-- comment l'aliment est né.
--
-- Des bornes physiques, pour qu'une étiquette lue en kJ ou une virgule perdue n'entre pas dans le bilan sans bruit :
-- jamais plus de 900 kcal ni 100 g de quoi que ce soit pour 100 g (l'huile pure fait 900), pas plus de 105 g de
-- protéines + glucides + lipides réunis (l'arrondi des étiquettes laisse un peu de jeu), une unité qui pèse entre
-- 1 g et 5 kg.
--
-- Les noms et les codes-barres se COMPARENT normalisés : « Yaourt », « yaourt  » et « YAOURT » sont le même nom ;
-- « 3033490004743 » et « 03033490004743 » (le même GTIN écrit sur 13 et sur 14 chiffres) sont le même code. Un nom fait
-- de blancs seulement n'est pas un nom. `remplace_repere` : le repère de `src/lib/reperes.ts` que cet aliment prend
-- à sa place (« Yaourt »), choisi par la personne — plus aucune règle de préfixe (« Yaourt dessert protéiné » ne cache
-- « Yaourt » que si on le lui dit).
--
-- RLS du foyer, quatre verbes écrits séparément (jamais `for all` : voir 0018). `household_id` figure dans l'export
-- RGPD, ci-dessous.
-- ═══════════════════════════════════════════════════════════════════════════

/* Un nom comparable : sans accents, en minuscules, apostrophes unifiées, blancs (dont l'insécable) réduits à un espace,
   ni espace au début ni à la fin. `immutable` : `unaccent()` ne l'est pas, et un index d'unicité l'exige. La même
   règle que `nomComparable` (`src/lib/aliments/ordre.ts`) pour les accents et la casse. */
create or replace function public.nom_comparable(t text)
 returns text
 language sql
 immutable parallel safe
 set search_path to 'pg_catalog'
as $$
  select btrim(regexp_replace(
    lower(translate(t,
      'àÀáÁâÂãÃäÄåÅçÇèÈéÉêÊëËìÌíÍîÎïÏñÑòÒóÓôÔõÕöÖøØùÙúÚûÛüÜýÝÿŸ’‘`' || chr(160),
      'aaaaaaaaaaaacceeeeeeeeiiiiiiiinnoooooooooooouuuuuuuuyyyy''''''' || ' ')),
    '\s+', ' ', 'g'))
$$;

create table if not exists public.aliment (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household(id) on delete cascade,
  label         text not null check (char_length(btrim(label)) between 1 and 80 and public.nom_comparable(label) <> ''),
  kcal_100g     numeric not null check (kcal_100g    >= 0 and kcal_100g    <= 900),
  protein_100g  numeric not null default 0 check (protein_100g >= 0 and protein_100g <= 100),
  carb_100g     numeric not null default 0 check (carb_100g    >= 0 and carb_100g    <= 100),
  fat_100g      numeric not null default 0 check (fat_100g     >= 0 and fat_100g     <= 100),
  fiber_100g    numeric not null default 0 check (fiber_100g   >= 0 and fiber_100g   <= 100),
  unite         text not null default 'pot' check (char_length(btrim(unite)) between 1 and 20),
  unite_g       numeric not null check (unite_g >= 1 and unite_g <= 5000),
  code_barres   text check (code_barres ~ '^[0-9]+$' and char_length(code_barres) in (8, 12, 13, 14)),
  remplace_repere text check (remplace_repere is null or char_length(btrim(remplace_repere)) between 1 and 80),
  source        text not null default 'main' check (source in ('main', 'etiquette', 'code_barres')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint aliment_macros_plausibles check (protein_100g + carb_100g + fat_100g <= 105)
);

-- Un nom, une fois par foyer (sans tenir compte de la casse, des accents ni des espaces) : deux « Yaourt » ne se
-- départageraient pas dans la feuille de choix. Un code-barres, une fois par foyer, comparé sur 14 chiffres (GTIN-14).
create unique index if not exists aliment_label_unique
  on public.aliment (household_id, public.nom_comparable(label));
create unique index if not exists aliment_code_barres_unique
  on public.aliment (household_id, lpad(code_barres, 14, '0')) where code_barres is not null;

drop trigger if exists aliment_touch on public.aliment;
create trigger aliment_touch before update on public.aliment
  for each row execute function public.tg_touch_updated_at();

alter table public.aliment enable row level security;

drop policy if exists aliment_select on public.aliment;
create policy aliment_select on public.aliment for select to authenticated
  using (household_id = public.current_household());
drop policy if exists aliment_insert on public.aliment;
create policy aliment_insert on public.aliment for insert to authenticated
  with check (household_id = public.current_household());
drop policy if exists aliment_update on public.aliment;
create policy aliment_update on public.aliment for update to authenticated
  using (household_id = public.current_household())
  with check (household_id = public.current_household());
drop policy if exists aliment_delete on public.aliment;
create policy aliment_delete on public.aliment for delete to authenticated
  using (household_id = public.current_household());

-- L'export RGPD : une table de plus, une ligne de plus. La définition est celle de 0118, plus une clé.
create or replace function public.export_my_data()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
                            from public.recipe r, hh where r.owner_household_id = hh.id),
    'session_convives',    (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                            from public.session_convive s, hh
                            where s.hote_id = hh.id or s.invite_id = hh.id),
    -- Budget, lot 1
    'comptes',             (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
                            from public.compte c, hh where c.household_id = hh.id),
    'revenus',             (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
                            from public.revenu v, hh where v.household_id = hh.id),
    'regles_partage',      (select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
                            from public.regle_partage g, hh where g.household_id = hh.id),
    -- Budget, lot 2
    'charges',             (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
                            from public.charge c, hh where c.household_id = hh.id),
    'charge_participants', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                            from public.charge_participant p, hh where p.household_id = hh.id),
    'depenses',            (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
                            from public.depense d, hh where d.household_id = hh.id),
    'depense_parts',       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                            from public.depense_part x, hh where x.household_id = hh.id),
    -- Budget, lot 3
    'enveloppes',          (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
                            from public.enveloppe e, hh where e.household_id = hh.id),
    'poches_epargne',      (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                            from public.poche_epargne p, hh where p.household_id = hh.id),
    'poche_postes',        (select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
                            from public.poche_poste q, hh where q.household_id = hh.id),
    'versements_epargne',  (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
                            from public.versement_epargne v, hh where v.household_id = hh.id),
    /* Une table de plus, une ligne de plus ici. Le test RGPD compare la liste
       des tables portant `household_id` à ce que l'export rend : c'est lui qui
       a rappelé `releve_annuel`, pas moi. */
    'releves_annuels',     (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                            from public.releve_annuel r, hh where r.household_id = hh.id),
    -- Budget refait (0097)
    'saisies',             (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                            from public.saisie s, hh where s.household_id = hh.id),
    'factures',            (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
                            from public.facture f, hh where f.household_id = hh.id),
    'clotures',            (select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
                            from public.cloture k, hh where k.household_id = hh.id),
    'cloture_choix',       (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
                            from public.cloture_choix c, hh where c.household_id = hh.id),
    -- L'aide intégrée (0118) : ce qu'on a signalé faux
    'aide_signalements',   (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                            from public.aide_signalement a, hh where a.household_id = hh.id),
    -- Nos aliments (0124) : ce que le foyer mange, avec ses vraies valeurs
    'aliments',            (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                            from public.aliment a, hh where a.household_id = hh.id)
  )
$function$;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
