-- Past deals (approved 2026-11-17): the team's own track record, used to rate
-- briefs on past-deal fit. Confidential: admins only (members and the demo
-- account cannot read them; briefs show only a fit label to non-admins).
create table public.past_deals (
  id uuid primary key default gen_random_uuid(),
  occupier text not null constraint past_deals_occupier check (length(trim(occupier)) between 1 and 200),
  company_type text constraint past_deals_company_type check (company_type in ('manufacturer', 'logistics_3pl', 'food_beverage', 'energy_nuclear', 'data_centre_tech', 'other')),
  region text constraint past_deals_region check (region in ('peel', 'york', 'halton', 'durham', 'toronto', 'hamilton_niagara', 'waterloo', 'wider_ontario')),
  municipality text constraint past_deals_municipality check (length(municipality) <= 120),
  deal_type text constraint past_deals_deal_type check (deal_type in ('lease', 'sale_purchase', 'expansion_in_place', 'new_build')),
  size_sqft numeric constraint past_deals_size check (size_sqft > 0 and size_sqft <= 50000000),
  clear_height_ft numeric constraint past_deals_clear_height check (clear_height_ft > 0 and clear_height_ft <= 200),
  deal_date date,
  notes text constraint past_deals_notes check (length(notes) <= 2000),
  source text not null default 'csv' constraint past_deals_source check (source in ('csv', 'pdf')),
  source_file text constraint past_deals_source_file check (length(source_file) <= 255),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index past_deals_created_idx on public.past_deals (created_at desc);
create index past_deals_created_by_idx on public.past_deals (created_by);

alter table public.past_deals enable row level security;
create policy "past_deals: admin read" on public.past_deals for select to authenticated using ((select public.is_admin()));
create policy "past_deals: admin insert" on public.past_deals for insert to authenticated with check ((select public.is_admin()) and created_by = (select auth.uid()));
create policy "past_deals: admin delete" on public.past_deals for delete to authenticated using ((select public.is_admin()));
