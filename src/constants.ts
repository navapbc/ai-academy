export { AI_PERSONAS } from './data/personas';
export { GLOSSARY_TERMS } from './data/glossary';
export { RECOMMENDED_RESOURCES } from './data/resources';
// The curriculum (PHASES) is no longer a static import — it's fetched from
// Supabase at runtime (content-as-data, P3.2.2). See src/lib/modules.ts. The
// src/data/phases.ts file is retained as the seed source-of-record referenced
// by the P3.2.1 migration.
