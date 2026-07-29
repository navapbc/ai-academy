// Client seam for talking to Claude via the server-side `chat` Edge Function.
//
// The browser NEVER sees the ANTHROPIC_API_KEY — it only ever calls our Edge
// Function, which holds the key. We use raw fetch + a stream reader (NOT
// supabase.functions.invoke, which buffers the whole response and can't
// stream) so tokens render incrementally as Claude produces them.

import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

// Reuse the same env the Supabase client reads — don't duplicate config.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamOptions {
  /** System prompt (persona prefix, grounding context, etc.). */
  system?: string;
  /** Override the Edge Function's default model (Claude Haiku 4.5). */
  model?: string;
  /** Override the default max output tokens. */
  maxTokens?: number;
  /**
   * Cancels the in-flight request/stream when aborted (LLM-05) — e.g. a
   * component unmounts mid-stream, a new send starts, or the user hits "stop".
   * Aborting resolves `streamChat` cleanly (it does not throw).
   */
  signal?: AbortSignal;
}

/**
 * Streams a chat completion from Claude through the Edge Function, invoking
 * `onChunk` with each decoded text fragment as it arrives.
 *
 * Mirrors the old `generateLocalStream` shape so component rewiring stays
 * minimal: pass the message history, options, and a chunk callback.
 */
export async function streamChat(
  messages: ChatMessage[],
  options: StreamOptions,
  onChunk: (text: string) => void,
): Promise<void> {
  if (!isSupabaseConfigured || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and ' +
        'VITE_SUPABASE_ANON_KEY in your .env (see .env.example).',
    );
  }

  // Use the signed-in user's access token if there is one; otherwise fall back
  // to the anon key. Pre-SSO this is always the anon key, which still passes
  // the Edge Function's JWT verification.
  let accessToken = SUPABASE_ANON_KEY;
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    if (data.session?.access_token) accessToken = data.session.access_token;
  } catch {
    // No session / auth not wired yet — anon key is fine.
  }

  // Already cancelled before we even sent — nothing to do.
  if (options.signal?.aborted) return;

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        messages,
        system: options.system,
        model: options.model,
        max_tokens: options.maxTokens,
      }),
      signal: options.signal,
    });
  } catch (err) {
    // An abort while the request itself is pending (before the first byte) must
    // honor the same contract as a mid-stream abort: resolve cleanly (D-05).
    if (options.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      return;
    }
    throw err;
  }

  if (!response.ok || !response.body) {
    // The function returns a JSON `{ error }` on failure.
    let detail = response.statusText;
    try {
      const json = await response.json();
      if (json?.error) detail = json.error;
    } catch {
      // Non-JSON error body — keep the status text.
    }
    throw new Error(detail || `Request failed (${response.status}).`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) onChunk(text);
    }
    // Flush whatever the streaming decoder is still holding. Without this final
    // (non-streaming) decode, bytes buffered from an incomplete multi-byte
    // sequence at the end of the stream are dropped silently instead of being
    // emitted, so a truncated stream loses its last character outright.
    const tail = decoder.decode();
    if (tail) onChunk(tail);
  } catch (err) {
    // An abort is intentional cancellation, not a failure to surface.
    if (options.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      return;
    }
    throw err;
  } finally {
    // Releasing a reader whose stream has errored/closed is safe; guard anyway.
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}
