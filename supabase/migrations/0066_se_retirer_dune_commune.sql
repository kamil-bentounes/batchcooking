-- ═══════════════════════════════════════════════════════════════════════════
-- 0066 · Se retirer d'une charge commune redevient possible
--
-- 0065 §5 l'interdisait : « se retirer d'une charge COMMUNE est une décision à
-- deux ». L'intention était juste, la garde était fausse, et elle a cassé DEUX
-- choses sans qu'aucun test ne bronche :
--
--   1. Le bouton « Changer qui participe » — le seul écran qui écrit dans
--      `charge_participant` — mourait en silence sur toute charge commune.
--      Douze des quinze charges d'un foyer le sont. Le bouton n'a jamais
--      fonctionné depuis que la garde existe.
--   2. `delete_my_account()`. La cascade `user_profile → charge_participant`
--      supprime la ligne du partant sur chaque charge commune ; le trigger la
--      voyait comme un retrait unilatéral et levait. La suppression de compte
--      RGPD était morte, et les deux tests qui la couvrent restaient verts
--      parce que leurs foyers n'ont aucune charge commune.
--
-- Ce foyer compte deux personnes, pas un conseil d'administration : la décision
-- se prend à voix haute, pas dans une contrainte. Ce qui manquait n'était pas
-- un verrou mais la VISIBILITÉ — la liste dit qui participe, et le mois se
-- refige derrière. C'est le front qui portait le défaut : il supprimait TOUS
-- les participants pour en reposer deux, sa propre ligne comprise.
--
-- Ce qui reste interdit ne change pas : écrire une part, désigner quelqu'un
-- d'un autre foyer, toucher un mois déjà réglé.
-- ═══════════════════════════════════════════════════════════════════════════

drop trigger if exists tg_participant_commun on public.charge_participant;
drop function if exists public.tg_participant_commun();

-- ── Ce qu'on a failli retirer en même temps ────────────────────────────────
--
-- Une revue a signalé `depense_part_update` comme une policy morte, au motif
-- que `tg_part_figee` refuse de toute façon tout UPDATE hors rôle de service.
-- C'est l'inverse : c'est elle qui laisse la ligne ATTEINDRE le trigger, donc
-- son message. Retirée, le refus devient un silence — zéro ligne modifiée,
-- aucune erreur, et l'appelant croit avoir réussi. Elle reste.
