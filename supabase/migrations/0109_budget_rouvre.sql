-- ═══════════════════════════════════════════════════════════════════════════
-- 0109 · Revenir sur un mois (§ 4.5)
--
-- Les lignes restent confirmées : une nouvelle clôture refait le même calcul
-- que la première, sur ce que l'écran montre alors. « Revenir dessus » ne
-- refait pas les parts du mois (lot 4 : un revenu saisi après la clôture
-- laisse le mois figé à son partage).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.rouvre_le_mois(le_mois date)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  foyer uuid := public.current_household();
  m date := date_trunc('month', le_mois)::date;
  la_cloture uuid;
begin
  if foyer is null then
    raise exception 'Tu n''es dans aucun foyer.' using errcode = 'insufficient_privilege';
  end if;
  perform public.verrou_du_foyer(foyer);
  select k.id into la_cloture from public.cloture k
  where k.household_id = foyer and k.mois = m;
  if la_cloture is null then
    raise exception '% n''est pas clôturé.', initcap(public.nom_du_mois(m))
      using errcode = 'no_data_found';
  end if;

  /* Les versements des membres encore là partent. Celui d'un membre parti
     reste : l'argent est dans la poche, et personne ne pourrait plus le
     reverser. `tg_versement_de_cloture` laisse passer : nous sommes le
     propriétaire. */
  delete from public.versement_epargne v
  using public.cloture_choix cc
  where cc.cloture_id = la_cloture and cc.versement_id = v.id
    and exists (select 1 from public.user_profile up
                where up.id = cc.user_profile_id and up.household_id = foyer);

  -- Les choix partent en cascade avec la clôture.
  delete from public.cloture where id = la_cloture;
end $$;
revoke execute on function public.rouvre_le_mois(date) from public, anon;
grant execute on function public.rouvre_le_mois(date) to authenticated;
