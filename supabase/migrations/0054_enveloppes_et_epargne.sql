-- ═══════════════════════════════════════════════════════════════════════════
-- LES ENVELOPPES, L'ÉPARGNE, ET LES PROJETS
--
-- Trois choses qu'on confond facilement, et qu'il faut séparer :
--
--  · une ENVELOPPE est un plafond de DÉPENSE. Aucun argent ne bouge. Elle se
--    remet à zéro chaque mois, sinon on « épargne » pour un mois à 800 € et
--    elle ne contraint plus rien (D65).
--  · une POCHE D'ÉPARGNE est de l'argent qui PERSISTE. Et comme elle persiste,
--    il faut savoir à qui elle appartient : on suit le cumul VERSÉ PAR
--    PERSONNE, pas seulement le solde (D64). Un livret joint est présumé
--    moitié-moitié ; sans registre, c'est la présomption qui gagne.
--  · un PROJET est une poche qui porte une échéance et des postes (D72). Son
--    étalement n'est pas une mécanique de plus : c'est D61, l'engendrement
--    mensuel, avec une fin.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── L'enveloppe : un plafond, pas de l'argent ──────────────────────────────
create table public.enveloppe (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household(id) on delete cascade,
  libelle       text not null check (length(btrim(libelle)) between 1 and 60),
  plafond_cents integer not null check (plafond_cents >= 0),
  /* Le reliquat relève-t-il le plafond du mois suivant ? Non pour le
     restaurant et la culture — sinon la contrainte se dissout. L'argent, lui,
     n'est jamais perdu : il reste sur le compte commun, et la fin de mois
     demande quoi en faire. */
  report        boolean not null default false,
  archive_le    timestamptz,
  created_at    timestamptz not null default now(),
  unique (household_id, libelle)
);

comment on table public.enveloppe is
  'Un plafond mensuel de dépense. Aucun argent ne bouge : ce qui bouge, ce sont '
  'les virements, et ils sont ailleurs. Le plafond se remet à zéro chaque mois.';

-- Une dépense tombe dans une enveloppe, et une charge peut la désigner d'avance.
alter table public.depense add column enveloppe_id uuid references public.enveloppe(id) on delete set null;
alter table public.charge  add column enveloppe_id uuid references public.enveloppe(id) on delete set null;

-- ── La poche d'épargne, et le projet, qui est une poche datée ─────────────
create table public.poche_epargne (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household(id) on delete cascade,
  libelle       text not null check (length(btrim(libelle)) between 1 and 60),
  /* `urgence` : intouchable sauf accord, et c'est tout l'intérêt de la
     séparer — l'urgence et les voyages dans le même pot, ce sont les voyages
     qui gagnent, toujours. `projet` : une échéance et des postes. */
  genre         text not null check (genre in ('urgence', 'projet')),
  objectif_cents integer check (objectif_cents >= 0),
  echeance      date,
  /* Sa propre clé de contribution, indépendante de celle du foyer : un voyage
     peut être à moitié-moitié même si tout le reste est au prorata (D72). */
  cle           text check (cle in ('prorata', 'moitie')),
  /* Le compte qui la porte. Souvent un livret : les livrets réglementés étant
     strictement individuels, il est fréquent qu'il soit à un seul nom — raison
     de plus pour tenir le registre. */
  compte_id     uuid references public.compte(id) on delete set null,
  atteinte_le   timestamptz,
  created_at    timestamptz not null default now(),
  unique (household_id, libelle),
  constraint poche_echeance_borne
    check (echeance is null or echeance between '2000-01-01'::date
                                            and (current_date + interval '30 years')::date)
);

-- Les postes d'un projet : hôtel, transport, sur place.
create table public.poche_poste (
  id            uuid primary key default gen_random_uuid(),
  poche_id      uuid not null references public.poche_epargne(id) on delete cascade,
  household_id  uuid not null references public.household(id) on delete cascade,
  libelle       text not null check (length(btrim(libelle)) between 1 and 60),
  montant_cents integer not null check (montant_cents >= 0),
  ordre         integer not null default 0
);

-- ── Le registre : qui a versé quoi ────────────────────────────────────────
--
-- Le cœur de D64. Le solde affiché n'est jamais « 4 000 € » mais « 4 000 €,
-- dont 2 480 toi et 1 520 elle ».
create table public.versement_epargne (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household(id) on delete cascade,
  poche_id      uuid not null references public.poche_epargne(id) on delete cascade,
  /* Comme `depense_part`, SANS clé étrangère : un versement est un fait
     comptable. Il reste vrai quand la personne s'en va, et le pot doit
     toujours pouvoir se rendre dans les proportions versées. */
  user_profile_id uuid not null,
  /* Signé : un versement est positif, un retrait négatif. Une seule colonne
     évite d'avoir à se rappeler dans quel sens lire un booléen. */
  montant_cents integer not null check (montant_cents <> 0),
  motif         text not null default 'mensuel'
                check (motif in ('mensuel', 'balayage', 'retrait', 'correction')),
  fait_le       date not null default current_date,
  created_at    timestamptz not null default now(),
  constraint versement_fait_le_borne
    check (fait_le between '2000-01-01'::date and (current_date + interval '1 year')::date)
);

comment on table public.versement_epargne is
  'Le registre des versements, par personne. Sans lui, un compte joint est '
  'présumé moitié-moitié alors que les versements ne l''étaient pas (D64).';

-- ── Le solde d'une poche, et à qui il appartient ──────────────────────────
create or replace function public.solde_epargne(la_poche uuid)
returns table (user_profile_id uuid, cumul_cents bigint)
language sql stable security definer set search_path = public as $$
  select v.user_profile_id, sum(v.montant_cents)::bigint
  from public.versement_epargne v
  join public.poche_epargne p on p.id = v.poche_id
  where v.poche_id = la_poche
    /* Le foyer de la POCHE, pas celui du versement : une fonction
       `security definer` qui déréférence un pointeur de l'appelant revérifie
       les droits à l'autre bout. */
    and p.household_id = public.current_household()
  group by v.user_profile_id
$$;
revoke execute on function public.solde_epargne(uuid) from public, anon;
grant   execute on function public.solde_epargne(uuid) to authenticated, service_role;

-- ── Ce qu'il reste sur une enveloppe, ce mois-ci ──────────────────────────
--
-- C'est ce chiffre qui doit s'afficher PENDANT la construction de la liste de
-- courses, pas en fin de mois (D66) : un plafond qu'on découvre trop tard est
-- une décoration.
create or replace function public.reste_enveloppe(le_mois date)
returns table (enveloppe_id uuid, libelle text, plafond_cents integer,
               depense_cents bigint, reste_cents bigint)
language sql stable security definer set search_path = public as $$
  /* ⚠️ Pas de virgule avant un LEFT JOIN : la jointure externe se lie au
     dernier élément de la liste, pas à `enveloppe`, et Postgres refuse d'y
     voir `e`. Les bornes passent donc par des jointures explicites. */
  select e.id, e.libelle, e.plafond_cents,
         coalesce(sum(d.montant_cents), 0)::bigint,
         (e.plafond_cents - coalesce(sum(d.montant_cents), 0))::bigint
  from public.enveloppe e
  left join public.depense d
    on d.enveloppe_id = e.id
   and d.mois = date_trunc('month', le_mois)::date
  where e.household_id = public.current_household()
    and e.archive_le is null
  group by e.id, e.libelle, e.plafond_cents
  order by e.libelle
$$;
revoke execute on function public.reste_enveloppe(date) from public, anon;
grant   execute on function public.reste_enveloppe(date) to authenticated, service_role;

-- ═══ Les droits ════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['enveloppe', 'poche_epargne', 'poche_poste', 'versement_epargne'] loop
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

-- ── Ce qu'une ligne désigne appartient au même foyer qu'elle ──────────────
create trigger z_compte_id_meme_foyer before insert or update on public.poche_epargne
  for each row execute function public.tg_meme_foyer('compte_id', 'compte');
create trigger z_poche_id_meme_foyer before insert or update on public.poche_poste
  for each row execute function public.tg_meme_foyer('poche_id', 'poche_epargne');
create trigger z_poche_id_meme_foyer before insert or update on public.versement_epargne
  for each row execute function public.tg_meme_foyer('poche_id', 'poche_epargne');
create trigger z_enveloppe_id_meme_foyer before insert or update on public.depense
  for each row execute function public.tg_meme_foyer('enveloppe_id', 'enveloppe');
create trigger z_enveloppe_id_meme_foyer before insert or update on public.charge
  for each row execute function public.tg_meme_foyer('enveloppe_id', 'enveloppe');

-- ── Ce qui ne change pas ──────────────────────────────────────────────────
--
-- Un versement ne change ni de personne ni de poche : ce serait déplacer de la
-- propriété. On le corrige par un versement de correction, qui laisse une
-- trace — c'est la différence entre une comptabilité et un tableur.
create or replace function public.tg_versement_ancre()
returns trigger language plpgsql as $$
begin
  if public.is_service_role() then return new; end if;
  if new.user_profile_id is distinct from old.user_profile_id then
    raise exception 'Un versement ne change pas de personne : passe par une correction.'
      using errcode = 'check_violation';
  end if;
  if new.poche_id is distinct from old.poche_id then
    raise exception 'Un versement ne change pas de poche.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger tg_versement_ancre before update on public.versement_epargne
  for each row execute function public.tg_versement_ancre();

-- ── Les index des prédicats ───────────────────────────────────────────────
create index enveloppe_household_idx     on public.enveloppe (household_id);
create index poche_household_idx         on public.poche_epargne (household_id);
create index poche_compte_idx            on public.poche_epargne (compte_id);
create index poche_poste_household_idx   on public.poche_poste (household_id);
create index poche_poste_poche_idx       on public.poche_poste (poche_id);
create index versement_household_idx     on public.versement_epargne (household_id);
create index versement_poche_idx         on public.versement_epargne (poche_id, user_profile_id);
create index depense_enveloppe_idx       on public.depense (enveloppe_id, mois);
create index charge_enveloppe_idx        on public.charge (enveloppe_id);

-- ── L'export suit le schéma, dans la MÊME migration ────────────────────────
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
                            from public.versement_epargne v, hh where v.household_id = hh.id)
  )
$$;
revoke execute on function public.export_my_data() from public, anon;
grant   execute on function public.export_my_data() to authenticated;

-- ── Le générateur recopie l'enveloppe de la charge ────────────────────────
--
-- Sans ça, `reste_enveloppe` ne voit jamais rien tomber dedans : la charge
-- désignait bien son enveloppe, la dépense engendrée ne la portait pas, et le
-- plafond restait éternellement intact — exactement le contraire de ce que D66
-- demande.
create or replace function public.ouvre_le_mois(le_mois date, le_foyer uuid default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  foyer uuid := case when public.is_service_role() and le_foyer is not null
                     then le_foyer else public.current_household() end;
  debut_mois date := date_trunc('month', le_mois)::date;
  fin_mois   date := (date_trunc('month', le_mois) + interval '1 month - 1 day')::date;
  nees  integer := 0;
begin
  if foyer is null then return 0; end if;
  if debut_mois < '2000-01-01'::date
     or debut_mois > (current_date + interval '5 years')::date then
    raise exception 'Mois hors des bornes raisonnables : %', debut_mois
      using errcode = 'check_violation';
  end if;

  create temp table depenses_nees (id uuid, charge_id uuid, montant_cents integer)
    on commit drop;

  with actives as (
    select c.id, c.libelle, c.cle, c.compte_id, c.variable, c.periodicite, c.enveloppe_id,
           public.provision_mensuelle(c.montant_cents, c.periodicite) as du_mois
    from public.charge c
    where c.household_id = foyer
      and c.archive_le is null
      and c.debut <= fin_mois
      and (c.fin is null or c.fin >= debut_mois)
      and exists (select 1 from public.charge_participant cp where cp.charge_id = c.id)
  )
  insert into public.depense
    (household_id, charge_id, mois, libelle, montant_cents, nature, source, compte_id, enveloppe_id)
  select foyer, a.id, debut_mois, a.libelle, a.du_mois,
         /* Une charge variable ou non mensuelle n'est qu'une estimation tant
            que le relevé n'est pas arrivé (D62). Une charge mensuelle fixe est
            connue dès le premier jour. */
         case when a.variable or a.periodicite <> 'mensuel' then 'estimee' else 'connue' end,
         'modele', a.compte_id, a.enveloppe_id
  from actives a
  on conflict do nothing;

  get diagnostics nees = row_count;

  insert into depenses_nees (id, charge_id, montant_cents)
  select d.id, d.charge_id, d.montant_cents
  from public.depense d
  where d.household_id = foyer and d.mois = debut_mois and d.source = 'modele'
    and not exists (select 1 from public.depense_part p where p.depense_id = d.id);

  with pesee as (
    select n.id as depense_id, n.montant_cents, cp.user_profile_id as uid,
           /* Les participants d'une charge ne sont pas tout le foyer : leurs
              parts ne font pas 10000 à elles seules, on renormalise sur leur
              propre total. Et s'ils pèsent zéro à eux tous, on partage entre
              eux à parts égales plutôt que de ne rien leur attribuer. */
           case when sum(p.part_bps) over (partition by n.id) = 0
                then 1 else p.part_bps end as poids
    from depenses_nees n
    join public.charge c on c.id = n.charge_id
    join public.charge_participant cp on cp.charge_id = c.id
    join lateral public.parts_du_foyer(debut_mois, foyer, c.cle) p
      on p.user_profile_id = cp.user_profile_id
  ),
  total as (
    select depense_id, montant_cents, uid, poids,
           sum(poids) over (partition by depense_id) as poids_total
    from pesee
  ),
  brut as (
    select depense_id, uid, montant_cents, poids, poids_total,
           (montant_cents::bigint * poids / poids_total)::integer as cents,
           (poids::bigint * 10000 / poids_total)::integer as bps,
           row_number() over (partition by depense_id order by poids desc, uid) as rang
    from total where poids_total > 0
  ),
  reste as (
    select depense_id, montant_cents - sum(cents) as r
    from brut group by depense_id, montant_cents
  )
  insert into public.depense_part
    (depense_id, user_profile_id, household_id, part_cents, part_bps)
  select b.depense_id, b.uid, foyer,
         b.cents + case when b.rang = 1 then coalesce(r.r, 0) else 0 end,
         b.bps
  from brut b left join reste r on r.depense_id = b.depense_id
  on conflict do nothing;

  return nees;
end $$;

comment on function public.ouvre_le_mois(date, uuid) is
  'Engendre les dépenses du mois à partir des charges actives et non archivées, '
  'fige les parts en centimes et recopie l''enveloppe de la charge. Idempotente. '
  'Rend le nombre de DÉPENSES créées.';
