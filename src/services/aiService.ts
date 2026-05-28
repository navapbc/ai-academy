export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  tokensPerSec: number;
}

export const generateLocalStream = async (
  provider: 'ollama' | 'lm-studio',
  model: string,
  messages: ChatMessage[],
  onChunk: (chunk: string) => void
): Promise<StreamMetrics> => {
  const startTime = performance.now();
  let promptTokens = 0;
  let completionTokens = 0;

  if (provider === 'ollama') {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      for (const line of decoder.decode(value).split('\n')) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.message?.content) onChunk(json.message.content);
          if (json.error) throw new Error(json.error);
          if (json.done) {
            promptTokens = json.prompt_eval_count ?? 0;
            completionTokens = json.eval_count ?? 0;
          }
        } catch (e) {}
      }
    }
  } else {
    const response = await fetch('/lm-studio/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      for (const line of decoder.decode(value).split('\n')) {
        const l = line.trim();
        if (!l || l === 'data: [DONE]') continue;
        if (l.startsWith('data: ')) {
          try {
            const json = JSON.parse(l.slice(6));
            const content = json.choices?.[0]?.delta?.content;
            if (content) onChunk(content);
            if (json.usage) {
              promptTokens = json.usage.prompt_tokens ?? 0;
              completionTokens = json.usage.completion_tokens ?? 0;
            }
          } catch (e) {}
        }
      }
    }
  }

  const durationMs = performance.now() - startTime;
  const totalTokens = promptTokens + completionTokens;
  const tokensPerSec = durationMs > 0 ? Math.round((completionTokens / durationMs) * 1000) : 0;

  return { promptTokens, completionTokens, totalTokens, durationMs, tokensPerSec };
};
