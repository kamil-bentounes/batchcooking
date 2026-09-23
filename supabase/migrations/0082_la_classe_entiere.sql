-- ═══════════════════════════════════════════════════════════════════════════
-- 0082 · La classe entière, pas un chemin de plus
--
-- 0081 pose la garde « une année close ne perd pas ses mois » sur UNE des deux
-- suppressions de `corrige_la_charge`. Une contre-revue a mesuré les trois
-- portes restées ouvertes, toutes par des gestes d'écran :
--
--   A · l'autre suppression — « la charge ne court plus sur ces mois-là »,
--       déclenchée par le champ « elle court depuis » qui s'affiche pour toute
--       charge non mensuelle : 720 € perdus, année figée à 780 € pour 1 500 € ;
--   B · avancer sa date d'entrée : `refige_pour` vide les mois sans participant
--       arrivé et la garde les empêche de renaître — 1 140 € tombent à 420 € ;
--   C · changer le MONTANT d'une charge dont une année est close et réglée :
--       les mois passés gardent l'ancien douzième, ceux à venir naissent au
--       nouveau — 1 590 € portés pour 1 500 €, sans ressaisie possible.
--
-- A et B reçoivent la garde. C se refuse, parce qu'aucune valeur ne serait
-- juste : on le dit, et on dit quoi faire.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.refige_pour(foyer uuid, le_mois date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      where cp.charge_id = d.charge_id and up.entre_le <= fin_mois)
    /* ⚠️ Une année close ne se vide pas non plus par CE chemin.
       Avancer sa date d'entrée — « en fait je suis arrivé en juillet » — fait
       supprimer ici les mois sans participant arrivé, et la garde des ouvreurs
       les empêche ensuite de renaître : 1 140 € tombaient à 420 €, et reculer
       la date ne restaurait rien. */
    and not exists (
      select 1 from public.releve_annuel r
      where r.charge_id = d.charge_id
        and r.annee = extract(year from d.mois)::integer);

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
end $function$

;

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

  /* ⚠️ Une année CLOSE ET RÉGLÉE ne supporte pas qu'on change le montant.
     Ses mois passés gardent l'ancien douzième et ses mois à venir naîtraient
     au nouveau : la même année obéirait à deux montants — mesuré, 1 590 €
     portés pour une facture de 1 500 € — et le relevé, verrouillé par une
     régularisation réglée, ne pourrait pas être ressaisi. On refuse, et on dit
     quoi faire. Renommer reste permis : le nom ne change aucun chiffre. */
  if exists (
       select 1 from public.releve_annuel r
       join public.charge c on c.id = r.charge_id
       where r.charge_id = la_charge
         and (c.montant_cents is distinct from nouveau_montant
              or c.periodicite is distinct from nouvelle_periodicite
              or c.debut is distinct from debut_final)
         and exists (
           select 1 from public.depense d
           where d.charge_id = la_charge and d.regularise_annee = r.annee
             and (d.regle_le is not null or d.confirme_le is not null))) then
    raise exception 'Le relevé d''une de ses années est déjà réglé : changer son montant rendrait cette année fausse. Retire cette charge et pose-en une nouvelle.'
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
  /* ⚠️ La MÊME condition que la suppression des dépenses juste au-dessus.
     Elle ne filtrait ni `regle_le` ni `confirme_le` : marquer un mois réglé
     pose `regle_le` sur TOUTES ses lignes, régularisation comprise, donc la
     dépense d'écart survivait pendant que sa trace partait. L'écran
     réaffichait le bouton, on recliquait, et l'index unique rendait une
     violation de contrainte brute — celle-là même que ce lot dit supprimer. */
  delete from public.releve_annuel r
   where r.charge_id = la_charge
     and not exists (
       select 1 from public.depense d
       where d.charge_id = la_charge and d.household_id = foyer
         and d.regularise_annee = r.annee
         and (d.regle_le is not null or d.confirme_le is not null))
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
     and d.mois < date_trunc('month', debut_final)::date
     /* ⚠️ LA MÊME GARDE QUE QUINZE LIGNES PLUS BAS.
        Le correctif du tour précédent n'a été posé que sur UNE des deux
        suppressions. Celle-ci — « la charge ne court plus sur ces mois-là » —
        ne regardait pas `releve_annuel`, et `nouveau_debut` est un champ de
        plein droit du formulaire pour toute charge non mensuelle, donc pour
        toute taxe foncière. Mesuré : 720 € perdus, année figée à 780 € pour
        une facture de 1 500 €, et le compteur annonçant « 9 mois refaits »
        alors que six avaient disparu et zéro renaissaient. */
     and not exists (
       select 1 from public.releve_annuel r
       where r.charge_id = la_charge
         and r.annee = extract(year from d.mois)::integer);

  create temp table if not exists mois_a_refaire (mois date) on commit drop;
  delete from mois_a_refaire where true;
  insert into mois_a_refaire (mois)
  select distinct d.mois
    from public.depense d
   where d.charge_id = la_charge and d.household_id = foyer
     and d.source = 'modele'
     and d.regle_le is null and d.confirme_le is null;

  /* ⚠️ On n'efface PAS les mois d'une année dont la trace survit.
     La trace ne part que si aucune régularisation de l'année n'est réglée ni
     confirmée ; si elle reste, l'année est close. Effacer ses mois les rendait
     irrécupérables — la garde, armée par la trace, leur interdisait de
     renaître. Mesuré : 960 € évaporés et l'année verrouillée à 18 000 centimes
     pour toujours. Pire que le défaut qu'on venait de corriger. */
  delete from public.depense d
   where d.charge_id = la_charge and d.household_id = foyer
     and d.source = 'modele'
     and d.regle_le is null and d.confirme_le is null
     and not exists (
       select 1 from public.releve_annuel r
       where r.charge_id = la_charge
         and r.annee = extract(year from d.mois)::integer);

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
  /* ⚠️ `greatest(x, date_trunc('month', x))` vaut TOUJOURS `x` : la
     normalisation ne normalisait rien, et `generate_series` s'arrêtait avant le
     mois courant dès que la date de départ n'était pas un premier. Le mois
     ainsi sauté devient un mois révolu jamais ouvert le 1er du mois suivant —
     exactement le trou que tout ceci existe pour supprimer. */
  insert into mois_a_refaire (mois)
  select distinct d.mois::date
  from generate_series(
         date_trunc('month', debut_final)::date,
         date_trunc('month', (now() at time zone 'Europe/Paris'))::date,
         interval '1 month') as d(mois)
  where d.mois::date not in (select mois from mois_a_refaire);

  /* ⚠️ `ouvre_la_charge`, PAS `ouvre_le_mois` : celui-ci ouvre le mois pour
     TOUTES les charges du foyer. Corriger son loyer faisait naître neuf mois
     de taxe foncière, dont le relevé annuel était déjà saisi et verrouillé —
     2 416,64 € portés pour une facture de 1 450 €. Une correction ne touche
     que la charge qu'on corrige. */
  for m in select distinct date_trunc('month', mois)::date as mois
             from mois_a_refaire order by 1 loop
    perform public.ouvre_la_charge(la_charge, foyer, m);
    refaits := refaits + 1;
  end loop;

  return refaits;
end $function$

;

-- ── D · Le mois qu'on n'a pas ouvert pendant son propre mois ───────────────
--
-- La garde est relative à « maintenant », mais l'ensemble que l'écart a compté
-- est figé à l'instant du relevé. Un mois compté doit donc naître PENDANT son
-- mois : `useMois` refuse d'ouvrir un mois futur, et revenir dessus après coup
-- ne l'ouvre plus. Un mois calendaire sans ouvrir l'application = 120,83 €
-- jamais mis de côté, définitivement, sans un mot.
--
-- Une fonction qui rattrape TOUS les mois manquants, appelée une fois par
-- visite du budget. Le passé cesse enfin de dépendre du moment où l'on a
-- regardé — c'est le fil de toute cette série de corrections.
create or replace function public.rattrape_les_mois()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  foyer uuid := public.current_household();
  depuis date;
  jusqua date := date_trunc('month', (now() at time zone 'Europe/Paris'))::date;
  m date;
  rattrapes integer := 0;
begin
  if foyer is null then return 0; end if;

  /* Du plus ancien départ de charge vivante au mois courant. */
  select date_trunc('month', min(c.debut))::date into depuis
  from public.charge c
  where c.household_id = foyer and c.archive_le is null;
  if depuis is null then return 0; end if;

  /* Deux ans en arrière au maximum : au-delà, ce n'est plus un rattrapage,
     c'est une reconstruction, et elle doit rester un geste explicite. */
  depuis := greatest(depuis, (jusqua - interval '2 years')::date);

  for m in
    select d.mois::date
    from generate_series(depuis, jusqua, interval '1 month') as d(mois)
    where not exists (
      select 1 from public.depense x
      where x.household_id = foyer and x.mois = d.mois::date and x.source = 'modele')
    order by 1
  loop
    perform public.ouvre_le_mois(m, foyer);
    rattrapes := rattrapes + 1;
  end loop;
  return rattrapes;
end $$;

revoke execute on function public.rattrape_les_mois() from public, anon;
grant   execute on function public.rattrape_les_mois() to authenticated, service_role;

-- ── Une note sur la garde de la première suppression ───────────────────────
--
-- Elle est redondante avec le refus C : une année close et réglée ne peut plus
-- voir sa date de départ changer, donc la suppression « la charge ne court plus
-- sur ces mois-là » ne peut plus l'atteindre. Une mutation le confirme — la
-- retirer ne fait rougir aucun test, et c'est normal.
--
-- Elle reste, parce que C est une règle de PRODUIT — on pourrait vouloir
-- l'assouplir — tandis que celle-ci est une règle de DONNÉES : une année close
-- ne perd pas ses mois, quelle que soit la raison. Écrire un test qui ne
-- mesurerait que le refus C serait un test pour le chiffre.
