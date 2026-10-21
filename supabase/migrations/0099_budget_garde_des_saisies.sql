-- ═══════════════════════════════════════════════════════════════════════════
-- 0099 · La garde des saisies (§ 4.2)
--
-- `security invoker` : elle juge le client par `current_user`. En `definer`,
-- elle ne refuserait jamais rien.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.tg_saisie_garde()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  la_ligne record;
  deja bigint;
begin
  /* ── Ce que mène une clé étrangère passe, et cela seul. Testé EN PREMIER :
        sans ces deux cas, `delete_my_account` échouait sur un mois clôturé (le
        piège de 0053), et « Retirer » en pleine cascade, la ligne étant déjà
        partie. `pg_trigger_depth()` ne suffit pas : l'écriture faite par le
        trigger d'une autre table, comme demain les tickets (D67), arrive elle
        aussi à la profondeur 2. ─────────────────────────────────────────── */
  if tg_op = 'DELETE' then
    -- La cascade depuis `depense` ou `household` : la ligne ou le foyer n'est plus visible.
    if not exists (select 1 from public.depense d where d.id = old.depense_id)
       or not exists (select 1 from public.household h where h.id = old.household_id) then
      return old;
    end if;
    -- Sous le propriétaire (delete_my_account, retire_charge), on ne juge pas une suppression.
    if current_user <> 'authenticated' then return old; end if;
    if exists (select 1 from public.cloture k
               where k.household_id = old.household_id
                 and k.mois = date_trunc('month', old.fait_le)::date) then
      raise exception '% est clôturé : reviens dessus pour retirer cette dépense.',
        initcap(public.nom_du_mois(old.fait_le)) using errcode = 'check_violation';
    end if;
    return old;
  end if;

  /* Le compte de l'auteur vient d'être supprimé : `on delete set null`. Seul cas
     où `saisi_par` change : un membre ne peut pas effacer ainsi l'auteur des
     saisies de l'autre. */
  if tg_op = 'UPDATE'
     and new.saisi_par is null and old.saisi_par is not null
     and (to_jsonb(new) - 'saisi_par') = (to_jsonb(old) - 'saisi_par')
     and not exists (select 1 from public.user_profile u where u.id = old.saisi_par) then
    return new;
  end if;

  /* ── L'idempotence, AVANT toute autre règle. Un renvoi du même id après une
        coupure est un succès sans effet : le front traite 23505 comme réussi.
        Sinon, un renvoi arrivé après la clôture serait refusé « mois clôturé »,
        ressaisi après « Revenir dessus », et 50 € compteraient deux fois. ── */
  if tg_op = 'INSERT' and exists (select 1 from public.saisie s where s.id = new.id) then
    raise exception 'Cette dépense est déjà enregistrée.' using errcode = 'unique_violation';
  end if;

  if tg_op = 'UPDATE' and current_user = 'authenticated'
     and new.saisi_par is distinct from old.saisi_par then
    raise exception 'L''auteur d''une dépense ne se change pas.'
      using errcode = 'insufficient_privilege';
  end if;

  /* La provenance appartient au serveur. La policy ne borne que le foyer : sans
     ceci, un client réétiquetait sa saisie `banque` ou `courses` (un faux
     « venu de la banque » que rien ne distingue d'un vrai), ou lui donnait une
     `reference_externe` qui ferait refuser la vraie plus tard (l'unicité du
     foyer). Sous le propriétaire (la synchro bancaire de demain, la clé de
     service), rien n'est jugé. */
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' and (new.source <> 'manuel' or new.reference_externe is not null) then
      raise exception 'La provenance d''une dépense ne se choisit pas.'
        using errcode = 'insufficient_privilege';
    end if;
    if tg_op = 'UPDATE' and (new.id is distinct from old.id
        or new.source is distinct from old.source
        or new.reference_externe is distinct from old.reference_externe
        or new.created_at is distinct from old.created_at
        or new.household_id is distinct from old.household_id) then
      raise exception 'La provenance, l''identifiant et la date de création d''une dépense ne se changent pas.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  /* ── La ligne : une ligne du générateur, au fil du mois PAR SA FAÇON — celle
        de la ligne, jamais celle de la charge (§ 4.1). ───────────────────── */
  select d.source, d.facon, d.mois, d.household_id into la_ligne
  from public.depense d where d.id = new.depense_id;
  if not found then
    raise exception 'Cette dépense n''a pas de ligne dans ce mois.'
      using errcode = 'foreign_key_violation';
  end if;
  if la_ligne.source <> 'modele' or la_ligne.facon is distinct from 'au_fil' then
    raise exception 'Cette ligne ne se déclare pas au fil du mois.'
      using errcode = 'check_violation';
  end if;
  if date_trunc('month', new.fait_le)::date <> la_ligne.mois then
    raise exception 'Une dépense se date dans le mois de sa ligne.'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.cloture k
             where k.household_id = la_ligne.household_id and k.mois = la_ligne.mois) then
    raise exception '% est clôturé : reviens dessus pour y déclarer une dépense.',
      initcap(public.nom_du_mois(la_ligne.mois)) using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.cloture k
      where k.household_id = old.household_id
        and k.mois = date_trunc('month', old.fait_le)::date) then
    raise exception '% est clôturé : reviens dessus pour changer cette dépense.',
      initcap(public.nom_du_mois(old.fait_le)) using errcode = 'check_violation';
  end if;

  /* La somme de la ligne ne dépasse pas 1 000 000 € : `confirme_la_ligne` la
     refuserait, et toute la clôture avec (deux fautes de frappe de 999 999 €
     sur les Courses). */
  select coalesce(sum(s.montant_cents), 0) into deja
  from public.saisie s where s.depense_id = new.depense_id and s.id <> new.id;
  if deja + new.montant_cents > 100000000 then
    raise exception 'Plus d''un million d''euros sur cette ligne : vérifie les montants.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists tg_saisie_garde on public.saisie;
create trigger tg_saisie_garde before insert or update or delete on public.saisie
  for each row execute function public.tg_saisie_garde();
