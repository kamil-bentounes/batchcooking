-- ═══════════════════════════════════════════════════════════════════════════
-- 0116 · On ne retire pas de l'épargne plus que ce qu'on y a versé
--
-- Trouvé au grand test (22/10) : « Je retire 100 000 € » sur 380 € versés laissait
-- la poche à −99 620 €. L'écran le refuse désormais, mais `versement_epargne`
-- (0054) n'avait aucun plancher : sa policy d'insertion ne regarde que le foyer et
-- `auth.uid()`, donc un appel REST direct passait. « Ce qui est versé appartient
-- à qui l'a versé » : le solde de CETTE personne dans CETTE poche ne passe jamais
-- sous zéro. Trois façons de le creuser, trois gardes :
--   · poser un retrait trop gros (INSERT) ;
--   · réécrire le montant d'une ligne (UPDATE) : un versement ne se modifie pas,
--     on le retire et on en pose un autre ;
--   · supprimer un versement que des retraits ont déjà entamé (DELETE) — y compris
--     « Revenir dessus », qui efface le versement de la clôture : refuser vaut mieux
--     que laisser −400 € dans la poche.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.tg_versement_plancher()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare solde bigint; foyer uuid;
begin
  foyer := case when tg_op = 'DELETE' then old.household_id else new.household_id end;
  /* Un client ne regarde que son foyer : la policy refusera le reste. Sans cela, le
     message d'erreur — qui dit le solde — et le verrou prendraient un foyer étranger.
     (`auth.uid()` et non `current_user` : sous `security definer`, `current_user` est
     le propriétaire, jamais `authenticated`.) */
  if auth.uid() is not null and foyer is distinct from public.current_household() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' then
    if new.montant_cents is distinct from old.montant_cents then
      raise exception 'Un versement ne se modifie pas : retire-le, puis pose-en un autre.'
        using errcode = 'check_violation', hint = 'versement_fige';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    /* Seulement l'instruction elle-même : la suppression d'une poche ou d'un foyer
       efface ses versements en cascade (profondeur 2), et ne doit pas s'y heurter. */
    if pg_trigger_depth() > 1 or old.montant_cents <= 0 then return old; end if;
    perform public.verrou_du_foyer(foyer);
    select coalesce(sum(v.montant_cents), 0) into solde
    from public.versement_epargne v
    where v.poche_id = old.poche_id and v.user_profile_id = old.user_profile_id
      and v.id <> old.id;
    if solde < 0 then
      raise exception 'Tu as retiré % de cette poche depuis : ce versement ne peut plus s’annuler.',
        public.en_euros(-solde)
        using errcode = 'check_violation', hint = 'plancher_epargne', detail = solde::text;
    end if;
    return old;
  end if;

  if new.montant_cents >= 0 then return new; end if;
  /* Le verrou du foyer AVANT de lire le solde : deux retraits simultanés de 300 €
     sur 380 € passaient l'un et l'autre, chacun voyant 380 €. */
  perform public.verrou_du_foyer(foyer);
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
create trigger tg_versement_plancher
  before insert or update or delete on public.versement_epargne
  for each row execute function public.tg_versement_plancher();
