-- ═══════════════════════════════════════════════════════════════════════════
-- 0112 · Le départ d'un membre (§ 4.3, § 4.6)
--
-- 0090 à l'identique, plus quatre choses : le verrou, le détail qui part, le
-- reste qui s'efface, et le recalage quand le foyer reste.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid(); v_hh uuid; ch uuid;
begin
  if v_uid is null then
    raise exception 'non authentifié' using errcode = 'insufficient_privilege';
  end if;
  select household_id into v_hh from public.user_profile where id = v_uid;

  /* Le verrou du foyer AVANT la première écriture : la fonction écrit désormais
     dans `saisie`, `cloture_choix` et `facture`. Sans lui, un départ pendant un
     « Revenir dessus » s'interbloquait. */
  perform public.verrou_du_foyer(v_hh);

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
    /* Son départ peut retirer des mois suivis, s'il était le seul à avoir un
       revenu : on recale chaque charge qui a des factures dans une année
       ouverte. `recale_la_charge` ne lit pas `current_household()` — il n'y en
       a plus. */
    for ch in
      select distinct f.charge_id from public.facture f
      where f.household_id = v_hh
        and not exists (select 1 from public.releve_annuel r
                        where r.charge_id = f.charge_id and r.annee = f.annee)
    loop
      perform public.recale_la_charge(ch);
    end loop;
  end if;

  delete from auth.users where id = v_uid;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
