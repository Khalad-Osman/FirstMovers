-- Email notifications (added 2026-11-25). The team has no sending address yet:
-- preferences are saved now, and every email that would be sent is written to
-- the outbox with status 'not_configured'. Once EMAIL_PROVIDER, EMAIL_FROM and
-- the provider key are set, the same code sends them.

-- One row per user; created the first time they save their choices.
create table public.email_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  enabled boolean not null default false,
  discovery_runs boolean not null default true,      -- a discovery run finishes, fails or pauses
  watchlist_briefs boolean not null default true,    -- a new brief for a Watchlist company
  strong_signals boolean not null default false,     -- any new Strong Signal brief
  weekly_digest boolean not null default true,       -- Monday summary of the week's new briefs
  updated_at timestamptz not null default now()
);

alter table public.email_preferences enable row level security;
create policy "email_preferences: own read" on public.email_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy "email_preferences: own insert" on public.email_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy "email_preferences: own update" on public.email_preferences for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update on public.email_preferences to authenticated;

-- Every email the app sends or would send. Written only by server code (secret key).
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  to_address text not null,
  kind text not null constraint email_outbox_kind check (kind in ('discovery_run', 'watchlist_brief', 'strong_signal', 'weekly_digest', 'test')),
  subject text not null,
  body_text text not null,
  body_html text not null,
  status text not null constraint email_outbox_status check (status in ('queued', 'sent', 'failed', 'not_configured')),
  error text,
  provider_message_id text,
  sent_at timestamptz,
  -- one email per user and event (a resumed run or a re-run digest doesn't repeat it)
  dedupe_key text not null,
  constraint email_outbox_dedupe unique (user_id, dedupe_key)
);
create index email_outbox_created_idx on public.email_outbox (created_at desc);

alter table public.email_outbox enable row level security;
create policy "email_outbox: own or admin read" on public.email_outbox for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "email_outbox: admin delete" on public.email_outbox for delete to authenticated using ((select public.is_admin()));
grant select, delete on public.email_outbox to authenticated;
