-- ═══════════════════════════════════════════════════════════════════════════
-- 0069 · Les quatre défauts d'argent que trois revues ont laissés ouverts
--
-- 1 · `excedent_du_mois` gardait le favori que 0064 dit avoir supprimé
-- 2 · `regularise_annuel` n'avait aucune garde de signe
-- 3 · la régularisation mourait au départ d'un membre
-- 4 · une dépense CONFIRMÉE se supprimait à la main, ses parts avec
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · Le favori oublié ───────────────────────────────────────────────────
--
-- 0064 a remplacé le départage `order by … , uid` par un tirage `md5` dans
-- quatre fonctions. `excedent_du_mois` est la cinquième, et elle n'a jamais
-- été migrée : à reste égal, le plus petit uuid encaissait le centime — mesuré
-- 60 fois sur 60. C'est un chiffre de LECTURE, mais c'est celui du virement.
--
-- Et deux `abs(x)::bigint` traînaient, la forme même que 0064 corrige une
-- ligne plus haut : la valeur absolue est prise en `integer`, donc elle
-- déborde sur −2 147 483 648 avant le cast. La soustraction `prevu −
-- montant_cents` déborde plus tôt encore ; elle passe en bigint d'abord.
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
           /* ⚠️ `sum(bigint)` rend du NUMERIC — le piège même que 0064 a refermé
              ailleurs, et que ce `::bigint` a rouvert ici. La division devenait
              exacte : 1 × 5000 / 10000 donnait 0,5 au lieu de 0, le reliquat
              tombait à zéro, et les DEUX encaissaient le centime pour un écart
              d'un seul. Le cast va sur la somme, pas sur ses termes. */
           (sum(p.part_cents) over (partition by l.id))::bigint as total_ligne
    from lignes l join public.depense_part p on p.depense_id = l.id
    where l.prevu <> l.montant_cents
  ),
  brut as (
    select uid, id,
           case when ecart < 0 then -1 else 1 end as signe,
           abs(ecart) * part_cents / nullif(total_ligne, 0) as base,
           abs(ecart) as absolu,
           row_number() over (
             partition by id
             order by (abs(ecart) * part_cents) % nullif(total_ligne, 0) desc,
                      /* ⚠️ Pas `uid` : le plus petit uuid encaissait TOUJOURS
                         le centime. La dépense entre dans le départage pour
                         que ce ne soit pas le même à chaque ligne. */
                      md5(uid::text || id::text)
           ) as rang
    from parts where total_ligne <> 0
  ),
  manque as (select id, max(absolu) - sum(base) as combien from brut group by id)
  select b.uid,
         sum((b.base + case when b.rang <= m.combien then 1 else 0 end) * b.signe)::bigint
  from brut b join manque m on m.id = b.id
  group by b.uid
$$;

revoke execute on function public.excedent_du_mois(date) from public, anon;
grant   execute on function public.excedent_du_mois(date) to authenticated, service_role;

-- ── 2 et 3 · La régularisation annuelle ────────────────────────────────────
--
-- 2 · AUCUNE GARDE DE SIGNE. Avec des revenus inversés en cours d'année et un
--     avoir au milieu, les `porte_cents` se mêlent : 8 100 et −7 100 pour un
--     total de 1 000. Les points de base donnaient 81 000 et −71 000, et la
--     seule chose qui arrêtait le calcul était la borne de la colonne — sur un
--     message de contrainte brut. En centimes, le partage sommait juste tout en
--     étant absurde : un membre débiteur de 3 969 € face à un autre crédité de
--     3 479 €. Une proportion n'a pas de sens quand les parts changent de
--     signe : on refuse, et on le dit en français.
--
-- 3 · LE DÉPART D'UN MEMBRE la tuait. `provisions_de` groupe par
--     `depense_part.user_profile_id`, y compris l'identifiant de quelqu'un
--     parti — c'est voulu, une part figée est un fait comptable. Mais
--     `regularise_annuel` réinsérait ces identifiants dans `depense_part`, où
--     la garde de rattachement les refuse. L'écart se répartit donc entre ceux
--     qui sont LÀ, au prorata de ce qu'ils ont porté entre eux : celui qui est
--     parti ne paie pas une régularisation qu'on ne peut plus lui demander.
create or replace function public.regularise_annuel(
  la_charge uuid, annee integer, reel_cents integer)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  foyer   uuid := public.current_household();
  nom_charge text;
  provisionne bigint;
  porte_ici   bigint;
  combien integer;
  negatifs integer;
  ecart   bigint;
  ligne   uuid;
  mois_ci date := date_trunc('month', (now() at time zone 'Europe/Paris'))::date;
begin
  if foyer is null then raise exception 'Aucun foyer.'; end if;

  select c.libelle into nom_charge
  from public.charge c where c.id = la_charge and c.household_id = foyer;
  if nom_charge is null then raise exception 'Charge inconnue.'; end if;

  select count(*), coalesce(max(total_cents), 0) into combien, provisionne
  from public.provisions_de(la_charge, annee);

  if combien = 0 then
    raise exception 'Rien n''a été provisionné sur cette charge en %.', annee
      using errcode = 'check_violation';
  end if;

  /* Ceux qui sont ENCORE LÀ, et ce qu'ils ont porté entre eux. */
  select count(*) filter (where v.porte_cents < 0),
         coalesce(sum(v.porte_cents), 0)
    into negatifs, porte_ici
  from public.provisions_de(la_charge, annee) v
  join public.user_profile p on p.id = v.user_profile_id
  where p.household_id = foyer;

  if negatifs > 0 then
    /* ⚠️ Le format d'un RAISE est un littéral : pas de `||` ici, Postgres le
       refuse à la compilation. */
    raise exception 'Les provisions de % ne vont pas toutes dans le même sens : un membre a porté un montant négatif. Une régularisation se répartit au prorata de ce que chacun a porté, et cette proportion n''existe pas ici. Corrige les mois concernés avant de régulariser.', annee
      using errcode = 'check_violation';
  end if;
  if provisionne <= 0 then
    raise exception 'Les provisions de % ne sont pas positives : l''écart n''a rien à répartir.', annee
      using errcode = 'check_violation';
  end if;
  if porte_ici <= 0 then
    raise exception 'Personne encore au foyer n''a porté cette charge en % : il n''y a personne à qui répartir.', annee
      using errcode = 'check_violation';
  end if;

  ecart := reel_cents::bigint - provisionne;
  if ecart = 0 then return null; end if;
  if abs(ecart) > 2000000000 then
    raise exception 'Écart hors des bornes raisonnables.' using errcode = 'check_violation';
  end if;

  insert into public.depense
    (household_id, charge_id, mois, libelle, montant_cents, nature, source,
     compte_id, enveloppe_id, regularise_annee)
  select foyer, la_charge, mois_ci,
         nom_charge || ' — régularisation ' || annee,
         ecart::integer, 'connue', 'manuel', c.compte_id, c.enveloppe_id, annee
  from public.charge c where c.id = la_charge
  returning id into ligne;

  insert into public.depense_part
    (depense_id, user_profile_id, household_id, part_cents, part_bps)
  with porte as (
    select v.user_profile_id as uid, v.porte_cents
    from public.provisions_de(la_charge, annee) v
    join public.user_profile p on p.id = v.user_profile_id
    where p.household_id = foyer
  ),
  brut as (
    select uid, porte_cents,
           case when ecart < 0 then -1 else 1 end as signe,
           abs(ecart) * porte_cents / porte_ici as base,
           (porte_cents * 10000) / porte_ici as bps_base,
           row_number() over (
             order by (abs(ecart) * porte_cents) % porte_ici desc,
                      md5(uid::text || ligne::text)) as rang,
           row_number() over (
             order by (porte_cents * 10000) % porte_ici desc,
                      md5(uid::text || ligne::text)) as rang_bps
    from porte
  ),
  manque as (
    select abs(ecart) - coalesce(sum(base), 0) as cents,
           10000 - coalesce(sum(bps_base), 0) as bps
    from brut
  )
  select ligne, b.uid, foyer,
         ((b.base + case when b.rang <= (select cents from manque) then 1 else 0 end)
          * b.signe)::integer,
         (b.bps_base + case when b.rang_bps <= (select bps from manque) then 1 else 0 end)::integer
  from brut b;

  update public.depense set nature = 'connue'
  where charge_id = la_charge and source = 'modele'
    and household_id = foyer
    and extract(year from mois) = annee;

  return ligne;
end $$;

revoke execute on function public.regularise_annuel(uuid, integer, integer) from public, anon;
grant   execute on function public.regularise_annuel(uuid, integer, integer)
  to authenticated, service_role;

-- ── 4 · Une dépense confirmée ne se supprime pas à la main ──────────────────
--
-- 0065 a retiré les policies d'écriture sur `depense_part` pour que les parts
-- figées ne se réécrivent pas. La grande porte restait ouverte : `delete from
-- depense` efface la dépense ET ses parts en cascade, `ouvre_le_mois` la
-- recrée, et le partage est réécrit. Éprouvé sur une dépense confirmée ET
-- réglée : 2 parts → 0, puis 101 000 confirmée redevient 100 000 non
-- confirmée.
--
-- ⚠️ C'est la POLICY qu'on resserre, pas un trigger. Une policy de DELETE
-- filtre les lignes supprimables en regardant leur contenu — ce qu'une policy
-- sait faire — et elle ne s'applique NI aux cascades (la suppression du foyer
-- par `delete_my_account` reste possible), NI aux fonctions `security definer`
-- du propriétaire. `corrige_la_charge` continue donc de refaire les mois non
-- confirmés, ce qui est exactement sa raison d'être.
drop policy if exists depense_delete on public.depense;
create policy depense_delete on public.depense for delete to authenticated
  using (household_id = public.current_household()
         and confirme_le is null
         and regle_le is null);
