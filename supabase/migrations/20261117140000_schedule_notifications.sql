-- Schedule options and in-app notifications (approved 2026-11-17).

-- Discovery schedule: daily, weekly on chosen days, or monthly on a day (1–28,
-- so every month has it). Replaces the single discovery_weekday.
alter table public.settings
  add column discovery_frequency text not null default 'weekly'
    constraint settings_discovery_frequency check (discovery_frequency in ('daily', 'weekly', 'monthly')),
  add column discovery_weekdays smallint[] not null default '{1}'
    constraint settings_discovery_weekdays check (
      cardinality(discovery_weekdays) between 1 and 7
      and discovery_weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    ),
  add column discovery_month_day smallint not null default 1
    constraint settings_discovery_month_day check (discovery_month_day between 1 and 28);

update public.settings set discovery_weekdays = array[discovery_weekday];
alter table public.settings drop column discovery_weekday;

-- Notifications are shared by the team (one workspace); read state is per user.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null constraint notifications_kind check (kind in ('discovery_completed', 'discovery_failed', 'discovery_paused')),
  title text not null,
  body text,
  link text,
  discovery_run_id uuid references public.discovery_runs (id) on delete cascade,
  -- one notification per run and kind (a resumed run that pauses again doesn't repeat it)
  constraint notifications_run_kind unique (discovery_run_id, kind)
);
create index notifications_created_idx on public.notifications (created_at desc);

create table public.notification_reads (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index notification_reads_user_idx on public.notification_reads (user_id);

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

-- Everyone signed in reads notifications; only server code (secret key) writes them.
create policy "notifications: read" on public.notifications for select to authenticated using (true);
create policy "notifications: admin delete" on public.notifications for delete to authenticated using ((select public.is_admin()));

-- Each user manages only their own read marks.
create policy "notification_reads: own read" on public.notification_reads for select to authenticated using (user_id = (select auth.uid()));
create policy "notification_reads: own insert" on public.notification_reads for insert to authenticated with check (user_id = (select auth.uid()));
create policy "notification_reads: own delete" on public.notification_reads for delete to authenticated using (user_id = (select auth.uid()));
