-- ═══════════════════════════════════════════════════════════════════════════
-- CE QU'ON MET AU CONGÉLATEUR SANS L'AVOIR CUISINÉ
--
-- Le congélateur existait déjà, mais pour une seule sorte de chose : les
-- barquettes nées d'une session de batch cooking, et les produits rangés à
-- l'inventaire. Manquait ce qui n'est ni l'un ni l'autre — un plat tout prêt
-- acheté dehors. C'est un REPAS : il doit se manger depuis la semaine et peser
-- dans les calories du jour, pas dormir dans une liste de courses.
--
-- Deux choses seulement, et elles suffisent :
--
--  · une barquette peut naître SANS session. `cycle_id` et `recipe_id` étaient
--    déjà nullables, il ne manquait que de dire D'OÙ elle vient — sinon on ne
--    saurait plus distinguer ce qu'on a cuisiné de ce qu'on a acheté, et le
--    bilan de la semaine mélangerait les deux ;
--  · un produit congelé porte lui aussi une date de mise au froid. Elle n'est
--    pas décorative : c'est elle qui fait courir les trois mois.
--
-- La péremption reste celle de D29 — trois mois au congélateur — mais elle est
-- désormais MODIFIABLE à l'ajout : une DLC imprimée sur un emballage vaut mieux
-- qu'une règle générale, et c'est le seul cas où quelqu'un en sait plus que nous.
-- ═══════════════════════════════════════════════════════════════════════════

/**
 * D'où vient cette barquette.
 *
 * `session` est le défaut et couvre tout l'existant : c'est ce que la cuisine
 * du dimanche produit. Les deux autres n'existent que par l'écran du
 * congélateur.
 */
alter table public.portion
  add column source text not null default 'session'
    check (source in ('session', 'manuel', 'achete'));

comment on column public.portion.source is
  'session = sortie du batch cooking · manuel = posée à la main · achete = plat tout prêt';

-- Ce qui vient d'une session en vient : on ne se réécrit pas une provenance.
create or replace function public.tg_portion_source()
returns trigger language plpgsql as $$
begin
  if new.source is distinct from old.source then
    raise exception 'une barquette ne change pas de provenance'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists portion_source on public.portion;
create trigger portion_source before update on public.portion
  for each row execute function public.tg_portion_source();

/**
 * La date de mise au froid d'un PRODUIT.
 *
 * `portion` l'avait déjà (`frozen_at`, imposée par la contrainte qui lie le
 * lieu à la date). `stock_item` non : un sachet de petits pois entrait au
 * congélateur sans qu'on sache quand, donc sans qu'on puisse dire quand il en
 * sort. Nullable, parce qu'un produit du placard n'en a pas.
 */
alter table public.stock_item add column frozen_at timestamptz;

alter table public.stock_item add constraint stock_item_congele_date
  check (frozen_at is null or location = 'congelateur');

-- La lecture d'une étiquette nutritionnelle est une dépense de vision comme
-- une autre : elle se compte, sinon le plafond du foyer ne plafonne rien.
alter table public.llm_usage drop constraint llm_usage_kind_check;
alter table public.llm_usage add constraint llm_usage_kind_check
  check (kind in ('extraction', 'vision', 'generation', 'ticket', 'import', 'etiquette'));
