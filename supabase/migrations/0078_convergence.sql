-- ═══════════════════════════════════════════════════════════════════════════
-- 0078 · Le pendule s'arrête, et le relevé cesse d'être une dépense
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · Le TROISIÈME prédicat de participant ───────────────────────────────
--
-- `ouvre_le_mois`, `provisions_a_venir` et `parts_du_foyer` écrivent tous
-- `entre_le <= fin_mois`. `refige_pour` écrivait `<= debut_mois` — le premier
-- du mois — et supprimait donc comme ORPHELINES les lignes que les trois
-- autres comptent.
--
-- Mesuré sur le cas le plus ordinaire qui soit : quelqu'un dont `entre_le` vaut
-- aujourd'hui (le défaut de la colonne, et ce que l'écran de profil propose)
-- pose une charge — septembre s'ouvre — puis saisit son revenu. Le trigger du
-- revenu appelle `refige_pour`, qui ne le voit pas encore arrivé au 1er
-- septembre, et EFFACE la dépense. Le membre invité était protégé, le
-- fondateur non.
create or replace function public.refige_pour(foyer uuid, le_mois date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  debut_mois date := date_trunc('month', le_mois)::date;
  fin_mois   date := (date_trunc('month', le_mois) + interval '1 month - 1 day')::date;
begin
  if foyer is null then return; end if;

  /* D'ABORD les orphelines : une dépense dont la charge n'a plus aucun
     participant arrivé ne se repeuplera jamais. */
  delete from public.depense d
  where d.household_id = foyer and d.mois = debut_mois and d.source = 'modele'
    and d.charge_id is not null
    and d.regle_le is null and d.confirme_le is null
    and not exists (
      select 1 from public.charge_participant cp
      join public.user_profile up on up.id = cp.user_profile_id
      where cp.charge_id = d.charge_id and up.entre_le <= fin_mois);

  delete from public.depense_part p
  where p.depense_id in (
    select d.id from public.depense d
    where d.household_id = foyer and d.mois = debut_mois and d.source = 'modele'
      and d.charge_id is not null
      and d.regle_le is null and d.confirme_le is null
      and exists (
        select 1 from public.charge_participant cp
        join public.user_profile up on up.id = cp.user_profile_id
        where cp.charge_id = d.charge_id and up.entre_le <= fin_mois));

  perform public.repartit_les_lignes(foyer, debut_mois);
end $$;

-- ── 2 · Le relevé annuel est un FAIT, pas une dépense ──────────────────────
--
-- 0077 posait une dépense à 0 € pour armer la garde « une seule fois par an ».
-- Une contre-revue a montré que c'était une mauvaise idée, et elle a raison :
--
--   · l'écran grise le bouton quand l'écart est nul, donc la ligne n'était
--     jamais posée par personne ;
--   · aucun écran ne lit `regularise_annee`, donc elle ne disait rien non plus ;
--   · le suffixe « — relevé YYYY, rien à ajuster » fait 30 caractères contre 22,
--     et un nom de charge de 51 à 58 caractères faisait ÉCHOUER le relevé juste
--     alors que le même nom passait avec un écart. « Ça marche quand je me
--     trompe, ça plante quand je saisis le bon montant » ;
--   · ses points de base 10000/0/0 sont une proportion FAUSSE, que
--     `confirme_la_depense` relit comme poids — mesuré, 300 € entièrement sur
--     un membre au lieu d'un tiers chacun.
--
-- Ce qu'on veut enregistrer, c'est « le relevé de telle année a été saisi, tel
-- jour, pour tel montant ». C'est une table, pas une dépense.
create table if not exists public.releve_annuel (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  charge_id    uuid not null references public.charge(id) on delete cascade,
  annee        integer not null check (annee between 2000 and 2100),
  reel_cents   integer not null check (reel_cents between -100000000 and 100000000),
  ecart_cents  bigint  not null,
  saisi_par    uuid references public.user_profile(id) on delete set null,
  saisi_le     timestamptz not null default now(),
  unique (charge_id, annee)
);

alter table public.releve_annuel enable row level security;
drop policy if exists releve_annuel_select on public.releve_annuel;
create policy releve_annuel_select on public.releve_annuel for select to authenticated
  using (household_id = public.current_household());
drop policy if exists releve_annuel_insert on public.releve_annuel;
create policy releve_annuel_insert on public.releve_annuel for insert to authenticated
  with check (household_id = public.current_household());
drop policy if exists releve_annuel_update on public.releve_annuel;
create policy releve_annuel_update on public.releve_annuel for update to authenticated
  using (household_id = public.current_household())
  with check (household_id = public.current_household());
drop policy if exists releve_annuel_delete on public.releve_annuel;
create policy releve_annuel_delete on public.releve_annuel for delete to authenticated
  using (household_id = public.current_household());

drop trigger if exists z_charge_id_meme_foyer on public.releve_annuel;
create trigger z_charge_id_meme_foyer before insert or update on public.releve_annuel
  for each row execute function public.tg_meme_foyer('charge_id', 'charge');

create index if not exists releve_annuel_charge_idx on public.releve_annuel (charge_id, annee);

-- Ce qui a déjà été régularisé compte comme saisi : sinon la garde laisserait
-- recommencer une année déjà close.
insert into public.releve_annuel (household_id, charge_id, annee, reel_cents, ecart_cents)
select d.household_id, d.charge_id, d.regularise_annee, 0, d.montant_cents
from public.depense d
where d.regularise_annee is not null and d.charge_id is not null
on conflict (charge_id, annee) do nothing;

-- ── Le relevé se consigne, qu'il y ait un écart ou non ─────────────────────
CREATE OR REPLACE FUNCTION public.regularise_annuel(la_charge uuid, annee integer, reel_cents integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  foyer   uuid := public.current_household();
  moi     uuid := auth.uid();
  nom_charge text;
  provisionne bigint;
  porte_ici   bigint;
  a_venir     bigint;
  combien integer;
  negatifs integer;
  ecart   bigint;
  ligne   uuid;
  mois_ci date := date_trunc('month', (now() at time zone 'Europe/Paris'))::date;
begin
  if foyer is null then raise exception 'Aucun foyer.'; end if;

  select c.libelle into nom_charge
  from public.charge c where c.id = la_charge and c.household_id = foyer;
  if nom_charge is null then raise exception 'Charge inconnue.'; end if;

  select count(*), coalesce(max(total_cents), 0) into combien, provisionne
  from public.provisions_de(la_charge, annee);

  if combien = 0 then
    raise exception 'Rien n''a été provisionné sur cette charge en %.', annee
      using errcode = 'check_violation';
  end if;

  select count(*) filter (where v.porte_cents < 0),
         coalesce(sum(v.porte_cents), 0)
    into negatifs, porte_ici
  from public.provisions_de(la_charge, annee) v
  join public.user_profile p on p.id = v.user_profile_id
  where p.household_id = foyer;

  /* ⚠️ Le TOTAL d'abord, le mélange ensuite. Une provision entièrement
     négative n'est pas un mélange de signes, et ce n'est pas la même chose à
     corriger — l'ordre inverse rendait le second message inatteignable. */
  if provisionne <= 0 then
    raise exception 'Les provisions de % ne sont pas positives : l''écart n''a rien à répartir.', annee
      using errcode = 'check_violation';
  end if;
  if negatifs > 0 then
    raise exception 'Les provisions de % ne vont pas toutes dans le même sens : un membre a porté un montant négatif. Une régularisation se répartit au prorata de ce que chacun a porté, et cette proportion n''existe pas ici. Corrige les mois concernés avant de régulariser.', annee
      using errcode = 'check_violation';
  end if;
  if porte_ici <= 0 then
    raise exception 'Personne encore au foyer n''a porté cette charge en % : il n''y a personne à qui répartir.', annee
      using errcode = 'check_violation';
  end if;

  /* ⚠️ L'année ENTIÈRE, pas les mois déjà ouverts.
     Comparer le réel aux seules provisions faites facturait la charge une fois
     et demie : au 23 septembre neuf mois sont ouverts, l'écart posé valait donc
     un quart de la facture, puis octobre, novembre et décembre engendraient
     chacun leur douzième par-dessus. Sur une année complète l'écart retombe à
     zéro, ce qui est la vérité — on a provisionné exactement ce qu'on devait. */
  a_venir := public.provisions_a_venir(la_charge, annee);
  /* ⚠️ La table s'alias : sa colonne `annee` et le paramètre `annee` portent le
     même nom, et plpgsql refuse de trancher. */
  if exists (select 1 from public.releve_annuel r
              where r.charge_id = la_charge and r.annee = regularise_annuel.annee) then
    raise exception 'Le relevé % de cette charge a déjà été saisi.', annee
      using errcode = 'unique_violation';
  end if;

  ecart := reel_cents::bigint - provisionne - a_venir;
  /* Rien à régulariser : le provisionnement de l'année tombe juste. C'est le
     cas NORMAL d'une charge annuelle dont on saisit le montant attendu, et il
     ne doit pas produire de ligne. */
  /* ⚠️ UNE TRACE, même quand l'écart est nul.
     Sans ligne, `regularise_annee` n'est jamais consommé, la garde « une seule
     fois » de 0059 ne s'arme pas, et rien à l'écran ne dit que l'année a été
     saisie : on ressaisit indéfiniment un relevé déjà entré. Une régularisation
     à zéro est un FAIT — l'année est tombée juste — et elle se garde comme tel.
     Le partage d'une ligne à zéro est à zéro, donc rien ne bouge. */
  if ecart = 0 then
    update public.depense set nature = 'connue'
    where charge_id = la_charge and source = 'modele'
      and household_id = foyer and extract(year from mois) = annee;

    /* Un relevé qui tombe juste est un FAIT : on le consigne, et on ne pose
       NI dépense NI parts. 0077 posait une ligne à 0 € dont les points de base
       valaient 10000/0/0 — une proportion fausse que `confirme_la_depense`
       relit comme poids. */
    insert into public.releve_annuel
      (household_id, charge_id, annee, reel_cents, ecart_cents, saisi_par)
    values (foyer, la_charge, annee, reel_cents, 0, moi);
    return null;
  end if;
  if abs(ecart) > 2000000000 then
    raise exception 'Écart hors des bornes raisonnables.' using errcode = 'check_violation';
  end if;

  insert into public.depense
    (household_id, charge_id, mois, libelle, montant_cents, nature, source,
     compte_id, enveloppe_id, regularise_annee)
  select foyer, la_charge, mois_ci,
         nom_charge || ' — régularisation ' || annee,
         ecart::integer, 'connue', 'manuel', c.compte_id, c.enveloppe_id, annee
  from public.charge c where c.id = la_charge
  returning id into ligne;

  insert into public.depense_part
    (depense_id, user_profile_id, household_id, part_cents, part_bps)
  with porte as (
    select v.user_profile_id as uid, v.porte_cents
    from public.provisions_de(la_charge, annee) v
    join public.user_profile p on p.id = v.user_profile_id
    where p.household_id = foyer
  ),
  brut as (
    select uid, porte_cents,
           case when ecart < 0 then -1 else 1 end as signe,
           abs(ecart) * porte_cents / porte_ici as base,
           (porte_cents * 10000) / porte_ici as bps_base,
           row_number() over (
             order by (abs(ecart) * porte_cents) % porte_ici desc,
                      md5(uid::text || ligne::text)) as rang,
           row_number() over (
             order by (porte_cents * 10000) % porte_ici desc,
                      md5(uid::text || ligne::text)) as rang_bps
    from porte
  ),
  manque as (
    select abs(ecart) - coalesce(sum(base), 0) as cents,
           10000 - coalesce(sum(bps_base), 0) as bps
    from brut
  )
  select ligne, b.uid, foyer,
         ((b.base + case when b.rang <= (select cents from manque) then 1 else 0 end)
          * b.signe)::integer,
         (b.bps_base + case when b.rang_bps <= (select bps from manque) then 1 else 0 end)::integer
  from brut b;

  update public.depense set nature = 'connue'
  where charge_id = la_charge and source = 'modele'
    and household_id = foyer
    and extract(year from mois) = annee;

  insert into public.releve_annuel
    (household_id, charge_id, annee, reel_cents, ecart_cents, saisi_par)
  values (foyer, la_charge, annee, reel_cents, ecart, moi);

  return ligne;
end $function$

;

-- ── Corriger une charge ouvre ce qu'elle couvre désormais ──────────────────
CREATE OR REPLACE FUNCTION public.corrige_la_charge(la_charge uuid, nouveau_libelle text, nouveau_montant integer, nouvelle_periodicite text, nouveau_debut date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  foyer   uuid := public.current_household();
  moi     uuid := auth.uid();
  m       date;
  debut_final date;
  refaits integer := 0;
begin
  if foyer is null then
    raise exception 'Tu n''es dans aucun foyer.' using errcode = 'insufficient_privilege';
  end if;

  /* ⚠️ `security definer` : le propriétaire contourne la RLS, donc la fonction
     revérifie elle-même que la charge est bien celle de l'appelant. */
  if not exists (select 1 from public.charge
                  where id = la_charge and household_id = foyer) then
    raise exception 'Cette charge n''est pas celle de ton foyer.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(nouveau_libelle), '') = '' then
    raise exception 'Une charge porte un nom.' using errcode = 'check_violation';
  end if;
  if length(btrim(nouveau_libelle)) > 80 then
    raise exception 'Ce nom est trop long.' using errcode = 'check_violation';
  end if;
  if nouveau_montant is null or nouveau_montant <= 0
     or nouveau_montant > 100000000 then
    raise exception 'Montant hors des bornes raisonnables.' using errcode = 'check_violation';
  end if;
  if nouvelle_periodicite not in ('mensuel', 'trimestriel', 'annuel') then
    raise exception 'Périodicité inconnue : %', nouvelle_periodicite
      using errcode = 'check_violation';
  end if;

  select coalesce(nouveau_debut, c.debut) into debut_final
  from public.charge c where c.id = la_charge;
  if debut_final < '2000-01-01'::date
     or debut_final > (current_date + interval '5 years')::date then
    raise exception 'Cette date de départ n''est pas raisonnable.'
      using errcode = 'check_violation';
  end if;

  update public.charge
     set libelle       = btrim(nouveau_libelle),
         montant_cents = nouveau_montant,
         periodicite   = nouvelle_periodicite,
         debut         = debut_final,
         modifie_par   = moi,
         modifie_le    = now()
   where id = la_charge;

  /* ⚠️ LA RÉGULARISATION DE L'ANNÉE S'EN VA AVEC LES MOIS QU'ELLE RÉSUMAIT.
     Mesuré : facture 1 600 €, régularisation exacte (total 160 000 ✓), puis on
     met la charge à 1 600 € — le geste suivant le plus naturel, et la raison
     d'être de cette fonction. Les douze mois se refaisaient à 13 333 et la
     ligne de régularisation, `source = 'manuel'`, SURVIVAIT : 175 000 € pour
     une facture de 1 600 €. Et l'index unique interdisait de recommencer.
     Une régularisation dit « l'année a coûté X » ; si les mois changent, elle
     ne dit plus rien. Elle part, et on la ressaisit. */
  /* ⚠️ SEULEMENT les années qu'on refait.
     Sans filtre, renommer une charge un an plus tard effaçait la
     régularisation d'une année CLOSE ET PAYÉE : 150,04 € évaporés en silence,
     mesuré, sur une année dont les douze mois sont réglés et que
     `mois_a_refaire` ne reprend donc même pas. */
  delete from public.depense d
   where d.charge_id = la_charge and d.household_id = foyer
     and d.regularise_annee is not null
     and d.regle_le is null and d.confirme_le is null
     and d.regularise_annee in (
       select distinct extract(year from x.mois)::integer
       from public.depense x
       where x.charge_id = la_charge and x.household_id = foyer
         and x.source = 'modele'
         and x.regle_le is null and x.confirme_le is null);

  /* La trace du relevé part avec elle : l'année ne vaut plus ce qu'on avait
     saisi, et il faut pouvoir le ressaisir. */
  delete from public.releve_annuel r
   where r.charge_id = la_charge
     and r.annee in (
       select distinct extract(year from x.mois)::integer
       from public.depense x
       where x.charge_id = la_charge and x.household_id = foyer
         and x.source = 'modele'
         and x.regle_le is null and x.confirme_le is null);

  /* La charge ne court plus sur ces mois-là : leurs dépenses n'ont plus de
     raison d'être. Un mois réglé ou confirmé garde la sienne. */
  delete from public.depense d
   where d.charge_id = la_charge and d.household_id = foyer
     and d.source = 'modele'
     and d.regle_le is null and d.confirme_le is null
     and d.mois < date_trunc('month', debut_final)::date;

  create temp table if not exists mois_a_refaire (mois date) on commit drop;
  delete from mois_a_refaire where true;
  insert into mois_a_refaire (mois)
  select distinct d.mois
    from public.depense d
   where d.charge_id = la_charge and d.household_id = foyer
     and d.source = 'modele'
     and d.regle_le is null and d.confirme_le is null;

  delete from public.depense d
   where d.charge_id = la_charge and d.household_id = foyer
     and d.source = 'modele'
     and d.regle_le is null and d.confirme_le is null;

  /* ⚠️ ET LES MOIS NOUVELLEMENT COUVERTS.
     Reculer la date de départ ne faisait naître aucun mois : ils s'ouvraient
     plus tard, à la première visite du budget. Entre-temps
     `provisions_a_venir` ne les comptait pas — ils sont dans le passé — et le
     provisionné ne les contenait pas non plus. Le relevé annuel se calculait
     donc sur un trou : 1 087,51 € pour une facture de 1 450 €, puis 1 812,49 €
     dès qu'on feuilletait mars. Le pendule était aux DEUX extrémités du même
     scénario.

     Poser une charge ouvre déjà tous ses mois jusqu'à aujourd'hui
     (`usePoseCharge`) ; la corriger doit faire pareil, sinon le passé dépend
     de ce qu'on a regardé. */
  insert into mois_a_refaire (mois)
  select distinct d.mois
  from generate_series(
         greatest(debut_final, date_trunc('month', debut_final)::date),
         date_trunc('month', (now() at time zone 'Europe/Paris'))::date,
         interval '1 month') as d(mois)
  where date_trunc('month', d.mois)::date not in (select mois from mois_a_refaire);

  for m in select distinct date_trunc('month', mois)::date as mois
             from mois_a_refaire order by 1 loop
    perform public.ouvre_le_mois(m, foyer);
    refaits := refaits + 1;
  end loop;

  return refaits;
end $function$

;

-- ── L'export RGPD n'oublie pas la nouvelle table ───────────────────────────
CREATE OR REPLACE FUNCTION public.export_my_data()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                            from public.releve_annuel r, hh where r.household_id = hh.id)
  )
$function$

;
