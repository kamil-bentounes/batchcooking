-- ═══════════════════════════════════════════════════════════════════════════
-- UNE DATE IMPRIMÉE VAUT MIEUX QU'UNE RÈGLE GÉNÉRALE
--
-- D29 pose des seuils ABSOLUS par lieu — quatre jours au frigo, trois mois au
-- congélateur — et c'est juste tant que personne n'en sait plus que nous. Pour
-- une barquette qu'on a cuisinée dimanche, personne n'en sait plus.
--
-- Un plat acheté, si : la date est imprimée sur l'emballage. Or
-- `tg_portion_peremption` recalculait `expires_at` à CHAQUE insertion au
-- congélateur (`lieu_change` vaut toujours vrai sur un INSERT), si bien que la
-- date lue sur le paquet était écrasée sans un mot par « trois mois ».
--
-- Le correctif tient en une inversion : la règle ne s'applique QUE si personne
-- n'a donné de date. Pour que « personne n'a donné de date » veuille dire
-- quelque chose, il faut retirer le DEFAULT de la colonne — sinon le `null` que
-- le trigger cherche n'arrive jamais jusqu'à lui.
--
-- Le calcul par défaut ne change pas d'un jour : il est simplement au SEUL
-- endroit qui le connaissait déjà.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.portion alter column expires_at drop default;

create or replace function public.tg_portion_peremption()
returns trigger language plpgsql as $$
declare
  jours_frigo    constant int := 4;
  jours_congele  constant int := 90;
  heures_decongele constant int := 24;
  -- ⚠️ Sur un INSERT, `lieu_change` était vrai par construction : c'est ce qui
  --    écrasait la date donnée. On distingue donc le DÉPLACEMENT, qui doit
  --    recalculer, de la POSE, qui doit respecter ce qu'on lui donne.
  deplacement boolean := tg_op = 'UPDATE' and new.location is distinct from old.location;
  donnee      boolean := tg_op = 'INSERT' and new.expires_at is not null;
begin
  if new.location = 'congelateur' then
    new.frozen_at := coalesce(new.frozen_at, now());
    -- Sortir puis remettre au congélateur ne rallonge pas la vie de la part :
    -- on repart de la date de congélation, pas de maintenant.
    if not donnee and (deplacement or new.expires_at is null) then
      new.expires_at := new.frozen_at + make_interval(days => jours_congele);
    end if;
    if tg_op = 'UPDATE' and old.state = 'decongelee' then
      new.state := 'au_frais';   -- recongeler n'est pas conseillé, mais se fait
    end if;
  else
    -- Retour au frigo depuis le congélateur : c'est une décongélation, et une
    -- part décongelée se mange le lendemain, pas dans quatre jours.
    if deplacement and old.location = 'congelateur' then
      new.state      := 'decongelee';
      new.frozen_at  := null;
      new.expires_at := now() + make_interval(hours => heures_decongele);
    elsif new.expires_at is null then
      new.expires_at := case new.state
        when 'decongelee' then now() + make_interval(hours => heures_decongele)
        else new.prepared_at + make_interval(days => jours_frigo)
      end;
    end if;
  end if;
  return new;
end $$;
