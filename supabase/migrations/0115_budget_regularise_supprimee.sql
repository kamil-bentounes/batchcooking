-- ═══════════════════════════════════════════════════════════════════════════
-- 0115 · `regularise_annuel` s'en va (lot 3)
--
-- Elle ne faisait plus que refuser depuis 0113, pour le seul ancien paquet que
-- le service worker servait au premier chargement après le budget refait. Il a
-- été servi ; plus rien ne l'appelle.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.regularise_annuel(uuid, integer, integer);
