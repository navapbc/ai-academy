import { useMemo, useState } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, CheckCircle2, Save, Send } from 'lucide-react';
import type { CmsLessonDetailData } from '../../lib/cmsContent';
import { saveDraft, publishLesson, type DraftFields } from '../../lib/adminContent';
import {
  validateLabConfig,
  parseAndValidateLabConfig,
  parseAndValidateSorterConfig,
  LAB_KINDS,
  FORM_LAB_KINDS,
  LAB_KIND_LABELS,
  SORTER_KIND,
  type ValidationResult,
} from '../../lib/labValidation';
import type { LabConfig } from '../../types';
import { StatusBadge } from './StatusBadge';

// The editor manages lab_config_json for the 22 LabConfig kinds, plus the
// scenario-sorter — which lives in the separate sorter_config_json column (cell
// 1.3). 'scenario-sort' is offered in the picker as a JSON kind that writes that
// other column (the plan's "the lab editor also covers sorter_config_json").
type EditorKind = LabConfig['kind'] | typeof SORTER_KIND;

// Lab editor for the admin CMS (P5.4-5): a kind-aware editor over lab_config_json.
// Per the agreed cut line, the three scalar-only kinds (reflection, failure-log,
// paired-calibration) get a structured form; every other kind is edited as
// validated JSON (the W2-7/D-16 fix — a malformed config is blocked with a named
// error, never a white-screen at read). Mirrors QuizEditor's draft → publish flow:
//   • Save   → save-draft with the assembled lab_config_json, merged over any
//              existing draft so a pending body/quiz edit isn't wiped (R3).
//   • Publish→ saves then promotes draft → live (R4 — no redeploy).
// Inline validation uses the SAME rules as the server (labValidation mirrors the
// Deno core); the function re-validates on write and stays authoritative.

type FieldType = 'text' | 'textarea' | 'number';
interface FormField {
  key: string; // flat key; dotted keys (e.g. 'offTask.label') map to nested objects
  label: string;
  type: FieldType;
  help?: string;
  optional?: boolean;
  default?: string;
}

// Structured-form specs for the scalar-only kinds. Required fields drive the
// validators; optional fields are omitted from the config when left blank.
const FORM_SPECS: Partial<Record<LabConfig['kind'], FormField[]>> = {
  reflection: [
    { key: 'prompt', label: 'Prompt', type: 'textarea' },
    { key: 'guidance', label: 'Guidance', type: 'textarea' },
    { key: 'minWords', label: 'Minimum words', type: 'number', default: '50' },
  ],
  'failure-log': [
    { key: 'intro', label: 'Intro', type: 'textarea', optional: true },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'helper', label: 'Helper', type: 'textarea' },
    { key: 'minEntries', label: 'Minimum entries (hard floor)', type: 'number', default: '3' },
    { key: 'targetEntries', label: 'Target entries (shown goal)', type: 'number', default: '6' },
    { key: 'taskPlaceholder', label: 'Task field placeholder', type: 'text', optional: true },
    { key: 'errorPlaceholder', label: 'Error field placeholder', type: 'text', optional: true },
    { key: 'caughtPlaceholder', label: 'Caught field placeholder', type: 'text', optional: true },
    { key: 'tellPlaceholder', label: 'Tell field placeholder', type: 'text', optional: true },
  ],
  'paired-calibration': [
    { key: 'intro', label: 'Intro', type: 'textarea', optional: true },
    { key: 'offTask.label', label: 'AI-off task — label', type: 'text' },
    { key: 'offTask.brief', label: 'AI-off task — brief', type: 'textarea' },
    { key: 'onTask.label', label: 'AI-on task — label', type: 'text' },
    { key: 'onTask.brief', label: 'AI-on task — brief', type: 'textarea' },
  ],
};

const NUMBER_KEYS = new Set(['minWords', 'minEntries', 'targetEntries']);

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let node = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
    node = node[k] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]] = value;
}

/** Flatten an existing config into the form's string-keyed state. */
function flattenToForm(kind: LabConfig['kind'], config: unknown): Record<string, string> {
  const spec = FORM_SPECS[kind] ?? [];
  const form: Record<string, string> = {};
  for (const f of spec) {
    const v = getPath(config, f.key);
    form[f.key] = v === undefined || v === null ? (f.default ?? '') : String(v);
  }
  return form;
}

/** Blank form state for a kind (defaults applied). */
function blankForm(kind: LabConfig['kind']): Record<string, string> {
  const spec = FORM_SPECS[kind] ?? [];
  const form: Record<string, string> = {};
  for (const f of spec) form[f.key] = f.default ?? '';
  return form;
}

/** Assemble a config object from the form state. Numbers parse to NaN when blank
 *  so the validator reports a clear error rather than silently coercing to 0. */
function assembleForm(kind: LabConfig['kind'], form: Record<string, string>): Record<string, unknown> {
  const spec = FORM_SPECS[kind] ?? [];
  const config: Record<string, unknown> = { kind };
  for (const f of spec) {
    const raw = form[f.key] ?? '';
    if (NUMBER_KEYS.has(f.key)) {
      setPath(config, f.key, raw.trim() === '' ? NaN : Number(raw));
    } else if (f.optional && raw.trim() === '') {
      // Omit blank optional fields entirely.
      continue;
    } else {
      setPath(config, f.key, raw);
    }
  }
  return config;
}

const isFormKindOf = (k: EditorKind): k is LabConfig['kind'] =>
  FORM_LAB_KINDS.includes(k as LabConfig['kind']);

/** Seed: prefer the staged draft's lab config, else the live one, else none. */
function initialLabConfig(lesson: CmsLessonDetailData): LabConfig | null {
  return (lesson.draft?.lab_config_json as LabConfig | undefined) ?? lesson.labConfig ?? null;
}
function initialSorterConfig(lesson: CmsLessonDetailData): unknown {
  return lesson.draft?.sorter_config_json ?? lesson.sorterConfig ?? null;
}

export default function LabEditor({
  lesson,
  onBack,
  onSaved,
}: {
  lesson: CmsLessonDetailData;
  onBack: () => void;
  /** Called after a successful save/publish so the parent re-fetches the list. */
  onSaved: () => void;
}) {
  const existingLab = initialLabConfig(lesson);
  const existingSorter = initialSorterConfig(lesson);
  // A cell with no lab but a sorter (1.3) opens on the sorter; otherwise the lab
  // kind, defaulting to reflection for a cell with no exercise yet.
  const initialKind: EditorKind = existingLab?.kind ?? (existingSorter ? SORTER_KIND : 'reflection');

  const [kind, setKind] = useState<EditorKind>(initialKind);
  const [form, setForm] = useState<Record<string, string>>(() =>
    isFormKindOf(initialKind) ? flattenToForm(initialKind, existingLab) : {},
  );
  const [jsonText, setJsonText] = useState<string>(() => {
    if (initialKind === SORTER_KIND) return existingSorter ? JSON.stringify(existingSorter, null, 2) : '';
    return existingLab && !isFormKindOf(initialKind) ? JSON.stringify(existingLab, null, 2) : '';
  });
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isFormKind = isFormKindOf(kind);
  const isSorterKind = kind === SORTER_KIND;

  // Switching kind resets the editor to a blank config for the new kind, so a
  // stale field from the previous kind can never be saved (test: kind-switch guard).
  function changeKind(next: EditorKind) {
    setKind(next);
    setError(null);
    setNotice(null);
    if (isFormKindOf(next)) {
      setForm(blankForm(next));
      setJsonText('');
    } else {
      setForm({});
      setJsonText(`{\n  "kind": "${next}"\n}`);
    }
  }

  const validation: ValidationResult = useMemo(() => {
    if (isSorterKind) return parseAndValidateSorterConfig(jsonText);
    if (isFormKind) return validateLabConfig(assembleForm(kind as LabConfig['kind'], form));
    return parseAndValidateLabConfig(jsonText, kind as LabConfig['kind']);
  }, [isSorterKind, isFormKind, kind, form, jsonText]);
  const valid = validation.ok;

  // save-draft REPLACES the whole `draft` column, so merge over any existing draft
  // to preserve fields this editor doesn't manage (a pending body/quiz edit). The
  // scenario-sorter writes the separate sorter_config_json column.
  function buildDraft(): DraftFields {
    if (isSorterKind) {
      return { ...lesson.draft, sorter_config_json: JSON.parse(jsonText) as unknown };
    }
    const config = isFormKind
      ? assembleForm(kind as LabConfig['kind'], form)
      : (JSON.parse(jsonText) as unknown);
    return { ...lesson.draft, lab_config_json: config };
  }

  async function handleSave() {
    if (!valid) return;
    setBusy('save');
    setError(null);
    setNotice(null);
    try {
      await saveDraft(lesson.cellId, buildDraft());
      setNotice('Lab draft saved. Learners still see the published lab until you publish.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the lab draft.');
    } finally {
      setBusy(null);
    }
  }

  async function handlePublish() {
    if (!valid) return;
    setBusy('publish');
    setError(null);
    setNotice(null);
    try {
      await saveDraft(lesson.cellId, buildDraft());
      await publishLesson(lesson.cellId);
      setNotice('Published. Learners now see this lab — no redeploy needed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish the lab.');
    } finally {
      setBusy(null);
      onSaved();
    }
  }

  function patchField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
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
          Lab · {lesson.title}
        </h1>
        <p className="text-sm text-gray-600">
          {isFormKind ? 'Structured form' : 'Validated JSON'} · v{lesson.version}
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
          <label htmlFor="lab-kind" className="block text-[11px] font-bold uppercase tracking-widest text-gray-500">
            Lab kind
          </label>
          <select
            id="lab-kind"
            value={kind}
            onChange={(e) => changeKind(e.target.value as EditorKind)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-nava-green focus:outline-none"
          >
            {[...LAB_KINDS, SORTER_KIND].map((k) => (
              <option key={k} value={k}>
                {k === SORTER_KIND ? 'Scenario sorter' : LAB_KIND_LABELS[k]}
                {isFormKindOf(k) ? '' : ' (JSON)'}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            Changing the kind clears the editor for the new kind&apos;s shape.
          </p>
        </div>

        {isFormKind ? (
          <div className="space-y-4">
            {(FORM_SPECS[kind as LabConfig['kind']] ?? []).map((f) => (
              <div key={f.key} className="space-y-1.5">
                <label
                  htmlFor={`lab-${f.key}`}
                  className="block text-xs font-semibold text-gray-600"
                >
                  {f.label}
                  {f.optional && <span className="ml-1 font-normal text-gray-400">(optional)</span>}
                </label>
                {f.type === 'textarea' ? (
                  <textarea
                    id={`lab-${f.key}`}
                    value={form[f.key] ?? ''}
                    onChange={(e) => patchField(f.key, e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-nava-green focus:outline-none"
                  />
                ) : (
                  <input
                    id={`lab-${f.key}`}
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={form[f.key] ?? ''}
                    onChange={(e) => patchField(f.key, e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-nava-green focus:outline-none"
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="lab-json" className="block text-xs font-semibold text-gray-600">
              Lab configuration (JSON)
            </label>
            <p className="text-xs text-gray-500">
              This kind has a rich shape (markdown, rubric anchors, or item lists), so it is edited
              as JSON. It is validated on save and on the server — a malformed config is rejected
              with a specific error.
            </p>
            <textarea
              id="lab-json"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={20}
              spellCheck={false}
              aria-invalid={!valid}
              className={`w-full rounded-lg border px-3 py-2 text-sm font-mono leading-relaxed focus:ring-2 focus:ring-nava-green focus:outline-none ${
                valid ? 'border-gray-300' : 'border-red-400'
              }`}
            />
          </div>
        )}
      </div>

      {!valid && (
        <p className="text-sm text-amber-700" role="alert">
          {validation.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={busy !== null || !valid}
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
          disabled={busy !== null || !valid}
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
