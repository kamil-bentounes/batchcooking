-- ═══════════════════════════════════════════════════════════════════════════
-- 0076 · Ce qu'une contre-revue de 0074 a mesuré
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · Corriger après avoir régularisé cassait le total ───────────────────
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
  delete from public.depense d
   where d.charge_id = la_charge and d.household_id = foyer
     and d.regularise_annee is not null
     and d.regle_le is null and d.confirme_le is null;

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

  for m in select mois from mois_a_refaire order by mois loop
    perform public.ouvre_le_mois(m, foyer);
    refaits := refaits + 1;
  end loop;

  return refaits;
end $function$

;

-- ── 2 · Ranger regardait trop peu ──────────────────────────────────────────
--
-- Les deux gardes refusaient d'archiver ce qui sert encore — mais ne
-- regardaient qu'UN usage sur deux, exactement contre leur propre argument.
--
-- `range_le_compte` ne comptait que `charge.compte_id` : mesuré, il archivait
-- un Livret A portant 2 500 € de versements dans une poche d'épargne, qui
-- continuait de pointer vers un compte filtré hors de tous les écrans.
--
-- `range_l_enveloppe` ne comptait que `charge.enveloppe_id` : il archivait une
-- enveloppe portant encore les dépenses du mois courant.
create or replace function public.range_le_compte(le_compte uuid, ranger boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare foyer uuid := public.current_household(); combien integer; poches integer; nom text;
begin
  if foyer is null then raise exception 'Aucun foyer.'; end if;
  select c.nom into nom from public.compte c
   where c.id = le_compte and c.household_id = foyer;
  if nom is null then
    raise exception 'Ce compte n''est pas celui de ton foyer.'
      using errcode = 'insufficient_privilege';
  end if;

  if ranger then
    select count(*) into combien from public.charge
     where compte_id = le_compte and archive_le is null;
    if combien > 0 then
      raise exception 'Ce compte porte encore % charge(s). Rattache-les ailleurs d''abord.', combien
        using errcode = 'check_violation';
    end if;
    select count(*) into poches from public.poche_epargne
     where compte_id = le_compte;
    if poches > 0 then
      raise exception 'Ce compte porte encore % poche(s) d''épargne. Détache-les d''abord.', poches
        using errcode = 'check_violation';
    end if;
  end if;

  update public.compte set archive_le = case when ranger then now() else null end
   where id = le_compte;
end $$;

create or replace function public.range_l_enveloppe(l_enveloppe uuid, ranger boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare foyer uuid := public.current_household(); combien integer; lignes integer; nom text;
begin
  if foyer is null then raise exception 'Aucun foyer.'; end if;
  select e.libelle into nom from public.enveloppe e
   where e.id = l_enveloppe and e.household_id = foyer;
  if nom is null then
    raise exception 'Cette enveloppe n''est pas celle de ton foyer.'
      using errcode = 'insufficient_privilege';
  end if;

  if ranger then
    select count(*) into combien from public.charge
     where enveloppe_id = l_enveloppe and archive_le is null;
    if combien > 0 then
      raise exception 'Cette enveloppe porte encore % charge(s). Détache-les d''abord.', combien
        using errcode = 'check_violation';
    end if;
    /* Le mois EN COURS : une enveloppe rangée au milieu du mois emporterait sa
       jauge alors que les dépenses continuent d'y tomber. */
    select count(*) into lignes from public.depense
     where enveloppe_id = l_enveloppe
       and mois >= date_trunc('month', (now() at time zone 'Europe/Paris'))::date;
    if lignes > 0 then
      raise exception 'Cette enveloppe porte encore % dépense(s) ce mois-ci. Attends le mois prochain.', lignes
        using errcode = 'check_violation';
    end if;
  end if;

  update public.enveloppe set archive_le = case when ranger then now() else null end
   where id = l_enveloppe;
end $$;

revoke execute on function public.range_le_compte(uuid, boolean) from public, anon;
grant   execute on function public.range_le_compte(uuid, boolean) to authenticated, service_role;
revoke execute on function public.range_l_enveloppe(uuid, boolean) from public, anon;
grant   execute on function public.range_l_enveloppe(uuid, boolean) to authenticated, service_role;

-- ── 3 · Une invitation expirée ne pouvait plus JAMAIS être relancée ────────
--
-- `tg_invitation_borne` rabat `expires_at` sur `created_at + 30 jours`. Tant
-- que la durée par défaut valait 7 jours, prolonger de 7 jours passait sous le
-- rabot. 0071 a porté le défaut à 30 jours : depuis, toute prolongation est
-- ramenée à une date PASSÉE, en silence. Et l'index partiel interdit d'en créer
-- une seconde. Boucle morte — mesuré : la prolongation rend une expiration
-- antérieure de dix jours à la demande.
--
-- La borne dit « une invitation ne vit pas plus de trente jours à la fois ».
-- C'est bien ce qu'on veut ; elle le disait mal, en comptant depuis la création
-- au lieu de compter depuis maintenant.
create or replace function public.tg_invitation_borne()
returns trigger language plpgsql as $$
begin
  if new.expires_at > greatest(new.created_at, now()) + interval '30 days' then
    new.expires_at := greatest(new.created_at, now()) + interval '30 days';
  end if;
  -- Une invitation acceptée ne redevient pas ouverte, même par le rôle de
  -- service : seule la fonction `accept-invite` la rend, et elle sait pourquoi.
  if tg_op = 'UPDATE' and old.accepted_at is not null and new.accepted_at is null
     and current_user <> 'service_role' then
    raise exception 'une invitation acceptée ne se rouvre pas'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
