-- ═══════════════════════════════════════════════════════════════════════════
-- 0112 · Le départ d'un membre (§ 4.3, § 4.6)
--
-- 0090 à l'identique, plus cinq choses : le verrou, le détail qui part, le
-- reste qui s'efface, le recalage quand le foyer reste, et la charge perso du
-- partant qui s'en va avec lui (choix de Kamil, le 22/10).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Répartir les lignes d'un foyer NOMMÉ ───────────────────────────────────
/* 0100 à l'identique, sauf une ligne : la pesée vient de `parts_du_mois`, qui prend
   le foyer en argument, et non de `parts_du_foyer`, qui ne croit un foyer nommé que
   sous la clé de service et ne lit sinon que `current_household()`. Un départ n'est
   ni l'un ni l'autre : une fois le profil supprimé, il n'y a plus de
   `current_household()`, et le repartage des mois ouverts ne lisait personne.
   Kamil, seul, lisait « Il te reste 1 275 € après 2 425 € de charges » alors qu'il en
   devait 3 959 € : 40 % des communes d'octobre restaient rattachés à un profil
   disparu. */
create or replace function public.repartit_les_lignes(foyer uuid, le_mois date)
returns void
language sql security definer set search_path = public, pg_temp
as $$
  with a_refaire as (
    select d.id, d.charge_id, d.montant_cents
    from public.depense d
    where d.household_id = foyer and d.mois = le_mois and d.source = 'modele'
      and d.charge_id is not null
      and not exists (select 1 from public.depense_part p where p.depense_id = d.id)
      /* 0100 : une ligne sans part d'un mois clôturé n'en reçoit pas. Le mois ne
         vaudrait plus son `reste_cents`. */
      and not exists (select 1 from public.cloture k
                      where k.household_id = foyer and k.mois = le_mois)
  ),
  -- (la suite, de `pesee` à l'`insert`, est celle de 0064, à l'identique)
  pesee as (
    select n.id as depense_id, n.montant_cents, cp.user_profile_id as uid,
           case when sum(p.part_bps) over (partition by n.id) = 0
                then 1 else p.part_bps end as poids
    from a_refaire n
    join public.charge c on c.id = n.charge_id
    join public.charge_participant cp on cp.charge_id = c.id
    join lateral public.parts_du_mois(foyer, le_mois, c.cle) p
      on p.user_profile_id = cp.user_profile_id
  ),
  total as (
    select depense_id, montant_cents, uid, poids,
           (sum(poids) over (partition by depense_id))::bigint as poids_total
    from pesee
  ),
  brut as (
    select depense_id, uid, poids, poids_total,
           case when montant_cents < 0 then -1 else 1 end as signe,
           abs(montant_cents::bigint) * poids / poids_total as base,
           row_number() over (
             partition by depense_id
             order by (abs(montant_cents::bigint) * poids) % poids_total desc,
                      md5(uid::text || depense_id::text)
           ) as rang,
           abs(montant_cents::bigint) as absolu,
           (poids::bigint * 10000) / poids_total as bps_base,
           row_number() over (
             partition by depense_id
             order by (poids::bigint * 10000) % poids_total desc,
                      md5(uid::text || depense_id::text)
           ) as rang_bps
    from total where poids_total > 0
  ),
  manque as (
    select depense_id, max(absolu) - sum(base) as cents,
           10000 - sum(bps_base) as bps
    from brut group by depense_id
  )
  insert into public.depense_part
    (depense_id, user_profile_id, household_id, part_cents, part_bps)
  select b.depense_id, b.uid, foyer,
         (b.base + case when b.rang <= m.cents then 1 else 0 end)::integer * b.signe,
         (b.bps_base + case when b.rang_bps <= m.bps then 1 else 0 end)::integer
  from brut b join manque m on m.depense_id = b.depense_id
$$;
revoke execute on function public.repartit_les_lignes(uuid, date) from public, anon, authenticated;

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_hh uuid; ch uuid; m date; retirees uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'non authentifié' using errcode = 'insufficient_privilege';
  end if;
  select household_id into v_hh from public.user_profile where id = v_uid;

  /* Le verrou du foyer AVANT la première écriture : la fonction écrit désormais
     dans `saisie`, `cloture_choix` et `facture`. Sans lui, un départ pendant un
     « Revenir dessus » s'interbloquait. */
  perform public.verrou_du_foyer(v_hh);

  /* Ses charges à lui seul s'en vont avec lui : plus personne ne les porte, et
     elles resteraient dans le budget de Kamil comme une dépense sans propriétaire.
     `retire_charge` fait le tri : les lignes des mois ouverts et leurs saisies
     partent, la charge avec si elle n'a pas d'histoire ; sinon elle s'arrête, et
     les mois clôturés, confirmés ou payés restent tels quels. AVANT la
     suppression du profil : elle lit `current_household()`. Le dernier membre n'a
     pas à le faire, le foyer entier part. */
  if v_hh is not null and exists (select 1 from public.user_profile
                                  where household_id = v_hh and id <> v_uid) then
    for ch in
      select c.id from public.charge c
      where c.household_id = v_hh and c.archive_le is null
        and exists (select 1 from public.charge_participant p
                    where p.charge_id = c.id and p.user_profile_id = v_uid)
        and not exists (select 1 from public.charge_participant p
                        where p.charge_id = c.id and p.user_profile_id <> v_uid)
    loop
      perform public.retire_charge(ch, true);
      retirees := retirees || ch;
      /* `retire_charge` ne retire jamais un ajustement, et la charge qui a une
         histoire s'archive : le recalage de son archivage vient de poser, sur le mois
         courant, un ajustement qui porte les parts de la partante seule. Personne ne
         le repartagerait (`refige_pour` ne lit que `modele`) : il compterait dans le
         mois, dans le reste de personne. Ce qui n'est ni confirmé, ni réglé, ni dans
         un mois clôturé part avec elle. */
      delete from public.depense d
      where d.charge_id = ch and d.confirme_le is null and d.regle_le is null
        and not exists (select 1 from public.cloture k
                        where k.household_id = v_hh and k.mois = d.mois);
    end loop;
  end if;

  if v_hh is not null then
    /* Le détail part, le total reste : les saisies des lignes dont il est le
       seul à porter une part, dans tous les mois, clôturés compris. Le montant
       confirmé de la ligne reste : c'est le fait comptable du mois. */
    delete from public.saisie s
    where s.household_id = v_hh
      and exists (select 1 from public.depense_part p
                  where p.depense_id = s.depense_id and p.user_profile_id = v_uid)
      and not exists (select 1 from public.depense_part p
                      where p.depense_id = s.depense_id and p.user_profile_id <> v_uid);

    /* Son revenu part avec son compte (`revenu` en cascade) : son reste ne se
       redirait plus. Il garde `versement_id` : c'est par lui que « Revenir
       dessus » épargne son versement, l'argent restant dans la poche. */
    update public.cloture_choix set reste_cents = null
    where household_id = v_hh and user_profile_id = v_uid;
  end if;

  /* 0090 : ses comptes perso partent AVANT son profil. Supprimer le profil
     mettait `titulaire_id` à null, ce que `compte_titulaire_coherent` refuse. */
  delete from public.compte where genre = 'perso' and titulaire_id = v_uid;
  delete from public.user_profile where id = v_uid;

  if v_hh is not null
     and not exists (select 1 from public.user_profile where household_id = v_hh) then
    /* Le dernier membre : ses factures et ses lignes d'abord. La cascade
       `household → charge` pourrait buter sur leur `restrict`, l'ordre des
       cascades n'étant pas garanti. */
    delete from public.facture where household_id = v_hh;
    delete from public.depense where household_id = v_hh;
    delete from public.household where id = v_hh;
  elsif v_hh is not null then
    /* Les mois OUVERTS se repartagent entre ceux qui restent : ses parts des
       lignes ni confirmées ni réglées reviennent aux autres, au prorata de
       leurs revenus. Un mois clôturé vaut son `reste_cents` : `refige_pour` ne le
       touche pas, ni les lignes gelées (« le total reste »). Après la suppression
       du profil : il pèse les membres PRÉSENTS. */
    for m in select distinct d.mois from public.depense d where d.household_id = v_hh order by 1
    loop
      perform public.refige_pour(v_hh, m);
    end loop;
    /* Son départ peut retirer des mois suivis, s'il était le seul à avoir un
       revenu : on recale chaque charge qui a des factures dans une année
       ouverte. `recale_la_charge` ne lit pas `current_household()` — il n'y en
       a plus. */
    for ch in
      select distinct f.charge_id from public.facture f
      where f.household_id = v_hh
        and not exists (select 1 from public.releve_annuel r
                        where r.charge_id = f.charge_id and r.annee = f.annee)
        and f.charge_id <> all (retirees)
    loop
      perform public.recale_la_charge(ch);
    end loop;
  end if;

  delete from auth.users where id = v_uid;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
