-- La dictée des charges est un nouvel usage du modèle : elle a son compteur,
-- donc son quota. Sans lui, elle mangerait celui des photos de frigo.
alter table public.llm_usage drop constraint if exists llm_usage_kind_check;
alter table public.llm_usage add constraint llm_usage_kind_check
  check (kind in ('extraction', 'vision', 'generation', 'ticket', 'import',
                  'etiquette', 'charges'));
