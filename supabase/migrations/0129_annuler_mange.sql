-- ═══════════════════════════════════════════════════════════════════════════
-- 0129 · ANNULER « JE L'AI MANGÉ »
--
-- Une case notée « mangé » peut redevenir « prévu » : `annule_mange(case)`. Le repas ne compte plus au bilan
-- (la barquette ne compte que sur une case « mangée »), l'heure notée s'efface, et la part consommée est RENDUE
-- là où elle était, au frigo ou au congélateur.
--
-- D'OÙ VENAIT LA BARQUETTE. La consommation (`tg_meal_slot_consomme`, 0122) ne change que `portion.state` :
-- `location`, `frozen_at` et `expires_at` restent ceux d'avant. Le LIEU est donc connu : une part mangée au
-- congélateur y retourne, une part mangée au frigo y reste. Ce qui se perd, c'est l'état d'avant, `au_frais` ou
-- `decongelee` (une part du frigo peut être l'une ou l'autre ; au congélateur c'est toujours `au_frais`). Le journal
-- (`portion_event`) ne le dit qu'en creux (un événement « decongelee »). La voie la plus sûre :
--   · pour les prochaines fois, `portion.etat_avant_mangee` garde l'état d'où la part est partie, posé par un
--     trigger sur la transition vers « mangee » (quel que soit le chemin : la case, la fiche du frigo, une fonction) ;
--   · pour les parts déjà mangées (colonne vide), on déduit : au congélateur, `au_frais` ; au frigo, `decongelee` si
--     le journal contient un événement « decongelee » pour la part, sinon `au_frais`. Dans le doute elle revient donc
--     là où elle était, pas ailleurs.
-- Le journal note la remise (`remise`) : « mangée » reste dans l'historique, sans que rien ne le lise comme un état.
--
-- LA RPC. Même `security definer` que `mange_une_part` (0122), et mêmes verrous dans le même ordre (la barquette
-- d'abord, puis la case : pas d'interblocage avec « Je l'ai mangé » sur l'autre téléphone). Elle vérifie elle-même :
--   · que je suis du foyer, et que la case est de mon foyer ;
--   · que la case est MA case : celle de l'autre membre ne s'annule pas ;
--   · que la case est « mangé » : une case déjà « prévu » (double appui, autre téléphone) ne rend rien une 2e fois.
-- Elle ne touche ni la case de l'autre membre ni `meal_extra` (« en plus » garde son propre « retirer »). Pour
-- « autre chose » (sans barquette), seule la case repasse à prévu. La barquette n'est rendue que si elle est encore
-- « mangée » et qu'aucune autre case « mangé » ne la porte : une part jetée depuis reste jetée.
-- La case garde sa barquette (`portion_id`) : elle la réclame de nouveau, comme avant d'être mangée.
--
-- Rend { portion_id, rendue, location, state }.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.portion
  add column if not exists etat_avant_mangee text
    check (etat_avant_mangee in ('au_frais', 'decongelee'));
comment on column public.portion.etat_avant_mangee is
  'L''état d''où la part est partie quand elle a été mangée : « annuler » la remet dans cet état.';

create or replace function public.tg_portion_etat_avant()
returns trigger language plpgsql as $$
begin
  if new.state = 'mangee' and old.state in ('au_frais', 'decongelee') then
    new.etat_avant_mangee := old.state;
  end if;
  return new;
end $$;

drop trigger if exists portion_etat_avant on public.portion;
create trigger portion_etat_avant before update on public.portion
  for each row execute function public.tg_portion_etat_avant();

-- ── Le journal sait ce que « remise » veut dire ─────────────────────────────
alter table public.portion_event drop constraint if exists portion_event_kind_check;
alter table public.portion_event add constraint portion_event_kind_check
  check (kind in ('dressee', 'congelee', 'decongelee', 'mangee', 'jetee', 'deplacee', 'remise'));

-- Comme 0028 ; en plus : une part « mangee » qui redevient `au_frais` / `decongelee` est une REMISE (et non une
-- décongélation).
create or replace function public.tg_portion_journal()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if tg_op = 'INSERT' then
    k := 'dressee';
  elsif new.state is distinct from old.state then
    k := case
           when old.state = 'mangee' and new.state in ('au_frais', 'decongelee') then 'remise'
           when new.state = 'mangee' then 'mangee'
           when new.state = 'jetee' then 'jetee'
           when new.state = 'decongelee' then 'decongelee'
           else null end;
  elsif new.location is distinct from old.location then
    k := case when new.location = 'congelateur' then 'congelee' else 'decongelee' end;
  end if;

  if k is null then return null; end if;
  insert into public.portion_event (portion_id, household_id, kind, by_user_id)
  values (new.id, new.household_id, k, auth.uid());
  return null;
end $$;

-- ── La RPC ──────────────────────────────────────────────────────────────────
create or replace function public.annule_mange(p_case uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  foyer uuid := public.current_household();
  moi uuid := auth.uid();
  v_pid uuid;
  c record;
  p record;
  v_etat text;
  v_lieu text;
  rendue boolean := false;
begin
  if foyer is null or moi is null then
    raise exception 'Aucun foyer.' using errcode = 'no_data_found';
  end if;
  if p_case is null then
    raise exception 'Il faut dire quel repas on remet à « prévu ».' using errcode = 'invalid_parameter_value';
  end if;

  -- La barquette d'abord (comme `mange_une_part`), puis la case : on lit son identifiant sans verrou, on verrouille
  -- la barquette, on verrouille la case et on vérifie que la case n'a pas changé de barquette entre-temps.
  select s.portion_id into v_pid from public.meal_slot s where s.id = p_case and s.household_id = foyer;
  if not found then
    raise exception 'Ce repas n’est pas dans ton foyer.' using errcode = 'no_data_found';
  end if;
  if v_pid is not null then
    perform 1 from public.portion where id = v_pid and household_id = foyer for update;
  end if;

  select s.id, s.user_profile_id, s.state, s.portion_id into c
  from public.meal_slot s where s.id = p_case and s.household_id = foyer for update;
  if not found then
    raise exception 'Ce repas n’est pas dans ton foyer.' using errcode = 'no_data_found';
  end if;
  if c.portion_id is distinct from v_pid then
    raise exception 'Ce repas vient de changer : réessaie.' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if c.user_profile_id <> moi then
    raise exception 'Ce n’est pas ton repas : seule la personne qui l’a mangé peut le remettre à « prévu ».'
      using errcode = 'insufficient_privilege';
  end if;
  if c.state <> 'mange' then
    raise exception 'Ce repas n’est pas noté mangé : rien à remettre.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  update public.meal_slot set state = 'prevu', eaten_at = null where id = c.id;

  if v_pid is not null then
    select * into p from public.portion where id = v_pid and household_id = foyer;
    -- Rendue seulement si elle est encore « mangée » (une part jetée depuis reste jetée) et qu'aucune AUTRE case
    -- « mangé » ne la porte.
    if found and p.state = 'mangee'
       and not exists (select 1 from public.meal_slot o
                       where o.portion_id = v_pid and o.id <> c.id and o.state = 'mange') then
      v_etat := coalesce(
        p.etat_avant_mangee,
        case when p.location = 'frigo' and exists (
               select 1 from public.portion_event e where e.portion_id = p.id and e.kind = 'decongelee')
             then 'decongelee' else 'au_frais' end);
      update public.portion set state = v_etat, etat_avant_mangee = null where id = p.id;
      v_lieu := p.location;
      rendue := true;
    end if;
  end if;

  return jsonb_build_object(
    'portion_id', v_pid, 'rendue', rendue,
    'location', v_lieu, 'state', v_etat);
end $$;

revoke execute on function public.annule_mange(uuid) from public, anon;
grant   execute on function public.annule_mange(uuid) to authenticated;
