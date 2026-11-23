-- Caledon and Oakville building permits (including Caledon applications under
-- review) and FedDev Ontario funding announcements as signal sources
-- (approved 2026-11-23).
alter type public.signal_source_type add value if not exists 'permit_caledon';
alter type public.signal_source_type add value if not exists 'permit_oakville';
alter type public.signal_source_type add value if not exists 'feddev_news';
