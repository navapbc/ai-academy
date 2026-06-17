-- realtime_dashboard_publication (P5.2d): live staff dashboard.
--
-- The staff dashboard (P5.2b/c) renders the P5.2a aggregation VIEWS, but Postgres
-- `postgres_changes` only fires on base-table rows. To drive the P5.2d "live
-- upgrade" we add the four base tables behind those views to the
-- `supabase_realtime` publication, so a change in any of them reaches a subscribed
-- staff client (which uses it only as a trigger to refetch the RLS-scoped views).
--
-- Delivery stays RLS-scoped: Realtime evaluates the row's RLS as the subscribing
-- user, so a champion only receives events for rows in their cohort (P5.1c/P5.2a).
-- This adds no policy or view.
--
-- INSERTs (new completions / quiz attempts / lab submissions -- the dominant
-- signal) deliver under RLS without extra config. DELETE/UPDATE would need
-- REPLICA IDENTITY FULL for RLS to see the OLD row; any delivered event triggers a
-- refetch regardless, so that edge is a minor latency note, not a correctness gap.
--
-- Idempotent: a guard checks pg_publication_tables before each ADD TABLE, so the
-- migration survives `supabase db reset`. The supabase_realtime publication is
-- created by the platform; guarded so a bare Postgres without it doesn't error.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['module_progress', 'quiz_attempts', 'lab_submissions', 'enrollments']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
