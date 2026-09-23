-- ═══════════════════════════════════════════════════════════════════════════
-- 0081 · La garde et l'écart cessent de se contredire
--
-- 0080 pose la garde : une année dont le relevé est saisi ne gagne plus de
-- mois. Elle ferme bien la porte des 2 054,15 €. Mais elle interdit AUSSI les
-- mois à venir — précisément ceux que l'écart vient de compter.
--
-- `regularise_annuel` pose `réel − faites − à_venir` en présupposant qu'octobre,
-- novembre et décembre naîtront. La garde le leur interdisait. Les deux règles
-- ne peuvent pas être vraies ensemble : mesuré, 362,49 € jamais mis de côté sur
-- une facture de 1 450 €, et l'écran promettant indéfiniment « 360 € d'ici
-- décembre » d'un argent qu'on ne commandera jamais.
--
-- Elles se complètent maintenant sans se recouvrir : `provisions_a_venir`
-- compte les mois >= le mois courant, la garde bloque ceux strictement avant.
-- ═══════════════════════════════════════════════════════════════════════════

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
      /* ⚠️ …ET SEULEMENT LES MOIS RÉVOLUS.
         La garde interdisait AUSSI les mois à venir — précisément ceux que
         l'écart vient de compter. `regularise_annuel` pose
         `réel − faites − à_venir` en présupposant qu'octobre, novembre et
         décembre naîtront ; la garde le leur interdisait. Les deux règles ne
         peuvent pas être vraies ensemble : mesuré, 362,49 € jamais mis de côté
         sur une facture de 1 450 €.
         Les deux se complètent maintenant sans se recouvrir :
         `provisions_a_venir` compte les mois >= le mois courant, la garde
         bloque ceux qui sont strictement avant — les seuls responsables des
         2 054,15 € du tour précédent. */
      and debut_mois < date_trunc('month', (now() at time zone 'Europe/Paris'))::date)
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
      /* ⚠️ …ET SEULEMENT LES MOIS RÉVOLUS.
         La garde interdisait AUSSI les mois à venir — précisément ceux que
         l'écart vient de compter. `regularise_annuel` pose
         `réel − faites − à_venir` en présupposant qu'octobre, novembre et
         décembre naîtront ; la garde le leur interdisait. Les deux règles ne
         peuvent pas être vraies ensemble : mesuré, 362,49 € jamais mis de côté
         sur une facture de 1 450 €.
         Les deux se complètent maintenant sans se recouvrir :
         `provisions_a_venir` compte les mois >= le mois courant, la garde
         bloque ceux qui sont strictement avant — les seuls responsables des
         2 054,15 € du tour précédent. */
      and debut_mois < date_trunc('month', (now() at time zone 'Europe/Paris'))::date)
  on conflict do nothing;

  get diagnostics nees = row_count;
  perform public.repartit_les_lignes(foyer, debut_mois);
  return nees;
end $function$

;

-- ── Corriger n'efface plus les mois d'une année close ───────────────────────
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
     and d.mois < date_trunc('month', debut_final)::date;

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
