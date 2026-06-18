import { useState } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle2, Save, Send } from 'lucide-react';
import type { CmsLessonDetailData } from '../../lib/cmsContent';
import { saveDraft, publishLesson, isValidVideoUrl, type DraftFields } from '../../lib/adminContent';
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
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const videoOk = isValidVideoUrl(videoUrl);
  const bodyEmpty = bodyMd.trim() === '';

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

  async function handlePublish() {
    if (!videoOk) return;
    setBusy('publish');
    setError(null);
    setNotice(null);
    try {
      // Persist the latest edits first so what's on screen is exactly what goes
      // live, then promote draft → live in the function (single server step).
      await saveDraft(lesson.cellId, buildDraft());
      await publishLesson(lesson.cellId);
      setNotice('Published. Learners now see this version — no redeploy needed.');
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
          onClick={handlePublish}
          disabled={busy !== null || !videoOk}
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
