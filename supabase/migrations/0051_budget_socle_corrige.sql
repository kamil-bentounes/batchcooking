-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUE 0049 A LAISSÉ OUVERT
--
-- Une relecture à l'œil frais, vérifiée en SQL, a trouvé six choses. Trois
-- touchent la DONNÉE et passent donc en premier.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · `entre_le` n'a pas été rétro-rempli ────────────────────────────────
--
-- `add column ... default current_date` ne pose pas la date de naissance de
-- chaque profil : il pose la date d'exécution de la MIGRATION, la même pour
-- tous (`pg_attribute.attmissingval` le montre en clair). En production, les
-- deux profils existants sont donc entrés dans le foyer le jour du
-- déploiement — et `parts_du_foyer` rend zéro ligne sur tous les mois d'avant.
-- Le commentaire de 0049 promettait le contraire.
update public.user_profile
   set entre_le = created_at::date
 where entre_le = '2026-09-22'::date and created_at::date < '2026-09-22'::date;

-- Et une borne : le fond du problème est qu'`entre_le` décide de ce qu'on paie.
-- La reculer ou l'avancer de trente ans fait disparaître quelqu'un de tous les
-- mois — sans trace, sans erreur. Une date future reste légitime (« j'emménage
-- le 1er novembre »), pas une date de fantaisie.
alter table public.user_profile
  add constraint user_profile_entre_le_borne
  check (entre_le between '2000-01-01'::date and (current_date + interval '2 years')::date)
  not valid;
alter table public.user_profile validate constraint user_profile_entre_le_borne;

comment on column public.user_profile.entre_le is
  'Le jour à partir duquel la personne partage les charges du foyer. C''est une '
  'colonne de DROITS : elle décide des mois qu''on paie. Le gel définitif '
  'viendra avec `depense`, quand un mois pourra être déjà réparti.';

-- ── 2 · Un revenu s'écrit par son titulaire, pas par le foyer ──────────────
--
-- 0049 a cadré les quatre verbes sur le foyer. Or `nutrition_target`, de forme
-- identique, est en portée PERSONNE depuis 0005 — et le commentaire y dit
-- exactement pourquoi : « une policy cadrée sur le foyer laisserait un membre
-- SUPPRIMER et MODIFIER les cibles de son conjoint ». Vérifié ici : A insérait,
-- modifiait et supprimait le revenu de B, et la clé basculait à 10000/0.
--
-- D63 dit que le salaire est VISIBLE dans le foyer. Il ne dit pas qu'il est
-- écrivable par l'autre. La lecture reste donc au foyer, l'écriture passe à la
-- personne.
drop policy revenu_insert on public.revenu;
drop policy revenu_update on public.revenu;
drop policy revenu_delete on public.revenu;

create policy revenu_insert on public.revenu for insert to authenticated
  with check (household_id = public.current_household()
              and user_profile_id = auth.uid());
create policy revenu_update on public.revenu for update to authenticated
  using (user_profile_id = auth.uid())
  with check (household_id = public.current_household()
              and user_profile_id = auth.uid());
create policy revenu_delete on public.revenu for delete to authenticated
  using (user_profile_id = auth.uid());

-- ── 3 · La clé, utilisable par le serveur, et qui ne compte que son foyer ──
--
-- Deux défauts d'un coup.
--
-- Le premier : `parts_du_foyer` n'a pas de paramètre de foyer et lit
-- `current_household()`, qui repose sur `auth.uid()`. Appelée par le rôle de
-- service — c'est-à-dire par le générateur mensuel de D61 et par la
-- régularisation de D62, qui tournent forcément côté serveur — elle rend zéro
-- ligne. Il faut donc changer sa signature MAINTENANT, avant que quoi que ce
-- soit s'appuie dessus.
--
-- ⚠️ Et comme c'est une fonction `security definer` qui accepte désormais un
--    pointeur de l'appelant, elle doit revérifier les droits à l'autre bout :
--    un authentifié qui passerait le foyer du voisin doit obtenir SON foyer,
--    pas celui qu'il demande. Le dépôt s'est déjà fait avoir sur ce motif.
--
-- Le second : le sous-select du revenu ne filtrait que `user_profile_id`. Une
-- ligne de revenu restée rattachée à un ancien foyer était donc comptée dans
-- la clé tout en étant invisible à la lecture — l'écran affichait un partage
-- que la donnée lisible n'expliquait pas.
--
-- Et le repli : quand la règle est `prorata`, une personne qui n'a RIEN saisi
-- n'est pas une personne qui gagne zéro. Confondre les deux donnait 10000/0 au
-- premier qui remplit son salaire. Tant qu'un présent n'a pas répondu, on
-- partage à parts égales — et c'est à l'écran de réclamer le revenu manquant.
drop function if exists public.parts_du_foyer(date);

create or replace function public.parts_du_foyer(le_mois date, le_foyer uuid default null)
returns table (user_profile_id uuid, part_bps integer)
language sql stable security definer set search_path = public as $$
  with bornes as (
    select (date_trunc('month', le_mois) + interval '1 month - 1 day')::date as fin,
           /* Le foyer demandé n'est honoré que pour le rôle de service. Pour
              tout le monde d'autre, c'est le sien, quoi qu'il demande. */
           case when public.is_service_role() and le_foyer is not null
                then le_foyer else public.current_household() end as foyer
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
           (select v.net_mensuel_cents
              from public.revenu v, bornes b2
             where v.user_profile_id = p.id
               and v.household_id = b2.foyer      -- le revenu appartient à CE foyer
               and v.valid_from <= b2.fin
             order by v.valid_from desc limit 1) as revenu_cents
    from public.user_profile p, bornes b
    where p.household_id = b.foyer
      and p.entre_le <= b.fin                     -- D71
  ),
  /* À parts égales si la règle le dit, ou tant qu'un présent n'a pas répondu :
     ne pas avoir saisi son revenu n'est pas gagner zéro. */
  pesee as (
    select uid,
           case when (select cle from regle) = 'moitie'
                     or exists (select 1 from membres where revenu_cents is null)
                     or coalesce((select sum(revenu_cents) from membres), 0) = 0
                then 1::bigint
                else revenu_cents::bigint
           end as poids
    from membres
  ),
  somme as (select sum(poids) as total from pesee),
  brut as (
    select p.uid, p.poids, (p.poids * 10000 / s.total)::integer as bps
    from pesee p, somme s where s.total > 0
  ),
  reliquat as (select 10000 - coalesce(sum(bps), 0) as r from brut),
  ainee as (select uid from brut order by poids desc, uid limit 1)
  select b.uid,
         b.bps + case when b.uid = (select uid from ainee)
                      then (select r from reliquat) else 0 end
  from brut b
$$;

comment on function public.parts_du_foyer(date, uuid) is
  'La part de chaque membre présent le mois donné, en points de base ; la somme '
  'fait exactement 10000. `le_foyer` n''est honoré que pour le rôle de service. '
  'Rend 0 ligne si le foyer n''a aucun membre présent ce mois-là — l''appelant '
  'doit traiter ce cas, ce n''est pas une erreur.';

revoke execute on function public.parts_du_foyer(date, uuid) from public, anon;
grant   execute on function public.parts_du_foyer(date, uuid) to authenticated, service_role;

-- ── 4 · Ce qu'un compte doit être cohérent ─────────────────────────────────
--
-- Un compte `perso` sans titulaire n'appartient à personne ; un compte `commun`
-- avec titulaire prétend le contraire de ce qu'il est. Les deux passaient.
alter table public.compte
  add constraint compte_titulaire_coherent
  check ((genre = 'perso' and titulaire_id is not null)
      or (genre <> 'perso' and titulaire_id is null));

-- Un compte archivé confisquait son nom pour toujours : l'unicité ne regardait
-- pas `archive_le`. On ne peut pas rouvrir un « Livret A » fermé l'an dernier.
alter table public.compte drop constraint compte_household_id_nom_key;
create unique index compte_nom_vivant
  on public.compte (household_id, nom) where archive_le is null;

-- ── 5 · Les bornes de date, comme 0029 les pose ailleurs ───────────────────
alter table public.revenu
  add constraint revenu_valid_from_borne
  check (valid_from between '2000-01-01'::date and (current_date + interval '5 years')::date);
alter table public.regle_partage
  add constraint regle_partage_valid_from_borne
  check (valid_from between '2000-01-01'::date and (current_date + interval '5 years')::date);

-- ── 6 · Les index des prédicats ────────────────────────────────────────────
--
-- `household_id` est le prédicat des quatre policies de `revenu` ET de
-- l'export : c'était la seule table réelle du schéma sans index dessus.
-- `titulaire_id` porte un `on delete set null`, donc un scan complet à chaque
-- suppression de profil.
create index revenu_household_idx on public.revenu (household_id);
create index compte_household_idx on public.compte (household_id);
create index compte_titulaire_idx on public.compte (titulaire_id);
create index regle_partage_household_idx on public.regle_partage (household_id);

-- ── 7 · Ce qui protège vraiment le passé ───────────────────────────────────
--
-- `revenu.user_profile_id` est en `on delete cascade` : le profil part, tout
-- l'historique des revenus part avec lui, et les clés des mois passés
-- changeraient — la contradiction de D60 et D62.
--
-- On garde pourtant la cascade, et c'est raisonné : `delete_my_account()` doit
-- pouvoir aboutir, et une FK sans clause rendrait la suppression de compte
-- impossible — le `23503` que 0032 a déjà payé une fois. Ce qui protège le
-- passé n'est PAS l'historique des revenus : c'est D60, la part figée EN
-- CENTIMES sur chaque dépense au moment où elle naît. `parts_du_foyer` ne sert
-- qu'à remplir cette part ; une fois posée, elle ne dépend plus de rien.
--
-- Corollaire à tenir quand `depense` arrivera : elle porte `part_a_cents`, pas
-- une référence vers `revenu`.
comment on column public.revenu.user_profile_id is
  'En cascade : la suppression de compte doit aboutir. Le passé n''est pas '
  'protégé par cette table mais par la part figée en centimes sur la dépense (D60).';
