-- Federal grants and contributions (Proactive Disclosure) as a structured signal source.
alter type public.signal_source_type add value if not exists 'federal_grant';
alter type public.signal_strength add value if not exists 'grant';

alter table public.settings
  add column grants_min_value numeric not null default 100000
    constraint settings_grants_min_value check (grants_min_value >= 0);
