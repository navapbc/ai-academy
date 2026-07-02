---
date: 2026-07-02
topic: x2-content-versioning
---

# X.2 — Content versioning discipline

## Problem Frame

The `content_versions` table (append-only snapshot history of a module) exists as substrate but has **zero rows and no writer** — nothing populates it. As the AI-literacy matrix evolves (v2→) through the admin CMS, there's no history of what a lesson's published content used to be, no changelog, and no audit of content evolution beyond the `content_changes` *action* log. X.2 makes versioning real: capture a content snapshot on each publish and let admins see the history.

## Decisions (resolved in brainstorm)

- **Scope = snapshot on publish + read-only history view.** On each publish, write a full content snapshot to `content_versions`; the CMS shows a read-only version history (version #, note, author, timestamp). **Rollback is deferred** (it must re-validate restored quiz/lab JSON — riskier; was already deferred once in the CMS plan).
- **Optional change note.** The CMS publish action accepts an optional "what changed" note, stored in `content_versions.note` and shown in the history. Makes the changelog meaningful.
- Snapshot happens on **publish only** (not save-draft) — publish is when `modules.version` bumps and live content changes.

## Requirements

- R1. On publish (admin CMS → `admin-content` Edge Function), write a `content_versions` row: `cell_id`, the new `version`, `snapshot_json` = the published (promoted-to-live) content, `author_id` = the admin, optional `note`, `created_at`. Same atomic operation as the publish (or immediately after), best-effort-consistent with the version bump.
- R2. The publish action accepts an **optional `note`** ("what changed"); persisted to `content_versions.note`.
- R3. `content_versions` is readable by **admins** (it's currently locked-down with no policy) so the CMS can show history — via an admin `select` RLS policy (`is_admin()`), consistent with the `content_changes`/`claude_usage` admin-read pattern.
- R4. The CMS lesson detail shows a **read-only version history**: each version's number, note, author, and timestamp, newest first.

## Success Criteria
- Publishing a lesson creates a `content_versions` snapshot row with the correct version + content + optional note.
- An admin can view a lesson's version history in the CMS.
- Non-admins cannot read `content_versions` (RLS).
- Snapshot writing never breaks/blocks a publish (best-effort, like the existing `content_changes` audit).

## Scope Boundaries
- **No rollback / restore** (deferred — needs re-validation of restored JSON).
- No diff/compare view (history list only).
- Snapshot on publish only (not on save-draft).
- No change to the learner read path or the version-bump logic (already exists).

## Key Technical Decisions
- Hook the writer into the existing `admin-content` publish path (service_role), alongside the existing `content_changes` audit write.
- Admin read via an `is_admin()` `select` policy on `content_versions` (reuse the established admin-read pattern), so the CMS reads it directly like other admin data.
- Snapshot = the promoted live content (the draft that publish promotes) — full field set, so a future rollback has what it needs.

## Open Questions

### Deferred to Planning
- [Affects R1][Technical] Exact `snapshot_json` shape (which live columns to include) and whether the write is inside the publish UPDATE transaction vs a follow-on insert (best-effort, mirroring `content_changes`).
- [Affects R4][Technical] Where the history view lives in the CMS detail (a section/expander) and how it reads (`content_versions` under the new admin policy, via a `cms*`/`adminContent` data-access module).

## Next Steps
-> `/ce:plan` (scope + note decided; rollback explicitly deferred).
