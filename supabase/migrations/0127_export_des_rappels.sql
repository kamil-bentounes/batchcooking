-- ═══════════════════════════════════════════════════════════════════════════
-- 0127 · L'EXPORT RGPD CONNAÎT LES RAPPELS
--
-- `rappel_reglage` (ce que la personne a activé) et `rappel_envoye` (l'historique de ses mails) sont des données
-- personnelles : elles figurent dans son export. Elles ne portent pas `household_id` (le test `tables_de_foyer` ne
-- les réclame donc pas) : l'export les filtre sur `auth.uid()`, ses lignes seulement, jamais celles de l'autre membre.
-- `rappel_passe` (journal des passages, sans adresse ni contenu, sans lien avec une personne) n'en fait pas partie.
--
-- La définition est celle de 0124, telle quelle, plus deux clés. Même `security definer`, même `search_path`, mêmes
-- `revoke` / `grant`. `auth.uid()` lit les revendications du jeton, que `security definer` ne change pas.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.export_my_data()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with hh as (select public.current_household() as id)
  select public.export_my_data_base() || jsonb_build_object(
    'weighing',            (select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
                            from public.weighing w, hh where w.household_id = hh.id),
    'household_unit_weight', (select coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
                            from public.household_unit_weight u, hh where u.household_id = hh.id),
    'household_ingredient_resolution', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                            from public.household_ingredient_resolution r, hh
                            where r.household_id = hh.id),
    'foyer_ami',           (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                            from public.foyer_ami a, hh
                            where a.invite_par = hh.id or a.accepte_par = hh.id),
    'recipes',             (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                            from public.recipe r, hh where r.owner_household_id = hh.id),
    'session_convives',    (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                            from public.session_convive s, hh
                            where s.hote_id = hh.id or s.invite_id = hh.id),
    -- Budget, lot 1
    'comptes',             (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
                            from public.compte c, hh where c.household_id = hh.id),
    'revenus',             (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
                            from public.revenu v, hh where v.household_id = hh.id),
    'regles_partage',      (select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
                            from public.regle_partage g, hh where g.household_id = hh.id),
    -- Budget, lot 2
    'charges',             (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
                            from public.charge c, hh where c.household_id = hh.id),
    'charge_participants', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                            from public.charge_participant p, hh where p.household_id = hh.id),
    'depenses',            (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
                            from public.depense d, hh where d.household_id = hh.id),
    'depense_parts',       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
                            from public.depense_part x, hh where x.household_id = hh.id),
    -- Budget, lot 3
    'enveloppes',          (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
                            from public.enveloppe e, hh where e.household_id = hh.id),
    'poches_epargne',      (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
                            from public.poche_epargne p, hh where p.household_id = hh.id),
    'poche_postes',        (select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
                            from public.poche_poste q, hh where q.household_id = hh.id),
    'versements_epargne',  (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb)
                            from public.versement_epargne v, hh where v.household_id = hh.id),
    /* Une table de plus, une ligne de plus ici. Le test RGPD compare la liste
       des tables portant `household_id` à ce que l'export rend : c'est lui qui
       a rappelé `releve_annuel`, pas moi. */
    'releves_annuels',     (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
                            from public.releve_annuel r, hh where r.household_id = hh.id),
    -- Budget refait (0097)
    'saisies',             (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
                            from public.saisie s, hh where s.household_id = hh.id),
    'factures',            (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
                            from public.facture f, hh where f.household_id = hh.id),
    'clotures',            (select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
                            from public.cloture k, hh where k.household_id = hh.id),
    'cloture_choix',       (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
                            from public.cloture_choix c, hh where c.household_id = hh.id),
    -- L'aide intégrée (0118) : ce qu'on a signalé faux
    'aide_signalements',   (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                            from public.aide_signalement a, hh where a.household_id = hh.id),
    -- Nos aliments (0124) : ce que le foyer mange, avec ses vraies valeurs
    'aliments',            (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
                            from public.aliment a, hh where a.household_id = hh.id),
    -- Les rappels par mail (0126) : ses réglages, et l'historique de ses mails. Les siens SEULS : `rappel_reglage`
    -- et `rappel_envoye` n'ont pas de foyer, un membre ne voit pas ce que l'autre a activé ni reçu.
    'rappel_reglages',     (select coalesce(jsonb_agg(to_jsonb(r) order by r.type), '[]'::jsonb)
                            from public.rappel_reglage r where r.user_id = auth.uid()),
    'rappels_envoyes',     (select coalesce(jsonb_agg(to_jsonb(e) order by e.envoye_le, e.type, e.cle), '[]'::jsonb)
                            from public.rappel_envoye e where e.user_id = auth.uid())
  )
$function$;

revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
