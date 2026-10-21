-- ═══════════════════════════════════════════════════════════════════════════
-- 0114 · La migration des données du budget (§ 5)
--
-- Sur la prod du 01/10/2026 : un foyer, un membre, un compte actif « Kamil CA »,
-- un revenu de 4 325 €. Elle tourne sans `auth.uid()` : elle n'ouvre aucun mois.
-- `ouvre_le_mois` est idempotente et ajoute à la prochaine ouverture les lignes
-- qui manquent — celles des enveloppes devenues charges.
--
-- Se déploie avec 0093 à 0113 dans UNE transaction (voir « Déploiement »).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Les arrêts : rien ne s'écrit si la donnée n'est pas celle qu'on a vue ──
do $$
declare n integer;
begin
  select count(*) into n from public.releve_annuel r
  where r.reel_cents = 0 and r.saisi_par is null;
  if n > 0 then
    raise exception 'Migration arrêtée : % relevé(s) à 0 € sans auteur — la trace que 0078 a posée pour les régularisations d''avant, qui ne dit pas ce qui a été payé.', n;
  end if;
  select count(*) into n from public.releve_annuel r where r.reel_cents < 0;
  if n > 0 then
    raise exception 'Migration arrêtée : % relevé(s) négatif(s), qu''une facture refuse.', n;
  end if;
  /* Une ligne réglée ou confirmée garde la façon de sa naissance, que rien n'a
     gardée : l'assurance à 100 € par mois confirmée en septembre, passée ensuite
     à 1 200 € par an, recevrait `mis_de_cote`, et décembre rendrait 100 € déjà
     payés. En prod, le 01/10 : 0 ligne sur 36. */
  select count(*) into n
  from public.depense d join public.charge c on c.id = d.charge_id
  where d.source = 'modele' and (d.confirme_le is not null or d.regle_le is not null)
    and c.periodicite <> 'mensuel';
  if n > 0 then
    raise exception 'Migration arrêtée : % ligne(s) réglée(s) ou confirmée(s) d''une charge non mensuelle.', n;
  end if;
end $$;

-- ── 2 · La façon de chaque charge ──────────────────────────────────────────
update public.charge c set mode = case
  when c.periodicite <> 'mensuel' then 'mis_de_cote'
  when c.enveloppe_id is not null then 'au_fil'
  when c.variable then 'facture'
  else 'fixe' end;
/* L'essence et le péage se dépensent au fil du mois ; l'électricité et le gaz du
   catalogue sont des factures du mois. */
update public.charge c set mode = 'au_fil'
where c.periodicite = 'mensuel' and c.mode = 'fixe'
  and lower(c.libelle) ~ '^(essence|carburant|péages?|parking|stationnement)';
update public.charge c set mode = 'facture'
from public.catalogue_charge k
where k.id = c.catalogue_id and c.periodicite = 'mensuel' and c.mode = 'fixe'
  and k.libelle in ('Électricité', 'Gaz');
/* Chaque ligne `modele` reçoit la façon de sa charge, tous mois confondus. C'est
   juste pour une ligne ni réglée ni confirmée — `corrige_la_charge` refait
   toujours celles-là avec la charge —, et les arrêts ont écarté les autres cas
   qui seraient faux. Les ajustements gardent `facon` à null. */
update public.depense d set facon = c.mode
from public.charge c
where c.id = d.charge_id and d.source = 'modele' and d.facon is null;

-- ── 3 · La catégorie ────────────────────────────────────────────────────────
update public.charge c
   set categorie = coalesce(public.categorie_de_l_article(c.catalogue_id), 'autre')
 where c.catalogue_id is not null;
/* Sans article : `auto` si un MOT du libellé parle de voiture (« Entretien
   Auto », « LOA ») ; sinon `autre`. Un mot entier, pas une sous-chaîne :
   « autre » contient « aut… ». */
update public.charge c set categorie = 'auto'
where c.catalogue_id is null
  and lower(c.libelle) ~ '\m(auto|voiture|essence|carburant|péages?|parking|stationnement|garage|loa)\M';

-- ── 4 · Les enveloppes sans charge deviennent des lignes au fil du mois ─────
do $$
declare
  e record;
  article uuid;
  portee text;
  est_commune boolean;
  le_compte uuid;
  titulaire uuid;
  nouvelle uuid;
begin
  for e in
    select x.id, x.household_id, x.libelle, x.plafond_cents
    from public.enveloppe x
    where x.archive_le is null
      and not exists (select 1 from public.charge c
                      where c.enveloppe_id = x.id and c.archive_le is null)
      /* Une enveloppe qui fait doublon avec une charge est retirée : « Essence
         ou recharge », doublon d'Essence. Les enveloppes ne sont pas supprimées. */
      and not exists (select 1 from public.charge c
                      where c.household_id = x.household_id and c.archive_le is null
                        and (position(lower(c.libelle) in lower(x.libelle)) > 0
                             or position(lower(x.libelle) in lower(c.libelle)) > 0))
    order by x.household_id, x.libelle
  loop
    select k.id, k.portee into article, portee
    from public.catalogue_charge k where lower(k.libelle) = lower(e.libelle)
    order by k.ordre limit 1;
    est_commune := coalesce(portee = 'commun', true);
    /* Le compte des autres charges du foyer, s'il n'y en a qu'un. Sans compte,
       `virements()` afficherait « 110 € à répartir » à un foyer d'une personne. */
    le_compte := null;
    select min(c.compte_id::text)::uuid into le_compte from public.charge c
    where c.household_id = e.household_id and c.archive_le is null and c.compte_id is not null
    having count(distinct c.compte_id) = 1;

    insert into public.charge (household_id, catalogue_id, libelle, montant_cents, periodicite,
                               mode, categorie, commun, compte_id, debut)
    values (e.household_id, article, e.libelle, e.plafond_cents, 'mensuel', 'au_fil',
            coalesce(public.categorie_de_l_article(article), 'vie_courante'), est_commune,
            le_compte,
            /* Le mois du déploiement : déployée en novembre, la migration ne
               change pas octobre après coup. */
            public.mois_courant())
    returning id into nouvelle;

    if est_commune then
      insert into public.charge_participant (charge_id, user_profile_id, household_id)
      select nouvelle, up.id, e.household_id
      from public.user_profile up where up.household_id = e.household_id;
    else
      /* Perso : le titulaire du seul compte perso actif ; sinon tout le foyer. */
      titulaire := null;
      select min(k.titulaire_id::text)::uuid into titulaire from public.compte k
      where k.household_id = e.household_id and k.genre = 'perso' and k.archive_le is null
      having count(*) = 1;
      insert into public.charge_participant (charge_id, user_profile_id, household_id)
      select nouvelle, up.id, e.household_id
      from public.user_profile up
      where up.household_id = e.household_id and (titulaire is null or up.id = titulaire);
    end if;
  end loop;
end $$;

-- ── 5 · La nature des lignes non confirmées, du mois en cours et après ─────
update public.depense d
   set nature = case when d.facon <> 'fixe' then 'estimee' else 'connue' end
 where d.source = 'modele' and d.confirme_le is null and d.regle_le is null
   and d.facon in ('fixe', 'facture', 'au_fil')
   and d.mois >= public.mois_courant();

-- ── 6 · Chaque relevé devient une facture ; il ne marque plus que l'année soldée ──
update public.releve_annuel r set prevu_cents = r.reel_cents::bigint - r.ecart_cents
where r.prevu_cents is null;
insert into public.facture (id, household_id, charge_id, annee, paye_le, montant_cents,
                            origine, saisi_par, created_at)
select gen_random_uuid(), r.household_id, r.charge_id, r.annee, r.saisi_le::date,
       r.reel_cents, 'releve', r.saisi_par, r.saisi_le
from public.releve_annuel r
where not exists (select 1 from public.facture f
                  where f.charge_id = r.charge_id and f.annee = r.annee and f.origine = 'releve');
alter table public.releve_annuel alter column prevu_cents set not null;

-- ── 7 · Les saisies d'amorce ────────────────────────────────────────────────
/* Sans elles, la clôture de septembre dirait « Rien de déclaré », et un ticket
   oublié de 20 € remplacerait les 800 € confirmés. */
insert into public.saisie (id, household_id, depense_id, fait_le, montant_cents, source, saisi_par)
select gen_random_uuid(), d.household_id, d.id,
       (d.mois + interval '1 month - 1 day')::date, d.montant_cents, 'manuel', null
from public.depense d
where d.source = 'modele' and d.facon = 'au_fil' and d.confirme_le is not null
  and d.montant_cents > 0
  and not exists (select 1 from public.cloture k
                  where k.household_id = d.household_id and k.mois = d.mois)
  and not exists (select 1 from public.saisie s where s.depense_id = d.id);

-- ── Les contraintes, en dernier ────────────────────────────────────────────
alter table public.charge drop constraint if exists charge_mode_periodicite;
alter table public.charge add constraint charge_mode_periodicite
  check ((mode = 'mis_de_cote') = (periodicite <> 'mensuel'));
/* Sans elle, une ligne née sans façon passerait pour un ajustement et
   sauterait les étapes 2 et 3 de la clôture. */
alter table public.depense drop constraint if exists depense_modele_a_une_facon;
alter table public.depense add constraint depense_modele_a_une_facon
  check (source <> 'modele' or facon is not null);
