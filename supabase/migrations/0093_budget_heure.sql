-- ═══════════════════════════════════════════════════════════════════════════
-- 0093 · L'heure du budget : une seule, celle de Paris, et réglable par un banc
--
-- La clôture, les factures et les ajustements disent « aujourd'hui » et « le
-- mois en cours ». Trois défauts à éviter d'un coup :
--   · `now()` est l'heure du DÉBUT de la transaction. Une facture commencée le
--     31/10 à 23 h 59, qui obtient le verrou du foyer après minuit, poserait son
--     ajustement sur octobre, déjà clôturé. `clock_timestamp()` lit l'heure au
--     moment où on la demande, donc après le verrou ;
--   · la base est en UTC : entre minuit et 2 h, « aujourd'hui » à Paris y est
--     encore « hier », et une facture payée aujourd'hui serait refusée comme
--     datée du lendemain ;
--   · un banc qui veut jouer un 1er novembre doit pouvoir le dire sans attendre
--     novembre. `popote.maintenant` ne se pose que par une connexion directe de
--     superutilisateur : ni le client ni PostgREST n'y ont accès.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.maintenant()
returns timestamptz
language plpgsql volatile
set search_path = public, pg_temp
as $$
declare
  reglee text := nullif(current_setting('popote.maintenant', true), '');
begin
  if reglee is null then return clock_timestamp(); end if;
  /* « heure jouée @ heure vraie au moment du réglage » : l'heure jouée AVANCE
     avec l'autre. Figée, un banc ne pourrait pas faire passer minuit à une
     facture qui attend le verrou. Sans « @ », l'heure est figée. */
  if position('@' in reglee) > 0 then
    return split_part(reglee, '@', 1)::timestamptz
         + (clock_timestamp() - split_part(reglee, '@', 2)::timestamptz);
  end if;
  return reglee::timestamptz;
end $$;

create or replace function public.aujourdhui()
returns date language sql volatile set search_path = public, pg_temp as $$
  select (public.maintenant() at time zone 'Europe/Paris')::date
$$;

create or replace function public.mois_courant()
returns date language sql volatile set search_path = public, pg_temp as $$
  select date_trunc('month', public.maintenant() at time zone 'Europe/Paris')::date
$$;

/* `authenticated` en a besoin : les triggers `security invoker` (la garde des
   charges, des saisies) tournent sous lui. */
revoke execute on function public.maintenant(), public.aujourdhui(), public.mois_courant()
  from public, anon;
grant execute on function public.maintenant(), public.aujourdhui(), public.mois_courant()
  to authenticated, service_role;
