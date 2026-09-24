-- La revue des charges est un nouvel usage du modèle : elle a son compteur,
-- donc son quota. Sans lui, elle mangerait celui de la dictée — et on relit
-- ses charges bien plus souvent qu'on ne les dicte.
alter table public.llm_usage drop constraint if exists llm_usage_kind_check;
alter table public.llm_usage add constraint llm_usage_kind_check
  check (kind in ('extraction', 'vision', 'generation', 'ticket', 'import',
                  'etiquette', 'charges', 'revue-charges'));
