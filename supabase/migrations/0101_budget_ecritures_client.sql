-- ═══════════════════════════════════════════════════════════════════════════
-- 0101 · Le client n'écrit plus l'argent des lignes (§ 4.5, § 4.6)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── depense : ni insertion, ni suppression ; seul `regle_le` reste au client ──
drop policy if exists depense_insert on public.depense;
drop policy if exists depense_delete on public.depense;
/* `depense_update` RESTE : l'ancien paquet coche `regle_le` (« Marquer ce mois
   comme réglé »), seule écriture directe qui lui reste sur ces tables.

   `depense_part` : l'insertion et la suppression sont fermées depuis 0065. On
   garde `depense_part_update` : c'est elle qui laisse la ligne atteindre
   `tg_part_figee`, qui refuse avec un message. Retirée, le refus deviendrait un
   silence — zéro ligne, aucune erreur (0066). */

create or replace function public.tg_depense_garde()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  /* Les fonctions `security definer` écrivent tout le reste. */
  if current_user <> 'authenticated' then return new; end if;
  if (to_jsonb(new) - 'regle_le') is distinct from (to_jsonb(old) - 'regle_le') then
    raise exception 'Une ligne du mois ne se change pas à la main : passe par l''écran du mois.'
      using errcode = 'insufficient_privilege';
  end if;
  /* Et `regle_le` lui-même, pas dans un mois clôturé : l'ancien paquet n'y voit
     pas le gel, et sa phrase lui dit quoi faire. */
  if new.regle_le is distinct from old.regle_le
     and exists (select 1 from public.cloture k
                 where k.household_id = old.household_id and k.mois = old.mois) then
    raise exception '% est clôturé. Recharge la page.', initcap(public.nom_du_mois(old.mois))
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists tg_depense_garde on public.depense;
create trigger tg_depense_garde before update on public.depense
  for each row execute function public.tg_depense_garde();

-- ── releve_annuel : il ne porte plus un montant saisi, il dit « année soldée » ──
/* Seules deux fonctions y écrivent : `solde_l_annee`, qui l'insère, et
   `corrige_le_releve`. Un client gelait ou dégelait une année sans passer par
   le solde. */
drop policy if exists releve_annuel_insert on public.releve_annuel;
drop policy if exists releve_annuel_update on public.releve_annuel;
drop policy if exists releve_annuel_delete on public.releve_annuel;

-- ── Plusieurs ajustements par charge-année : l'unicité passe dans `recale_l_annee` ──
drop index if exists public.depense_regularisation_unique;

-- ── Un versement de clôture ne se touche qu'en revenant sur le mois ──────────
/* Sans cela, octobre afficherait « dont 316,80 € mis de côté » pendant que
   l'épargne n'en aurait plus qu'1 €. `rouvre_le_mois`, sous son propriétaire,
   passe ; la cascade d'une poche supprimée aussi — vider une poche est un geste
   explicite. `security invoker` : il juge `current_user`. */
create or replace function public.tg_versement_de_cloture()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare m date;
begin
  if current_user <> 'authenticated' then return coalesce(new, old); end if;
  select k.mois into m
  from public.cloture_choix cc join public.cloture k on k.id = cc.cloture_id
  where cc.versement_id = old.id limit 1;
  if m is not null then
    raise exception 'Ce versement vient de la clôture %. Reviens sur % pour le changer.',
      public.de_mois(m), public.nom_du_mois(m) using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists tg_versement_de_cloture on public.versement_epargne;
create trigger tg_versement_de_cloture before update or delete on public.versement_epargne
  for each row execute function public.tg_versement_de_cloture();
