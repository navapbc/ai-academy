-- Retire workshops (cohort-restructure U12, R4): the standalone workshops
-- feature (X.3) is superseded by the course/week experience (U2/U3). Prod was
-- never deployed and the feature was staging-only and days old, so there is no
-- automated transform: any authored workshop is recreated manually as a course
-- week. Existing rows are logged to the migration output via RAISE NOTICE —
-- that log IS the audit trail — and then the table is dropped.
--
-- What 20260702020000_workshops.sql created and what happens to it here:
--   * table public.workshops                     -> dropped below
--   * RLS + policy "Workshops are viewable by authenticated users"
--                                                -> dropped with the table
--                                                   (policies live on the table)
-- No workshops-only functions, triggers, or views were ever created, and the
-- admin-workshops Edge Function (deleted in the same change) was the only
-- writer, so nothing else is left dangling.
--
-- Idempotent: the logging block is guarded on table existence and the drop is
-- `if exists`, so a re-run (or a reset replay) is a clean no-op.

do $$
declare
  ws record;
  n  integer := 0;
begin
  if to_regclass('public.workshops') is not null then
    for ws in
      select id, title, step_cell_ids from public.workshops order by created_at
    loop
      raise notice 'retire_workshops: dropping workshop id=% title=% step_cell_ids=%',
        ws.id, ws.title, ws.step_cell_ids;
      n := n + 1;
    end loop;
    if n = 0 then
      raise notice 'retire_workshops: public.workshops is empty — nothing to log.';
    else
      raise notice 'retire_workshops: % row(s) logged above; dropping table.', n;
    end if;
  else
    raise notice 'retire_workshops: public.workshops does not exist — nothing to do.';
  end if;
end $$;

drop table if exists public.workshops cascade;
