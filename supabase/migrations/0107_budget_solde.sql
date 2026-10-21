-- ═══════════════════════════════════════════════════════════════════════════
-- 0107 · Solder une année (§ 4.5)
-- ═══════════════════════════════════════════════════════════════════════════

/* Les années que la clôture de `le_mois` solderait : pour chaque charge du
   foyer, ARCHIVÉE OU NON, qui a dans l'année des lignes de façon `mis_de_cote`
   ou des factures, toute année ouverte strictement antérieure à celle du mois,
   et celle du mois si c'est décembre. La façon des LIGNES, pas le mode de la
   charge : une charge repassée en mensuelle garde ses provisions de l'année.
   Écrit une fois : la clôture et son aperçu le lisent tous deux. */
create or replace function public.annees_a_solder(foyer uuid, le_mois date)
returns table (charge_id uuid, libelle text, annee integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct c.id, c.libelle, y.annee
  from public.charge c
  cross join lateral (
    select extract(year from d.mois)::integer as annee from public.depense d
    where d.charge_id = c.id and d.source = 'modele' and d.facon = 'mis_de_cote'
    union
    select f.annee from public.facture f where f.charge_id = c.id
  ) y
  where c.household_id = annees_a_solder.foyer
    and (y.annee < extract(year from le_mois)::integer
         or (y.annee = extract(year from le_mois)::integer
             and extract(month from le_mois)::integer = 12))
    and not exists (select 1 from public.releve_annuel r
                    where r.charge_id = c.id and r.annee = y.annee)
  order by 3, 2
$$;
revoke execute on function public.annees_a_solder(uuid, date) from public, anon, authenticated;

create or replace function public.solde_l_annee(la_charge uuid, annee integer, mois_cible date)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare foyer uuid; m date; x record;
begin
  select c.household_id into foyer from public.charge c where c.id = la_charge;
  if foyer is null then
    raise exception 'Charge inconnue.' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.releve_annuel r
             where r.charge_id = la_charge and r.annee = solde_l_annee.annee) then
    return;
  end if;

  /* On matérialise les mois SUIVIS de l'année, avec la boucle et les bornes de
     `regularise_annuel` : le prévu se lit alors sur des lignes qui existent,
     pas sur une prédiction. `ouvre_la_charge` saute un mois clôturé. */
  for m in
    select d.mois::date
    from generate_series(make_date(annee, 1, 1), make_date(annee, 12, 1),
                         interval '1 month') as d(mois)
    where d.mois::date >= '2000-01-01'::date
      and d.mois::date <= (current_date + interval '5 years')::date
      and public.mois_suivi(foyer, d.mois::date)
    order by 1
  loop
    perform public.ouvre_la_charge(la_charge, foyer, m);
  end loop;

  /* L'année marquée soldée, avec son prévu FIGÉ. Une année sans mois suivi n'a
     pas de cas à part : B y vaut Σ factures, Pl y vaut 0, et chaque facture a
     déjà posé son montant. */
  select * into x from public.cible_de(la_charge, annee, true);
  insert into public.releve_annuel
    (household_id, charge_id, annee, reel_cents, prevu_cents, ecart_cents, saisi_par, saisi_le)
  values (foyer, la_charge, annee, x.b::integer, x.pl, x.b - x.pl, auth.uid(),
          public.maintenant());
  perform public.recale_l_annee(la_charge, annee, mois_cible);
end $$;
revoke execute on function public.solde_l_annee(uuid, integer, date) from public, anon, authenticated;

/* Ce que la clôture de ce mois poserait, sans rien écrire. La même fonction
   (`cible_de`, `comme_soldee`) : les provisions à venir des mois que le solde
   matérialiserait y comptent. */
create or replace function public.apercu_des_soldes(le_mois date)
returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'charge', a.charge_id, 'libelle', a.libelle, 'annee', a.annee,
           'cents', x.cible - x.pose) order by a.annee, a.libelle), '[]'::jsonb)
  from public.annees_a_solder(public.current_household(),
                              date_trunc('month', le_mois)::date) a
  cross join lateral public.cible_de(a.charge_id, a.annee, true) x
  where x.cible - x.pose <> 0
$$;
revoke execute on function public.apercu_des_soldes(date) from public, anon;
grant execute on function public.apercu_des_soldes(date) to authenticated;
