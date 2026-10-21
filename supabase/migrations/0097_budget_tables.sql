-- ═══════════════════════════════════════════════════════════════════════════
-- 0097 · Les quatre tables du budget refait (§ 4.2, 4.3, 4.6)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── saisie : les dépenses au fil du mois ──────────────────────────────────
create table if not exists public.saisie (
  /* Fourni par l'appareil : un par saisie VOULUE, créé à la frappe du montant
     et gardé pour les renvois. Un second envoi du même id est un succès sans
     effet. */
  id                uuid primary key,
  household_id      uuid not null references public.household(id) on delete cascade,
  /* Rattachée à la LIGNE du mois, pas à la charge : quand « Retirer » supprime
     les lignes non confirmées, leurs saisies partent avec elles ; celles d'un
     mois clôturé restent avec leur ligne confirmée. */
  depense_id        uuid not null references public.depense(id) on delete cascade,
  fait_le           date not null,
  /* La borne de la base : la somme d'une ligne ne dépasse pas 1 000 000 €. */
  montant_cents     integer not null
                    check (montant_cents > 0 and montant_cents <= 100000000),
  source            text not null default 'manuel'
                    check (source in ('manuel', 'banque', 'courses')),
  reference_externe text,
  saisi_par         uuid references public.user_profile(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint saisie_reference_unique unique (household_id, reference_externe)
);
create index if not exists saisie_depense_idx   on public.saisie (depense_id);
create index if not exists saisie_household_idx on public.saisie (household_id);
-- `on delete set null` : sans index, chaque profil supprimé parcourt toute la table.
create index if not exists saisie_saisi_par_idx on public.saisie (saisi_par);

-- ── facture : les factures des charges mises de côté ─────────────────────
create table if not exists public.facture (
  id            uuid primary key,              -- fourni par l'appareil : idempotence
  household_id  uuid not null references public.household(id) on delete cascade,
  /* `restrict`, comme `depense` (0053) : une charge qui a des factures ne se
     supprime pas, elle s'archive. En cascade, retirer l'entretien après une
     facture de 320 € effaçait la facture, et ses 320 € ne comptaient plus. */
  charge_id     uuid not null references public.charge(id) on delete restrict,
  annee         integer not null check (annee between 2000 and 2100),
  paye_le       date not null,
  montant_cents integer not null check (montant_cents between 0 and 100000000),
  origine       text not null default 'saisie' check (origine in ('saisie', 'releve')),
  saisi_par     uuid references public.user_profile(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint facture_annee_du_paiement
    check (origine = 'releve' or extract(year from paye_le)::integer = annee)
);
create index if not exists facture_charge_annee_idx on public.facture (charge_id, annee);
create index if not exists facture_household_idx    on public.facture (household_id);
create index if not exists facture_saisi_par_idx    on public.facture (saisi_par);
comment on table public.facture is
  'Pour toute charge mise de côté et toute année, le total payé B est la somme '
  'des factures. Aucune autre source.';

-- ── cloture et cloture_choix ──────────────────────────────────────────────
create table if not exists public.cloture (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  mois         date not null check (mois = date_trunc('month', mois)::date),
  cloture_le   timestamptz not null,           -- public.maintenant(), après le verrou
  cloture_par  uuid references public.user_profile(id) on delete set null,
  constraint cloture_une_par_mois unique (household_id, mois)
);
create index if not exists cloture_cloture_par_idx on public.cloture (cloture_par);

create table if not exists public.cloture_choix (
  cloture_id        uuid not null references public.cloture(id) on delete cascade,
  household_id      uuid not null references public.household(id) on delete cascade,
  /* Sans clé étrangère, comme `versement_epargne.user_profile_id` (0054) : un
     choix de clôture est un fait comptable, qui survit au départ. */
  user_profile_id   uuid not null,
  reste_cents       integer,                   -- null : la personne est partie (RGPD)
  mis_de_cote_cents integer not null default 0 check (mis_de_cote_cents >= 0),
  poche_id          uuid references public.poche_epargne(id) on delete set null,
  versement_id      uuid references public.versement_epargne(id) on delete set null,
  baisse_cents      integer not null default 0 check (baisse_cents >= 0),  -- lot 4
  primary key (cloture_id, user_profile_id)
);
create index if not exists cloture_choix_household_idx on public.cloture_choix (household_id);
create index if not exists cloture_choix_versement_idx on public.cloture_choix (versement_id);
create index if not exists cloture_choix_poche_idx     on public.cloture_choix (poche_id);

-- ── Les droits ────────────────────────────────────────────────────────────
alter table public.saisie        enable row level security;
alter table public.facture       enable row level security;
alter table public.cloture       enable row level security;
alter table public.cloture_choix enable row level security;

drop policy if exists saisie_select on public.saisie;
create policy saisie_select on public.saisie for select to authenticated
  using (household_id = public.current_household());
drop policy if exists saisie_insert on public.saisie;
create policy saisie_insert on public.saisie for insert to authenticated
  with check (household_id = public.current_household() and saisi_par = auth.uid());
drop policy if exists saisie_update on public.saisie;
create policy saisie_update on public.saisie for update to authenticated
  using (household_id = public.current_household())
  with check (household_id = public.current_household());
drop policy if exists saisie_delete on public.saisie;
create policy saisie_delete on public.saisie for delete to authenticated
  using (household_id = public.current_household());

/* Lecture seule pour le client : seules `paie_une_facture`, `retire_une_facture`
   et `corrige_le_releve` écrivent une facture ; seules la clôture et « Revenir
   dessus » écrivent les deux autres. */
drop policy if exists facture_select on public.facture;
create policy facture_select on public.facture for select to authenticated
  using (household_id = public.current_household());
drop policy if exists cloture_select on public.cloture;
create policy cloture_select on public.cloture for select to authenticated
  using (household_id = public.current_household());
drop policy if exists cloture_choix_select on public.cloture_choix;
create policy cloture_choix_select on public.cloture_choix for select to authenticated
  using (household_id = public.current_household());

-- ── Ce qu'une ligne désigne appartient au même foyer qu'elle ──────────────
/* `before insert or update` SEULEMENT : `tg_meme_foyer` rend `new`, qui vaut
   NULL sur un DELETE. Posée aussi sur DELETE, elle annulerait en silence toute
   suppression. */
drop trigger if exists z_depense_id_meme_foyer on public.saisie;
create trigger z_depense_id_meme_foyer before insert or update on public.saisie
  for each row execute function public.tg_meme_foyer('depense_id', 'depense');
drop trigger if exists z_saisi_par_meme_foyer on public.saisie;
create trigger z_saisi_par_meme_foyer before insert or update on public.saisie
  for each row execute function public.tg_meme_foyer('saisi_par', 'user_profile');
drop trigger if exists z_charge_id_meme_foyer on public.facture;
create trigger z_charge_id_meme_foyer before insert or update on public.facture
  for each row execute function public.tg_meme_foyer('charge_id', 'charge');
drop trigger if exists z_poche_id_meme_foyer on public.cloture_choix;
create trigger z_poche_id_meme_foyer before insert or update on public.cloture_choix
  for each row execute function public.tg_meme_foyer('poche_id', 'poche_epargne');

-- ── Le verrou du foyer, sur la seule de ces tables que le client écrit ────
drop trigger if exists a_verrou_du_foyer on public.saisie;
create trigger a_verrou_du_foyer before insert or update or delete on public.saisie
  for each statement execute function public.tg_verrou_instruction();

-- ── L'export suit le schéma, dans la MÊME migration ───────────────────────
/* Corps de 0078, avec quatre clés de plus à la fin. Le test RGPD compare la
   liste des tables portant `household_id` à ce que l'export rend : une table
   oubliée ici est une donnée que l'utilisateur ne peut pas emporter. */
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
                            from public.cloture_choix c, hh where c.household_id = hh.id)
  )
$function$;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
