-- ═══════════════════════════════════════════════════════════════════════════
-- 0077 · Un relevé qui tombe juste laisse une trace
--
-- Quand l'écart vaut zéro — l'année a été provisionnée exactement — la fonction
-- ne posait AUCUNE ligne. Conséquence : `regularise_annee` n'est jamais
-- consommé, la garde « une seule fois par an » de 0059 ne s'arme pas, et rien
-- à l'écran ne dit que le relevé a été saisi. On le ressaisit indéfiniment, et
-- le cas est loin d'être rare : c'est justement celui d'une charge annuelle
-- bien provisionnée.
--
-- Une régularisation à zéro est un FAIT, pas une absence.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.regularise_annuel(la_charge uuid, annee integer, reel_cents integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  foyer   uuid := public.current_household();
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

    insert into public.depense
      (household_id, charge_id, mois, libelle, montant_cents, nature, source,
       compte_id, enveloppe_id, regularise_annee)
    select foyer, la_charge, mois_ci,
           nom_charge || ' — relevé ' || annee || ', rien à ajuster',
           0, 'connue', 'manuel', c.compte_id, c.enveloppe_id, annee
    from public.charge c where c.id = la_charge
    returning id into ligne;

    insert into public.depense_part
      (depense_id, user_profile_id, household_id, part_cents, part_bps)
    select ligne, v.user_profile_id, foyer, 0,
           case when row_number() over (order by v.user_profile_id) = 1
                then 10000 else 0 end
    from public.provisions_de(la_charge, annee) v
    join public.user_profile p on p.id = v.user_profile_id
    where p.household_id = foyer;

    return ligne;
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

  return ligne;
end $function$

;
