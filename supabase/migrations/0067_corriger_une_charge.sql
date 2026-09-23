-- ═══════════════════════════════════════════════════════════════════════════
-- 0067 · Corriger une charge
--
-- Il manquait, et le manque était définitif. On tape 11 200 € au lieu de
-- 1 120 € le premier soir — le moment de toute l'année où c'est le plus
-- probable — et aucun écran ne permet de revenir dessus :
--
--   · « Retirer » échoue sur `depense_charge_id_fkey` (RESTRICT) dès qu'un
--     mois est ouvert, et retombe sur l'archivage ;
--   · la dépense de 11 200 € RESTE dans le mois ;
--   · reposer la charge corrigée ajoute 1 120 € par-dessus — le mois affiche
--     12 320 €, pour toujours.
--
-- CE QUI EST REFAIT, ET POURQUOI ON SUPPRIME PLUTÔT QU'ON NE RETOUCHE
--
-- Tous les mois ouverts dont la dépense n'est ni réglée ni confirmée — la même
-- règle que `refige_pour` applique déjà aux parts. Un mois confirmé garde son
-- histoire : c'est ce qu'on a réellement payé, une correction de saisie ne le
-- réécrit pas.
--
-- Et on supprime la ligne pour la laisser renaître, parce que
-- `montant_prevu_cents` est GELÉ par `tg_prevu_gele` — à raison : c'est le
-- témoin contre lequel `excedent_du_mois` mesure. Mais une faute de frappe a
-- aussi faussé la prévision : la garder afficherait un excédent fantôme de
-- 10 080 €. Une ligne ni réglée ni confirmée n'a aucune histoire à garder, et
-- `ouvre_le_mois` sait la refaire entièrement — montant, prévu, nature.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.corrige_la_charge(
  la_charge            uuid,
  nouveau_libelle      text,
  nouveau_montant      integer,
  nouvelle_periodicite text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  foyer   uuid := public.current_household();
  m       date;
  refaits integer := 0;
begin
  if foyer is null then
    raise exception 'Tu n''es dans aucun foyer.' using errcode = 'insufficient_privilege';
  end if;

  /* ⚠️ `security definer` : le propriétaire contourne la RLS, donc la fonction
     revérifie elle-même que la charge est bien celle de l'appelant. Sans ça,
     n'importe quel uuid deviné réécrivait la charge d'un autre foyer. */
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

  update public.charge
     set libelle       = btrim(nouveau_libelle),
         montant_cents = nouveau_montant,
         periodicite   = nouvelle_periodicite
   where id = la_charge;

  -- Les mois à refaire, relevés AVANT la suppression qui les efface.
  create temp table if not exists mois_a_refaire (mois date) on commit drop;
  delete from mois_a_refaire where true;
  insert into mois_a_refaire (mois)
  select distinct d.mois
    from public.depense d
   where d.charge_id = la_charge and d.household_id = foyer
     and d.source = 'modele'
     and d.regle_le is null and d.confirme_le is null;

  delete from public.depense d
   where d.charge_id = la_charge and d.household_id = foyer
     and d.source = 'modele'
     and d.regle_le is null and d.confirme_le is null;

  for m in select mois from mois_a_refaire order by mois loop
    perform public.ouvre_le_mois(m, foyer);
    refaits := refaits + 1;
  end loop;

  return refaits;
end $$;

revoke execute on function public.corrige_la_charge(uuid, text, integer, text)
  from public, anon;
grant execute on function public.corrige_la_charge(uuid, text, integer, text)
  to authenticated, service_role;
