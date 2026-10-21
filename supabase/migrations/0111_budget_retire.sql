-- ═══════════════════════════════════════════════════════════════════════════
-- 0111 · « Retirer », sans rien perdre de ce qui a été payé (§ 4.5)
--
-- `security definer` désormais : la policy `depense_delete`, qui gardait le
-- confirmé, n'existe plus (0101). La fonction revérifie donc elle-même le foyer
-- et choisit elle-même ce qui part : les lignes `modele` ni confirmées ni
-- réglées, d'un mois non clôturé, hors années soldées. Elle seule archive.
--
-- Remplacée (drop, puis create) : l'ancien paquet l'appelle avec un seul
-- argument, et exige une réponse non nulle (`budget.ts:407`, `supabase.ts:40`).
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.retire_charge(uuid);
drop function if exists public.retire_charge(uuid, boolean);

create function public.retire_charge(p_charge uuid, avec_les_saisies boolean default false)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  foyer uuid := public.current_household();
  nom text;
  total bigint;
  les_mois text;
begin
  if foyer is null then
    raise exception 'Charge introuvable.' using errcode = 'no_data_found';
  end if;
  perform public.verrou_du_foyer(foyer);
  select c.libelle into nom from public.charge c where c.id = p_charge and c.household_id = foyer;
  if nom is null then
    raise exception 'Charge introuvable.' using errcode = 'no_data_found';
  end if;

  /* Ce qui part. ⚠️ Des lignes `modele` seulement : un ajustement reste toujours.
     Celui d'une année soldée tombe souvent sur un mois de l'année suivante, que
     la garde par année ne protège pas : une facture complémentaire 2026 de 60 €,
     posée sur janvier 2027, partait avec un retrait du 20 janvier.
     ⚠️ Pas les années soldées : retirer la copropriété effaçait ses douze lignes
     de 2026, et ses 1 200 € ne comptaient plus nulle part. */
  create temp table if not exists lignes_a_retirer (id uuid, mois date) on commit drop;
  delete from lignes_a_retirer where true;
  insert into lignes_a_retirer (id, mois)
  select d.id, d.mois from public.depense d
  where d.charge_id = p_charge and d.source = 'modele'
    and d.confirme_le is null and d.regle_le is null
    and not exists (select 1 from public.cloture k
                    where k.household_id = foyer and k.mois = d.mois)
    and not exists (select 1 from public.releve_annuel r
                    where r.charge_id = p_charge
                      and r.annee = extract(year from d.mois)::integer);

  /* Une saisie ne part pas sans qu'on l'ait vue. Le total ne compte que celles
     qui partiraient — pas l'amorce confirmée de septembre. L'écran lit `hint`,
     redemande « Retirer Courses et ses 430 € déclarés ? », puis rappelle avec
     `avec_les_saisies`. */
  select coalesce(sum(s.montant_cents), 0) into total
  from public.saisie s where s.depense_id in (select id from lignes_a_retirer);
  if total > 0 and not avec_les_saisies then
    select string_agg(public.nom_du_mois(x.mois), ' et ' order by x.mois) into les_mois
    from (select distinct l.mois from lignes_a_retirer l
          where exists (select 1 from public.saisie s where s.depense_id = l.id)) x;
    raise exception '% a % de dépenses déclarées en %.', nom, public.en_euros(total), les_mois
      using errcode = 'check_violation', hint = 'avec_les_saisies', detail = total::text;
  end if;

  -- Les saisies partent avec leurs lignes (cascade, que la garde laisse passer).
  delete from public.depense d where d.id in (select id from lignes_a_retirer);

  begin
    delete from public.charge where id = p_charge;
    /* Une charge supprimée n'a ni facture ni année soldée : rien à recaler.
       Appeler le recalage sur elle échouait, et annulait le retrait de Netflix
       ajouté par erreur. */
    return 'supprimee';
  exception when foreign_key_violation then
    -- Il reste du confirmé, du clôturé, du soldé ou des factures : elle s'arrête.
    update public.charge set archive_le = public.maintenant() where id = p_charge;
    /* Ce que le retrait change à une année ouverte — moins de provisions pour
       les mêmes factures — se pose TOUT DE SUITE, comme D77 le veut. Attendre
       décembre faisait balayer 83,34 € de trop vers l'épargne à la clôture de
       novembre. */
    perform public.recale_la_charge(p_charge);
    return 'archivee';
  end;
end $$;
revoke execute on function public.retire_charge(uuid, boolean) from public, anon;
grant execute on function public.retire_charge(uuid, boolean) to authenticated;
