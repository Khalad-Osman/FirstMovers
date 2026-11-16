-- Ingestion: idempotent upsert, change detection, company linking, privileges.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.companies (id, display_name, normalized_key)
values ('00000000-0000-0000-0000-0000000000c1', 'Halloway Switchgear Enclosures Inc.', 'halloway switchgear enclosures');

create temp table batch as select $$[
  {"source_type":"canadabuys_award","source_record_id":"C-1","raw_entity_name":"HALLOWAY SWITCHGEAR ENCLOSURES INC","entity_key":"halloway switchgear enclosures","occupier_status":"not_applicable","signal_strength":"award","title":"Award 1","summary":null,"url":null,"published_at":"2026-09-01","event_at":"2026-08-20","location":"Vaughan, Ontario","raw":{"v":1}},
  {"source_type":"permit_mississauga","source_record_id":"BP-1","raw_entity_name":null,"entity_key":null,"occupier_status":"unresolved","signal_strength":"alteration","title":"Permit 1","summary":"x","url":null,"published_at":"2026-09-02","event_at":null,"location":"1 Main St, Mississauga","raw":{"v":1}}
]$$::jsonb as rows;

select results_eq($$ select inserted, updated from public.upsert_signals((select rows from batch)) $$,
  $$ values (2, 0) $$, 'first run inserts both');
select results_eq($$ select inserted, updated from public.upsert_signals((select rows from batch)) $$,
  $$ values (0, 0) $$, 'second identical run changes nothing');
select is((select count(*)::int from public.signals where source_record_id in ('C-1', 'BP-1')), 2, 'no duplicates after re-run');
select is((select company_id from public.signals where source_record_id = 'C-1'),
  '00000000-0000-0000-0000-0000000000c1'::uuid, 'award linked to company by entity_key');

update batch set rows = jsonb_set(rows, '{0,raw}', '{"v":2}');
select results_eq($$ select inserted, updated from public.upsert_signals((select rows from batch)) $$,
  $$ values (0, 1) $$, 'changed record updates in place');
select is((select raw->>'v' from public.signals where source_record_id = 'C-1'), '2', 'update applied');

-- Late linking after a company is created
update public.signals set entity_key = 'acme fabrication' where source_record_id = 'BP-1';
insert into public.companies (display_name, normalized_key) values ('Acme Fabrication Ltd.', 'acme fabrication');
select is(public.link_signals_to_companies(), 1, 'link_signals_to_companies links the new match');
select isnt((select company_id from public.signals where source_record_id = 'BP-1'), null, 'permit now linked');

select is((select canadabuys_min_value from public.settings), 100000::numeric, 'CanadaBuys minimum defaults to 100,000');
select is((select grants_min_value from public.settings), 100000::numeric, 'Federal grants minimum defaults to 100,000');

set local role authenticated;
select throws_ok($$ select public.upsert_signals('[]'::jsonb) $$, '42501', null, 'members cannot call upsert_signals');
reset role;
set local role anon;
select throws_ok($$ select * from public.ingestion_runs $$, '42501', null, 'anon cannot read ingestion runs');
reset role;

select * from finish();
rollback;
