// P5.6b — CSV serializer for EvidenceRow[].
// Pure functions are side-effect-free and unit-testable.
// The only impure export is downloadCsv (DOM Blob + anchor).

import type { EvidenceRow } from './evidenceExport';

// ---------------------------------------------------------------------------
// RFC 4180 quoting
// ---------------------------------------------------------------------------

// Characters that trigger formula injection in Excel / Sheets.
const INJECTION_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/** Wrap a value in double-quotes; double any internal quotes. */
function quoteCell(raw: string): string {
  const safe = INJECTION_CHARS.has(raw[0] ?? '') ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function cellStr(v: string | null | undefined): string {
  return quoteCell(v ?? '');
}

function cellBool(v: boolean | null | undefined): string {
  return quoteCell(v === true ? 'Yes' : v === false ? 'No' : '');
}

function cellPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return quoteCell('');
  return quoteCell(`${Math.round(v * 100)}%`);
}

function cellArray(v: string[]): string {
  return quoteCell(v.join(' | '));
}

// ---------------------------------------------------------------------------
// Column definitions — stable order
// ---------------------------------------------------------------------------

const HEADERS: string[] = [
  'Learner ID',
  'Learner Name',
  'Learner Email',
  'Cohort ID',
  'Cohort Name',
  'Cell ID',
  'Cell Title',
  'Stage',
  'Dimensions',
  'Evidence Type',
  'Completed',
  'Completed At',
  'Quiz Score %',
  'Quiz Passed',
  'Quiz Attempt Count',
  'Best Quiz Attempted At',
  'Lab Status',
  'Lab Submitted At',
  'Lab Reviewed At',
  'Lab Reviewer Email',
  'Lab Overall Score %',
  'DOL Claims',
  'EU AI Act Claims',
  'M-25-21 Claims',
];

function serializeRow(r: EvidenceRow): string {
  return [
    cellStr(r.learnerId),
    cellStr(r.learnerName),
    cellStr(r.learnerEmail),
    cellStr(r.cohortId),
    cellStr(r.cohortName),
    cellStr(r.cellId),
    cellStr(r.cellTitle),
    cellStr(r.stage),
    cellArray(r.dimensions),
    cellStr(r.evidenceType),
    cellBool(r.completed),
    cellStr(r.completedAt),
    cellPct(r.quizScore),
    cellBool(r.quizPassed),
    quoteCell(String(r.quizAttemptCount)),
    cellStr(r.bestQuizAttemptedAt),
    cellStr(r.labStatus),
    cellStr(r.labSubmittedAt),
    cellStr(r.labReviewedAt),
    cellStr(r.labReviewerEmail),
    cellPct(r.labOverallScore),
    cellArray(r.dolClaims),
    cellArray(r.euAiActClaims),
    cellArray(r.m2521Claims),
  ].join(',');
}

// ---------------------------------------------------------------------------
// Public pure API
// ---------------------------------------------------------------------------

/**
 * Serialize EvidenceRow[] to a UTF-8 BOM-prefixed RFC 4180 CSV string.
 * Includes a header row. Returns a header-only string when rows is empty.
 */
export function serializeEvidenceCsv(rows: EvidenceRow[]): string {
  const headerLine = HEADERS.map((h) => quoteCell(h)).join(',');
  const lines = [headerLine, ...rows.map(serializeRow)];
  // UTF-8 BOM so Excel-on-Windows renders § and en-dashes correctly.
  return '﻿' + lines.join('\r\n');
}

/**
 * Build a filename for the CSV download.
 * cohortName: the active cohort name (or undefined for all-cohorts).
 * date: ISO date string (YYYY-MM-DD portion used); defaults to today.
 */
export function buildCsvFilename(cohortName?: string, date?: string): string {
  const slug = cohortName
    ? cohortName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : 'all-cohorts';
  const day = (date ?? new Date().toISOString()).slice(0, 10);
  return `cohort-evidence-${slug}-${day}.csv`;
}

// ---------------------------------------------------------------------------
// Impure: browser download trigger
// ---------------------------------------------------------------------------

/** Trigger a CSV file download in the browser. */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
