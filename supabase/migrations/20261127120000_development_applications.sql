-- Oakville and Hamilton development applications as signal sources (approved 2026-11-25).
alter type public.signal_source_type add value if not exists 'devapp_oakville';
alter type public.signal_source_type add value if not exists 'devapp_hamilton';
alter type public.signal_strength add value if not exists 'development';
