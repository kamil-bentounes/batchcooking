-- ═══════════════════════════════════════════════════════════════════════════
-- 0075 · Le pendule est passé de l'autre côté
--
-- 0073 corrigeait « l'app facture 1 812 € pour une facture de 1 450 € ». Une
-- contre-revue a mesuré ce qu'il produit dans le cas le plus ORDINAIRE : on
-- installe l'application en septembre, on pose la taxe foncière avec « depuis
-- janvier » — ce que l'écran encourage en toutes lettres — et un seul mois est
-- ouvert. Alors :
--
--   provisionné réel        120,83 €
--   `provisions_a_venir`  1 329,13 €   (il compte janvier→août, RÉVOLUS)
--   écart posé                 0,04 €
--   facturé sur l'année      120,87 €   pour une facture de 1 450 €
--
-- « Facture 1 329 € d'un coup » est devenu « ne facture jamais les 1 329 € ».
--
-- LA RÈGLE, et elle est simple : `provisions_a_venir` doit poser EXACTEMENT le
-- même prédicat qu'`ouvre_le_mois`, borné au futur. Toute divergence entre les
-- deux est de l'argent perdu, dans un sens ou dans l'autre.
--
-- Je m'étais trompé de condition en corrigeant le double comptage d'une année
-- future : il fallait AJOUTER l'absence de dépense à la borne de date, pas la
-- remplacer. Les deux, et le prédicat de participant avec.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.provisions_a_venir(la_charge uuid, annee integer)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with c as (
    select montant_cents, periodicite, debut, fin, archive_le, household_id
    from public.charge
    /* ⚠️ Le filtre de foyer manquait. `security definer` + `grant to
       authenticated` : n'importe qui lisait le montant d'une charge d'un autre
       foyer en devinant son identifiant. `provisions_de`, elle, filtre. */
    where id = la_charge and household_id = public.current_household()
  )
  select coalesce(sum(public.provision_mensuelle(c.montant_cents, c.periodicite)), 0)::bigint
  from c,
       generate_series(make_date(annee, 1, 1), make_date(annee, 12, 1),
                       interval '1 month') as m(mois)
  where c.archive_le is null
    and c.debut <= (m.mois + interval '1 month - 1 day')::date
    and (c.fin is null or c.fin >= m.mois::date)
    /* ⚠️ LES DEUX conditions, pas l'une OU l'autre.
       « Pas encore ouvert » ne suffit pas : un mois RÉVOLU jamais ouvert ne
       s'ouvrira jamais tout seul, et le compter revient à effacer ce qu'il
       aurait dû coûter. Et la borne de date seule comptait deux fois les mois
       d'une année future déjà ouverts. */
    and m.mois::date >= date_trunc('month', (now() at time zone 'Europe/Paris'))::date
    and not exists (
      select 1 from public.depense d
      where d.charge_id = la_charge and d.source = 'modele'
        and d.mois = m.mois::date)
    /* ⚠️ Le MÊME prédicat qu'`ouvre_le_mois` : un mois sans participant déjà
       arrivé ne produit aucune dépense. Sans lui, on promet des provisions que
       personne ne fera — mesuré à 724,98 € d'écart pour quelqu'un arrivé en
       juillet. */
    and exists (
      select 1 from public.charge_participant cp
      join public.user_profile up on up.id = cp.user_profile_id
      where cp.charge_id = la_charge
        and up.entre_le <= (m.mois + interval '1 month - 1 day')::date)
$$;

revoke execute on function public.provisions_a_venir(uuid, integer) from public, anon;
grant   execute on function public.provisions_a_venir(uuid, integer) to authenticated, service_role;

-- ── La garde de signe écartait des lignes saines ───────────────────────────
--
-- 0072 écarte du calcul de l'excédent les lignes dont les parts changent de
-- signe : une proportion n'existe pas entre 8 100 et −7 100. Juste. Mais le
-- filtre écrit `min(part) >= 0`, qui attrape aussi les lignes ENTIÈREMENT
-- négatives — un avoir EDF, dont la proportion est parfaitement définie et que
-- 0069 calculait juste.
--
-- Mesuré : excédent annoncé 5,00 € pour 65,00 € réels. La ligne disparaît en
-- silence, sans compteur ni drapeau, et c'est ce nombre qui pilote « le verser
-- à l'épargne » et « vire X au lieu de Y ».
create or replace function public.excedent_du_mois(le_mois date)
returns table (user_profile_id uuid, excedent_cents bigint)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with lignes as (
    select d.id,
           d.montant_cents::bigint as montant_cents,
           coalesce(d.montant_prevu_cents, d.montant_cents)::bigint as prevu
    from public.depense d
    where d.household_id = public.current_household()
      and d.mois = date_trunc('month', le_mois)::date
      and d.source = 'modele'
      and d.nature = 'connue'
  ),
  parts as (
    select p.user_profile_id as uid, l.id,
           l.prevu - l.montant_cents as ecart,
           p.part_cents::bigint as part_cents,
           (sum(p.part_cents) over (partition by l.id))::bigint as total_ligne,
           /* ⚠️ MÊLÉS, pas « négatifs ». Des parts toutes négatives ont une
              proportion parfaitement définie ; seules celles qui changent de
              signe n'en ont pas. */
           min(p.part_cents) over (partition by l.id) as plus_petite,
           max(p.part_cents) over (partition by l.id) as plus_grande
    from lignes l join public.depense_part p on p.depense_id = l.id
    where l.prevu <> l.montant_cents
  ),
  brut as (
    select uid, id,
           case when ecart < 0 then -1 else 1 end as signe,
           abs(ecart) * abs(part_cents) / nullif(abs(total_ligne), 0) as base,
           abs(ecart) as absolu,
           row_number() over (
             partition by id
             order by (abs(ecart) * abs(part_cents)) % nullif(abs(total_ligne), 0) desc,
                      md5(uid::text || id::text)
           ) as rang
    from parts
    where total_ligne <> 0
      and not (plus_petite < 0 and plus_grande > 0)
  ),
  manque as (select id, max(absolu) - sum(base) as combien from brut group by id)
  select b.uid,
         sum((b.base + case when b.rang <= m.combien then 1 else 0 end) * b.signe)::bigint
  from brut b join manque m on m.id = b.id
  group by b.uid
$$;

revoke execute on function public.excedent_du_mois(date) from public, anon;
grant   execute on function public.excedent_du_mois(date) to authenticated, service_role;

-- ── Rouvrir la création quand le dernier foyer s'en va ─────────────────────
--
-- 0070 referme la création dès qu'un foyer existe : c'est ce qui empêche
-- quelqu'un arrivé sans son lien de s'en fabriquer un second. Mais supprimer
-- son compte supprime le foyer quand on est le dernier — et le réglage restait
-- fermé. Plus aucun foyer, plus aucune création possible, et c'est un bouton
-- de l'application qui y mène.
create or replace function public.tg_rouvre_la_creation()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.household) then
    update public.instance_setting
       set value = jsonb_build_object('enabled', true)
     where key = 'allow_household_creation';
  end if;
  return null;
end $$;

drop trigger if exists tg_rouvre_la_creation on public.household;
create trigger tg_rouvre_la_creation
  after delete on public.household
  for each statement execute function public.tg_rouvre_la_creation();
