/**
 * 0118 — L'aide intégrée : « Cette réponse est fausse ».
 *
 * L'assistant répond d'après un manuel, et le manuel peut avoir tort ou avoir vieilli. Le bouton « Cette réponse
 * est fausse » écrit ici la question, ce qu'il a répondu et les pages du manuel dont il s'est servi : c'est la
 * seule façon de découvrir une page fausse autrement qu'au hasard d'une lecture.
 *
 * Écrite par la personne seule, lisible par son foyer. Rien d'autre ne l'écrit : pas de modification (un signalement
 * est un fait), pas de suppression côté client — elle part avec le foyer ou le profil (`on delete cascade`).
 * Elle porte `household_id` : le test RGPD exige alors qu'elle figure dans `export_my_data`, ci-dessous.
 */
create table if not exists public.aide_signalement (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.household(id) on delete cascade,
  user_profile_id uuid not null references public.user_profile(id) on delete cascade,
  question        text not null check (char_length(question) between 1 and 600),
  reponse         text not null check (char_length(reponse) between 1 and 2000),
  pages           text[] not null default '{}' check (cardinality(pages) <= 8),
  cree_le         timestamptz not null default now()
);
create index if not exists aide_signalement_household_idx on public.aide_signalement (household_id);
create index if not exists aide_signalement_profil_idx    on public.aide_signalement (user_profile_id);

alter table public.aide_signalement enable row level security;

drop policy if exists aide_signalement_select on public.aide_signalement;
create policy aide_signalement_select on public.aide_signalement for select to authenticated
  using (household_id = public.current_household());
drop policy if exists aide_signalement_insert on public.aide_signalement;
create policy aide_signalement_insert on public.aide_signalement for insert to authenticated
  with check (household_id = public.current_household() and user_profile_id = auth.uid());

-- Le profil désigné est du même foyer (comme `saisi_par`) : on ne signale pas au nom de quelqu'un d'autre.
drop trigger if exists z_profil_meme_foyer on public.aide_signalement;
create trigger z_profil_meme_foyer before insert or update on public.aide_signalement
  for each row execute function public.tg_meme_foyer('user_profile_id', 'user_profile');

/* Le compteur d'usage connaît désormais « aide » : `llm_consomme` écrit dans `llm_usage`, dont la colonne `kind`
   n'accepte que les usages déclarés. Sans cette ligne, la fonction rendait 503 « compteur indisponible ». */
alter table public.llm_usage drop constraint if exists llm_usage_kind_check;
alter table public.llm_usage add constraint llm_usage_kind_check
  check (kind in ('extraction', 'vision', 'generation', 'ticket', 'import', 'etiquette', 'charges', 'revue-charges', 'aide'));

/* L'export RGPD : une table de plus, une ligne de plus. La définition est celle de 0097, plus une clé. */
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
                            from public.aide_signalement a, hh where a.household_id = hh.id)
  )
$function$;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
