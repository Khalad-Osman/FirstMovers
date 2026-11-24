-- Retail alongside industrial (approved 2026-11-23). Every signal, research
-- session, discovery run and brief belongs to one sector; industrial stays the
-- default so existing rows and code paths are unchanged.
create type public.sector as enum ('industrial', 'retail');

alter table public.signals add column sector public.sector not null default 'industrial';
alter table public.research_sessions add column sector public.sector not null default 'industrial';
alter table public.discovery_runs add column sector public.sector not null default 'industrial';
alter table public.briefs add column sector public.sector not null default 'industrial';
alter table public.settings add column discovery_sector public.sector not null default 'industrial';

create index signals_sector_published_idx on public.signals (sector, published_at desc);

-- Latest brief per company and sector (a company can be researched for both).
drop view public.latest_briefs;
create view public.latest_briefs
with (security_invoker = true) as
select distinct on (company_id, sector) *
from public.briefs
order by company_id, sector, version desc;
grant select on public.latest_briefs to authenticated;

-- upsert_signals carries the sector; a sector change updates the row.
create or replace function public.upsert_signals(rows jsonb)
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
      raw jsonb,
      sector public.sector
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
      title, summary, url, published_at, event_at, location, raw, company_id, ingested_at, sector
    )
    select source_type, source_record_id, raw_entity_name, entity_key, occupier_status, signal_strength,
           title, summary, url, published_at, event_at, location, raw, company_id, now(),
           coalesce(sector, 'industrial')
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
      sector = excluded.sector,
      company_id = coalesce(s.company_id, excluded.company_id),
      ingested_at = now()
    where s.raw is distinct from excluded.raw
       or s.entity_key is distinct from excluded.entity_key
       or s.signal_strength is distinct from excluded.signal_strength
       or s.sector is distinct from excluded.sector
    returning (xmax = 0) as was_insert
  )
  select count(*) filter (where was_insert)::integer, count(*) filter (where not was_insert)::integer from up;
end;
$$;
revoke execute on function public.upsert_signals(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_signals(jsonb) to service_role;
