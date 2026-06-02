-- seed_lab_config_2_1 (P3.2.3b): lab config as content-as-data.
--
-- Moves the 2.1 prompt-construction lab's brief + constraints + scaffolding
-- tips out of src/components/PromptLab.tsx (where they were hardcoded) and into
-- the modules.lab_config_json column, so the lab content is editable without a
-- rebuild (and, later, via the admin CMS). The values below are the EXACT
-- current hardcoded values from PromptLab.tsx (BRIEF + SCAFFOLD_HINTS), so the
-- lab renders identically — now sourced from the DB.
--
-- Additive/idempotent: updates a single existing row's lab_config_json. The
-- column already exists (added in 20260602130334_modules_content_as_data.sql).
-- Safe to re-run; only sets the value when it is still null so a later
-- CMS/Studio edit is never clobbered by a `supabase db reset` re-applying this.

update public.modules
set lab_config_json = $json$
{
  "kind": "prompt-construction",
  "brief": {
    "task": "A caseworker needs a plain-language note explaining a SNAP recertification deadline to a client.",
    "constraints": [
      "≤120 words",
      "~8th-grade reading level",
      "warm, respectful tone",
      "no jargon",
      "ends with one clear next step"
    ]
  },
  "scaffoldHints": [
    { "label": "Role & context", "hint": "Who should Claude act as, and what background does it need?" },
    { "label": "Task & constraints", "hint": "State the exact output and its limits up front (length, reading level, tone)." },
    { "label": "Format / example", "hint": "Describe the shape you want — a short note, a template, a sample of \"good\"." },
    { "label": "Definition of done", "hint": "What does a finished, correct answer look like?" }
  ]
}
$json$::jsonb
where cell_id = '2.1'
  and lab_config_json is null;
