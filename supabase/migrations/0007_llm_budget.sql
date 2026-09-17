-- Deux budgets distincts : household_id NULL = consommation système (ingestion
-- mutualisée entre tous les foyers), non-NULL = vision et propositions du foyer.
-- `unique nulls not distinct` (PostgreSQL 15+) rend la ligne système unique.

create table public.llm_usage (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid references public.household(id) on delete cascade,  -- NULL = système
  month        date not null,
  kind         text not null check (kind in ('extraction','vision','generation')),
  calls        int     not null default 0 check (calls >= 0),
  cost_eur     numeric not null default 0 check (cost_eur >= 0),
  updated_at   timestamptz not null default now(),
  constraint llm_usage_unique unique nulls not distinct (household_id, month, kind)
);
create index on public.llm_usage (household_id, month);

alter table public.llm_usage enable row level security;
-- Lecture des seules lignes du foyer. La ligne système (NULL) n'est lue par
-- personne d'autre que le rôle de service, qui contourne RLS.
create policy llm_usage_read on public.llm_usage
  for select to authenticated
  using (household_id = public.current_household());

create trigger llm_usage_touch before update on public.llm_usage
  for each row execute function public.tg_touch_updated_at();

create or replace function public.llm_budget_remaining()
returns numeric language sql stable security definer set search_path = public as $$
  select h.llm_monthly_cap_eur - coalesce((
    select sum(u.cost_eur) from public.llm_usage u
    where u.household_id = h.id and u.month = date_trunc('month', now())::date
  ), 0)
  from public.household h where h.id = public.current_household()
$$;
revoke execute on function public.llm_budget_remaining() from public, anon;
grant   execute on function public.llm_budget_remaining() to authenticated, service_role;

-- Budget global d'ingestion. RÉSERVÉ au rôle de service : le revoke from public
-- ne suffit pas, Supabase accordant EXECUTE par défaut à anon et authenticated.
create or replace function public.llm_global_budget_remaining()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> 'amount')::numeric from public.instance_setting
                   where key = 'llm_global_monthly_cap_eur'), 0)
       - coalesce((select sum(cost_eur) from public.llm_usage
                   where household_id is null
                     and month = date_trunc('month', now())::date), 0)
$$;
revoke execute on function public.llm_global_budget_remaining() from public, anon, authenticated;
grant   execute on function public.llm_global_budget_remaining() to service_role;
