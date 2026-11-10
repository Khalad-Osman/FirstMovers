-- Phase 4: structured ingestion (approved 2026-11-10)
-- signals: entity_key, occupier_status, signal_strength; new ingestion_runs table;
-- settings.canadabuys_min_value; upsert + linking functions.

create type public.occupier_status as enum ('named', 'unresolved', 'not_applicable');
create type public.signal_strength as enum (
  'award', 'new_building', 'addition', 'change_of_use', 'alteration', 'demolition', 'sign', 'other'
);

alter table public.signals
  add column entity_key text,                                    -- normalized occupier/supplier name
  add column occupier_status public.occupier_status not null default 'not_applicable',
  add column signal_strength public.signal_strength not null default 'other';
create index signals_entity_key_idx on public.signals (entity_key);
create index signals_source_published_idx on public.signals (source_type, published_at desc);

alter table public.settings
  add column canadabuys_min_value numeric not null default 100000
    constraint settings_canadabuys_min_value check (canadabuys_min_value >= 0);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source public.signal_source_type not null,
  started_by uuid references public.profiles (id) on delete set null,
  status public.run_status not null default 'running',
  progress text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  settings jsonb not null default '{}',
  fetched integer not null default 0,     -- records read from the source
  inserted integer not null default 0,
  updated integer not null default 0,     -- existing records whose content changed
  unchanged integer not null default 0,
  skipped integer not null default 0,     -- read but filtered out
  skip_reasons jsonb not null default '{}', -- { reason: count }
  linked integer not null default 0,      -- signals linked to a company in this run
  errors jsonb not null default '[]'
);
create index ingestion_runs_source_idx on public.ingestion_runs (source, started_at desc);
create index ingestion_runs_started_by_idx on public.ingestion_runs (started_by);

revoke all on public.ingestion_runs from anon;
alter table public.ingestion_runs enable row level security;
create policy "ingestion_runs: read" on public.ingestion_runs for select to authenticated using (true);
-- Writes come from server code with the secret key (admin-checked).

-- Upsert a batch of signals. Re-running never duplicates (unique source_type +
-- source_record_id); content changes update in place; unchanged rows are left
-- alone. New or changed rows are linked to a company whose normalized_key
-- matches entity_key, without overwriting an existing link.
-- Returns counts: inserted, updated.
create function public.upsert_signals(rows jsonb)
returns table (inserted integer, updated integer)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with input as (
    select * from jsonb_to_recordset(rows) as r(
      source_type public.signal_source_type,
      source_record_id text,
      raw_entity_name text,
      entity_key text,
      occupier_status public.occupier_status,
      signal_strength public.signal_strength,
      title text,
      summary text,
      url text,
      published_at date,
      event_at date,
      location text,
      raw jsonb
    )
  ),
  resolved as (
    select i.*, c.id as company_id
    from input i
    left join public.companies c on i.entity_key is not null and c.normalized_key = i.entity_key
  ),
  up as (
    insert into public.signals as s (
      source_type, source_record_id, raw_entity_name, entity_key, occupier_status, signal_strength,
      title, summary, url, published_at, event_at, location, raw, company_id, ingested_at
    )
    select source_type, source_record_id, raw_entity_name, entity_key, occupier_status, signal_strength,
           title, summary, url, published_at, event_at, location, raw, company_id, now()
    from resolved
    on conflict (source_type, source_record_id) do update set
      raw_entity_name = excluded.raw_entity_name,
      entity_key = excluded.entity_key,
      occupier_status = excluded.occupier_status,
      signal_strength = excluded.signal_strength,
      title = excluded.title,
      summary = excluded.summary,
      url = excluded.url,
      published_at = excluded.published_at,
      event_at = excluded.event_at,
      location = excluded.location,
      raw = excluded.raw,
      company_id = coalesce(s.company_id, excluded.company_id),
      ingested_at = now()
    where s.raw is distinct from excluded.raw
       or s.entity_key is distinct from excluded.entity_key
       or s.signal_strength is distinct from excluded.signal_strength
    returning (xmax = 0) as was_insert
  )
  select count(*) filter (where was_insert)::integer, count(*) filter (where not was_insert)::integer from up;
end;
$$;

-- Link unlinked signals to companies by entity_key (e.g. after Live Research
-- creates a company). Returns the number of signals linked.
create function public.link_signals_to_companies()
returns integer
language sql
security invoker
set search_path = ''
as $$
  with linked as (
    update public.signals s
    set company_id = c.id
    from public.companies c
    where s.company_id is null and s.entity_key is not null and c.normalized_key = s.entity_key
    returning 1
  )
  select count(*)::integer from linked;
$$;

-- Only server code (secret key / service_role) runs these.
revoke execute on function public.upsert_signals(jsonb) from public, anon, authenticated;
revoke execute on function public.link_signals_to_companies() from public, anon, authenticated;
grant execute on function public.upsert_signals(jsonb) to service_role;
grant execute on function public.link_signals_to_companies() to service_role;
