-- content_versions admin read (X.2 Unit 1): make the dormant snapshot-history
-- table readable by admins so the CMS can show a lesson's version history.
--
-- content_versions (20260602130334) was created with RLS enabled and NO
-- permissive policy — fully locked down: the only writer is the service_role
-- client inside the admin-content Edge Function (service_role bypasses RLS), and
-- nobody could read it. X.2 adds exactly ONE policy: an admin SELECT via the
-- existing public.is_admin() SECURITY DEFINER helper (20260612000000 — do NOT
-- redefine it here). NO insert/update/delete policy is added on purpose: writes
-- stay service_role-only, mirroring the claude_usage / content_changes
-- locked-down-write + admin-read pattern.
--
-- Idempotent + additive: guarded so `supabase db reset` (and any re-run) applies
-- cleanly — the policy is created only when it does not already exist.
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'content_versions_admin_read'
  ) then
    create policy content_versions_admin_read
      on public.content_versions for select
      to authenticated
      using (public.is_admin());
  end if;
end $$;
