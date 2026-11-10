-- First Movers: initial schema (Phase 1)
-- Shared team workspace. All signed-in users read everything; only admins write
-- through the user session. Pipeline writes (Live Research, discovery) run in
-- server code that checks the caller's role and uses the secret (service) key.

-------------------------------------------------------------------------------
-- Enums
-------------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'member');
create type public.brief_origin as enum ('discovered', 'live_research');
create type public.signal_rating as enum ('strong_signal', 'worth_monitoring', 'no_meaningful_signal');
create type public.opportunity_stage as enum (
  'pre_shop', 'active_search', 'site_controlled', 'construction_fit_out', 'open', 'undetermined'
);
create type public.evidence_type as enum ('fact', 'inference', 'hypothesis', 'unknown');
create type public.relevance as enum ('signal', 'context', 'not_relevant');
create type public.signal_source_type as enum (
  'canadabuys_award', 'permit_mississauga', 'permit_brampton', 'permit_toronto', 'jobbank_posting', 'web'
);
create type public.run_status as enum ('queued', 'running', 'completed', 'failed');

-------------------------------------------------------------------------------
-- Shared helpers
-------------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-------------------------------------------------------------------------------
-- profiles
-------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now()
);

-- Security definer so RLS policies can check the role without recursing into
-- profiles' own policies.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- New auth user -> member profile.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Signed-in non-admins cannot change any role (including their own).
-- Direct SQL / secret-key access (no auth.uid()) may, which is how the first
-- admin is promoted.
create function public.guard_profile_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and (select auth.uid()) is not null
     and not public.is_admin() then
    raise exception 'Only admins can change roles' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-------------------------------------------------------------------------------
-- companies
-------------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,             -- full name as it appears in the source
  normalized_key text not null unique,    -- for entity resolution
  aliases text[] not null default '{}',
  parent_company_id uuid references public.companies (id) on delete set null,
  ontario_connection text,
  entity_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index companies_parent_idx on public.companies (parent_company_id);
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

-------------------------------------------------------------------------------
-- signals (one row per raw structured signal)
-------------------------------------------------------------------------------
create table public.signals (
  id uuid primary key default gen_random_uuid(),
  source_type public.signal_source_type not null,
  source_record_id text not null,
  raw_entity_name text,
  company_id uuid references public.companies (id) on delete set null,
  title text,
  summary text,
  url text,
  published_at date,
  event_at date,
  location text,
  raw jsonb not null default '{}',
  ingested_at timestamptz not null default now(),
  constraint signals_source_record_unique unique (source_type, source_record_id)
);
create index signals_company_idx on public.signals (company_id);
create index signals_published_idx on public.signals (published_at desc);

-------------------------------------------------------------------------------
-- sources (collected web/document sources used as evidence)
-------------------------------------------------------------------------------
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  publisher text,
  title text,
  published_at date,
  event_at date,
  excerpt text,          -- scraped text: untrusted data, never instructions
  content_hash text,
  fetched_at timestamptz not null default now()
);

-------------------------------------------------------------------------------
-- discovery_runs
-------------------------------------------------------------------------------
create table public.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  started_by uuid references public.profiles (id) on delete set null,
  status public.run_status not null default 'queued',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  settings jsonb not null default '{}',
  candidates_found integer not null default 0,
  analyzed integer not null default 0,
  skipped jsonb not null default '[]',    -- [{ company, reason }]
  usage jsonb not null default '{}',      -- { firecrawl_requests, llm_calls, tokens }
  errors jsonb not null default '[]'
);
create index discovery_runs_started_idx on public.discovery_runs (started_at desc);
create index discovery_runs_started_by_idx on public.discovery_runs (started_by);

-------------------------------------------------------------------------------
-- briefs (immutable versions; only dismissal fields may change)
-------------------------------------------------------------------------------
create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  version integer not null,
  origin public.brief_origin not null,
  trigger_signal_id uuid references public.signals (id) on delete set null,
  trigger_query text,
  rating public.signal_rating not null,
  stage public.opportunity_stage not null default 'undetermined',
  analysis jsonb not null,
  model text not null,
  analyzed_at timestamptz not null default now(),
  discovery_run_id uuid references public.discovery_runs (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  dismissed boolean not null default false,
  dismissed_by uuid references public.profiles (id) on delete set null,
  dismissed_at timestamptz,
  constraint briefs_company_version_unique unique (company_id, version),
  constraint briefs_version_positive check (version > 0)
);
create index briefs_company_analyzed_idx on public.briefs (company_id, analyzed_at desc);
create index briefs_feed_idx on public.briefs (rating, analyzed_at desc);
create index briefs_trigger_signal_idx on public.briefs (trigger_signal_id);
create index briefs_run_idx on public.briefs (discovery_run_id);
create index briefs_created_by_idx on public.briefs (created_by);
create index briefs_dismissed_by_idx on public.briefs (dismissed_by);

-- Assign the next version number per company when none is given.
create function public.assign_brief_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version
    from public.briefs where company_id = new.company_id;
  end if;
  return new;
end;
$$;

create trigger briefs_assign_version
  before insert on public.briefs
  for each row execute function public.assign_brief_version();

-- Never overwrite a brief: re-analysis inserts a new version.
create function public.guard_brief_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - array['dismissed', 'dismissed_by', 'dismissed_at'])
     is distinct from
     (to_jsonb(old) - array['dismissed', 'dismissed_by', 'dismissed_at']) then
    raise exception 'Briefs are immutable; insert a new version instead'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger briefs_guard_immutable
  before update on public.briefs
  for each row execute function public.guard_brief_immutable();

-- Latest version per company (respects the caller's RLS).
create view public.latest_briefs
with (security_invoker = true) as
select distinct on (company_id) *
from public.briefs
order by company_id, version desc;

-------------------------------------------------------------------------------
-- brief_sources (evidence ledger rows)
-------------------------------------------------------------------------------
create table public.brief_sources (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete restrict,
  evidence_type public.evidence_type not null,
  relevance public.relevance not null,
  finding text not null,
  -- Repeated coverage of one event is one signal: point at the primary entry.
  is_repeat_coverage_of uuid references public.brief_sources (id) on delete set null,
  created_at timestamptz not null default now()
);
create index brief_sources_brief_idx on public.brief_sources (brief_id);
create index brief_sources_source_idx on public.brief_sources (source_id);
create index brief_sources_repeat_idx on public.brief_sources (is_repeat_coverage_of);

-------------------------------------------------------------------------------
-- watchlist
-------------------------------------------------------------------------------
create table public.watchlist (
  company_id uuid primary key references public.companies (id) on delete cascade,
  added_by uuid default auth.uid() references public.profiles (id) on delete set null,
  added_at timestamptz not null default now()
);
create index watchlist_added_by_idx on public.watchlist (added_by);

-------------------------------------------------------------------------------
-- settings (single row)
-------------------------------------------------------------------------------
create table public.settings (
  id boolean primary key default true,
  discovery_cap integer not null default 3,
  sources_per_candidate integer not null default 5,
  skip_window_days integer not null default 7,
  screening_model text,   -- null = use LLM_SCREENING_MODEL env default
  analysis_model text,    -- null = use LLM_ANALYSIS_MODEL env default
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint settings_single_row check (id),
  constraint settings_discovery_cap check (discovery_cap between 1 and 8),
  constraint settings_sources_per_candidate check (sources_per_candidate between 1 and 5),
  constraint settings_skip_window check (skip_window_days >= 0)
);
create index settings_updated_by_idx on public.settings (updated_by);
create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();
insert into public.settings (id) values (true);

-------------------------------------------------------------------------------
-- Privileges: no anonymous access to anything
-------------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on function public.is_admin() to authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-------------------------------------------------------------------------------
-- Row Level Security
-------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.signals enable row level security;
alter table public.sources enable row level security;
alter table public.discovery_runs enable row level security;
alter table public.briefs enable row level security;
alter table public.brief_sources enable row level security;
alter table public.watchlist enable row level security;
alter table public.settings enable row level security;

-- profiles
create policy "profiles: read" on public.profiles
  for select to authenticated using (true);
create policy "profiles: update own or admin" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

-- Read-for-all, write-for-admins tables
create policy "companies: read" on public.companies for select to authenticated using (true);
create policy "companies: admin insert" on public.companies for insert to authenticated with check ((select public.is_admin()));
create policy "companies: admin update" on public.companies for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "companies: admin delete" on public.companies for delete to authenticated using ((select public.is_admin()));

create policy "signals: read" on public.signals for select to authenticated using (true);
create policy "signals: admin insert" on public.signals for insert to authenticated with check ((select public.is_admin()));
create policy "signals: admin update" on public.signals for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "signals: admin delete" on public.signals for delete to authenticated using ((select public.is_admin()));

create policy "sources: read" on public.sources for select to authenticated using (true);
create policy "sources: admin insert" on public.sources for insert to authenticated with check ((select public.is_admin()));
create policy "sources: admin update" on public.sources for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "sources: admin delete" on public.sources for delete to authenticated using ((select public.is_admin()));

create policy "discovery_runs: read" on public.discovery_runs for select to authenticated using (true);
create policy "discovery_runs: admin insert" on public.discovery_runs for insert to authenticated with check ((select public.is_admin()));
create policy "discovery_runs: admin update" on public.discovery_runs for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "discovery_runs: admin delete" on public.discovery_runs for delete to authenticated using ((select public.is_admin()));

create policy "briefs: read" on public.briefs for select to authenticated using (true);
create policy "briefs: admin insert" on public.briefs for insert to authenticated with check ((select public.is_admin()));
create policy "briefs: admin dismiss" on public.briefs for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "briefs: admin delete" on public.briefs for delete to authenticated using ((select public.is_admin()));

create policy "brief_sources: read" on public.brief_sources for select to authenticated using (true);
create policy "brief_sources: admin insert" on public.brief_sources for insert to authenticated with check ((select public.is_admin()));
create policy "brief_sources: admin update" on public.brief_sources for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "brief_sources: admin delete" on public.brief_sources for delete to authenticated using ((select public.is_admin()));

-- watchlist: any signed-in team member manages it
create policy "watchlist: read" on public.watchlist for select to authenticated using (true);
create policy "watchlist: member add" on public.watchlist for insert to authenticated with check (added_by = (select auth.uid()));
create policy "watchlist: member remove" on public.watchlist for delete to authenticated using (true);

-- settings: read for all, update for admins (single row; no insert/delete)
create policy "settings: read" on public.settings for select to authenticated using (true);
create policy "settings: admin update" on public.settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
