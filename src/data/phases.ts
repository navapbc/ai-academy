import { Phase } from '../types';
import { BRANDING } from '../branding';

import contentP1M0 from '../content/p1-m0.md?raw';
import contentP1M1 from '../content/p1-m1.md?raw';
import contentP1M2 from '../content/p1-m2.md?raw';
import contentP1M3 from '../content/p1-m3.md?raw';
import contentP2M1 from '../content/p2-m1.md?raw';
import contentP2M2 from '../content/p2-m2.md?raw';
import contentP2M3 from '../content/p2-m3.md?raw';
import contentP3M1 from '../content/p3-m1.md?raw';
import contentP3M2 from '../content/p3-m2.md?raw';
import contentP3M3 from '../content/p3-m3.md?raw';
import contentP4M1 from '../content/p4-m1.md?raw';
import contentP4M2 from '../content/p4-m2.md?raw';
import contentP4M3 from '../content/p4-m3.md?raw';

export const PHASES: Phase[] = [
  {
    id: 'phase-1',
    week: 'Week 1',
    title: 'Crawl: Mental Models',
    description: "Understanding what AI is (and isn't) before we touch the tech.",
    modules: [
      {
        id: 'p0-setup',
        phaseId: 'phase-1',
        title: 'Before You Begin: Install Local AI',
        type: 'local-setup' as const,
        content: '',
        videoUrl: 'https://www.youtube.com/watch?v=2ShWmXICOjI',
        resources: [
          { title: 'LM Studio — Download', url: 'https://lmstudio.ai/' },
          { title: 'Ollama — Download & Docs', url: 'https://ollama.com/' },
          { title: 'IBM Granite Models (free, open-source)', url: 'https://ollama.com/library/granite3.1-dense' },
        ]
      },
      {
        id: 'p1-m0',
        phaseId: 'phase-1',
        title: `Mission Briefing: AI at ${BRANDING.name}`,
        type: 'content',
        content: contentP1M0,
        resources: [
          { title: `${BRANDING.name} Labs — AI Research`, url: 'https://www.navapbc.com/labs' },
          { title: `${BRANDING.name} Blog: Building Trust in Government`, url: 'https://www.navapbc.com/blog/building-trust-in-government' },
          { title: `${BRANDING.name}: AI in Government — Case Studies`, url: 'https://www.navapbc.com/tags/artificial-intelligence' },
          { title: 'Microsoft: Responsible AI Principles', url: 'https://www.microsoft.com/en-us/ai/responsible-ai' },
          { title: 'Google: Responsible AI Practices', url: 'https://ai.google/responsibility/responsible-ai-practices/' },
        ]
      },
      {
        id: 'p1-m1',
        phaseId: 'phase-1',
        title: 'Decoding the Black Box',
        type: 'content',
        videoUrl: 'https://www.youtube.com/watch?v=LPZh9BOjkQs',
        content: contentP1M1,
        resources: [
          { title: 'The Illustrated Transformer (Jay Alammar)', url: 'https://jalammar.github.io/illustrated-transformer/' },
          { title: 'Intro to Large Language Models (Andrej Karpathy)', url: 'https://youtu.be/zjkBMFhNj_g' },
          { title: 'LLMs in 2024 — Simon Willison', url: 'https://simonwillison.net/2024/Dec/31/llms-in-2024/' },
        ]
      },
      {
        id: 'p1-m2',
        phaseId: 'phase-1',
        title: 'Privacy Architectures',
        type: 'simulator',
        videoUrl: 'https://www.youtube.com/watch?v=-Tz_FWVYgnM',
        content: contentP1M2,
        resources: [
          { title: `${BRANDING.name} Public Benefit Report`, url: 'https://www.navapbc.com/public-benefit-report' },
          { title: 'Google: Responsible AI Practices', url: 'https://ai.google/responsibility/responsible-ai-practices/' },
          { title: 'IBM AI Ethics', url: 'https://www.ibm.com/artificial-intelligence/ethics' },
        ]
      },
      {
        id: 'p1-m3_lesson',
        phaseId: 'phase-1',
        title: 'AI Ethics in GovTech',
        type: 'content',
        videoUrl: 'https://www.youtube.com/watch?v=aGwYtUzMQUk',
        content: contentP1M3,
        resources: [
          { title: `${BRANDING.name}: Evaluating AI for Caseworkers`, url: 'https://www.navapbc.com/case-studies/evaluating-ai-assistive-chatbot-caseworkers' },
          { title: `${BRANDING.name}: Readable AI Content Toolkit`, url: 'https://www.navapbc.com/toolkits/readable-ai-content' },
          { title: `${BRANDING.name}: AI Public Sector Challenges`, url: 'https://www.navapbc.com/toolkits/ai-public-sector-challenges' },
          { title: 'Anthropic Responsible Scaling Policy', url: 'https://www.anthropic.com/responsible-scaling-policy' },
          { title: 'Microsoft: Responsible AI', url: 'https://www.microsoft.com/en-us/ai/responsible-ai' },
        ]
      },
      {
        id: 'p1-m3',
        phaseId: 'phase-1',
        title: 'The Literacy Checkpoint',
        type: 'quiz',
        content: 'Testing your mental models before we start walking. This quiz will cover LLM basics and the fundamental differences between Cloud and Local architectures.',
        resources: [
          { title: 'Review Phase 1 Content', url: '#' },
        ]
      }
    ]
  },
  {
    id: 'phase-2',
    week: 'Week 2',
    title: 'Walk: Effective Interaction',
    description: 'Learning to communicate with models using grounding and context.',
    modules: [
      {
        id: 'p2-m1',
        phaseId: 'phase-2',
        title: 'The Art of Grounding',
        type: 'lab',
        videoUrl: 'https://www.youtube.com/watch?v=6dxkBftbukI',
        content: contentP2M1,
        resources: [
          { title: `${BRANDING.name}: Refining AI Chatbot Chunking`, url: 'https://www.navapbc.com/case-studies/refining-AI-chatbot-chunking' },
          { title: 'Anthropic: Prompt Engineering Overview', url: 'https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview' },
          { title: 'OpenAI: Prompt Engineering Guide', url: 'https://platform.openai.com/docs/guides/prompt-engineering' },
          { title: 'Prompting Guide', url: 'https://www.promptingguide.ai/' },
        ]
      },
      {
        id: 'p2-m2',
        phaseId: 'phase-2',
        title: `The ${BRANDING.name} Use-Case Library`,
        type: 'use-case',
        videoUrl: 'https://www.youtube.com/watch?v=AtYtuVTZCQU',
        content: contentP2M2,
        resources: [
          { title: `${BRANDING.name}: AI Tools for Public Benefits`, url: 'https://www.navapbc.com/case-studies/ai-tools-public-benefits' },
          { title: `${BRANDING.name}: AI Public Sector Challenges`, url: 'https://www.navapbc.com/toolkits/ai-public-sector-challenges' },
          { title: `${BRANDING.name}: Reducing Administrative Burden`, url: 'https://www.navapbc.com/blog/reducing-administrative-burden' },
          { title: 'PlainLanguage.gov', url: 'https://www.plainlanguage.gov/' },
          { title: 'ByteByteGo: MCP vs RAG vs AI Agents', url: 'https://blog.bytebytego.com/p/ep202-mcp-vs-rag-vs-ai-agents' },
        ]
      },
      {
        id: 'p2-m3_lesson',
        phaseId: 'phase-2',
        title: 'Advanced Prompt Patterns',
        type: 'content',
        videoUrl: 'https://www.youtube.com/watch?v=vD0E3EUb8-8',
        content: contentP2M3,
        resources: [
          { title: 'Anthropic: Prompt Engineering Overview', url: 'https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview' },
          { title: 'Anthropic: System Prompt Guide', url: 'https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts' },
          { title: 'OpenAI: Prompt Engineering Guide', url: 'https://platform.openai.com/docs/guides/prompt-engineering' },
          { title: 'LLM-powered Autonomous Agents — Lilian Weng', url: 'https://lilianweng.github.io/posts/2023-06-23-agent/' },
        ]
      },
      {
        id: 'p2-m3',
        phaseId: 'phase-2',
        title: 'The Interaction Checkpoint',
        type: 'quiz',
        content: `Validating your prompter skills. This checkpoint focuses on grounding techniques and the specific "${BRANDING.name} Style" of AI interaction.`,
        resources: [
          { title: 'Prompting Guide: Techniques Reference', url: 'https://www.promptingguide.ai/techniques' },
        ]
      }
    ]
  },
  {
    id: 'phase-3',
    week: 'Week 3',
    title: 'Run: Local Independence',
    description: 'Taking the training wheels off and running models on your hardware.',
    modules: [
      {
        id: 'p3-m1',
        phaseId: 'phase-3',
        title: 'The Local Stack',
        type: 'local-setup',
        videoUrl: 'https://www.youtube.com/watch?v=5RIOQuHOihY',
        content: contentP3M1,
        resources: [
          { title: 'Ollama Documentation', url: 'https://ollama.com/' },
          { title: 'LM Studio Documentation', url: 'https://lmstudio.ai/docs' },
          { title: 'IBM Granite — Open Source Models', url: 'https://ollama.com/library/granite3.1-dense' },
        ]
      },
      {
        id: 'p3-m2',
        phaseId: 'phase-3',
        title: 'Deep Dive: Privacy First',
        type: 'content',
        videoUrl: 'https://www.youtube.com/watch?v=-Tz_FWVYgnM',
        content: contentP3M2,
        resources: [
          { title: 'Anthropic: Building Effective Agents', url: 'https://www.anthropic.com/research/building-effective-agents' },
          { title: 'IBM AI Ethics', url: 'https://www.ibm.com/artificial-intelligence/ethics' },
          { title: 'Google: Responsible AI Practices', url: 'https://ai.google/responsibility/responsible-ai-practices/' },
          { title: 'Microsoft: Responsible AI', url: 'https://www.microsoft.com/en-us/ai/responsible-ai' },
        ]
      },
      {
        id: 'p3-m3_lesson',
        phaseId: 'phase-3',
        title: 'Deploying Local AI',
        type: 'content',
        videoUrl: 'https://www.youtube.com/watch?v=5Z2HBJTUNik',
        content: contentP3M3,
        resources: [
          { title: `${BRANDING.name}: VA AI Claims Classification`, url: 'https://www.navapbc.com/case-studies/va-AI-claims-classification' },
          { title: `${BRANDING.name}: VA Artificial Intelligence Overview`, url: 'https://www.navapbc.com/case-studies/va-artificial-intelligence' },
          { title: `${BRANDING.name}: Caseworker AI Tools`, url: 'https://www.navapbc.com/labs/caseworker-ai-tools' },
          { title: `${BRANDING.name} Blog: Open Source in Government`, url: 'https://www.navapbc.com/blog/open-source-software-for-government' },
          { title: 'ByteByteGo: MCP vs RAG vs AI Agents', url: 'https://blog.bytebytego.com/p/ep202-mcp-vs-rag-vs-ai-agents' },
        ]
      },
      {
        id: 'p3-m3',
        phaseId: 'phase-3',
        title: 'The Independence Checkpoint',
        type: 'quiz',
        content: `Final sanity check on local model concepts and the ${BRANDING.name} privacy decision matrix.`,
        resources: [
          { title: 'Ollama Troubleshooting', url: 'https://github.com/ollama/ollama/blob/main/docs/faq.md' },
        ]
      }
    ]
  },
  {
    id: 'phase-4',
    week: 'Week 4',
    title: 'Sprint: Custom Specialization',
    description: 'Fine-tuned workflows and advanced civic tech patterns.',
    modules: [
      {
        id: 'p4-m1',
        phaseId: 'phase-4',
        title: 'Custom System Prompts',
        type: 'content',
        videoUrl: 'https://www.youtube.com/watch?v=MO3U1X8-NNQ',
        content: contentP4M1,
        resources: [
          { title: 'Anthropic: System Prompt Guide', url: 'https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts' },
          { title: 'Anthropic: Prompt Engineering Overview', url: 'https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview' },
          { title: 'Google DeepMind: System Instructions', url: 'https://ai.google.dev/gemini-api/docs/system-instructions' },
        ]
      },
      {
        id: 'p4-m2',
        phaseId: 'phase-4',
        title: 'Advanced Tooling & Agents',
        type: 'content',
        videoUrl: 'https://www.youtube.com/watch?v=AtYtuVTZCQU',
        content: contentP4M2,
        resources: [
          { title: `${BRANDING.name}: Caseworker AI Tools`, url: 'https://www.navapbc.com/labs/caseworker-ai-tools' },
          { title: `${BRANDING.name}: AI Tools for Public Benefits`, url: 'https://www.navapbc.com/case-studies/ai-tools-public-benefits' },
          { title: 'Anthropic: Building Effective Agents', url: 'https://www.anthropic.com/research/building-effective-agents' },
          { title: 'LLM-powered Autonomous Agents — Lilian Weng', url: 'https://lilianweng.github.io/posts/2023-06-23-agent/' },
          { title: 'ByteByteGo: MCP vs RAG vs AI Agents', url: 'https://blog.bytebytego.com/p/ep202-mcp-vs-rag-vs-ai-agents' },
          { title: 'Microsoft Semantic Kernel', url: 'https://learn.microsoft.com/en-us/semantic-kernel/overview/' },
        ]
      },
      {
        id: 'p4-m3',
        phaseId: 'phase-4',
        title: 'Graduation Sprint',
        type: 'content',
        videoUrl: 'https://www.youtube.com/watch?v=v4F1gFy-hqg',
        content: contentP4M3,
        resources: [
          { title: 'Anthropic: Building Effective Agents', url: 'https://www.anthropic.com/research/building-effective-agents' },
          { title: 'LLMs in 2024 — Simon Willison', url: 'https://simonwillison.net/2024/Dec/31/llms-in-2024/' },
          { title: `${BRANDING.name} AI Pilot Application`, url: '#' },
        ]
      },
      {
        id: 'p4-glossary',
        phaseId: 'phase-4',
        title: `${BRANDING.name} AI Glossary`,
        type: 'glossary',
        content: '',
        resources: []
      }
    ]
  }
];
