-- Bug fix: the brief immutability guard also blocked the database's own
-- ON DELETE SET NULL maintenance, so deleting a discovery run, a triggering
-- signal or a user who created/dismissed a brief failed. Allow exactly that:
-- a reference column changing to NULL. Content columns stay immutable.
create or replace function public.guard_brief_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ignored text[] := array['dismissed', 'dismissed_by', 'dismissed_at'];
  ref text;
begin
  -- Reference columns may only be cleared (FK set-null), never repointed.
  foreach ref in array array['trigger_signal_id', 'discovery_run_id', 'created_by'] loop
    if (to_jsonb(new) ->> ref) is null and (to_jsonb(old) ->> ref) is not null then
      ignored := ignored || ref;
    end if;
  end loop;

  if (to_jsonb(new) - ignored) is distinct from (to_jsonb(old) - ignored) then
    raise exception 'Briefs are immutable; insert a new version instead'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
