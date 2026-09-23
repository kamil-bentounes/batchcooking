-- ═══════════════════════════════════════════════════════════════════════════
-- 0083 · On matérialise l'année au lieu de la prédire
--
-- Sept tours de correction ont buté sur la même chose, et ce n'était pas de la
-- maladresse : le DESSIN était mauvais.
--
-- L'écart annuel se calculait sur `provisions_a_venir` — une prédiction portant
-- sur des mois qui n'existaient pas encore. Il fallait ensuite interdire au
-- monde entier de démentir cette prédiction, et chaque interdiction en cassait
-- une autre :
--
--   0069  1 812 €   ·  0073  120,87 €  ·  0078  2 416,64 €  ·  0079  2 054,15 €
--   0080  362,49 € et 960 €            ·  0081  720 €, 1 140→420 €, 1 590 €
--   0082  un rattrapage incapable de rattraper la charge pour laquelle il
--         avait été écrit, et 845,81 € perdus selon l'ORDRE des gestes
--
-- Une prédiction qu'il faut protéger est un mauvais dessin. Le relevé ouvre
-- désormais les douze mois de l'année, somme ce qui existe, et n'a plus rien à
-- supposer. La garde devient alors TOTALE — une année saisie ne bouge plus, ni
-- d'un côté ni de l'autre — au lieu de devoir distinguer le passé de l'avenir
-- et de se contredire elle-même.
--
-- Et ce qui en découle :
--   · le refus de corriger une charge disparaît — il n'a plus de raison d'être,
--     et c'était un cul-de-sac permanent qui prescrivait un contournement
--     doublant l'année ;
--   · `refige_pour` garde ses DEUX suppressions, pas une (242,72 € déplacés
--     d'un membre à l'autre pendant que la somme, seule chose regardée par le
--     test, restait juste) ;
--   · le rattrapage mesure le manque PAR CHARGE, comme l'ouvreur ;
--   · le compteur compte les naissances, pas les tours de boucle.
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

CREATE OR REPLACE FUNCTION public.ouvre_le_mois(le_mois date, le_foyer uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  create temp table if not exists depenses_nees
    (id uuid, charge_id uuid, montant_cents integer) on commit drop;
  delete from depenses_nees where true;

  with actives as (
    select c.id, c.libelle, c.cle, c.compte_id, c.variable, c.periodicite, c.enveloppe_id,
           public.provision_mensuelle(c.montant_cents, c.periodicite) as du_mois
    from public.charge c
    where c.household_id = foyer
      and c.archive_le is null
      and c.debut <= fin_mois
      and (c.fin is null or c.fin >= debut_mois)
      and exists (
        select 1 from public.charge_participant cp
        join public.user_profile p on p.id = cp.user_profile_id
        where cp.charge_id = c.id and p.entre_le <= fin_mois)
    /* ⚠️ UNE ANNÉE DONT LE RELEVÉ EST SAISI NE GAGNE PLUS DE MOIS.
       C'est LA garde, et elle manquait depuis quatre tours de correction. À
       chaque fois on déplaçait l'appelant — `corrige_la_charge`, puis les
       triggers d'arrivée — et le suivant rouvrait la porte : faire naître un
       mois dans une année déjà régularisée ajoute sa provision par-dessus un
       écart qui, lui, ne bouge plus, et la garde « une seule fois » interdit
       de ressaisir. Mesuré trois fois : 2 416,64 € puis 205 415 centimes pour
       une facture de 1 450 €.
       Posée ICI, aucun appelant ne peut la contourner. Corriger la charge
       efface la trace de l'année qu'il refait, donc les mois renaissent. */
      and not exists (
        select 1 from public.releve_annuel r
        where r.charge_id = c.id
          and r.annee = extract(year from debut_mois)::integer
      /* ⚠️ TOTALE : ni le passé ni l'avenir.
         La borne « seulement les mois révolus » existait parce que l'écart
         comptait des mois à venir qui n'étaient pas encore nés. Ils le sont
         maintenant, tous, au moment du relevé : une année saisie est complète,
         donc elle ne doit plus bouger du tout. */)
  )
  insert into public.depense
    (household_id, charge_id, mois, libelle, montant_cents, montant_prevu_cents,
     nature, source, compte_id, enveloppe_id)
  select foyer, a.id, debut_mois, a.libelle, a.du_mois, a.du_mois,
         case when a.variable or a.periodicite <> 'mensuel' or a.enveloppe_id is not null
              then 'estimee' else 'connue' end,
         'modele', a.compte_id, a.enveloppe_id
  from actives a
  on conflict do nothing;

  get diagnostics nees = row_count;

  insert into depenses_nees (id, charge_id, montant_cents)
  select d.id, d.charge_id, d.montant_cents
  from public.depense d
  where d.household_id = foyer and d.mois = debut_mois and d.source = 'modele'
    and not exists (select 1 from public.depense_part p where p.depense_id = d.id);

  perform public.repartit_les_lignes(foyer, debut_mois);
  return nees;
end $function$

;

CREATE OR REPLACE FUNCTION public.ouvre_la_charge(la_charge uuid, foyer uuid, le_mois date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  /* ⚠️ Le foyer se REPREND, il ne se croit pas.
     La fonction est accordée à `authenticated` et faisait confiance à son
     argument : mesuré, on créait une dépense de 999 € chez le voisin, avec
     zéro part — l'invariant de somme cassé dans un foyer auquel l'appelant n'a
     aucun accès. `ouvre_le_mois` reprend le sien depuis toujours. */
  foyer      uuid := case when public.is_service_role() and ouvre_la_charge.foyer is not null
                          then ouvre_la_charge.foyer else public.current_household() end;
  debut_mois date := date_trunc('month', le_mois)::date;
  fin_mois   date := (date_trunc('month', le_mois) + interval '1 month - 1 day')::date;
  nees integer := 0;
begin
  if foyer is null then return 0; end if;
  if debut_mois < '2000-01-01'::date
     or debut_mois > (current_date + interval '5 years')::date then
    raise exception 'Mois hors des bornes raisonnables : %', debut_mois
      using errcode = 'check_violation';
  end if;

  /* Le MÊME prédicat qu'`ouvre_le_mois` — c'est la règle de ce dépôt, et
     chaque divergence a coûté de l'argent. */
  insert into public.depense
    (household_id, charge_id, mois, libelle, montant_cents, montant_prevu_cents,
     nature, source, compte_id, enveloppe_id)
  select foyer, c.id, debut_mois, c.libelle,
         public.provision_mensuelle(c.montant_cents, c.periodicite),
         public.provision_mensuelle(c.montant_cents, c.periodicite),
         case when c.variable or c.periodicite <> 'mensuel' or c.enveloppe_id is not null
              then 'estimee' else 'connue' end,
         'modele', c.compte_id, c.enveloppe_id
  from public.charge c
  where c.id = la_charge
    and c.household_id = foyer
    and c.archive_le is null
    and c.debut <= fin_mois
    and (c.fin is null or c.fin >= debut_mois)
    and exists (
      select 1 from public.charge_participant cp
      join public.user_profile p on p.id = cp.user_profile_id
      where cp.charge_id = c.id and p.entre_le <= fin_mois)
    /* ⚠️ UNE ANNÉE DONT LE RELEVÉ EST SAISI NE GAGNE PLUS DE MOIS.
       C'est LA garde, et elle manquait depuis quatre tours de correction. À
       chaque fois on déplaçait l'appelant — `corrige_la_charge`, puis les
       triggers d'arrivée — et le suivant rouvrait la porte : faire naître un
       mois dans une année déjà régularisée ajoute sa provision par-dessus un
       écart qui, lui, ne bouge plus, et la garde « une seule fois » interdit
       de ressaisir. Mesuré trois fois : 2 416,64 € puis 205 415 centimes pour
       une facture de 1 450 €.
       Posée ICI, aucun appelant ne peut la contourner. Corriger la charge
       efface la trace de l'année qu'il refait, donc les mois renaissent. */
    and not exists (
      select 1 from public.releve_annuel r
      where r.charge_id = c.id
        and r.annee = extract(year from debut_mois)::integer
      /* ⚠️ TOTALE : ni le passé ni l'avenir.
         La borne « seulement les mois révolus » existait parce que l'écart
         comptait des mois à venir qui n'étaient pas encore nés. Ils le sont
         maintenant, tous, au moment du relevé : une année saisie est complète,
         donc elle ne doit plus bouger du tout. */)
  on conflict do nothing;

  get diagnostics nees = row_count;
  perform public.repartit_les_lignes(foyer, debut_mois);
  return nees;
end $function$

;

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
        where cp.charge_id = d.charge_id and up.entre_le <= fin_mois)
      /* ⚠️ LA MÊME GARDE QUE VINGT LIGNES PLUS HAUT. Elle n'était posée que
         sur la suppression des DÉPENSES. Celle des PARTS ne l'avait pas : une
         année close gardait ses mois mais changeait de porteur — mesuré,
         242,72 € déplacés d'un membre à l'autre, pendant que la somme des
         montants, seule chose que le test regardait, restait identique. */
      and not exists (
        select 1 from public.releve_annuel r
        where r.charge_id = d.charge_id
          and r.annee = extract(year from d.mois)::integer));

  perform public.repartit_les_lignes(foyer, debut_mois);
end $function$

;

CREATE OR REPLACE FUNCTION public.rattrape_les_mois()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    /* ⚠️ « Manquant » se mesure PAR CHARGE, pas par foyer.
       Le critère « aucune dépense du foyer ce mois-là » déclarait fait un mois
       où une charge sur quinze avait une ligne — et le fabricant de ces mois
       partiels, c'est `corrige_la_charge`, qui depuis 0079 n'ouvre que SA
       charge. Les deux moitiés se contredisaient : l'ouvreur est par charge,
       le détecteur de manque était par foyer. Mesuré : 845,81 € jamais
       provisionnés quand on corrige une charge avant d'ouvrir le budget. */
    where exists (
      select 1 from public.charge c
      where c.household_id = foyer and c.archive_le is null
        and c.debut <= (d.mois + interval '1 month - 1 day')::date
        and (c.fin is null or c.fin >= d.mois::date)
        and exists (
          select 1 from public.charge_participant cp
          join public.user_profile p on p.id = cp.user_profile_id
          where cp.charge_id = c.id
            and p.entre_le <= (d.mois + interval '1 month - 1 day')::date)
        and not exists (
          select 1 from public.releve_annuel rr
          where rr.charge_id = c.id
            and rr.annee = extract(year from d.mois)::integer)
        and not exists (
          select 1 from public.depense x
          where x.charge_id = c.id and x.mois = d.mois::date and x.source = 'modele'))
    order by 1
  loop
    perform public.ouvre_le_mois(m, foyer);
    rattrapes := rattrapes + 1;
  end loop;
  return rattrapes;
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

  /* Le refus qui vivait ici n'a plus lieu d'être : une année saisie est
     désormais COMPLÈTE et figée par la garde, donc changer le montant de la
     charge ne peut plus lui faire mélanger deux douzièmes. Et il était un
     cul-de-sac permanent — une taxe foncière dont 2025 est réglée refusait
     toute correction en 2027 et au-delà, en prescrivant un contournement qui
     doublait l'année. */
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
    /* ⚠️ On compte les NAISSANCES, pas les tours de boucle. L'écran annonçait
       « 21 mois refaits » là où neuf renaissaient — les douze autres étant
       bloqués par la garde. */
    refaits := refaits + public.ouvre_la_charge(la_charge, foyer, m);
  end loop;

  return refaits;
end $function$

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

