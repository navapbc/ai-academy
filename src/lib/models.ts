// Minimal Claude model picker shared by the Playground and Prompt Lab.
//
// A full Header-level model picker is out of scope for P1.2 — this is just
// enough to let learners compare a fast/cheap model against a more capable
// one. The Edge Function defaults to Haiku 4.5 when no model is sent; these
// ids let the client override per request.
//
// NOTE: the server-side allow-list in supabase/functions/chat/chat-core.ts
// (MODELS / MODEL_ALLOWLIST) is authoritative. Keep these ids a subset of it.

export interface ClaudeModel {
  id: string;
  label: string;
}

export const CLAUDE_MODELS: ClaudeModel[] = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 · fast' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6 · capable' },
];

/** Default to the cheapest current model (mirrors the Edge Function default). */
export const DEFAULT_MODEL_ID = CLAUDE_MODELS[0].id;
