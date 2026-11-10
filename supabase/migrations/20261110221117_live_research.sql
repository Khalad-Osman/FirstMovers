-- Phase 3: Live Research (approved 2026-11-10)
-- New table research_sessions; two new columns on sources.

create type public.research_mode as enum ('company', 'theme');
create type public.research_status as enum (
  'searching', 'scraping', 'ready', 'analyzing', 'analyzed', 'saved', 'failed'
);
create type public.date_method as enum ('metadata', 'structured_data', 'url', 'text', 'none');

-- How each source's date was found, and the search that first surfaced it.
alter table public.sources
  add column date_method public.date_method not null default 'none',
  add column first_seen_query text;

create table public.research_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  mode public.research_mode not null,
  query text not null,                       -- company name or theme as entered
  company_id uuid references public.companies (id) on delete set null, -- set for re-analysis
  status public.research_status not null default 'searching',
  progress text,                             -- short human-readable step
  error text,
  source_ids uuid[] not null default '{}',   -- ordered: S1, S2, … in analysis
  theme_results jsonb not null default '[]', -- theme mode: [{ url, title, description, publisher }]
  analysis jsonb,                            -- validated brief (only set when valid)
  analysis_errors jsonb,                     -- validation errors when analysis failed
  analysis_model text,
  brief_id uuid references public.briefs (id) on delete set null,
  usage jsonb not null default '{}',         -- { firecrawl_requests, firecrawl_credits, llm_calls, input_tokens, output_tokens }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index research_sessions_created_idx on public.research_sessions (created_at desc);
create index research_sessions_created_by_idx on public.research_sessions (created_by);
create index research_sessions_company_idx on public.research_sessions (company_id);
create index research_sessions_brief_idx on public.research_sessions (brief_id);
create trigger research_sessions_updated_at before update on public.research_sessions
  for each row execute function public.set_updated_at();

-- Shared workspace: everyone signed in reads; only server code (secret key) writes.
revoke all on public.research_sessions from anon;
alter table public.research_sessions enable row level security;
create policy "research_sessions: read" on public.research_sessions
  for select to authenticated using (true);
