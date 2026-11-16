-- Notifications and schedule settings. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'n-admin@test.local', '{"full_name":"N Admin"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'n-member@test.local', '{"full_name":"N Member"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'n-other@test.local', '{"full_name":"N Other"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.discovery_runs (id, status) values ('00000000-0000-0000-0000-0000000000e1', 'completed');
insert into public.notifications (id, kind, title, link, discovery_run_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'discovery_completed', 'Discovery finished: 3 briefs', '/discovery/x', '00000000-0000-0000-0000-0000000000e1');

-- Schedule settings -----------------------------------------------------------
select is((select discovery_frequency from public.settings), 'weekly', 'discovery frequency defaults to weekly');
select is((select discovery_weekdays from public.settings), array[1]::smallint[], 'weekday carried over from the old single-day setting (Monday)');
select throws_ok($$ update public.settings set discovery_weekdays = '{7}' $$, '23514', null, 'weekdays must be 0–6');
select throws_ok($$ update public.settings set discovery_weekdays = '{}' $$, '23514', null, 'at least one weekday');
select throws_ok($$ update public.settings set discovery_month_day = 29 $$, '23514', null, 'day of month is 1–28');
select throws_ok($$ update public.settings set discovery_frequency = 'hourly' $$, '23514', null, 'frequency is daily, weekly or monthly');
select throws_ok(
  $$ insert into public.notifications (kind, title, discovery_run_id) values ('discovery_completed', 'again', '00000000-0000-0000-0000-0000000000e1') $$,
  '23505', null, 'one notification per run and kind');

-- Member ----------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is((select count(*)::int from public.notifications), 1, 'members read team notifications');
select throws_ok(
  $$ insert into public.notifications (kind, title) values ('discovery_failed', 'fake') $$,
  '42501', null, 'members cannot create notifications');
select lives_ok(
  $$ insert into public.notification_reads (notification_id, user_id) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a2') $$,
  'a member can mark a notification read for themself');
select throws_ok(
  $$ insert into public.notification_reads (notification_id, user_id) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a3') $$,
  '42501', null, 'a member cannot mark it read for someone else');
delete from public.notifications;
reset role;

select is((select count(*)::int from public.notifications), 1, 'member delete had no effect');

-- Another user does not see the member's read marks
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select is((select count(*)::int from public.notification_reads), 0, 'read marks are private to each user');
reset role;

-- Admin can delete notifications
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
delete from public.notifications where id = '00000000-0000-0000-0000-0000000000f1';
reset role;
select is((select count(*)::int from public.notifications), 0, 'admin can delete notifications (read marks cascade)');

select * from finish();
rollback;
