import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, stubClaude, stubGrade } from './helpers';

// Cell 2.6 renders the voice-edit exercise (P4.4b) after the lesson: read a dense
// source + a writing brief, generate an AI FIRST DRAFT live (streamChat), revise it
// "AI off" in your own voice, then get the revision anchor-scored in place. We STUB
// BOTH the chat Edge Function (the draft) AND the grade Edge Function (the judge) —
// no real key. Nothing is gated (restructure U2), so 2.6 opens directly. The voice-edit
// is graded PRACTICE — it must NOT gate completion, so we also confirm the inline
// quiz is still present as the gate. Reuses streamChat + the #48 judge stub +
// GradeResultCard.
test('the 2.6 voice-edit exercise generates a draft, grades the revision in place, and does not gate completion', async ({ page }) => {
  // A deliberately flat AI first draft that drops the specifics — the kind of
  // draft the exercise teaches the learner to fix.
  await stubClaude(
    page,
    'Your child care benefits are up for their yearly review. Please send your documents soon so we ' +
      'can keep your help going. If we do not hear from you, your benefits may be affected. Contact ' +
      'us with any questions.',
  );
  await stubGrade(page, {
    perAnchor: [
      { id: 'preserve-specifics', label: 'Keep every specific', score: 2, max: 2, rationale: 'Kept the form, stubs, dates, and copay.' },
      { id: 'plain-language', label: 'Hit the plain-language target', score: 2, max: 2, rationale: 'Short sentences, plain words.' },
      { id: 'tone-and-next-step', label: 'Right tone, one next step', score: 1, max: 2, rationale: 'Warm; one next step.' },
      { id: 'improves-on-draft', label: 'Improve on the draft', score: 2, max: 2, rationale: 'Restored the dropped specifics.' },
    ],
    overall: 7,
    maxOverall: 8,
  });

  await signInAsDemo(page);

  await openModule(page, '2.6');
  const voiceEdit = page.locator('#voice-edit');
  await expect(voiceEdit).toBeVisible();
  // The dense source is rendered for the learner to rewrite.
  await expect(
    voiceEdit.getByText('Internal case note — Child Care Subsidy (CCS) annual redetermination'),
  ).toBeVisible();

  // Phase 1: generate the AI first draft (chat is stubbed).
  await voiceEdit.getByRole('button', { name: /Generate AI first draft/i }).click();

  // The streamed draft prefills the revision textarea — phase 2 starts "AI off".
  const revision = voiceEdit.getByLabel('Your revision');
  await expect(revision).toHaveValue(/send your documents soon/i, { timeout: 15_000 });

  // Phase 2: revise it in the learner's own voice, restoring the specifics the
  // flat draft dropped (>= 50 words).
  await revision.fill(
    'Your child care help is up for its yearly review. To keep it, send us two things by August 15, ' +
      '2026: a completed Form CCS-9 and your two most recent pay stubs. If you still qualify, your ' +
      'monthly payment changes from $45 to $72 starting September 1, 2026. If we do not get your form ' +
      'by August 15, your help ends on August 31, 2026, and you would have to apply again. Next step: ' +
      'return Form CCS-9 and your two pay stubs by August 15, 2026.',
  );
  await voiceEdit.getByRole('button', { name: /Save revision/i }).click();

  // The anchor-scored result renders in place (grade is stubbed).
  await expect(voiceEdit.locator('#grade-result')).toBeVisible({ timeout: 15_000 });
  await expect(voiceEdit.getByText('Anchor-scored feedback')).toBeVisible();
  await expect(voiceEdit.getByText('7 / 8')).toBeVisible();

  // The voice-edit did NOT complete the module — the inline quiz is still the gate.
  await expect(page.locator('#module-quiz')).toBeVisible();
});
