-- ═══════════════════════════════════════════════════════════════════════════
-- 0068 · L'enveloppe est vide le 1er du mois, et elle le disait « dépensé »
--
-- Mesuré : une enveloppe « Courses 800 € » avec la charge « Courses 800 €/mois »
-- dedans affiche « 800,00 / 800,00 € » et, sur le hub, « Courses : il reste
-- 0,00 € » — le premier du mois, avant le moindre achat. L'écran des réglages
-- promet pourtant « Aucun argent ne bouge — c'est une limite ».
--
-- La cause : `ouvre_le_mois` pose une dépense de PROVISION pour la charge
-- rattachée à l'enveloppe, et la somme la comptait comme une sortie. C'est le
-- plan, pas la dépense. Le chiffre mesurait donc la prévision contre le
-- plafond — deux fois la même chose — et n'apprenait rien.
--
-- Trois colonnes désormais, parce que ce sont trois choses :
--
--   prevu_cents   ce qui est PROVISIONNÉ et pas encore confirmé — le plan ;
--   depense_cents ce qui a RÉELLEMENT été porté : une provision confirmée à
--                 son montant réel, et toute dépense hors modèle ;
--   reste_cents   le plafond moins le réel.
--
-- Sans relevé bancaire, `depense_cents` reste à zéro jusqu'à la confirmation
-- du 27. C'est honnête : « on ne sait pas encore » se dit mieux que « il ne
-- reste rien ». L'écran montre le prévu tant que le réel est inconnu.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.reste_enveloppe(date);

create function public.reste_enveloppe(le_mois date)
returns table (
  enveloppe_id  uuid,
  libelle       text,
  plafond_cents integer,
  prevu_cents   bigint,
  depense_cents bigint,
  reste_cents   bigint)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  /* ⚠️ Pas de virgule avant un LEFT JOIN : la jointure externe se lie au
     dernier élément de la liste, pas à `enveloppe`, et Postgres refuse d'y
     voir `e`. Les bornes passent donc par des jointures explicites. */
  select e.id, e.libelle, e.plafond_cents,
         /* Le plan : une provision du modèle que personne n'a encore
            confirmée. Elle ne se soustrait de rien. */
         coalesce(sum(d.montant_cents) filter (
           where d.source = 'modele' and d.confirme_le is null), 0)::bigint,
         /* Le réel : une provision confirmée porte son montant VRAI, et une
            dépense hors modèle est une sortie par définition. */
         coalesce(sum(d.montant_cents) filter (
           where d.source <> 'modele' or d.confirme_le is not null), 0)::bigint,
         (e.plafond_cents - coalesce(sum(d.montant_cents) filter (
           where d.source <> 'modele' or d.confirme_le is not null), 0))::bigint
  from public.enveloppe e
  left join public.depense d
    on d.enveloppe_id = e.id
   and d.mois = date_trunc('month', le_mois)::date
  where e.household_id = public.current_household()
    and e.archive_le is null
  group by e.id, e.libelle, e.plafond_cents
  order by e.libelle
$$;

revoke execute on function public.reste_enveloppe(date) from public, anon;
grant   execute on function public.reste_enveloppe(date) to authenticated, service_role;
