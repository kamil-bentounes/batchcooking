-- ═══════════════════════════════════════════════════════════════════════════
-- 0106 · Payer, retirer, corriger une facture (D77, § 4.5)
--
-- Il n'y a plus de « relevé annuel » à saisir : ce sont les factures qui
-- régularisent. Chacune prend le verrou du foyer, puis recale l'année.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.paie_une_facture(la_facture uuid, la_charge uuid,
                                                   montant_cents integer, paye_le date)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  foyer uuid := public.current_household();
  le_mode text;
  jour date;
  plancher date;
  m date;
begin
  if foyer is null then
    raise exception 'Tu n''es dans aucun foyer.' using errcode = 'insufficient_privilege';
  end if;
  perform public.verrou_du_foyer(foyer);

  /* La charge est celle du foyer, AVANT tout, l'idempotence comprise : un
     identifiant de facture d'un autre foyer rendait sinon un succès silencieux,
     sans rien écrire, et confirmait au passage que cette facture existe. */
  select c.mode into le_mode from public.charge c
  where c.id = la_charge and c.household_id = foyer;
  if le_mode is null then
    raise exception 'Cette charge n''est pas celle de ton foyer.'
      using errcode = 'insufficient_privilege';
  end if;

  /* L'idempotence AVANT toute autre règle : un renvoi après une coupure, ou un
     double toucher, est un succès sans effet. L'identifiant vient de l'appareil.
     Seule NOTRE facture, sur CETTE charge, compte comme un renvoi ; l'id d'un
     autre foyer échoue à l'insertion (clé primaire) : une erreur, pas un succès. */
  if exists (select 1 from public.facture f
             where f.id = la_facture and f.household_id = foyer
               and f.charge_id = la_charge) then
    return la_facture;
  end if;
  /* Une charge retirée garde son mode : sa feuille s'ouvre encore (§ 3.4). */
  if le_mode <> 'mis_de_cote' then
    raise exception 'Cette charge ne se paie pas facture par facture.'
      using errcode = 'check_violation';
  end if;
  if montant_cents is null or montant_cents <= 0 or montant_cents > 100000000 then
    raise exception 'Une facture se saisit entre 0,01 € et 1 000 000 €.'
      using errcode = 'check_violation';
  end if;

  -- Après le verrou, à l'heure de Paris (0093).
  jour := public.aujourdhui();
  plancher := make_date(extract(year from jour)::integer - 1, 1, 1);
  if paye_le is null or paye_le < plancher or paye_le > jour then
    raise exception 'Une facture se date entre le % et aujourd''hui.',
      to_char(plancher, 'DD/MM/YYYY') using errcode = 'check_violation';
  end if;

  /* Le mois de paiement doit être suivi (D77), le mois en cours compris. Une
     facture d'un mois non suivi n'a pas de provision en face : elle
     s'ajouterait en entier au mois en cours, pour une dépense payée avant
     Popote. Un nouveau foyer qui payait 320 € le 10/03 sans revenu, puis posait
     son premier revenu le 05/04, voyait −320 € sur avril, 320 € de reste fictif
     proposés à l'épargne. */
  m := date_trunc('month', paye_le)::date;
  if not public.mois_suivi(foyer, m) then
    if m = date_trunc('month', jour)::date then
      raise exception 'Ajoute ton revenu d''abord.' using errcode = 'check_violation';
    end if;
    raise exception 'Popote ne suivait pas encore % % : cette facture n''y compte pas.',
      public.nom_du_mois(m), extract(year from m)::integer using errcode = 'check_violation';
  end if;

  insert into public.facture (id, household_id, charge_id, annee, paye_le, montant_cents,
                              origine, saisi_par)
  values (la_facture, foyer, la_charge, extract(year from paye_le)::integer, paye_le,
          montant_cents, 'saisie', auth.uid());

  perform public.recale_l_annee(la_charge, extract(year from paye_le)::integer, null);
  return la_facture;
end $$;
revoke execute on function public.paie_une_facture(uuid, uuid, integer, date) from public, anon;
grant execute on function public.paie_une_facture(uuid, uuid, integer, date) to authenticated;

create or replace function public.retire_une_facture(la_facture uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare foyer uuid := public.current_household(); f record;
begin
  if foyer is null then
    raise exception 'Tu n''es dans aucun foyer.' using errcode = 'insufficient_privilege';
  end if;
  perform public.verrou_du_foyer(foyer);
  select x.charge_id, x.annee, x.origine into f
  from public.facture x where x.id = la_facture and x.household_id = foyer;
  if not found then
    raise exception 'Cette facture n''existe plus.' using errcode = 'no_data_found';
  end if;
  /* Retirer le relevé de taxe foncière rouvrait l'année sur les seuls mois
     suivis (483,32 €) : le ressaisir ajoutait 966,68 € à octobre. */
  if f.origine = 'releve' then
    raise exception 'Un relevé se corrige, il ne se retire pas.' using errcode = 'check_violation';
  end if;
  delete from public.facture where id = la_facture;
  -- Le contre-ajustement tombe sur le mois en cours : on ne réécrit pas un mois passé.
  perform public.recale_l_annee(f.charge_id, f.annee, null);
end $$;
revoke execute on function public.retire_une_facture(uuid) from public, anon;
grant execute on function public.retire_une_facture(uuid) to authenticated;

create or replace function public.corrige_le_releve(la_facture uuid, montant_cents integer)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare foyer uuid := public.current_household(); f record; total bigint;
begin
  if foyer is null then
    raise exception 'Tu n''es dans aucun foyer.' using errcode = 'insufficient_privilege';
  end if;
  perform public.verrou_du_foyer(foyer);
  select x.charge_id, x.annee, x.origine into f
  from public.facture x where x.id = la_facture and x.household_id = foyer;
  if not found then
    raise exception 'Cette facture n''existe plus.' using errcode = 'no_data_found';
  end if;
  if f.origine <> 'releve' then
    raise exception 'Seul un relevé se corrige ainsi.' using errcode = 'check_violation';
  end if;
  if corrige_le_releve.montant_cents is null or corrige_le_releve.montant_cents < 0
     or corrige_le_releve.montant_cents > 100000000 then
    raise exception 'Un montant entre 0 € et 1 000 000 €.' using errcode = 'check_violation';
  end if;

  update public.facture set montant_cents = corrige_le_releve.montant_cents
  where id = la_facture;
  select coalesce(sum(x.montant_cents), 0) into total
  from public.facture x where x.charge_id = f.charge_id and x.annee = f.annee;
  /* L'année reste soldée, son prévu figé ne bouge pas : seuls le réel et
     l'écart suivent. */
  update public.releve_annuel r
     set reel_cents = total::integer, ecart_cents = total - r.prevu_cents
   where r.charge_id = f.charge_id and r.annee = f.annee;
  perform public.recale_l_annee(f.charge_id, f.annee, null);
end $$;
revoke execute on function public.corrige_le_releve(uuid, integer) from public, anon;
grant execute on function public.corrige_le_releve(uuid, integer) to authenticated;

/* Interne : recale chaque année OUVERTE de la charge, sans mois cible. Appelée
   sous leur verrou par `retire_charge` et `delete_my_account`. Elle ne lit pas
   `current_household()` : `delete_my_account` l'appelle après avoir supprimé
   le profil. Aucun écran ne l'appelle : elle écrit sur le mois en cours. */
create or replace function public.recale_la_charge(la_charge uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare y integer;
begin
  for y in
    select distinct a.annee from (
      select extract(year from d.mois)::integer as annee from public.depense d
      where d.charge_id = la_charge and d.source = 'modele' and d.facon = 'mis_de_cote'
      union
      select f.annee from public.facture f where f.charge_id = la_charge
    ) a
    where not exists (select 1 from public.releve_annuel r
                      where r.charge_id = la_charge and r.annee = a.annee)
    order by 1
  loop
    perform public.recale_l_annee(la_charge, y, null);
  end loop;
end $$;
revoke execute on function public.recale_la_charge(uuid) from public, anon, authenticated;
