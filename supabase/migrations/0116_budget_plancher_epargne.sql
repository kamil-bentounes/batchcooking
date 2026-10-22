-- ═══════════════════════════════════════════════════════════════════════════
-- 0116 · On ne retire pas de l'épargne plus que ce qu'on y a versé
--
-- Trouvé au grand test (22/10) : « Je retire 100 000 € » sur 380 € versés laissait
-- la poche à −99 620 €. L'écran le refuse désormais, mais `versement_epargne`
-- (0054) n'avait aucun plancher : sa policy d'insertion ne regarde que le foyer et
-- `auth.uid()`, donc un appel REST direct passait. « Ce qui est versé appartient
-- à qui l'a versé » : un retrait ne dépasse jamais le solde de CETTE personne dans
-- CETTE poche. Un versement (positif) passe toujours ; la suppression d'un versement
-- (« Revenir dessus ») n'est pas une insertion : elle n'est pas concernée.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.tg_versement_plancher()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare solde bigint;
begin
  if new.montant_cents >= 0 then return new; end if;
  /* Le verrou du foyer AVANT de lire le solde : deux retraits simultanés de 300 €
     sur 380 € passaient l'un et l'autre, chacun voyant 380 €. */
  perform public.verrou_du_foyer(new.household_id);
  select coalesce(sum(v.montant_cents), 0) into solde
  from public.versement_epargne v
  where v.poche_id = new.poche_id and v.user_profile_id = new.user_profile_id;
  if solde + new.montant_cents < 0 then
    raise exception 'Tu n’as versé que % ici : tu ne peux pas en retirer plus.',
      public.en_euros(greatest(solde, 0))
      using errcode = 'check_violation', hint = 'plancher_epargne', detail = solde::text;
  end if;
  return new;
end $$;

drop trigger if exists tg_versement_plancher on public.versement_epargne;
create trigger tg_versement_plancher before insert on public.versement_epargne
  for each row execute function public.tg_versement_plancher();
