-- P5.5c — champion review columns on lab_submissions.
--
-- The champion grade action (approve/return, via the service_role `review-grade`
-- Edge Function) records its decision on the submission row: the status flips to
-- 'reviewed' or 'returned', and we capture the reviewer, timestamp, and an optional
-- feedback note. The LLM rubric_scores are NOT touched (decision-only model — no
-- re-scoring). No RLS change: champion/admin already SELECT lab_submissions (P5.1c);
-- writes stay service_role-only (no client write policy).
--
-- Idempotent: add-column-if-not-exists so `supabase db reset` re-applies cleanly.

alter table public.lab_submissions
  add column if not exists review_note  text,
  add column if not exists reviewed_by  uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at  timestamptz;

-- Guard: reviews are reviewer-only. `lab_submissions` has an owner-UPDATE policy
-- (init_core) that the learner's own grading flow relies on (saveGrade client-writes
-- rubric_scores + status='reviewable'). Without a column guard, an owner could also
-- client-write status='reviewed'/'returned' or the review_* fields, faking a review
-- and bypassing the service_role review-grade function. A BEFORE UPDATE trigger
-- (SECURITY INVOKER → current_user is the real session role) blocks the
-- authenticated/anon path from recording a review decision, while leaving the
-- learner's status→'reviewable' + rubric_scores writes working. service_role (the
-- function) / postgres / supabase_admin (migrations) stay allowed. Mirrors the W2-2
-- prevent_self_role_change pattern.
create or replace function public.prevent_owner_review_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('service_role', 'supabase_admin', 'postgres') then
    if (new.status is distinct from old.status and new.status in ('reviewed', 'returned'))
       or new.review_note is distinct from old.review_note
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'review decisions may only be recorded by a reviewer'
        using errcode = '42501'; -- insufficient_privilege
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists lab_submissions_prevent_owner_review_write on public.lab_submissions;
create trigger lab_submissions_prevent_owner_review_write
  before update on public.lab_submissions
  for each row
  execute function public.prevent_owner_review_write();
