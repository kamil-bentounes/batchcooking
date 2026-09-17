-- `unique (verb, appliance_type)` ne contraint PAS les lignes où appliance_type est
-- NULL : Postgres traite chaque NULL comme distinct, donc les verbes sans appareil
-- se dupliquent à chaque upsert. Constaté en production : 74 lignes au lieu de 55.
-- `nulls not distinct` (PostgreSQL 15+) est la forme correcte.

-- 1. Dédupliquer l'existant, en gardant la ligne la plus ancienne.
delete from public.default_duration d
using public.default_duration autre
where d.verb = autre.verb
  and d.appliance_type is not distinct from autre.appliance_type
  and d.ctid > autre.ctid;

-- 2. Poser la bonne contrainte.
alter table public.default_duration drop constraint if exists default_duration_verb_appliance_type_key;
alter table public.default_duration
  add constraint default_duration_unique unique nulls not distinct (verb, appliance_type);

-- Même défaut sur unit_conversion : ciqual_subgroup y est NULL pour les valeurs
-- par défaut, donc chaque unité générique se dupliquait aussi.
delete from public.unit_conversion u
using public.unit_conversion autre
where u.unit_label = autre.unit_label
  and u.ciqual_subgroup is not distinct from autre.ciqual_subgroup
  and u.ctid > autre.ctid;

alter table public.unit_conversion drop constraint if exists unit_conversion_unit_label_ciqual_subgroup_key;
alter table public.unit_conversion
  add constraint unit_conversion_unique unique nulls not distinct (unit_label, ciqual_subgroup);
