-- ═══════════════════════════════════════════════════════════════════════════
-- 0096 · La façon de payer d'une charge, et sa catégorie (§ 4.1)
--
-- Quatre façons : fixe, facture du mois, au fil du mois, mise de côté (D75).
-- La catégorie appartient à la CHARGE, pas au catalogue : elle en vient par
-- défaut, et se change dans « Mes charges » (D74).
--
-- Chaque ligne du mois fige sa façon à sa naissance (`depense.facon`), comme
-- son prévu. Sans cela, une ligne confirmée d'un mois ouvert changerait de
-- règle avec sa charge : des Courses de septembre à 820 € déclarés, passées en
-- fixe le 2 octobre, se clôtureraient à 800 €, et 20 € disparaîtraient.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.charge
  add column if not exists mode text not null default 'fixe',
  add column if not exists categorie text not null default 'autre';
alter table public.charge drop constraint if exists charge_mode_check;
alter table public.charge add constraint charge_mode_check
  check (mode in ('fixe', 'facture', 'au_fil', 'mis_de_cote'));
alter table public.charge drop constraint if exists charge_categorie_check;
alter table public.charge add constraint charge_categorie_check
  check (categorie in ('vie_courante', 'maison', 'credits', 'auto',
                       'abonnements', 'sante', 'impots', 'autre'));
/* `(mode = 'mis_de_cote') = (periodicite <> 'mensuel')` n'est PAS posée ici :
   les charges annuelles existantes valent encore `fixe` jusqu'à la migration
   des données (0114), qui la pose en dernier. */

alter table public.depense add column if not exists facon text;
alter table public.depense drop constraint if exists depense_facon_check;
alter table public.depense add constraint depense_facon_check
  check (facon in ('fixe', 'facture', 'au_fil', 'mis_de_cote'));
comment on column public.depense.facon is
  'La façon de la LIGNE, figée à sa naissance (charge.mode ce jour-là). NULL : un '
  'ajustement. La clôture, la garde des saisies et l''écran lisent celle-ci, jamais '
  'celle de la charge.';

/* Le prévu de l'année, FIGÉ au moment du solde. Sans lui, le prévu se relisait
   sur les lignes vivantes, qu'un retrait faisait changer, et l'aperçu « les
   320 € s'ajoutent » mentait. Nullable jusqu'à 0114, qui le remplit. */
alter table public.releve_annuel add column if not exists prevu_cents bigint;
comment on column public.releve_annuel.prevu_cents is
  'Le prévu de l''année au moment où elle a été soldée. Ne bouge plus : seul '
  '`corrige_le_releve` change `reel_cents` et `ecart_cents`.';

/* La catégorie d'un article : sa section, sauf la résidence, qui est la
   maison — le toit qu'on paie, pas un crédit parmi d'autres. */
create or replace function public.categorie_de_l_article(article uuid)
returns text language sql stable set search_path = public, pg_temp as $$
  select case
           when k.libelle = 'Crédit immobilier — résidence' then 'maison'
           when k.section = 'Logement'     then 'maison'
           when k.section = 'Vie courante' then 'vie_courante'
           when k.section = 'Auto'         then 'auto'
           when k.section = 'Crédits'      then 'credits'
           when k.section = 'Abonnements'  then 'abonnements'
           when k.section = 'Santé'        then 'sante'
           when k.section = 'Impôts'       then 'impots'
           else 'autre'
         end
  from public.catalogue_charge k where k.id = article
$$;
revoke execute on function public.categorie_de_l_article(uuid) from public, anon;
grant execute on function public.categorie_de_l_article(uuid) to authenticated, service_role;

/*
 * La garde de `charge`.
 *
 * `security invoker` : en `definer`, `current_user` vaudrait le propriétaire et
 * le refus au client ne jouerait jamais.
 */
create or replace function public.tg_charge_garde()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare plancher date;
begin
  /* ── 1 · Ce que le client ne change pas lui-même ───────────────────────────
     La policy `charge_update` ouvre toutes les colonnes. Un `update` direct du
     montant laissait la ligne d'octobre à 800 € sous une charge à 850 € : ces
     changements passent par `corrige_la_charge`, qui refait les lignes et
     rattache les saisies. On juge ce que le client ENVOIE, avant la
     normalisation plus bas : une enveloppe que l'ancien paquet rattache change
     encore la façon par la règle 3. */
  if tg_op = 'UPDATE' and current_user = 'authenticated' then
    if new.montant_cents is distinct from old.montant_cents
       or new.periodicite is distinct from old.periodicite
       or new.mode is distinct from old.mode
       or new.variable is distinct from old.variable
       or new.cle is distinct from old.cle
       or new.debut is distinct from old.debut
       or new.fin is distinct from old.fin
       or new.commun is distinct from old.commun then
      raise exception 'Ce changement passe par « Corriger » : il refait les mois de la charge.'
        using errcode = 'insufficient_privilege';
    end if;
    /* Seul `retire_charge` archive. Archiver en direct une charge à 580 €
       laissait sa ligne du mois ; la recréer comptait les deux. */
    if new.archive_le is distinct from old.archive_le then
      raise exception 'Une charge se retire par « Retirer ».'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  /* ── 2 · La date de départ ──────────────────────────────────────────────
     Pas avant le 1er janvier de l'année précédente, comme une facture : au-delà,
     on reconstruirait des années que personne n'a suivies. Pour tous, clé de
     service comprise. Une charge plus ancienne qui ne change pas de date reste
     modifiable. */
  if tg_op = 'INSERT' or new.debut is distinct from old.debut then
    plancher := make_date(extract(year from public.aujourdhui())::integer - 1, 1, 1);
    if new.debut < plancher then
      raise exception 'Une charge ne part pas d''avant le % : Popote ne suivait rien avant.',
        to_char(plancher, 'DD/MM/YYYY') using errcode = 'check_violation';
    end if;
  end if;

  /* ── 3 · La façon, déduite pour l'ancien paquet ────────────────────────
     Le paquet que sert le service worker au premier chargement ne connaît ni
     `mode` ni `categorie`. Il écrit `periodicite`, `variable` et
     `enveloppe_id` : la façon s'en déduit, et son « Électricité, variable,
     50 € » devient une facture du mois. */
  if new.periodicite <> 'mensuel' then
    new.mode := 'mis_de_cote';
  elsif new.mode = 'mis_de_cote' then
    new.mode := case when new.enveloppe_id is not null then 'au_fil'
                     when new.variable then 'facture' else 'fixe' end;
  elsif new.mode = 'fixe'
        and (tg_op = 'INSERT'
             or ((new.variable is distinct from old.variable
                  or new.enveloppe_id is distinct from old.enveloppe_id)
                 and new.mode is not distinct from old.mode)) then
    /* À la modification, seulement quand `variable` ou `enveloppe_id` changent
       sans que `mode` change : seul l'ancien paquet écrit encore ces colonnes.
       `corrige_la_charge` qui passe des Courses en fixe les y laisse. */
    if new.enveloppe_id is not null then new.mode := 'au_fil';
    elsif new.variable then new.mode := 'facture';
    end if;
  end if;

  /* ── 4 · La catégorie d'un article du catalogue ──────────────────────── */
  if tg_op = 'INSERT' and new.categorie = 'autre' and new.catalogue_id is not null then
    new.categorie := coalesce(public.categorie_de_l_article(new.catalogue_id), 'autre');
  end if;
  return new;
end $$;

drop trigger if exists tg_charge_garde on public.charge;
create trigger tg_charge_garde before insert or update on public.charge
  for each row execute function public.tg_charge_garde();
