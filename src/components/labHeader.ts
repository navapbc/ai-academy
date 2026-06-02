import type { PromptConstructionConfig } from '../types';

/** Resolves a lab's header text from its config, with generic fallbacks. */
export function labHeader(config: PromptConstructionConfig): { title: string; subtitle: string } {
  return {
    title: config.title ?? 'Lab',
    subtitle: config.subtitle ?? 'Compose a prompt and run it against Claude.',
  };
}
