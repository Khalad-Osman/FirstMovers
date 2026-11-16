-- Stored signals (permits, contract awards) used as analysis evidence.
-- A source created from a signal is marked date_method = 'public_record' and
-- keeps a link to that signal (one source per signal).
alter type public.date_method add value if not exists 'public_record';

alter table public.sources
  add column signal_id uuid references public.signals (id) on delete set null;

create unique index sources_signal_id_key on public.sources (signal_id) where signal_id is not null;
