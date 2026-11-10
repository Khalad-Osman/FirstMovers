-- Live Research table: readable by signed-in users, not writable through the user session.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000b', 'member@test.local');
insert into public.research_sessions (id, mode, query) values
  ('00000000-0000-0000-0000-0000000000f1', 'company', 'Test Co Inc.');

select has_column('public', 'sources', 'date_method', 'sources.date_method exists');

set local role anon;
select throws_ok($$ select * from public.research_sessions $$, '42501', null, 'anon cannot read research sessions');
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from public.research_sessions), 1, 'member can read research sessions');
select throws_ok(
  $$ insert into public.research_sessions (mode, query) values ('company', 'x') $$,
  '42501', null, 'member cannot insert research sessions directly');
update public.research_sessions set status = 'failed';
reset role;
select is((select status::text from public.research_sessions), 'searching', 'member update has no effect');

select * from finish();
rollback;
