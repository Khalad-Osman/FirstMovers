-- Past deals are confidential: admins only. Run with: npm run db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001a1', 'pd-admin@test.local', '{"full_name":"PD Admin"}'),
  ('00000000-0000-0000-0000-0000000001a2', 'pd-member@test.local', '{"full_name":"PD Member"}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000001a1';

insert into public.past_deals (id, occupier, company_type, region, deal_type, size_sqft, created_by)
values ('00000000-0000-0000-0000-0000000001d1', 'Acme Foods Inc.', 'food_beverage', 'peel', 'lease', 120000, '00000000-0000-0000-0000-0000000001a1');

select throws_ok($$ insert into public.past_deals (occupier, region) values ('X', 'mars') $$, '23514', null, 'region must be a known key');
select throws_ok($$ insert into public.past_deals (occupier, size_sqft) values ('X', -5) $$, '23514', null, 'size must be positive');
select throws_ok($$ insert into public.past_deals (occupier) values ('   ') $$, '23514', null, 'occupier is required');

-- Member: sees nothing, can't write
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000001a2","role":"authenticated"}';
select is((select count(*)::int from public.past_deals), 0, 'members cannot read past deals');
select throws_ok(
  $$ insert into public.past_deals (occupier, created_by) values ('Sneaky Co', '00000000-0000-0000-0000-0000000001a2') $$,
  '42501', null, 'members cannot add past deals');
delete from public.past_deals;
reset role;
select is((select count(*)::int from public.past_deals), 1, 'member delete had no effect');

-- Admin: reads, adds as self, deletes
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}';
select is((select count(*)::int from public.past_deals), 1, 'admins read past deals');
select lives_ok(
  $$ insert into public.past_deals (occupier, created_by) values ('Beta 3PL Ltd.', '00000000-0000-0000-0000-0000000001a1') $$,
  'admins add past deals as themselves');
delete from public.past_deals;
select is((select count(*)::int from public.past_deals), 0, 'admins delete past deals');
reset role;

select * from finish();
rollback;
