-- fix_1_6_mfa_step — 1.6 told learners to do something they cannot do.
--
-- WHY: 1.6's first-run checklist said "Turn on MFA and confirm it actually
-- prompts you on next login." At Nava there is no such setting to find. Sign-in
-- goes through Google SSO (CLAUDE.md; and Week 0's corrected copy in
-- 20260811000000_week0_login_sso.sql walks learners through the email +
-- "Continue with SSO" path), so multi-factor lives at the identity provider, not
-- inside the tool. Week 0 never mentions MFA for exactly this reason. A learner
-- following 1.6's checklist goes hunting for a toggle that does not exist.
--
-- WHAT REPLACES IT: the real failure mode at Nava, which Week 0 warns about in
-- capitals — "DO NOT choose Continue with Google". Taking the wrong sign-in path
-- lands you in a personal Claude workspace that looks identical to the org one,
-- with your work outside the organization's controls. That is both actionable
-- and the thing that actually goes wrong, so it takes the MFA step's place. A
-- parenthetical still answers the security-minded learner's question (MFA comes
-- with SSO; nothing to switch on).
--
-- 1.6 stays vendor-neutral prose, so the wording says "the organization's
-- account" rather than naming Claude.
--
-- SCOPE: body_md (three mentions: "What it is", the checklist, the Example) and
-- quiz_json (one answer option that listed the checklist). Verified no MFA
-- reference survives in either.
--
-- NOT A MERGE: the audit first listed 1.6 as redundant with c1-w0-claude-setup.
-- It is not — 1.6 is the vendor-neutral "why", Week 0 is the Claude-specific
-- "how". Only the accuracy defect needed fixing.
--
-- Same write-path reasoning as 20260915000000_reconcile_1_4_data_classification.sql;
-- the seed JSON is updated to match.
--
-- Re-runnable: a second apply rewrites the same values.

update public.modules
   set body_md   = $md$Two new hires get the same AI tool license on day one. Three weeks later, one is drafting summaries with it daily. The other never got past the login screen and has quietly stopped trying. The license was identical. The setup wasn't.

## What it is

Setup and access is the unglamorous work of actually turning a license into a working tool. It means signing in through single sign-on (SSO), confirming you landed in the organization's account rather than a personal one, checking your settings and data controls, opening the sanctioned tool, and running a real first prompt. It also means knowing where to get help when a step breaks. None of this is about prompting skill. It's the gate everything else depends on.

## Why it matters to you

Adoption stalls in the gap between getting a license and the first real use. Structured, hands-on onboarding matters because the person who "never got it working" can't build the skills that come later, and tends to disengage entirely ([DOL AI Literacy Framework, ETA TEN 07-25](https://www.dol.gov/agencies/eta/advisories/ten-07-25)). That framework, while voluntary, treats practical access and hands-on practice as core to real literacy. For your own work, finishing setup is what separates a tool you use from a tab you ignore. The cost of a half-done setup isn't visible on day one. It shows up three weeks later as a colleague who fell behind.

## How to do it / what to watch for

Work a simple first-run checklist and don't skip steps:

- Sign in through SSO with your Nava credentials, not a personal email.
- Confirm you landed in the organization's account. The wrong sign-in path can quietly create a personal workspace that looks identical, and anything you do there sits outside the organization's controls. (Multi-factor authentication comes with SSO — there is nothing to switch on inside the tool.)
- Open settings and check data controls (history, training opt-outs) before your first prompt.
- Run one real prompt on non-sensitive work to confirm the tool responds.
- Bookmark the help channel or support contact before you need it.

The red flag is treating "I have the license" as "I'm set up." They're not the same. If a step fails, ask for help that day. The person who quietly waits is the person who never starts.

## Example

A new hire on a CMS project gets her license Monday. Instead of bookmarking the tool for later, she runs the checklist: SSO sign-in, organization account confirmed, data controls reviewed, then a throwaway first prompt asking the tool to summarize a public press release. It works. She notes the support channel in case something breaks. Ten minutes, start to finish. By the time real work lands, the tool is a habit, not a hurdle. The teammate who skipped this is still stuck at login, and now embarrassed to ask.

## In practice

A license is not access. Finish the setup, run one real prompt, and find the help channel before you need it.

## Sources

- [DOL AI Literacy Framework, ETA TEN 07-25](https://www.dol.gov/agencies/eta/advisories/ten-07-25)$md$,
       quiz_json = $json$[
  {
    "question": "You just received your AI tool license on your first day. What's the best way to make sure it actually becomes usable?",
    "options": [
      "Save the link and wait until a real task requires the tool.",
      "Run the full setup now: SSO sign-in, account check, data-controls check, and one real test prompt.",
      "Sign in once to confirm the license works, then close it until needed.",
      "Forward the license email to your manager so it's documented."
    ],
    "correctIndex": 1,
    "explanation": "Adoption stalls in the gap between getting a license and first real use, so completing setup and running an actual prompt turns the license into a working habit. Option 1 is the most common trap: 'I'll set it up when I need it' is exactly how people end up stuck at the login screen under deadline pressure. A license is not access; finish the setup before you need the tool."
  },
  {
    "question": "During first-run setup, which step most directly protects you from accidentally exposing data later?",
    "options": [
      "Bookmarking the help channel for support questions.",
      "Confirming the tool returns a response to your first prompt.",
      "Checking the settings and data controls, like history and training opt-outs, before your first prompt.",
      "Choosing a memorable display name in your profile."
    ],
    "correctIndex": 2,
    "explanation": "Reviewing data controls before you start determines whether your inputs are retained or used for training, which is the setting that affects data exposure. Option 2 confirms the tool works but says nothing about what happens to what you type into it. Setup isn't just 'does it respond'; it includes verifying the controls that govern your data from the first prompt on."
  },
  {
    "question": "A teammate three weeks into the job admits they never got the AI tool working and have stopped trying. What does this best illustrate?",
    "options": [
      "Some people simply aren't suited to using AI tools.",
      "The license must have been provisioned incorrectly by IT.",
      "The tool is probably too hard for non-technical staff to use.",
      "A half-finished setup quietly blocks someone from building the skills that come later."
    ],
    "correctIndex": 3,
    "explanation": "The person who 'never got it working' can't engage with later skills and tends to disengage entirely, which is why hands-on setup matters as a first step. Option 1 blames the individual rather than the gap in onboarding, missing the real lesson. Finishing setup and asking for help the day a step breaks is what keeps someone from silently falling behind."
  }
]$json$::jsonb,
       updated_at = now()
 where cell_id = '1.6';
