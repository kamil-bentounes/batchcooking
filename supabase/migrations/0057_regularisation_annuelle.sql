-- ═══════════════════════════════════════════════════════════════════════════
-- LA RÉGULARISATION ANNUELLE (D62)
--
-- La taxe foncière a été provisionnée au douzième toute l'année. En septembre
-- le vrai montant arrive. L'écart ne se règle pas en écrasant le mois courant —
-- ce serait facturer 1450 € en octobre — mais en une LIGNE D'AJUSTEMENT,
-- répartie selon la clé en vigueur CHACUN des mois provisionnés.
--
-- Concrètement : la part de chacun dans l'ajustement est proportionnelle à ce
-- qu'il a réellement porté sur cette charge pendant l'année. Quelqu'un arrivé
-- en octobre ne paie donc que trois douzièmes de l'écart, sans qu'on ait à
-- écrire la moindre règle de date : elle est déjà dans les parts figées.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Une dépense peut être NÉGATIVE ────────────────────────────────────────
--
-- Un relevé inférieur à la provision est un remboursement, pas une anomalie :
-- une année douce, l'énergie provisionnée dépasse l'énergie payée. Interdire le
-- négatif obligeait à écraser la ligne du mois, donc à perdre la trace de ce
-- qui avait été prévu. Le contrôle qui compte reste le même : la somme des
-- parts recompose le montant, quel que soit son signe.
alter table public.depense drop constraint depense_montant_cents_check;
alter table public.depense_part drop constraint depense_part_part_cents_check;

comment on column public.depense.montant_cents is
  'Signé. Un montant négatif est un remboursement — la régularisation d''une '
  'provision trop généreuse. La somme des parts le recompose, signe compris.';

-- ── Ce qui a été provisionné, et par qui ──────────────────────────────────
create or replace function public.provisions_de(la_charge uuid, annee integer)
returns table (user_profile_id uuid, porte_cents bigint, total_cents bigint)
language sql stable security definer set search_path = public as $$
  with lignes as (
    select d.id, d.montant_cents
    from public.depense d
    where d.charge_id = la_charge
      and d.household_id = public.current_household()
      and d.source = 'modele'
      and extract(year from d.mois) = annee
  )
  select p.user_profile_id,
         sum(p.part_cents)::bigint,
         (select coalesce(sum(montant_cents), 0) from lignes)::bigint
  from public.depense_part p
  join lignes l on l.id = p.depense_id
  group by p.user_profile_id
$$;
revoke execute on function public.provisions_de(uuid, integer) from public, anon;
grant   execute on function public.provisions_de(uuid, integer) to authenticated, service_role;

-- ── La régularisation elle-même ───────────────────────────────────────────
create or replace function public.regularise_annuel(
  la_charge uuid, annee integer, reel_cents integer)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  foyer   uuid := public.current_household();
  nom_charge text;   -- surtout pas `libelle` : c'est aussi une colonne de `charge`
  provisionne bigint;
  ecart   bigint;
  ligne   uuid;
  mois_ci date := date_trunc('month', current_date at time zone 'Europe/Paris')::date;
begin
  if foyer is null then raise exception 'Aucun foyer.'; end if;

  select c.libelle into nom_charge
  from public.charge c where c.id = la_charge and c.household_id = foyer;
  if nom_charge is null then raise exception 'Charge inconnue.'; end if;

  select coalesce(max(total_cents), 0) into provisionne
  from public.provisions_de(la_charge, annee);

  ecart := reel_cents - provisionne;
  if ecart = 0 then return null; end if;

  insert into public.depense
    (household_id, charge_id, mois, libelle, montant_cents, nature, source,
     compte_id, enveloppe_id)
  select foyer, la_charge, mois_ci,
         nom_charge || ' — régularisation ' || annee,
         ecart::integer, 'connue', 'manuel', c.compte_id, c.enveloppe_id
  from public.charge c where c.id = la_charge
  returning id into ligne;

  /* La part de chacun suit ce qu'il a PORTÉ sur l'année, pas la clé
     d'aujourd'hui. C'est là qu'est tout le sens de D62 : un rattrapage ne
     facture personne selon un partage qui n'était pas le sien à l'époque, et
     quelqu'un arrivé en octobre ne porte que ses trois mois.

     ⚠️ Le reliquat s'ajoute DANS l'insert, jamais par un update : `tg_part_figee`
        refuse toute retouche d'une part, y compris depuis cette fonction —
        `security definer` en fait le propriétaire, pas le rôle de service. */
  insert into public.depense_part
    (depense_id, user_profile_id, household_id, part_cents, part_bps)
  with brut as (
    select v.user_profile_id as uid,
           (ecart * v.porte_cents / nullif(provisionne, 0))::integer as cents,
           (v.porte_cents * 10000 / nullif(provisionne, 0))::integer as bps,
           row_number() over (order by v.porte_cents desc, v.user_profile_id) as rang
    from public.provisions_de(la_charge, annee) v
  ),
  manque as (select ecart - coalesce(sum(cents), 0) as r from brut)
  select ligne, b.uid, foyer,
         b.cents + case when b.rang = 1 then (select r from manque)::integer else 0 end,
         b.bps
  from brut b;

  -- Les provisions de l'année cessent d'être des estimations : on a le relevé.
  update public.depense set nature = 'connue'
  where charge_id = la_charge and source = 'modele'
    and extract(year from mois) = annee;

  return ligne;
end $$;

comment on function public.regularise_annuel(uuid, integer, integer) is
  'Pose une ligne d''ajustement pour l''écart entre le relevé annuel et ce qui a '
  'été provisionné, répartie selon ce que chacun a PORTÉ sur l''année — donc '
  'selon la clé en vigueur chaque mois, sans avoir à la relire (D62).';

revoke execute on function public.regularise_annuel(uuid, integer, integer) from public, anon;
grant   execute on function public.regularise_annuel(uuid, integer, integer) to authenticated, service_role;
