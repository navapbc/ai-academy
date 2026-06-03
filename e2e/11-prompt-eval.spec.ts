import { test, expect } from '@playwright/test';
import { signInAsDemo, openModule, completeStage1a, stubClaude, stubGrade } from './helpers';

// Cell 2.10 ("Test-driven and constraint-first prompting") renders the reusable-
// prompt eval (P4.5b) after the lesson: read a recurring task + the constraints to
// encode + a small seeded test set (2 complete records + 1 EDGE case with a missing
// income field), write ONE reusable, constraint-first prompt, RUN it live against
// each record (streamChat — ONE chat call PER CASE), then submit the prompt + its
// per-case outputs to the P4.2 judge for an anchor-scored verdict in place. We STUB
// BOTH the chat Edge Function (the per-case runs) AND the grade Edge Function (the
// judge) — no real key. The stubClaude route returns the same canned body for EVERY
// chat call, so it transparently handles the multiple per-case calls. 2.10 is Stage
// 2, so we complete Stage 1a to unlock it. The prompt-eval is graded PRACTICE — it
// must NOT gate completion, so we also confirm the inline quiz is still present as
// the gate. Reuses streamChat + the #48 judge stub + GradeResultCard.
test('the 2.10 prompt-eval runs the prompt against every case, grades it in place, and does not gate completion', async ({ page }) => {
  // A canned 3-line case summary — returned for every per-case chat call.
  await stubClaude(
    page,
    'Case SNAP-2231: verify the lease address against the utility bill on file.\n' +
      'Action: confirm the address before processing.\n' +
      'Deadline: recertification packet due 2026-07-15.',
  );
  await stubGrade(page, {
    perAnchor: [
      { id: 'constraints-up-front', label: 'States its constraints up front', score: 2, max: 2, rationale: 'Rules stated before the task.' },
      { id: 'format-on-normal', label: 'Outputs meet the format on the normal cases', score: 2, max: 2, rationale: '3 lines, includes ID/action/deadline.' },
      { id: 'handles-edge-case', label: 'Handles the missing-field edge case', score: 1, max: 2, rationale: 'Flags the blank income.' },
      { id: 'reusable-general', label: 'The prompt is reusable, not hardcoded', score: 2, max: 2, rationale: 'General rules for any record.' },
    ],
    overall: 7,
    maxOverall: 8,
  });

  await signInAsDemo(page);
  await completeStage1a(page);

  await openModule(page, '2.10');
  const promptEval = page.locator('#prompt-eval');
  await expect(promptEval).toBeVisible();
  // The seeded test set is rendered, with the edge case visibly marked.
  await expect(promptEval.getByText('Child care assistance — missing income')).toBeVisible();
  await expect(promptEval.getByText('Edge case', { exact: true })).toBeVisible();

  // Write a reusable, constraint-first prompt.
  await promptEval.getByLabel('Your reusable prompt').fill(
    'Rules: write exactly 3 lines, about 60 words or fewer, in plain language. Every summary must ' +
      'include the case ID, the action needed, and the deadline. Never invent a missing value — if a ' +
      'field is blank, write "not provided — follow up". Summarize the intake record below for the queue.',
  );

  // Run the prompt against every test case (chat is stubbed; one call per case).
  await promptEval.getByRole('button', { name: /Run against test cases/i }).click();

  // Once every case has an output, the Submit button appears.
  const submit = promptEval.getByRole('button', { name: /Submit for grading/i });
  await expect(submit).toBeVisible({ timeout: 15_000 });
  // The streamed outputs are shown for review.
  await expect(promptEval.getByText(/verify the lease address/i).first()).toBeVisible();

  await submit.click();

  // The anchor-scored result renders in place (grade is stubbed).
  await expect(promptEval.locator('#grade-result')).toBeVisible({ timeout: 15_000 });
  await expect(promptEval.getByText('Anchor-scored feedback')).toBeVisible();
  await expect(promptEval.getByText('7 / 8')).toBeVisible();

  // The prompt-eval did NOT complete the module — the inline quiz is still the gate.
  await expect(page.locator('#module-quiz')).toBeVisible();
});
