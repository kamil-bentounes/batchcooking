-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUE 0044 DISAIT DE TROP, ET CE QU'IL DISAIT DE TRAVERS
--
-- Aucune régression : les parcours écrivent tous comme avant. Mais trois
-- choses à reprendre, et la première est un vrai défaut.
--
--  · `tg_meme_foyer` ne regardait pas si la colonne CHANGE. Toute écriture sur
--    une ligne déjà en infraction était donc refusée — y compris celle qui la
--    réparerait. En production, une ligne croisée héritée d'une faille fermée
--    depuis devenait intouchable pour son propre foyer. C'est aussi ce qui a
--    rendu tautologique le test des rayons : cocher l'article devenait
--    impossible, donc l'apprentissage ne tournait plus, donc le test ne
--    prouvait plus rien tout en restant vert.
--  · trois couples de la même classe étaient restés dehors.
--  · deux commentaires décrivaient un mécanisme qui n'existe pas. Un
--    commentaire qui promet une garantie inexistante est pire que pas de
--    commentaire : c'est ce qui fait supprimer un jour une sécurité qu'on croit
--    redondante.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * On vérifie quand le rattachement BOUGE, pas à chaque écriture.
 *
 * Deux façons de créer une incohérence : déplacer le pointeur, ou déplacer la
 * ligne. Les deux sont regardées. Le reste du temps on laisse passer — une
 * ligne déjà croisée, posée par le rôle de service ou héritée d'une faille
 * ancienne, doit rester réparable par celui à qui elle appartient.
 *
 * ⚠️ Ce trigger vérifie une COHÉRENCE, il n'ancre rien : sur treize des seize
 *    couples il n'y a aucun trigger de dérivation, donc `new.household_id` vient
 *    entièrement du client et l'on compare deux valeurs que l'appelant contrôle.
 *    Ce qui ANCRE la ligne à son foyer reste la policy — et, plus exactement, la
 *    policy de LECTURE, que PostgreSQL applique aussi à la ligne nouvelle lors
 *    d'un UPDATE. Le commentaire de 0044 laissait croire l'inverse.
 */
create or replace function public.tg_meme_foyer()
returns trigger language plpgsql security definer set search_path = public as $$
declare colonne text := tg_argv[0];
        parente text := tg_argv[1];
        vise uuid;
        jadis uuid;
        foyer uuid;
begin
  if public.is_service_role() then return new; end if;

  execute format('select ($1).%I', colonne) into vise using new;
  if vise is null then return new; end if;

  if tg_op = 'UPDATE' then
    execute format('select ($1).%I', colonne) into jadis using old;
    -- Rien n'a bougé, ni le pointeur ni la ligne : ce n'est pas notre affaire.
    if vise is not distinct from jadis
       and new.household_id is not distinct from old.household_id then
      return new;
    end if;
  end if;

  execute format('select household_id from public.%I where id = $1', parente)
    into foyer using vise;
  if foyer is null or foyer is distinct from new.household_id then
    raise exception '% désigne quelque chose qui n''est pas au foyer', colonne
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

-- ── Les trois couples restés dehors ─────────────────────────────────────────
-- `receipt_line.shopping_item_id` se croisait encore, prouvé. Sans escalade —
-- `tg_receipt_line_apprend` filtre sur le foyer, et il n'y a pas d'index unique
-- donc pas de préemption possible — mais c'est le motif que 0044 prétendait
-- fermer une fois pour toutes.
--
-- `portion_event` reste dehors, et c'est délibéré : la table n'a AUCUNE policy
-- d'écriture, elle n'est remplie que par des triggers `security definer`. Il n'y
-- a pas de chemin client à garder.
do $$
declare l text[];
begin
  foreach l slice 1 in array array[
    ['receipt_line',     'shopping_item_id', 'shopping_item'],
    ['nutrition_target', 'user_profile_id',  'user_profile']
  ] loop
    execute format('drop trigger if exists %I on public.%I',
                   'z_' || l[2] || '_meme_foyer', l[1]);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.tg_meme_foyer(%L, %L)',
      'z_' || l[2] || '_meme_foyer', l[1], l[2], l[3]);
  end loop;
end $$;

/*
 * ⚠️ `session_task.assignee_id` est volontairement HORS de la liste.
 *
 *    C'est le seul rattachement qui doit traverser les foyers : un convive
 *    prend un geste chez son hôte, et la ligne désigne donc quelqu'un d'un
 *    autre foyer que le sien. C'est toute la fonctionnalité. Ce qui l'encadre
 *    est `tg_session_task_convive` — on ne prend un geste que pour soi, et que
 *    s'il n'est à personne.
 *
 * ⚠️ `tg_session_task_ancree` n'exempte pas le rôle de service, et c'est
 *    assumé : un geste ne change pas de session, même pour un script. La
 *    conséquence est réelle — une restauration côté serveur ne peut pas
 *    déplacer un geste, il faut le réécrire. Le plan se réenregistre en entier
 *    de toute façon (`useEnregistrePlan` supprime puis réinsère).
 *
 *    En revanche l'ORDRE des triggers sur `session_task` n'est PAS porteur,
 *    contrairement à ce qu'annonçait 0044. `tg_session_task_convive` ne lève
 *    pas quand la ligne part du cycle de l'appelant : il rend `new`. Donc
 *    `ancree` s'exécute de toute façon, avant ou après, et seul le message
 *    d'erreur change. Personne ne doit croire qu'un renommage désarmerait une
 *    sécurité — ni, à l'inverse, que l'ordre en garantit une.
 */
