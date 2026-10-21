-- ═══════════════════════════════════════════════════════════════════════════
-- 0110 · Corriger une charge : les factures décident, les saisies suivent
--
-- Elle ne supprime plus ni les lignes d'ajustement ni les relevés. Seules les
-- lignes `modele` non confirmées se refont, hors mois clôturés et hors années
-- soldées. Une année soldée garde ses lignes telles quelles, libellé compris.
-- ═══════════════════════════════════════════════════════════════════════════

/* Remplacée, pas surchargée : l'ancien paquet l'appelle avec ses cinq arguments
   nommés, et PostgREST refuserait de choisir entre deux versions. Le sixième
   a une valeur par défaut, donc l'appel à cinq arguments tombe sur celle-ci. */
drop function if exists public.corrige_la_charge(uuid, text, integer, text, date);
drop function if exists public.corrige_la_charge(uuid, text, integer, text, date, text);

create function public.corrige_la_charge(
  la_charge uuid, nouveau_libelle text, nouveau_montant integer,
  nouvelle_periodicite text, nouveau_debut date default null, nouveau_mode text default null)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  foyer uuid := public.current_household();
  moi uuid := auth.uid();
  avant record;
  debut_final date;
  m date;
  refaits integer := 0;
  bloque date;
begin
  if foyer is null then
    raise exception 'Tu n''es dans aucun foyer.' using errcode = 'insufficient_privilege';
  end if;
  perform public.verrou_du_foyer(foyer);

  /* ⚠️ `security definer` : le propriétaire contourne la RLS, donc la fonction
     revérifie elle-même que la charge est celle de l'appelant. */
  select c.* into avant from public.charge c where c.id = la_charge and c.household_id = foyer;
  if not found then
    raise exception 'Cette charge n''est pas celle de ton foyer.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(nouveau_libelle), '') = '' then
    raise exception 'Une charge porte un nom.' using errcode = 'check_violation';
  end if;
  if length(btrim(nouveau_libelle)) > 80 then
    raise exception 'Ce nom est trop long.' using errcode = 'check_violation';
  end if;
  if nouveau_montant is null or nouveau_montant <= 0 or nouveau_montant > 100000000 then
    raise exception 'Montant hors des bornes raisonnables.' using errcode = 'check_violation';
  end if;
  if nouvelle_periodicite not in ('mensuel', 'trimestriel', 'annuel') then
    raise exception 'Périodicité inconnue : %', nouvelle_periodicite
      using errcode = 'check_violation';
  end if;
  /* Le nouveau paquet dit la façon ; une façon qui ne va pas avec la périodicité
     est refusée. Sans elle, c'est l'ancien paquet, et le trigger la déduit. */
  if nouveau_mode is not null then
    if nouveau_mode not in ('fixe', 'facture', 'au_fil', 'mis_de_cote') then
      raise exception 'Façon de payer inconnue : %', nouveau_mode
        using errcode = 'check_violation';
    end if;
    if (nouveau_mode = 'mis_de_cote') <> (nouvelle_periodicite <> 'mensuel') then
      raise exception 'Une charge mise de côté se paie par trimestre ou par an ; les autres, chaque mois.'
        using errcode = 'check_violation';
    end if;
  end if;

  debut_final := coalesce(nouveau_debut, avant.debut);
  if debut_final < '2000-01-01'::date
     or debut_final > (current_date + interval '5 years')::date then
    raise exception 'Cette date de départ n''est pas raisonnable.' using errcode = 'check_violation';
  end if;

  /* ⚠️ Une charge mise de côté qui a une histoire ne devient pas mensuelle : des
     factures, une année soldée, ou une ligne mise de côté qu'on ne referait pas
     (confirmée, réglée, ou d'un mois clôturé). Un mois rouvert reste tout
     confirmé : ne regarder que les mois clôturés laissait passer l'Entretien
     d'octobre rouvert, et ses 41,67 € ne revenaient jamais. */
  if avant.mode = 'mis_de_cote' and nouvelle_periodicite = 'mensuel'
     and (exists (select 1 from public.facture f where f.charge_id = la_charge)
          or exists (select 1 from public.releve_annuel r where r.charge_id = la_charge)
          or exists (select 1 from public.depense d
                     where d.charge_id = la_charge and d.source = 'modele'
                       and d.facon = 'mis_de_cote'
                       and (d.confirme_le is not null or d.regle_le is not null
                            or exists (select 1 from public.cloture k
                                       where k.household_id = foyer and k.mois = d.mois)))) then
    raise exception 'Pour la payer chaque mois, retire-la et ajoute la nouvelle. Ses factures et ses années soldées restent ; une année encore ouverte se soldera à la clôture de décembre.'
      using errcode = 'check_violation';
  end if;

  -- Les lignes qu'on refait : `modele`, ni confirmées ni réglées, hors mois clôturés et années soldées.
  create temp table if not exists lignes_a_refaire (id uuid, mois date) on commit drop;
  delete from lignes_a_refaire where true;
  insert into lignes_a_refaire (id, mois)
  select d.id, d.mois from public.depense d
  where d.charge_id = la_charge and d.household_id = foyer and d.source = 'modele'
    and d.regle_le is null and d.confirme_le is null
    and not exists (select 1 from public.cloture k
                    where k.household_id = foyer and k.mois = d.mois)
    and not exists (select 1 from public.releve_annuel r
                    where r.charge_id = la_charge
                      and r.annee = extract(year from d.mois)::integer);

  /* Leurs saisies, telles quelles : mêmes id, auteur et date. La policy qui
     pose `saisi_par = auth.uid()` ne joue pas sous le propriétaire. Renommer
     Courses, ou passer son prévu de 800 € à 850 €, garde ainsi les 430 € déjà
     déclarés en octobre. */
  create temp table if not exists saisies_a_rattacher (like public.saisie) on commit drop;
  delete from saisies_a_rattacher where true;
  insert into saisies_a_rattacher
  select s.* from public.saisie s where s.depense_id in (select id from lignes_a_refaire);

  update public.charge
     set libelle       = btrim(nouveau_libelle),
         montant_cents = nouveau_montant,
         periodicite   = nouvelle_periodicite,
         debut         = debut_final,
         mode          = coalesce(nouveau_mode, mode),
         /* Quand la façon est dite, `variable` et `enveloppe_id` ne disent plus
            rien. Gardés, un rattachement d'enveloppe fait plus tard par l'ancien
            paquet recalculerait la façon sur un `variable` périmé. */
         variable      = case when nouveau_mode is not null then false else variable end,
         enveloppe_id  = case when nouveau_mode is not null then null else enveloppe_id end,
         modifie_par   = moi,
         modifie_le    = public.maintenant()
   where id = la_charge;

  -- Les lignes partent ; leurs saisies partent en cascade (la garde laisse passer une cascade).
  delete from public.depense d where d.id in (select id from lignes_a_refaire);

  create temp table if not exists mois_a_refaire (mois date) on commit drop;
  delete from mois_a_refaire where true;
  insert into mois_a_refaire (mois) select distinct mois from lignes_a_refaire;
  /* ET les mois nouvellement couverts (0083) : reculer la date de départ fait
     naître des mois. Un mois clôturé n'en gagne pas : `ouvre_la_charge` le saute. */
  insert into mois_a_refaire (mois)
  select d.mois::date
  from generate_series(date_trunc('month', debut_final)::date, public.mois_courant(),
                       interval '1 month') as d(mois)
  where d.mois::date not in (select mois from mois_a_refaire);

  /* `ouvre_la_charge`, PAS `ouvre_le_mois` : une correction ne touche que la
     charge qu'on corrige (0083). On compte les naissances, pas les tours. */
  for m in select distinct mois from mois_a_refaire order by 1 loop
    refaits := refaits + public.ouvre_la_charge(la_charge, foyer, m);
  end loop;

  /* Les saisies rejoignent la ligne renée de leur mois. Si ce mois ne renaît
     pas — la date de départ a avancé au-delà —, ou si la ligne n'est plus au fil
     du mois, elles n'auraient plus de ligne : on refuse, et tout s'annule. */
  select min(date_trunc('month', s.fait_le)::date) into bloque
  from saisies_a_rattacher s
  where not exists (select 1 from public.depense d
                    where d.charge_id = la_charge and d.source = 'modele'
                      and d.mois = date_trunc('month', s.fait_le)::date
                      and d.facon = 'au_fil');
  if bloque is not null then
    raise exception 'Des dépenses sont déclarées en % sur cette charge. Retire-les d''abord.',
      public.nom_du_mois(bloque) using errcode = 'check_violation';
  end if;
  insert into public.saisie (id, household_id, depense_id, fait_le, montant_cents, source,
                             reference_externe, saisi_par, created_at)
  select s.id, s.household_id, d.id, s.fait_le, s.montant_cents, s.source,
         s.reference_externe, s.saisi_par, s.created_at
  from saisies_a_rattacher s
  join public.depense d on d.charge_id = la_charge and d.source = 'modele'
                       and d.mois = date_trunc('month', s.fait_le)::date;

  /* Une charge mise de côté se recale : passer l'entretien de 500 € à 600 €
     déplace le prévu de l'année, et un dépassement déjà posé se corrige par un
     contre-ajustement. Une année soldée ne bouge pas. */
  perform public.recale_la_charge(la_charge);
  return refaits;
end $$;
revoke execute on function public.corrige_la_charge(uuid, text, integer, text, date, text)
  from public, anon;
grant execute on function public.corrige_la_charge(uuid, text, integer, text, date, text)
  to authenticated;
