export interface LocalModel {
  id: string;
  name: string;
  provider: 'ollama' | 'lm-studio';
  details?: {
    size?: number;
    quantization?: string;
    family?: string;
  };
}

export interface ProviderStatus {
  ollama: {
    active: boolean;
    models: LocalModel[];
    error?: string;
  };
  lmStudio: {
    active: boolean;
    models: LocalModel[];
    error?: string;
  };
}

const OLLAMA_URL = 'http://localhost:11434';
const LM_STUDIO_URL = '/lm-studio';

export const localProviderService = {
  async checkOllama(): Promise<{ active: boolean; models: LocalModel[]; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      
      const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!res.ok) throw new Error('Ollama not responding');
      
      const data = await res.json();
      const models = (data.models || []).map((m: any) => ({
        id: m.name,
        name: m.name,
        provider: 'ollama' as const,
        details: {
          size: m.size,
          quantization: m.details?.quantization_level,
          family: m.details?.family
        }
      }));

      return { active: true, models };
    } catch (err) {
      return { active: false, models: [] };
    }
  },

  async checkLMStudio(): Promise<{ active: boolean; models: LocalModel[]; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      
      // LM Studio uses OpenAI compatible /v1/models
      const res = await fetch(`${LM_STUDIO_URL}/v1/models`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!res.ok) throw new Error('LM Studio not responding');
      
      const data = await res.json();
      const models = (data.data || []).map((m: any) => ({
        id: m.id,
        name: m.id.split('/').pop() || m.id, // Extract filename if path
        provider: 'lm-studio' as const,
        details: {
          family: m.owned_by
        }
      }));

      return { active: true, models };
    } catch (err) {
      return { active: false, models: [] };
    }
  }
};
