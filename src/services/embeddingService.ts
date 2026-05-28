const OLLAMA_EMBEDDING_MODEL = 'nomic-embed-text';
const LM_STUDIO_EMBEDDING_MODEL = 'text-embedding-nomic-embed-text-v1.5';

export interface IndexedChunk {
  lessonId: string;
  lessonTitle: string;
  text: string;
  embedding: number[];
}

// --- Math ---

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// --- Provider-aware embedding ---

async function fetchEmbedding(text: string, provider: 'ollama' | 'lm-studio'): Promise<number[]> {
  if (provider === 'ollama') {
    const res = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_EMBEDDING_MODEL, prompt: text }),
    });
    if (!res.ok) throw new Error(`Ollama embeddings: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.embedding)) throw new Error('Unexpected Ollama embedding shape');
    return data.embedding;
  } else {
    const res = await fetch('/lm-studio/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: LM_STUDIO_EMBEDDING_MODEL, input: text }),
    });
    if (!res.ok) throw new Error(`LM Studio embeddings: ${res.status}`);
    const data = await res.json();
    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) throw new Error('Unexpected LM Studio embedding shape');
    return embedding;
  }
}

// --- Chunking ---

function chunkLesson(lessonId: string, lessonTitle: string, content: string): string[] {
  // Split on ## or ### headers; keep the header with its body
  const raw = content.split(/\n(?=#{1,3} )/).map(s => s.trim()).filter(Boolean);

  const chunks: string[] = [];
  for (const section of raw) {
    // Prepend lesson attribution so the tutor knows the source
    const attributed = `[Lesson: ${lessonTitle}]\n${section}`;
    // Only index sections with meaningful content (>80 chars after attribution)
    if (section.length > 80) chunks.push(attributed);
  }
  return chunks;
}

// --- Singleton index ---

type IndexStatus = 'idle' | 'building' | 'ready' | 'error';

let _index: IndexedChunk[] = [];
let _status: IndexStatus = 'idle';
let _builtForProvider: 'ollama' | 'lm-studio' | null = null;

export const embeddingService = {
  get status(): IndexStatus { return _status; },
  get isReady(): boolean { return _status === 'ready' && _index.length > 0; },

  async buildIndex(
    lessons: Array<{ id: string; title: string; content: string }>,
    provider: 'ollama' | 'lm-studio',
    onProgress?: (indexed: number, total: number) => void,
  ): Promise<void> {
    _status = 'building';
    _builtForProvider = provider;

    const allChunks: Omit<IndexedChunk, 'embedding'>[] = lessons.flatMap(lesson =>
      chunkLesson(lesson.id, lesson.title, lesson.content).map(text => ({
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        text,
      }))
    );

    const indexed: IndexedChunk[] = [];
    for (let i = 0; i < allChunks.length; i++) {
      const chunk = allChunks[i];
      try {
        const embedding = await fetchEmbedding(chunk.text, provider);
        indexed.push({ ...chunk, embedding });
      } catch {
        // Skip chunks whose embedding fails — don't abort the whole build
      }
      onProgress?.(i + 1, allChunks.length);
    }

    if (indexed.length === 0) {
      _status = 'error';
      return;
    }

    _index = indexed;
    _status = 'ready';
  },

  async search(
    query: string,
    provider: 'ollama' | 'lm-studio',
    topK = 5,
  ): Promise<IndexedChunk[]> {
    if (_index.length === 0) return [];
    const queryEmbedding = await fetchEmbedding(query, provider);
    return _index
      .map(chunk => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(r => r.chunk);
  },

  reset(): void {
    _index = [];
    _status = 'idle';
    _builtForProvider = null;
  },

  get builtForProvider() { return _builtForProvider; },
};
