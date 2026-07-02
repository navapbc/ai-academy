// P5.6c — PDF evidence report for EvidenceRow[].
// Same data as the CSV export (P5.6b), formatted as a per-learner report.
// Pure functions (model builder + filename + text sanitizer) are
// side-effect-free and unit-testable; the only impure export is
// downloadEvidencePdf (jsPDF document + DOM Blob download).
// No new migration/RLS/Edge Function — rides on the P5.6a query.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { EvidenceRow } from './evidenceExport';

// ---------------------------------------------------------------------------
// Text sanitizing — jsPDF's built-in Helvetica uses WinAnsi encoding, so the
// crosswalk strings' § and em/en dashes render as mojibake. We map the known
// non-ASCII characters to readable ASCII equivalents up-front, in the pure
// layer, so the model is render-safe and the mapping is unit-tested.
// ---------------------------------------------------------------------------

/** Make text render-safe for jsPDF's built-in fonts.
 *  jsPDF's standard Helvetica is WinAnsi (cp1252) encoded: every code point
 *  ≤ U+00FF (incl. accented Latin like é/ü/ñ) renders correctly, so we keep
 *  those. We (1) map the known curriculum/crosswalk punctuation to readable
 *  ASCII (§, em/en dash, smart quotes, ellipsis — these live above U+00FF), and
 *  (2) drop any *other* code point above U+00FF to '?', since cp1252 cannot
 *  represent it and jsPDF would emit mojibake. The catch-all guards
 *  attacker-influenced fields (learner names, CMS-authored titles) that may
 *  carry CJK / Cyrillic / Latin-Extended characters. */
export function toPdfSafeText(s: string): string {
  return s
    .replace(/§\s*/g, 'Section ')
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    // Anything at U+0100 or above is outside cp1252 → not renderable.
    .replace(/[\u0100-\uffff]/g, '?');
}

// ---------------------------------------------------------------------------
// PDF document model — pure, fully unit-testable.
// ---------------------------------------------------------------------------

/** One module row in a learner's evidence table (display strings, render-safe). */
export interface PdfModuleRow {
  cellId: string;
  title: string;
  completed: string; // 'Yes' | 'No'
  quiz: string; // 'NN%' | '-'
  labStatus: string; // status text | '-'
  labScore: string; // 'NN%' | '-'
  claims: string; // combined DOL/EU/M-25-21 claims | '-'
}

/** One learner's section of the report. */
export interface PdfLearnerSection {
  learnerName: string;
  learnerEmail: string; // '-' when unknown
  cohortName: string; // 'No cohort' when unassigned
  completedCount: number;
  moduleCount: number;
  rows: PdfModuleRow[];
}

/** The full report model fed to the renderer. */
export interface EvidencePdfModel {
  title: string;
  cohortLabel: string; // cohort name, or 'All cohorts'
  generatedAt: string; // YYYY-MM-DD
  learnerCount: number;
  rowCount: number;
  sections: PdfLearnerSection[];
}

/** Column headers for the per-learner module table (matches PdfModuleRow order). */
export const EVIDENCE_PDF_COLUMNS: readonly string[] = [
  'Cell',
  'Module',
  'Done',
  'Quiz',
  'Lab Status',
  'Lab Score',
  'Compliance Claims',
];

export const PDF_TITLE = 'Nava AI Academy - Compliance Evidence Report';

function pct(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return `${Math.round(v * 100)}%`;
}

function combineClaims(r: EvidenceRow): string {
  const groups: string[] = [];
  if (r.dolClaims.length) groups.push(...r.dolClaims);
  if (r.euAiActClaims.length) groups.push(...r.euAiActClaims);
  if (r.m2521Claims.length) groups.push(...r.m2521Claims);
  if (groups.length === 0) return '-';
  return groups.map(toPdfSafeText).join('\n');
}

function toModuleRow(r: EvidenceRow): PdfModuleRow {
  return {
    cellId: r.cellId,
    title: toPdfSafeText(r.cellTitle),
    completed: r.completed ? 'Yes' : 'No',
    quiz: pct(r.quizScore),
    labStatus: r.labStatus ? toPdfSafeText(r.labStatus) : '-',
    labScore: pct(r.labOverallScore),
    claims: combineClaims(r),
  };
}

export interface BuildPdfModelOptions {
  /** Active cohort name; omitted/undefined means the all-cohorts admin export. */
  cohortName?: string;
  /** ISO timestamp; only the YYYY-MM-DD portion is used. Defaults to today. */
  generatedAt?: string;
}

/**
 * Pure: groups EvidenceRow[] (already sorted by learner name then module order
 * by buildEvidenceRows) into one section per learner, preserving order.
 */
export function buildEvidencePdfModel(
  rows: EvidenceRow[],
  { cohortName, generatedAt }: BuildPdfModelOptions,
): EvidencePdfModel {
  const sections: PdfLearnerSection[] = [];
  const byLearner = new Map<string, PdfLearnerSection>();

  for (const r of rows) {
    let section = byLearner.get(r.learnerId);
    if (!section) {
      section = {
        learnerName: toPdfSafeText(r.learnerName),
        learnerEmail: r.learnerEmail ?? '-',
        cohortName: r.cohortName ? toPdfSafeText(r.cohortName) : 'No cohort',
        completedCount: 0,
        moduleCount: 0,
        rows: [],
      };
      byLearner.set(r.learnerId, section);
      sections.push(section);
    }
    section.rows.push(toModuleRow(r));
    section.moduleCount += 1;
    if (r.completed) section.completedCount += 1;
  }

  const day = (generatedAt ?? new Date().toISOString()).slice(0, 10);

  return {
    title: PDF_TITLE,
    cohortLabel: cohortName ? toPdfSafeText(cohortName) : 'All cohorts',
    generatedAt: day,
    learnerCount: sections.length,
    rowCount: rows.length,
    sections,
  };
}

/**
 * Build a filename for the PDF download.
 * Mirrors buildCsvFilename: cohort-evidence-<slug>-<YYYY-MM-DD>.pdf.
 */
export function buildPdfFilename(cohortName?: string, date?: string): string {
  const slug = cohortName
    ? cohortName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : 'all-cohorts';
  const day = (date ?? new Date().toISOString()).slice(0, 10);
  return `cohort-evidence-${slug}-${day}.pdf`;
}

// ---------------------------------------------------------------------------
// Impure: jsPDF document construction + browser download trigger.
// ---------------------------------------------------------------------------

/** Render the model into a jsPDF document (landscape, per-learner tables). */
export function renderEvidencePdf(model: EvidencePdfModel): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const marginX = 40;
  const pageWidth = doc.internal.pageSize.getWidth();

  // Cover header.
  doc.setFontSize(16);
  doc.text(model.title, marginX, 48);
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(
    `Cohort: ${model.cohortLabel}   |   Generated: ${model.generatedAt}   |   ` +
      `Learners: ${model.learnerCount}   |   Evidence rows: ${model.rowCount}`,
    marginX,
    66,
  );
  doc.setTextColor(0);

  if (model.sections.length === 0) {
    doc.setFontSize(11);
    doc.text('No evidence to report for the selected scope.', marginX, 96);
    return doc;
  }

  let cursorY = 90;
  for (const section of model.sections) {
    // Keep the learner header with at least the table header on the page.
    if (cursorY > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      cursorY = 60;
    }
    doc.setFontSize(12);
    doc.text(`${section.learnerName}  (${section.learnerEmail})`, marginX, cursorY);
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(
      `Cohort: ${section.cohortName}   |   Completed ${section.completedCount} of ${section.moduleCount} modules`,
      marginX,
      cursorY + 14,
    );
    doc.setTextColor(0);

    autoTable(doc, {
      startY: cursorY + 24,
      margin: { left: marginX, right: marginX },
      head: [EVIDENCE_PDF_COLUMNS as string[]],
      body: section.rows.map((r) => [
        r.cellId,
        r.title,
        r.completed,
        r.quiz,
        r.labStatus,
        r.labScore,
        r.claims,
      ]),
      styles: { fontSize: 8, cellPadding: 3, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: [45, 106, 79], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 36 },
        1: { cellWidth: 150 },
        2: { cellWidth: 36 },
        3: { cellWidth: 40 },
        4: { cellWidth: 70 },
        5: { cellWidth: 50 },
        6: { cellWidth: pageWidth - marginX * 2 - 382 },
      },
    });

    // jspdf-autotable records the final Y on the doc after drawing.
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY;
    cursorY = (finalY ?? cursorY + 40) + 28;
  }

  return doc;
}

/** Trigger a PDF file download in the browser. */
export function downloadEvidencePdf(
  rows: EvidenceRow[],
  options: BuildPdfModelOptions & { filename?: string } = {},
): void {
  const model = buildEvidencePdfModel(rows, options);
  const doc = renderEvidencePdf(model);
  const filename = options.filename ?? buildPdfFilename(options.cohortName, options.generatedAt);
  doc.save(filename);
}
