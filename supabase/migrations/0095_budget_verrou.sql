-- ═══════════════════════════════════════════════════════════════════════════
-- 0095 · Le verrou du foyer
--
-- Un seul verrou sérialise, dans un foyer, tout ce qui touche à une clôture.
-- Une saisie, une facture, une validation, un revenu ou une ligne qui naît
-- pendant une clôture attend sa fin, puis la voit.
--
-- Il se prend AVANT la première écriture. Une écriture faite avant pose des
-- verrous de ligne : l'insertion dans `charge_participant` tient KEY SHARE sur
-- la charge, et `retire_charge`, qui tenait le verrou, attendait de supprimer
-- cette charge. Interblocage reproduit le 01/10. D'où, pour le client, un
-- trigger d'INSTRUCTION : il passe avant que la ligne visée soit verrouillée.
--
-- Aucune fonction ne verrouille EN PLUS une ligne de charge (`for update`) :
-- c'est l'autre interblocage du 01/10.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.verrou_du_foyer(foyer uuid)
returns void language plpgsql volatile set search_path = public, pg_temp as $$
begin
  /* Un foyer NULL ne verrouille rien, et `pg_advisory_xact_lock(…, NULL)` le
     ferait en silence. On ne prétend pas avoir verrouillé : l'appelant qui a
     besoin d'un foyer l'a déjà exigé. */
  if foyer is null then return; end if;
  -- ⚠️ La MÊME clé que `tg_verrou_instruction`, plus bas. Le banc du verrou le prouve.
  perform pg_advisory_xact_lock(hashtext('budget'), hashtext(foyer::text));
end $$;
revoke execute on function public.verrou_du_foyer(uuid) from public, anon, authenticated;

/*
 * Le verrou des écritures du client.
 *
 * `security invoker` : en `definer`, `current_user` vaudrait le propriétaire et
 * le trigger ne verrouillerait jamais rien. Sous le propriétaire, il ne fait
 * RIEN : une fonction `security definer` tient déjà le verrou, et une action de
 * clé étrangère qui l'attendrait en tenant sa ligne parente s'interbloquerait.
 * Supprimer un compte met ainsi à null le `compte_id` de ses lignes sans
 * attendre personne.
 *
 * La clé est le foyer de l'appelant. `current_household()` ne sert seul qu'ici,
 * sous `authenticated` : sous la clé de service il vaut NULL.
 */
create or replace function public.tg_verrou_instruction()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare foyer uuid;
begin
  if current_user <> 'authenticated' then return null; end if;
  foyer := public.current_household();
  if foyer is null then return null; end if;
  perform pg_advisory_xact_lock(hashtext('budget'), hashtext(foyer::text));
  return null;
end $$;

/* `revenu` et `regle_partage` en font partie : `refige_pour` venait trop tard,
   dans un trigger `after`, la ligne déjà écrite. Un revenu posé pendant le
   départ de son compte tenait sa ligne et attendait le verrou, que
   `delete_my_account` tenait en attendant de supprimer cette ligne.
   `user_profile` aussi : `entre_le` y change, et repartage des mois. */
do $$
declare t text;
begin
  foreach t in array array['depense', 'depense_part', 'charge', 'charge_participant',
                           'revenu', 'regle_partage', 'user_profile'] loop
    execute format('drop trigger if exists a_verrou_du_foyer on public.%I', t);
    execute format('create trigger a_verrou_du_foyer
                      before insert or update or delete on public.%I
                      for each statement execute function public.tg_verrou_instruction()', t);
  end loop;
end $$;
