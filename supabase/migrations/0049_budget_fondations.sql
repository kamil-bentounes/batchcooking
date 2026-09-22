-- ═══════════════════════════════════════════════════════════════════════════
-- LE BUDGET, LOT 1 : les comptes, les revenus, et la clé de partage
--
-- Trois tables, pas huit. Le 21 septembre, ce dépôt a pris quatorze migrations
-- en une journée — dont neuf correctifs — pour rendre deux tables sûres. On
-- pose donc le socle, on le teste, et on n'écrit la suite qu'ensuite.
--
-- Ce que ce lot décide, et qui contraint tout le reste :
--
-- D60 · La clé se FIGE sur la dépense, elle ne se recalcule jamais. Une
--       augmentation en juin ne doit pas réécrire les partages de mars.
-- D62 · Une régularisation se répartit « avec la clé en vigueur chaque mois ».
--       Cette phrase n'a de sens que si la règle est DATÉE : d'où `valid_from`
--       sur `revenu` et sur `regle_partage`, et la fonction `parts_du_foyer`
--       qui répond pour un mois donné, qu'une ligne existe ou non ce mois-là.
-- D71 · La date d'entrée dans le foyer se corrige. Sans historisation, la
--       reculer obligerait à réécrire le passé ; avec, c'est un fait daté de
--       plus, et le calcul suit tout seul.
--
-- Les montants sont en CENTIMES ENTIERS. Un pourcentage sur un numérique donne
-- 10,25 € en deux parts de 5,13 qui font 10,26 : la somme des parts ne fait
-- plus le total, par construction. Le pourcentage reste la PROVENANCE du
-- partage ; ce qui est stocké, et ce qui s'additionne, ce sont des centimes.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── La date d'entrée dans le foyer (D71) ───────────────────────────────────
-- Elle vaut par défaut le jour où le profil est né, ce qui est juste pour le
-- cas normal — on accepte l'invitation le jour où l'on emménage. Elle se
-- corrige ensuite : c'est elle, et rien d'autre, qui décide des mois qu'une
-- personne partage.
alter table public.user_profile
  add column if not exists entre_le date not null default current_date;

comment on column public.user_profile.entre_le is
  'Le jour à partir duquel la personne partage les charges du foyer. Corrigeable : '
  'une invitation acceptée trois semaines avant l''emménagement est le cas normal.';

-- ── Les comptes ────────────────────────────────────────────────────────────
-- Un par vrai compte bancaire. Sans eux, la sortie mensuelle serait un solde
-- abstrait ; avec eux, c'est une liste de virements à faire, ce qui est la
-- seule forme utilisable.
create table public.compte (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household(id) on delete cascade,
  nom           text not null check (length(btrim(nom)) between 1 and 60),
  /* `commun` : celui sur lequel on vire. `perso` : celui de quelqu'un, qui
     avance des charges. `epargne` : le livret. Le type ne donne aucun droit,
     il dit à quoi sert le compte. */
  genre         text not null check (genre in ('commun', 'perso', 'epargne')),
  /* Le titulaire, pour un compte perso ou un livret à un seul nom — ce que les
     livrets réglementés imposent, d'ailleurs. NULL pour un compte joint. */
  titulaire_id  uuid references public.user_profile(id) on delete set null,
  /* Le matelas à laisser sur le compte commun, en centimes. C'est au-dessus de
     lui que se pose la question de fin de mois : baisser le virement suivant,
     ou verser à l'épargne. */
  matelas_cents integer not null default 0 check (matelas_cents >= 0),
  archive_le    timestamptz,
  created_at    timestamptz not null default now(),
  /* Deux comptes du même nom dans un foyer ne se distinguent pas à l'écran. */
  unique (household_id, nom)
);

-- ── Les revenus ────────────────────────────────────────────────────────────
-- Historisés : le prorata d'octobre doit rester celui d'octobre quand on saisit
-- l'augmentation de janvier.
create table public.revenu (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.household(id) on delete cascade,
  user_profile_id   uuid not null references public.user_profile(id) on delete cascade,
  /* Net MENSUEL APRÈS IMPÔT, en centimes. Après impôt, parce que c'est ce qui
     arrive réellement sur le compte ; c'est donc la seule base honnête d'un
     partage au prorata. */
  net_mensuel_cents integer not null check (net_mensuel_cents >= 0),
  valid_from        date not null,
  created_at        timestamptz not null default now(),
  /* Une personne n'a qu'un revenu par date d'effet : deux valeurs le même jour
     ne se départageraient que par hasard. */
  unique (user_profile_id, valid_from)
);

-- ── La règle de partage du foyer ───────────────────────────────────────────
create table public.regle_partage (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  /* `prorata` : chacun selon son revenu. `moitie` : à parts égales.
     Il n'y a pas de troisième clé globale, et c'est délibéré : « certaines
     choses à 50/50 et d'autres au prorata » se dit au niveau de la CHARGE, qui
     porte sa propre clé ; et « 100 % pour quelqu'un » se dit en ne mettant
     qu'une personne dans les participants. Une clé « fixe » au niveau du foyer
     n'exprimerait rien de plus, et ferait une troisième façon de dire la même
     chose. */
  cle          text not null check (cle in ('prorata', 'moitie')),
  valid_from   date not null,
  created_at   timestamptz not null default now(),
  unique (household_id, valid_from)
);

-- ═══ La clé en vigueur un mois donné ═══════════════════════════════════════
--
-- Le cœur du lot. Elle rend, pour le premier jour d'un mois, la part de chaque
-- membre présent, en POINTS DE BASE (10 000 = 100 %), et la somme fait
-- exactement 10 000 — le reliquat allant au plus gros contributeur, ce qui est
-- la seule répartition du centime résiduel qui ne s'excuse pas.
--
-- Elle répond même quand aucune ligne ne porte ce mois-là : elle prend la
-- dernière règle et le dernier revenu DATÉS AVANT la fin du mois. C'est ce qui
-- permet à D62 de dire « la clé en vigueur chaque mois » sans supposer qu'une
-- écriture a eu lieu ce mois-là.
create or replace function public.parts_du_foyer(le_mois date)
returns table (user_profile_id uuid, part_bps integer)
language sql stable security definer set search_path = public as $$
  with bornes as (
    /* La FIN du mois, pas son début : une règle posée le 15 octobre vaut pour
       octobre. Prendre le premier jour la ferait commencer en novembre. */
    select (date_trunc('month', le_mois) + interval '1 month - 1 day')::date as fin,
           public.current_household() as foyer
  ),
  regle as (
    select coalesce((
      select r.cle from public.regle_partage r, bornes b
      where r.household_id = b.foyer and r.valid_from <= b.fin
      order by r.valid_from desc limit 1
    ), 'prorata') as cle
  ),
  membres as (
    select p.id as uid,
           case when (select cle from regle) = 'moitie' then 1::bigint
                else coalesce((
                  select v.net_mensuel_cents from public.revenu v, bornes b2
                  where v.user_profile_id = p.id and v.valid_from <= b2.fin
                  order by v.valid_from desc limit 1
                ), 0)::bigint
           end as poids
    from public.user_profile p, bornes b
    where p.household_id = b.foyer
      -- D71 : on ne partage pas les mois qu'on n'a pas habités.
      and p.entre_le <= b.fin
  ),
  /* Personne n'a saisi son revenu : on partage à parts égales plutôt que de
     diviser par zéro. Un foyer qui vient d'ouvrir l'app doit voir un partage,
     pas une erreur. */
  pesee as (
    select uid,
           case when coalesce((select sum(poids) from membres), 0) = 0 then 1::bigint
                else poids end as poids
    from membres
  ),
  somme as (select sum(poids) as total from pesee),
  brut as (
    select p.uid, p.poids, (p.poids * 10000 / s.total)::integer as bps
    from pesee p, somme s where s.total > 0
  ),
  /* La division entière perd jusqu'à un point de base par personne. Le
     reliquat va au plus gros contributeur — c'est la seule attribution du
     centime résiduel qui n'ait pas à s'excuser — et la somme fait alors
     EXACTEMENT 10 000. */
  reliquat as (select 10000 - coalesce(sum(bps), 0) as r from brut),
  ainee as (select uid from brut order by poids desc, uid limit 1)
  select b.uid,
         b.bps + case when b.uid = (select uid from ainee)
                      then (select r from reliquat) else 0 end
  from brut b
$$;

comment on function public.parts_du_foyer(date) is
  'La part de chaque membre présent le mois donné, en points de base. La somme '
  'fait exactement 10000 : le reliquat va au plus gros contributeur.';

revoke execute on function public.parts_du_foyer(date) from public, anon;
grant   execute on function public.parts_du_foyer(date) to authenticated, service_role;

-- ═══ Les droits ════════════════════════════════════════════════════════════
--
-- Classe C : la donnée appartient au foyer, et tout le foyer la voit. Les
-- revenus y compris — c'est une décision, pas un oubli : le foyer est l'unité
-- de confiance du produit, et un secret par personne compliquerait la RLS pour
-- un bénéfice nul entre deux personnes qui partagent un compte en banque. Ce
-- qui protège, c'est l'ENTRÉE dans le foyer, qui demande qu'un membre l'accepte.
--
-- Quatre verbes séparés, jamais `for all` : une policy unique cache laquelle
-- des quatre opérations elle autorise vraiment, et c'est ainsi qu'on ouvre une
-- écriture en croyant n'ouvrir qu'une lecture.
do $$
declare t text;
begin
  foreach t in array array['compte', 'revenu', 'regle_partage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (household_id = public.current_household())', t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (household_id = public.current_household())', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (household_id = public.current_household())
         with check (household_id = public.current_household())', t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (household_id = public.current_household())', t || '_delete', t);
  end loop;
end $$;

-- ── Ce qu'une ligne DÉSIGNE appartient au même foyer qu'elle ───────────────
-- Sans ça, on pointe le revenu d'un membre du foyer d'à côté : la policy ne
-- regarde que `household_id`, jamais ce que les autres colonnes visent.
create trigger z_user_profile_id_meme_foyer
  before insert or update on public.revenu
  for each row execute function public.tg_meme_foyer('user_profile_id', 'user_profile');

create trigger z_titulaire_id_meme_foyer
  before insert or update on public.compte
  for each row execute function public.tg_meme_foyer('titulaire_id', 'user_profile');

-- ── Ce qui ne change pas ───────────────────────────────────────────────────
--
-- Un fait daté ne DÉMÉNAGE pas. Corriger un revenu mal saisi, oui ; changer sa
-- date d'effet après coup, non — ce serait réécrire des partages déjà figés,
-- exactement ce que D60 interdit. Et ça s'écrit en trigger, jamais en policy :
-- une policy `for update` évalue `using` sur l'ancienne ligne et `with check`
-- sur la nouvelle, séparément, sans jamais les voir ensemble.
create or replace function public.tg_fait_date_immuable()
returns trigger language plpgsql as $$
begin
  if public.is_service_role() then return new; end if;
  if new.valid_from is distinct from old.valid_from then
    raise exception 'La date d''effet ne se change pas : supprime la ligne et repose-la.'
      using errcode = 'check_violation';
  end if;
  if new.household_id is distinct from old.household_id then
    raise exception 'Une ligne ne change pas de foyer.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger tg_revenu_date_immuable
  before update on public.revenu
  for each row execute function public.tg_fait_date_immuable();

create trigger tg_regle_partage_date_immuable
  before update on public.regle_partage
  for each row execute function public.tg_fait_date_immuable();

-- Un revenu appartient à la personne qu'il décrit : il ne se réattribue pas.
create or replace function public.tg_revenu_meme_personne()
returns trigger language plpgsql as $$
begin
  if public.is_service_role() then return new; end if;
  if new.user_profile_id is distinct from old.user_profile_id then
    raise exception 'Un revenu ne change pas de personne.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger tg_revenu_meme_personne
  before update on public.revenu
  for each row execute function public.tg_revenu_meme_personne();

-- ── L'export suit le schéma, dans la MÊME migration ────────────────────────
-- `tables_de_foyer()` énumère par introspection toute table portant
-- `household_id` ; `tests/rgpd.test.ts` devient donc rouge à l'instant où l'une
-- d'elles manque ici. Écrire l'export plus tard, c'est le découvrir en rouge.
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
                            from public.regle_partage g, hh where g.household_id = hh.id)
  )
$$;
revoke execute on function public.export_my_data() from public, anon;
grant   execute on function public.export_my_data() to authenticated;
