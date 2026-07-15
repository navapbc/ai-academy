import { useState } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle2, Save, Send } from 'lucide-react';
import type { CmsLessonDetailData } from '../../lib/cmsContent';
import {
  saveDraft,
  publishLesson,
  isValidVideoUrl,
  NOTE_MAX_LENGTH,
  type DraftFields,
} from '../../lib/adminContent';
import LessonMarkdown from '../LessonMarkdown';
import { StatusBadge } from './StatusBadge';

// Lesson editor for the admin CMS (P5.4-3): the headline draft → preview → publish
// flow for the text-shaped fields (markdown body, video link, tutor reference).
//   • Save   → posts a `save-draft` action (writes modules.draft only; the LIVE
//              columns and the learner view are untouched — R3).
//   • Preview→ the right pane renders the working body through the SAME renderer
//              the learner sees (LessonMarkdown), so preview ≡ published (R9).
//   • Publish→ saves the current working copy, then promotes draft → live and
//              bumps the version in one server step (R4 — no redeploy).
// Quiz/lab editing arrives in P5.4-4 / P5.4-5; those fields pass through untouched.

/** Working values seed from the staged draft if one exists, else the live content. */
function initial(lesson: CmsLessonDetailData) {
  return {
    bodyMd: lesson.draft?.body_md ?? lesson.bodyMd ?? '',
    videoUrl: lesson.draft?.video_url ?? lesson.videoUrl ?? '',
    tutorRef: lesson.draft?.tutor_reference_md ?? lesson.tutorReference ?? '',
  };
}

export default function LessonEditor({
  lesson,
  onBack,
  onSaved,
}: {
  lesson: CmsLessonDetailData;
  onBack: () => void;
  /** Called after a successful save/publish so the parent re-fetches the list. */
  onSaved: () => void;
}) {
  const seed = initial(lesson);
  const [bodyMd, setBodyMd] = useState(seed.bodyMd);
  const [videoUrl, setVideoUrl] = useState(seed.videoUrl);
  const [tutorRef, setTutorRef] = useState(seed.tutorRef);
  const [note, setNote] = useState('');
  // U10: publish may additionally reset every learner's progress for this
  // module. Default OFF, and a checked box still requires an explicit confirm
  // step before the publish fires — the reset is destructive and irreversible.
  const [resetProgress, setResetProgress] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const videoOk = isValidVideoUrl(videoUrl);
  const bodyEmpty = bodyMd.trim() === '';
  const noteTooLong = note.trim().length > NOTE_MAX_LENGTH;

  // The working copy posted to the function. save-draft REPLACES the whole `draft`
  // column (admin-content index.ts), so we merge over any existing draft to
  // preserve fields this editor doesn't manage (e.g. a pending quiz/lab draft from
  // P5.4-4/-5). Empty optional text fields persist as null (a cleared video link /
  // tutor reference removes it), matching admin-content-core.validateDraft.
  function buildDraft(): DraftFields {
    return {
      ...lesson.draft,
      // Coerce a blank/whitespace-only body to null so it matches `bodyEmpty`
      // (which also trims) — never persist whitespace as if it were content.
      body_md: bodyMd.trim() === '' ? null : bodyMd,
      video_url: videoUrl.trim() === '' ? null : videoUrl.trim(),
      tutor_reference_md: tutorRef.trim() === '' ? null : tutorRef,
    };
  }

  async function handleSave() {
    if (!videoOk) return;
    setBusy('save');
    setError(null);
    setNotice(null);
    try {
      await saveDraft(lesson.cellId, buildDraft());
      setNotice('Draft saved. Learners still see the published lesson until you publish.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the draft.');
    } finally {
      setBusy(null);
    }
  }

  async function handlePublish(confirmed = false) {
    if (!videoOk || noteTooLong) return;
    // U10 confirm step: a reset-flagged publish first switches into an explicit
    // inline confirmation; ONLY the confirm button (confirmed=true) reaches the
    // network call — re-clicking the main Publish button keeps the panel open.
    if (resetProgress && !confirmed) {
      setConfirmingReset(true);
      return;
    }
    setConfirmingReset(false);
    setBusy('publish');
    setError(null);
    setNotice(null);
    try {
      // Persist the latest edits first so what's on screen is exactly what goes
      // live, then promote draft → live in the function (single server step).
      // The optional change-note rides on the publish call (X.2) → content_versions.
      await saveDraft(lesson.cellId, buildDraft());
      await publishLesson(lesson.cellId, note, resetProgress);
      setNote('');
      setNotice(
        resetProgress
          ? 'Published, and learner progress for this lesson was reset. Learners will see it as not yet completed.'
          : 'Published. Learners now see this version — no redeploy needed.',
      );
      setResetProgress(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish the lesson.');
    } finally {
      setBusy(null);
      // A draft may have been persisted even if the publish step failed; refresh
      // so the list/detail reflect the true DB state (status + pending-draft).
      onSaved();
    }
  }

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-nava-green hover:text-nava-plum transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to lessons
      </button>

      <header className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-widest text-nava-green">
            {lesson.cellId}
          </span>
          <StatusBadge status={lesson.status} archived={lesson.archived} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900" tabIndex={-1}>
          Edit · {lesson.title}
        </h1>
        <p className="text-sm text-gray-600">
          {lesson.type} · {lesson.stage ? `Stage ${lesson.stage}` : 'Additional lesson'} · v
          {lesson.version}
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2" role="alert">
          <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {notice && (
        <div
          className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-start gap-2"
          role="status"
        >
          <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm text-green-800">{notice}</p>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
        <div className="space-y-1.5">
          <label
            htmlFor="cms-video-url"
            className="block text-[11px] font-bold uppercase tracking-widest text-gray-500"
          >
            Video link
          </label>
          <input
            id="cms-video-url"
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://…"
            aria-invalid={!videoOk}
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-nava-green focus:outline-none ${
              videoOk ? 'border-gray-300' : 'border-red-400'
            }`}
          />
          {!videoOk && (
            <p className="text-xs text-red-600" role="alert">
              Enter a valid http(s) URL, or leave blank to remove the video.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="cms-tutor-ref"
            className="block text-[11px] font-bold uppercase tracking-widest text-gray-500"
          >
            Tutor reference
          </label>
          <p className="text-xs text-gray-500">
            Extra grounding for the in-app tutor. Only the published version is used.
          </p>
          <textarea
            id="cms-tutor-ref"
            value={tutorRef}
            onChange={(e) => setTutorRef(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-nava-green focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="cms-body-md"
              className="block text-[11px] font-bold uppercase tracking-widest text-gray-500"
            >
              Lesson body (markdown)
            </label>
            {bodyEmpty && (
              <span className="text-xs text-amber-600">Body is empty — you can save, but learners will see no lesson text.</span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <textarea
              id="cms-body-md"
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
              rows={18}
              spellCheck
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono leading-relaxed focus:ring-2 focus:ring-nava-green focus:outline-none"
            />
            <div
              className="rounded-lg border border-gray-200 bg-gray-50 p-4 overflow-auto max-h-[28rem]"
              aria-label="Live preview"
            >
              {bodyEmpty ? (
                <p className="text-sm text-gray-400">Nothing to preview yet.</p>
              ) : (
                <LessonMarkdown content={bodyMd} />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="cms-change-note"
          className="block text-[11px] font-bold uppercase tracking-widest text-gray-500"
        >
          What changed? (optional)
        </label>
        <p className="text-xs text-gray-500">
          A short note saved with this publish for the version history. Optional.
        </p>
        <input
          id="cms-change-note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX_LENGTH + 100}
          placeholder="e.g. Fixed the reflection prompt wording"
          aria-invalid={noteTooLong}
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-nava-green focus:outline-none ${
            noteTooLong ? 'border-red-400' : 'border-gray-300'
          }`}
        />
        {noteTooLong && (
          <p className="text-xs text-red-600" role="alert">
            Keep the note to {NOTE_MAX_LENGTH} characters or fewer ({note.trim().length} now).
          </p>
        )}
      </div>

      {/* U10: publish-time progress reset — checkbox (default off) + confirm step. */}
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <input
            id="cms-reset-progress"
            type="checkbox"
            checked={resetProgress}
            onChange={(e) => {
              setResetProgress(e.target.checked);
              setConfirmingReset(false);
            }}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-nava-green focus:ring-nava-green"
          />
          <div>
            <label htmlFor="cms-reset-progress" className="text-sm font-semibold text-gray-800">
              Reset learner progress for this module
            </label>
            <p className="text-xs text-gray-500">
              Clears every learner&apos;s completion for this lesson when it publishes. They will
              need to do the updated activity again. Quiz attempts and lab submissions are kept.
            </p>
          </div>
        </div>
        {confirmingReset && (
          <div
            role="alertdialog"
            aria-label="Confirm progress reset"
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 space-y-3"
          >
            <p className="text-sm text-amber-900">
              <span className="font-bold">This cannot be undone.</span> Publishing will permanently
              clear every learner&apos;s completion for this lesson — including work saved offline.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handlePublish(true)}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Publish and reset progress
              </button>
              <button
                onClick={() => setConfirmingReset(false)}
                disabled={busy !== null}
                className="text-sm font-bold text-gray-600 hover:text-gray-900 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={busy !== null || !videoOk}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {busy === 'save' ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="w-4 h-4" aria-hidden="true" />
          )}
          Save draft
        </button>
        <button
          onClick={() => handlePublish()}
          disabled={busy !== null || !videoOk || noteTooLong}
          className="inline-flex items-center gap-2 rounded-xl bg-nava-green px-5 py-2 text-sm font-bold text-white hover:bg-nava-plum disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {busy === 'publish' ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="w-4 h-4" aria-hidden="true" />
          )}
          Publish
        </button>
      </div>
    </div>
  );
}
