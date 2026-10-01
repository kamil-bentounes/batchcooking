-- « Retirer », c'est retirer.
--
-- Le bouton « Retirer » d'une charge tentait de la supprimer, et, dès qu'elle
-- avait produit une ligne, l'archivait : elle cessait d'engendrer, mais les
-- mois déjà ouverts la GARDAIENT. Le 25/09, un doublon de prêt retiré sur la
-- foi de la revue des charges comptait encore 580 € en septembre — et
-- l'écran ne le montrait nulle part.
--
-- Pour celui qui clique, « Retirer » veut dire une seule chose : la charge
-- disparaît, et il ne la revoit plus. On retire donc ses lignes de TOUS les
-- mois, puis la charge.
--
-- Seules restent les lignes que la base protège déjà (`depense_delete`,
-- 0069) : celles qu'on a CONFIRMÉES et celles d'un mois marqué RÉGLÉ. C'est
-- de l'argent dont on a dit qu'il était sorti. La charge s'archive alors —
-- `restrict` sur `depense.charge_id` (0053) l'exige, et c'est lui qui évite
-- de facturer deux fois un mois si on la recrée.
--
-- ⚠️ `security invoker`, PAS `definer` : c'est la policy de l'appelant qui
--    choisit les lignes supprimables. En `definer`, la fonction effacerait
--    aussi le confirmé et le réglé — et ouvrirait la porte du foyer voisin.
create or replace function public.retire_charge(p_charge uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- La charge doit être VISIBLE de l'appelant : celle d'un autre foyer ne
  -- l'est pas, et rien ne doit en partir.
  perform 1 from public.charge where id = p_charge;
  if not found then
    raise exception 'Charge introuvable.' using errcode = 'no_data_found';
  end if;

  delete from public.depense where charge_id = p_charge;

  begin
    delete from public.charge where id = p_charge;
    return 'supprimee';
  exception when foreign_key_violation then
    -- Il reste du confirmé ou du réglé : on le garde, et la charge s'arrête.
    update public.charge set archive_le = now() where id = p_charge;
    return 'archivee';
  end;
end $$;

revoke all on function public.retire_charge(uuid) from public;
grant execute on function public.retire_charge(uuid) to authenticated;

-- Les charges DÉJÀ retirées sous l'ancienne règle suivent la nouvelle : leurs
-- lignes non confirmées et non réglées partent, et celles qui n'ont plus rien
-- partent avec. En production, le 01/10/2026 : une seule — « Mensualité de
-- prêt », archivée le 25/09, et sa ligne de septembre.
delete from public.depense d
using public.charge c
where d.charge_id = c.id
  and c.archive_le is not null
  and d.confirme_le is null
  and d.regle_le is null;

delete from public.charge c
where c.archive_le is not null
  and not exists (select 1 from public.depense d where d.charge_id = c.id);
