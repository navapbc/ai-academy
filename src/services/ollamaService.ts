export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaStatus {
  isActive: boolean;
  models: OllamaModel[];
  error?: string;
}

const OLLAMA_BASE_URL = 'http://localhost:11434';

export const ollamaService = {
  /**
   * Checks if the Ollama server is running and reachable
   */
  async checkStatus(): Promise<OllamaStatus> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      const versionRes = await fetch(`${OLLAMA_BASE_URL}/api/version`, {
        signal: controller.signal,
      });

      if (!versionRes.ok) {
        throw new Error('Ollama server returned an error status');
      }

      const modelsRes = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
        signal: controller.signal,
      });

      if (!modelsRes.ok) {
        return { isActive: true, models: [], error: 'Could not fetch models' };
      }

      const data = await modelsRes.json();
      
      return {
        isActive: true,
        models: data.models || [],
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown network error';
      return {
        isActive: false,
        models: [],
        error: errorMessage,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  },

  /**
   * Pulls a model from the Ollama library
   */
  async pullModel(name: string, onProgress?: (status: string) => void) {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.status && onProgress) {
              onProgress(json.status);
            }
            if (json.error) throw new Error(json.error);
          } catch (e) {
            // Ignore parse errors for incomplete lines
          }
        }
      }
    } catch (err) {
      console.error('Pull Error:', err);
      throw err;
    }
  }
};
