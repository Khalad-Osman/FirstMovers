-- RLS and integrity tests. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- Fixtures (as postgres, bypassing RLS) ---------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', '{"full_name":"Admin User"}'),
  ('00000000-0000-0000-0000-00000000000b', 'member@test.local', '{"full_name":"Member User"}');

select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  'member', 'new users get a member profile');
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'),
  'Member User', 'full_name copied from sign-up metadata');

-- Direct SQL (no auth.uid()) can promote the first admin
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'admin', 'direct SQL can promote an admin');

insert into public.companies (id, display_name, normalized_key)
values ('00000000-0000-0000-0000-0000000000c1', 'Test Fabrication Holdings Inc.', 'test fabrication holdings');

insert into public.briefs (id, company_id, origin, rating, analysis, model)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1',
        'discovered', 'worth_monitoring', '{}', 'test-model');
insert into public.briefs (company_id, origin, rating, analysis, model)
values ('00000000-0000-0000-0000-0000000000c1', 'discovered', 'strong_signal', '{}', 'test-model');

select results_eq(
  $$ select version from public.briefs order by version $$,
  array[1, 2], 'versions are assigned per company');
select is(
  (select rating::text from public.latest_briefs), 'strong_signal',
  'latest_briefs returns the newest version');

-- Anonymous: no access at all -------------------------------------------------
set local role anon;
select throws_ok($$ select * from public.briefs $$, '42501', null, 'anon cannot read briefs');
select throws_ok($$ select * from public.companies $$, '42501', null, 'anon cannot read companies');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select * from public.latest_briefs $$, '42501', null, 'anon cannot read latest_briefs');
reset role;

-- Member ----------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is((select count(*)::int from public.briefs), 2, 'member can read briefs');
select is((select count(*)::int from public.settings), 1, 'member can read settings');

update public.briefs set dismissed = true where id = '00000000-0000-0000-0000-0000000000b1';
delete from public.briefs where id = '00000000-0000-0000-0000-0000000000b1';
select throws_ok(
  $$ insert into public.companies (display_name, normalized_key) values ('X Ltd.', 'x') $$,
  '42501', null, 'member cannot insert companies');
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', 'Only admins can change roles', 'member cannot self-promote');
select lives_ok(
  $$ update public.profiles set full_name = 'Renamed' where id = '00000000-0000-0000-0000-00000000000b' $$,
  'member can update own name');
update public.profiles set full_name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000a';

select lives_ok(
  $$ insert into public.watchlist (company_id) values ('00000000-0000-0000-0000-0000000000c1') $$,
  'member can add to watchlist');
select is(
  (select added_by from public.watchlist), '00000000-0000-0000-0000-00000000000b'::uuid,
  'watchlist added_by defaults to the caller');
reset role;

select is(
  (select dismissed from public.briefs where id = '00000000-0000-0000-0000-0000000000b1'),
  false, 'member update to dismiss had no effect');
select is(
  (select count(*)::int from public.briefs), 2, 'member delete had no effect');
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Admin User', 'member cannot edit another profile');

-- Admin -----------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

update public.briefs
set dismissed = true, dismissed_by = '00000000-0000-0000-0000-00000000000a', dismissed_at = now()
where id = '00000000-0000-0000-0000-0000000000b1';
select is(
  (select dismissed from public.briefs where id = '00000000-0000-0000-0000-0000000000b1'),
  true, 'admin can dismiss a brief');

select throws_ok(
  $$ update public.briefs set rating = 'no_meaningful_signal' where id = '00000000-0000-0000-0000-0000000000b1' $$,
  '42501', 'Briefs are immutable; insert a new version instead', 'brief content cannot be overwritten');
reset role;

select throws_ok(
  $$ update public.settings set discovery_cap = 9 $$,
  '23514', null, 'discovery cap is limited to 8');

-- FK set-null maintenance is allowed; repointing a reference is not.
insert into public.discovery_runs (id) values ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2');
insert into public.briefs (id, company_id, origin, rating, analysis, model, discovery_run_id, created_by)
values ('00000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000c1', 'discovered', 'worth_monitoring', '{}', 'test-model',
        '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000b');
select throws_ok(
  $$ update public.briefs set discovery_run_id = '00000000-0000-0000-0000-0000000000d2' where id = '00000000-0000-0000-0000-0000000000b9' $$,
  '42501', 'Briefs are immutable; insert a new version instead', 'a brief cannot be repointed to another run');
select lives_ok(
  $$ delete from public.discovery_runs where id = '00000000-0000-0000-0000-0000000000d1' $$,
  'deleting a discovery run that produced a brief works (FK set null)');
select is((select discovery_run_id from public.briefs where id = '00000000-0000-0000-0000-0000000000b9'), null, 'brief kept, run link cleared');
select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-00000000000b' $$,
  'deleting a user who created a brief works (FK set null)');

select * from finish();
rollback;
