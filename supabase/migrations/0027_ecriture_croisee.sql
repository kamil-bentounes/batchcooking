-- ═══════════════════════════════════════════════════════════════════════════
-- LE TRIGGER QUI ÉCRIVAIT CHEZ LES AUTRES (correctif du lot 5)
--
-- `tg_receipt_line_apprend` est `security definer` — il doit l'être, pour
-- écrire dans `household_price` sans que le client ait ce droit. Mais
-- `security definer` CONTOURNE la RLS, et le trigger reportait le prix payé sur
-- `shopping_item` en se fiant à l'identifiant fourni par le client.
--
-- Conséquence, prouvée par un test : un foyer pouvait pointer une ligne de SON
-- ticket sur l'article d'un AUTRE foyer et écrire dans sa liste de courses. Il
-- ne pouvait pas la lire — la RLS tient à la lecture — mais il pouvait la
-- corrompre, et fausser le bilan de quelqu'un d'autre en silence.
--
-- La RLS ne protège pas d'un trigger `security definer` : c'est au trigger de
-- vérifier. Il le fait maintenant, et sur les DEUX tables qu'il touche.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.tg_receipt_line_apprend()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  boutique uuid;
  unitaire numeric;
  u        text;
begin
  -- Le magasin ne se prend QUE s'il appartient au même foyer : un identifiant
  -- venu d'ailleurs apprendrait un prix rangé sous l'enseigne d'un autre.
  select r.store_id into boutique
  from public.receipt r
  left join public.store s on s.id = r.store_id
  where r.id = new.receipt_id
    and (r.store_id is null or s.household_id = new.household_id);

  if new.quantity is not null and new.quantity > 0
     and new.unit in ('g', 'kg', 'ml', 'l') then
    unitaire := new.price_eur / (case
      when new.unit = 'g'  then new.quantity / 1000.0
      when new.unit = 'ml' then new.quantity / 1000.0
      else new.quantity end);
    u := case when new.unit in ('g', 'kg') then 'kg' else 'l' end;
  else
    unitaire := new.price_eur / coalesce(nullif(new.quantity, 0), 1);
    u := 'u';
  end if;

  insert into public.household_price
    (household_id, store_id, label, food_id, unit, avg_price_eur, last_price_eur)
  values (new.household_id, boutique, new.label, new.food_id, u, unitaire, unitaire)
  on conflict (household_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(label))
  do update set
    avg_price_eur = (household_price.avg_price_eur * household_price.observations
                     + excluded.avg_price_eur) / (household_price.observations + 1),
    last_price_eur = excluded.last_price_eur,
    observations  = household_price.observations + 1,
    last_seen_at  = now(),
    food_id       = coalesce(excluded.food_id, household_price.food_id),
    unit          = excluded.unit;

  -- ⚠️ LE POINT SENSIBLE. `security definer` contourne la RLS : sans ce
  --    `household_id`, la clause `where id = ...` suffit à écrire n'importe où.
  if new.shopping_item_id is not null then
    update public.shopping_item set paid_price_eur = new.price_eur
    where id = new.shopping_item_id
      and household_id = new.household_id;
  end if;
  return null;
end $$;

/**
 * Consommer une unité de quota, sans perdre de compte.
 *
 * Les Edge Functions lisaient `calls`, puis écrivaient `calls + 1`. Deux appels
 * simultanés lisaient donc la même valeur N et écrivaient tous deux N+1 : l'un
 * des deux ne comptait pas. Le plafond est un garde-fou de coût, pas une
 * sécurité — mais un garde-fou qui ne compte pas ne garde rien.
 *
 * L'incrément est fait EN BASE, en une instruction, donc atomique. On garde
 * l'appel APRÈS la réponse du modèle : un 503 de Gemini — et il y en a, c'est
 * mesuré — ne doit pas coûter une photo à quelqu'un.
 */
create or replace function public.llm_consomme(p_household uuid, p_kind text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.llm_usage (household_id, month, kind, calls)
  values (p_household, date_trunc('month', now())::date, p_kind, 1)
  on conflict (household_id, month, kind)
    do update set calls = llm_usage.calls + 1
  returning calls into n;
  return n;
end $$;
revoke execute on function public.llm_consomme(uuid, text) from public, anon, authenticated;
grant   execute on function public.llm_consomme(uuid, text) to service_role;
