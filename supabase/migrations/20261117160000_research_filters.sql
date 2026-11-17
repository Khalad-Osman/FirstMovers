-- Live Research filters (approved 2026-11-17): stored with the session
-- (validated in code by lib/research/filters.ts). Null = no filters.
alter table public.research_sessions add column filters jsonb;
