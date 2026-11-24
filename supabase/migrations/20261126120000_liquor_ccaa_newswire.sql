-- AGCO liquor licence applications, CCAA creditor protection filings and
-- newswire.ca releases as signal sources (approved 2026-11-24).
alter type public.signal_source_type add value if not exists 'agco_liquor';
alter type public.signal_source_type add value if not exists 'ccaa_filing';
alter type public.signal_source_type add value if not exists 'newswire_release';
alter type public.signal_strength add value if not exists 'insolvency';
