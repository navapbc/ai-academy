export { AI_PERSONAS } from './data/personas';
export { GLOSSARY_TERMS } from './data/glossary';
// The curriculum is fetched from Supabase at runtime (content-as-data, P3.2.2;
// see src/lib/modules.ts). The former static seed files (data/phases.ts,
// data/quiz.ts, data/resources.ts, content/*.md) were superseded by the DB seed
// + supabase/seed-data/curriculum-content.json and removed (DEAD-01/02/03).
