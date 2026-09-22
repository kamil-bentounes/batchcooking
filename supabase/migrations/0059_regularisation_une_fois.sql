-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUE 0057 A LAISSÉ OUVERT
--
-- Trois défauts, tous reproduits : la régularisation pouvait se déclencher
-- autant de fois qu'on cliquait, elle pouvait créer une dépense que personne ne
-- devait, et elle rendait une erreur Postgres brute sur un cas limite.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Une régularisation par charge et par année, et c'est tout ─────────────
--
-- `provisions_de` ne compte que les lignes du GÉNÉRATEUR : le deuxième appel
-- recalculait donc le même écart et le refacturait. Cinq clics, cinq lignes,
-- et rien à l'écran pour dire qu'elle existait déjà. L'unicité partielle de
-- `depense` ne couvrait que `source = 'modele'`.
alter table public.depense add column regularise_annee integer;
comment on column public.depense.regularise_annee is
  'L''année que cette ligne régularise. Porte l''unicité : une charge ne se '
  'régularise qu''une fois par année, sans quoi un double-clic facture deux fois.';

create unique index depense_regularisation_unique
  on public.depense (charge_id, regularise_annee)
  where regularise_annee is not null;

create or replace function public.regularise_annuel(
  la_charge uuid, annee integer, reel_cents integer)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  foyer   uuid := public.current_household();
  nom_charge text;
  provisionne bigint;
  combien integer;
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

  /* Rien n'a été provisionné cette année-là : il n'y a rien à régulariser, et
     surtout personne à qui répartir. 0057 créait ici une dépense à zéro part —
     le défaut même que 0056 venait de corriger dans le générateur, réintroduit
     dix lignes plus loin. */
  if combien = 0 then
    raise exception 'Rien n''a été provisionné sur cette charge en %.', annee
      using errcode = 'check_violation';
  end if;
  if provisionne = 0 then
    raise exception 'Les provisions de % sont à zéro : l''écart n''a rien à répartir.', annee
      using errcode = 'check_violation';
  end if;

  ecart := reel_cents - provisionne;
  if ecart = 0 then return null; end if;

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
  with brut as (
    select v.user_profile_id as uid,
           (ecart * v.porte_cents / provisionne)::integer as cents,
           (v.porte_cents * 10000 / provisionne)::integer as bps,
           row_number() over (order by v.porte_cents desc, v.user_profile_id) as rang
    from public.provisions_de(la_charge, annee) v
  ),
  manque as (select ecart - coalesce(sum(cents), 0) as r from brut)
  select ligne, b.uid, foyer,
         b.cents + case when b.rang = 1 then (select r from manque)::integer else 0 end,
         b.bps
  from brut b;

  update public.depense set nature = 'connue'
  where charge_id = la_charge and source = 'modele'
    and household_id = foyer
    and extract(year from mois) = annee;

  return ligne;
end $$;

comment on function public.regularise_annuel(uuid, integer, integer) is
  'Pose LA ligne d''ajustement d''une charge pour une année — une seule, '
  'l''unicité la garde — répartie selon ce que chacun a porté (D62).';

revoke execute on function public.regularise_annuel(uuid, integer, integer) from public, anon;
grant   execute on function public.regularise_annuel(uuid, integer, integer) to authenticated, service_role;
