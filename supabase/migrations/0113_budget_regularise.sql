-- ═══════════════════════════════════════════════════════════════════════════
-- 0113 · `regularise_annuel` ne fait plus que refuser
--
-- Elle garde sa signature : l'ancien paquet que sert le service worker au
-- premier chargement peut encore l'appeler. Elle n'écrit plus rien. Le lot 3 la
-- supprime (0115).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.regularise_annuel(la_charge uuid, annee integer, reel_cents integer)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  raise exception 'Le relevé annuel se saisit désormais facture par facture. Recharge la page.'
    using errcode = 'feature_not_supported';
end $$;
revoke execute on function public.regularise_annuel(uuid, integer, integer) from public, anon;
grant execute on function public.regularise_annuel(uuid, integer, integer) to authenticated, service_role;
