import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Loader2, AlertCircle } from 'lucide-react';
import { useDialogA11y } from '../../lib/useDialogA11y';
import { createCustomLesson, type CreatableOrigin } from '../../lib/adminContent';
import type { ModuleType } from '../../types';

// Create a free-form lesson (P5.4-6; course variant U3). An admin names the
// lesson, picks a content type, and chooses where it lives: a standalone custom
// lesson (default — public, `custom-<slug>`) or a Course lesson (program-visible,
// `course-<slug>`; assigned to a week afterwards via Course management). Either
// way the server generates the id and inserts a hidden DRAFT row (stage=null) —
// invisible to learners until it is published (R3). On success the parent
// re-fetches and opens the new lesson's editor so the admin can immediately add
// body/quiz/lab content via the reused Chunk 3–5 editors. Title is set here
// (the lesson editors don't edit it).

// The content types an admin can pick for a new lesson. Each maps to the editor
// the admin will reach from the lesson detail; `content` (markdown) is the default.
const LESSON_TYPES: { value: ModuleType; label: string }[] = [
  { value: 'content', label: 'Content (markdown lesson)' },
  { value: 'lab', label: 'Lab (hands-on exercise)' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'sorter', label: 'Scenario sorter' },
  { value: 'simulator', label: 'Simulator' },
  { value: 'glossary', label: 'Glossary' },
];

export default function CreateLessonModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the new lesson's server-generated cell_id after a successful create. */
  onCreated: (cellId: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ModuleType>('content');
  const [origin, setOrigin] = useState<CreatableOrigin>('custom');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useDialogA11y<HTMLDivElement>(isOpen, onClose);

  const isValid = title.trim().length > 0;
  const showWarning = touched && !isValid;

  const submit = async () => {
    setTouched(true);
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Only the course variant passes origin — the default custom call stays
      // byte-identical to the pre-U3 contract.
      const res =
        origin === 'course'
          ? await createCustomLesson(title.trim(), type, 'course')
          : await createCustomLesson(title.trim(), type);
      // Reset for next time, then hand the new id back to the parent.
      setTitle('');
      setType('content');
      setOrigin('custom');
      setTouched(false);
      setSubmitting(false);
      if (res.cellId) onCreated(res.cellId);
      else onClose();
    } catch (err: unknown) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Could not create the lesson.');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-nava-plum/40 backdrop-blur-sm"
          />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-lesson-title"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-nava-mint flex items-center justify-center text-nava-green">
                    <Plus className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 id="create-lesson-title" className="text-xl font-bold text-nava-plum">
                      New lesson
                    </h2>
                    <p className="text-sm text-gray-500">
                      A standalone lesson outside the matrix — ungated and hidden until you publish.
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-600"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="new-lesson-title" className="text-sm font-bold text-gray-700">
                      Title
                    </label>
                    {showWarning && (
                      <span
                        id="new-lesson-title-warning"
                        role="alert"
                        className="text-[10px] font-bold text-red-500 uppercase tracking-wider"
                      >
                        Enter a title
                      </span>
                    )}
                  </div>
                  <input
                    id="new-lesson-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => setTouched(true)}
                    maxLength={300}
                    aria-invalid={showWarning}
                    aria-describedby={showWarning ? 'new-lesson-title-warning' : undefined}
                    className={`w-full bg-gray-50 border-2 rounded-xl px-4 py-3 focus:ring-2 outline-none transition-all text-sm ${
                      showWarning ? 'border-red-100 focus:ring-red-200' : 'border-gray-50 focus:ring-nava-green'
                    }`}
                    placeholder="e.g. Prompt patterns for case workers"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="new-lesson-type" className="text-sm font-bold text-gray-700">
                    Type
                  </label>
                  <select
                    id="new-lesson-type"
                    value={type}
                    onChange={(e) => setType(e.target.value as ModuleType)}
                    className="w-full bg-gray-50 border-2 border-gray-50 rounded-xl px-4 py-3 focus:ring-2 focus:ring-nava-green outline-none transition-all text-sm"
                  >
                    {LESSON_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Origin choice (U3): custom (default) vs course lesson. */}
                <fieldset className="space-y-2">
                  <legend className="text-sm font-bold text-gray-700">Lesson home</legend>
                  <div className="flex items-start gap-2">
                    <input
                      id="new-lesson-origin-custom"
                      type="radio"
                      name="new-lesson-origin"
                      value="custom"
                      checked={origin === 'custom'}
                      onChange={() => setOrigin('custom')}
                      className="mt-0.5 border-gray-300 text-nava-green focus:ring-nava-green"
                    />
                    <div className="text-sm text-gray-700">
                      <label htmlFor="new-lesson-origin-custom" className="font-semibold">
                        Standalone lesson
                      </label>
                      <p className="text-xs text-gray-500">
                        Lives under “Resources &amp; additional lessons” — visible to everyone once
                        published.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <input
                      id="new-lesson-origin-course"
                      type="radio"
                      name="new-lesson-origin"
                      value="course"
                      checked={origin === 'course'}
                      onChange={() => setOrigin('course')}
                      className="mt-0.5 border-gray-300 text-nava-green focus:ring-nava-green"
                    />
                    <div className="text-sm text-gray-700">
                      <label htmlFor="new-lesson-origin-course" className="font-semibold">
                        Course lesson
                      </label>
                      <p className="text-xs text-gray-500">
                        Program-visible (enrolled learners and staff). Assign it to a course week
                        via Course management after creating it.
                      </p>
                    </div>
                  </div>
                </fieldset>

                {error && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex gap-2" role="alert">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="flex-1 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all bg-nava-green text-white hover:bg-nava-plum disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="w-4 h-4" aria-hidden="true" />
                  )}
                  {submitting ? 'Creating…' : 'Create lesson'}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 bg-white border-2 border-gray-100 text-gray-600 font-bold py-3.5 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
