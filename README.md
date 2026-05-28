# {{COMPANY}} AI Training Platform

An interactive, local-first learning platform for mastering Generative AI and Large Language Models (LLMs) with a focus on data privacy and professional ethics.

## Overview

This application provides a structured curriculum for internal teams to learn about AI. It emphasizes **Local AI** (using Ollama or LM Studio) to ensure that sensitive data never leaves your machine.

### Key Features:
- **Interactive Labs:** Real-time feedback using local LLMs.
- **AI Harness Concepts:** Learn how to "cage" an AI using system prompts and grounding.
- **Privacy First:** Designed for high-security environments like government services (PII/PHI).
- **Custom Branding:** Easily adaptable for different organizations via `src/branding.ts`.

## Getting Started

### Prerequisites:
1. **Node.js:** v18 or higher.
2. **Local AI Provider (Highly Recommended):**
   - [Ollama](https://ollama.com/) (Standard)
   - [LM Studio](https://lmstudio.ai/) (Advanced)

### Installation:
```bash
npm install
npm run dev
```

### Connected Local Models:
Once you have Ollama or LM Studio running on port `11434` or `12345`, the dashboard will automatically detect your available models (e.g., Llama 3, Mistral, Phi-3).

## Configuration

You can customize the company name, logo, and core mission in `src/branding.ts`:

```typescript
export const BRANDING = {
  name: "Your Company",
  fullName: "Your Company Name LLC",
  tagline: "Your tagline here",
  // ...
};
```

## Curriculum Structure

- **Phase 1: Foundations** (Decoding the black box, Privacy).
- **Phase 2: The Art of Control** (Prompt Engineering, System Personas).
- **Phase 3: The Lab** (Setting up Ollama, Hardware requirements).
- **Phase 4: Synthesis** (Building real-world use cases).

## License & Legal

This project is licensed under the **PolyForm Noncommercial License 1.0.0**. 
- **Personal/Internal Use:** Permitted.
- **Modification:** Permitted for internal/non-commercial use.
- **Resale for Profit:** **Prohibited.**

For more details, see [LICENSE](LICENSE) and [CONTRIBUTING.md](CONTRIBUTING.md).

---
*Built with React, Vite, and ❤️ for Secure AI.*
