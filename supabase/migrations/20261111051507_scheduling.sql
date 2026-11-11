-- Phase 6: scheduling and cost controls (approved 2026-11-10)

alter table public.settings
  add column schedule_ingestion_enabled boolean not null default false,
  add column schedule_discovery_enabled boolean not null default false,
  add column discovery_weekday smallint not null default 1  -- 0 = Sunday … 6 = Saturday (Toronto time)
    constraint settings_discovery_weekday check (discovery_weekday between 0 and 6),
  add column firecrawl_monthly_budget integer not null default 800
    constraint settings_firecrawl_budget check (firecrawl_monthly_budget between 0 and 100000);

create type public.run_trigger as enum ('manual', 'scheduled');
alter table public.discovery_runs add column trigger public.run_trigger not null default 'manual';
alter table public.ingestion_runs add column trigger public.run_trigger not null default 'manual';

-- Research sessions created by discovery point at their run, so usage totals
-- don't count discovery research twice (it is also summed in discovery_runs.usage).
alter table public.research_sessions
  add column discovery_run_id uuid references public.discovery_runs (id) on delete set null;
create index research_sessions_discovery_run_idx on public.research_sessions (discovery_run_id);
