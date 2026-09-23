-- ═══════════════════════════════════════════════════════════════════════════
-- 0084 · Les deux culs-de-sac que le nouveau dessin laissait
--
-- Une contre-revue a confirmé que la matérialisation tient : les mois futurs
-- figés ne bougent plus quand quelqu'un arrive ou change de revenu, l'ordre des
-- mesures est bon, le signe tient, et le rattrapage converge en une passe.
-- Restaient deux endroits où l'application se bloquait elle-même, et une chose
-- à écrire noir sur blanc.
--
-- CE QUE LE DESSIN COÛTE, ASSUMÉ, ET QU'IL FAUT SAVOIR :
--
--  · Saisir en janvier le relevé de l'année en cours fige les douze mois au
--    partage du jour. Quelqu'un qui arrive ensuite porte 0 € de cette charge
--    pour toute l'année, et le même mois montre deux partages côte à côte.
--    C'est « on lit l'avenir, on ne le décide pas » rompu délibérément — pour
--    une charge, et seulement quand on a dit connaître son montant annuel.
--  · Un mois À VENIR supprimé d'une année close ne revient jamais. Aucun écran
--    ne supprime de dépense aujourd'hui ; à savoir avant d'ajouter un bouton.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.provisions_a_venir(la_charge uuid, annee integer)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with c as (
    select montant_cents, periodicite, debut, fin, archive_le, household_id
    from public.charge
    /* ⚠️ Le filtre de foyer manquait. `security definer` + `grant to
       authenticated` : n'importe qui lisait le montant d'une charge d'un autre
       foyer en devinant son identifiant. `provisions_de`, elle, filtre. */
    where id = la_charge and household_id = public.current_household()
  )
  select coalesce(sum(public.provision_mensuelle(c.montant_cents, c.periodicite)), 0)::bigint
  from c,
       generate_series(make_date(annee, 1, 1), make_date(annee, 12, 1),
                       interval '1 month') as m(mois)
  where c.archive_le is null
    /* ⚠️ LES MÊMES BORNES que la matérialisation du relevé. Sans elles, l'écran
       promettait des mois que la base refuse d'ouvrir — la divergence
       écran/base déjà payée deux fois dans cette série. */
    and m.mois::date >= '2000-01-01'::date
    and m.mois::date <= (current_date + interval '5 years')::date
    and c.debut <= (m.mois + interval '1 month - 1 day')::date
    and (c.fin is null or c.fin >= m.mois::date)
    /* ⚠️ LES DEUX conditions, pas l'une OU l'autre.
       « Pas encore ouvert » ne suffit pas : un mois RÉVOLU jamais ouvert ne
       s'ouvrira jamais tout seul, et le compter revient à effacer ce qu'il
       aurait dû coûter. Et la borne de date seule comptait deux fois les mois
       d'une année future déjà ouverts. */
    and m.mois::date >= date_trunc('month', (now() at time zone 'Europe/Paris'))::date
    and not exists (
      select 1 from public.depense d
      where d.charge_id = la_charge and d.source = 'modele'
        and d.mois = m.mois::date)
    /* Une année dont le relevé est saisi est COMPLÈTE et figée : elle n'a plus
       rien à venir, et l'écran ne doit plus promettre « X € d'ici décembre »
       d'un argent qu'on ne commandera jamais. */
    and not exists (
      select 1 from public.releve_annuel r
      where r.charge_id = la_charge and r.annee = provisions_a_venir.annee)
    /* ⚠️ Le MÊME prédicat qu'`ouvre_le_mois` : un mois sans participant déjà
       arrivé ne produit aucune dépense. Sans lui, on promet des provisions que
       personne ne fera — mesuré à 724,98 € d'écart pour quelqu'un arrivé en
       juillet. */
    and exists (
      select 1 from public.charge_participant cp
      join public.user_profile up on up.id = cp.user_profile_id
      where cp.charge_id = la_charge
        and up.entre_le <= (m.mois + interval '1 month - 1 day')::date)
$function$

;

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
  m           date;
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

  /* ⚠️ AVANT toute écriture : un appel refusé ne doit rien laisser derrière
     lui, et la matérialisation ci-dessous écrit. */
  /* ⚠️ La table s'alias : sa colonne `annee` et le paramètre `annee` portent le
     même nom, et plpgsql refuse de trancher. */
  if exists (select 1 from public.releve_annuel r
              where r.charge_id = la_charge and r.annee = regularise_annuel.annee) then
    raise exception 'Le relevé % de cette charge a déjà été saisi.', annee
      using errcode = 'unique_violation';
  end if;

  /* ⚠️ Une année qu'on ne peut pas ouvrir EN ENTIER ne se régularise pas.
     `ouvre_la_charge` refuse les mois au-delà de cinq ans : saisir le relevé
     2031 en 2026 n'en matérialisait que neuf, posait l'écart dessus, et figeait
     l'année à 9/12 POUR TOUJOURS — la garde bloquant même quand la fenêtre
     avance. Une demi-année mesurée est pire qu'un refus. */
  if exists (
       select 1 from generate_series(make_date(annee, 1, 1), make_date(annee, 12, 1),
                                     interval '1 month') as d(mois)
       where d.mois::date < '2000-01-01'::date
          or d.mois::date > (current_date + interval '5 years')::date) then
    raise exception 'L''année % est trop loin pour être régularisée : ses mois ne peuvent pas tous être ouverts.', annee
      using errcode = 'check_violation';
  end if;

  /* ⚠️ ON MATÉRIALISE L'ANNÉE, on ne la prédit plus.
     Sept tours de correction ont buté sur la même chose : l'écart se calculait
     sur `provisions_a_venir`, c'est-à-dire sur des mois qui n'existaient pas
     encore, et il fallait ensuite interdire au monde de démentir cette
     prédiction. Chaque interdiction en cassait une autre — 1 812, 120,87,
     2 416, 2 054, 362, 960, 720, 1 590 €, et pour finir un rattrapage
     incapable de rattraper la charge pour laquelle il avait été écrit.

     Une prédiction qu'il faut protéger est un mauvais dessin. On ouvre les
     douze mois de l'année MAINTENANT, on somme ce qui existe, et l'écart n'a
     plus rien à supposer. La garde peut alors devenir totale — une année
     saisie ne bouge plus, ni d'un côté ni de l'autre — au lieu d'avoir à
     distinguer le passé de l'avenir et à se contredire elle-même. */
  for m in
    select d.mois::date
    from generate_series(make_date(annee, 1, 1), make_date(annee, 12, 1),
                         interval '1 month') as d(mois)
    /* Les bornes que `ouvre_la_charge` refuse : on les saute au lieu de faire
       échouer tout le relevé. Une année entièrement hors bornes n'aura
       simplement aucun mois, et la garde « rien n'a été provisionné » le dira
       en français. */
    where d.mois::date >= '2000-01-01'::date
      and d.mois::date <= (current_date + interval '5 years')::date
  loop
    perform public.ouvre_la_charge(la_charge, foyer, m);
  end loop;

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

  ecart := reel_cents::bigint - provisionne;
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
         /* ⚠️ COUPÉ. Le suffixe fait 23 caractères et `depense_libelle_check`
            s'arrête à 80 : une charge nommée à 59 caractères ou plus ne
            pouvait JAMAIS être régularisée — erreur de contrainte brute, à
            chaque tentative, et l'année inaccessible à vie. */
         left(nom_charge, 55) || ' — régularisation ' || annee,
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
