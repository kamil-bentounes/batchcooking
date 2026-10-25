-- ═══════════════════════════════════════════════════════════════════════════
-- 0119 · Une session interrompue se reprend d'après le jour où elle a COMMENCÉ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Le 25/10/2026, Kamil arrive à 30 actions sur 34 et touche « Interrompre » pour dire
-- « c'est fini ». L'accueil ne lui propose ensuite aucune reprise : `cycle_a_reprendre`
-- (0117) ne regardait que la SEMAINE du plan, et la sienne datait du 21 septembre — le
-- cycle avait été ouvert le 18/09 et cuisiné le 25/10. Ses 30 parts n'atteignaient jamais
-- le dressage.
--
-- La règle reste celle de 0117 (« un plan d'il y a un mois ne se reprend pas »), mais
-- l'âge d'une session se lit aussi à son départ : une session commencée ces sept derniers
-- jours se reprend, quelle que soit la semaine de son plan.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.cycle_a_reprendre()
returns uuid language sql security definer set search_path = public, pg_temp as $$
  select id from public.cycle
  where household_id = public.current_household()
    and state = 'interrompue'
    and (week_of >= (date_trunc('week', public.aujourdhui()) - interval '7 days')::date
         or started_at >= public.maintenant() - interval '7 days')
  order by coalesce(started_at, created_at) desc, week_of desc
  limit 1
$$;
revoke execute on function public.cycle_a_reprendre() from public, anon;
grant   execute on function public.cycle_a_reprendre() to authenticated, service_role;
