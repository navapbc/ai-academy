import { BRANDING } from '../branding';

export const GLOSSARY_TERMS = [
  {
    term: 'LLM',
    definition: 'Large Language Model. A mathematical model trained on vast amounts of text to predict the next word in a sequence.'
  },
  {
    term: 'Harness',
    definition: 'The software layer surrounding an LLM that controls its behavior, restricts its context, and ensures safety.'
  },
  {
    term: 'Grounding',
    definition: `The process of providing an LLM with specific, 'ground truth' data to ensure its answers stay accurate to a specific domain (like ${BRANDING.name} policies).`
  },
  {
    term: 'Quantization',
    definition: 'The process of compressing an AI model so it can run efficiently on consumer hardware without massive memory requirements.'
  },
  {
    term: 'RAG',
    definition: 'Retrieval-Augmented Generation. A technique that fetches relevant documents at query time and injects them into the prompt, so the model answers from real evidence instead of memory.'
  },
  {
    term: 'Context Window',
    definition: 'The maximum amount of text (measured in tokens) a model can process in a single request. Everything outside the window is invisible to the model.'
  },
  {
    term: 'Hallucination',
    definition: 'When an LLM generates plausible-sounding but factually incorrect information. A key reason human review remains essential in high-stakes decisions.'
  },
  {
    term: 'REAct',
    definition: 'Reason + Act. A prompting strategy where an AI model thinks through a problem step-by-step before taking an action.'
  },
  {
    term: 'System Prompt',
    definition: 'Instructions given to a model before the user conversation begins. Sets persona, constraints, and behavior — the invisible rulebook the model follows.'
  },
  {
    term: 'Token',
    definition: 'The basic unit an LLM processes — roughly 3/4 of an English word. Models are priced and limited by token counts, not character or word counts.'
  },
  {
    term: 'Automation Bias',
    definition: 'The tendency for humans to over-trust automated outputs even when they are wrong. A critical risk when AI is used in eligibility or case management decisions.'
  },
  {
    term: 'GGUF',
    definition: 'A file format for storing quantized LLM weights, used by Ollama and LM Studio to run models efficiently on consumer hardware.'
  }
];
