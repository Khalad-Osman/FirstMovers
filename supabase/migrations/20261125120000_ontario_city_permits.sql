-- Building permits from Kitchener, Waterloo, Kingston, Barrie and Ottawa and
-- AGCO cannabis store authorizations as signal sources, and the new regions for
-- past deals (approved 2026-11-23).
alter type public.signal_source_type add value if not exists 'permit_kitchener';
alter type public.signal_source_type add value if not exists 'permit_waterloo';
alter type public.signal_source_type add value if not exists 'permit_kingston';
alter type public.signal_source_type add value if not exists 'permit_barrie';
alter type public.signal_source_type add value if not exists 'permit_ottawa';
alter type public.signal_source_type add value if not exists 'agco_cannabis';
alter type public.signal_strength add value if not exists 'store_licence';

alter table public.past_deals drop constraint past_deals_region;
alter table public.past_deals add constraint past_deals_region
  check (region in ('peel', 'york', 'halton', 'durham', 'toronto', 'hamilton_niagara', 'waterloo', 'ottawa', 'kingston', 'barrie_simcoe', 'wider_ontario'));
