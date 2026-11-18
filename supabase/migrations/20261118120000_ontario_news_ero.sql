-- Ontario newsroom company investment announcements and Environmental Registry
-- of Ontario approval notices as signal sources (approved 2026-11-18).
alter type public.signal_source_type add value if not exists 'ontario_news';
alter type public.signal_source_type add value if not exists 'ero_approval';
alter type public.signal_strength add value if not exists 'announcement';
alter type public.signal_strength add value if not exists 'env_approval';
