-- Phase 5: discovery (approved 2026-11-10)
-- New columns on discovery_runs for step-wise progress and the run summary.

alter table public.discovery_runs
  add column progress text,                            -- current step, human readable
  add column candidates jsonb not null default '[]',   -- screened candidates: score, verdict, reason, shortlisted
  add column outcomes jsonb not null default '[]';     -- per shortlisted candidate: brief / not verified / failed / skipped
