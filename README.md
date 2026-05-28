# Nava AI Academy

An internal AI-literacy training platform for Nava.

## Overview

Nava AI Academy is an internal training platform that teaches the Nava AI Literacy
Skills Matrix (Stages 1–2). It pairs a structured curriculum with interactive labs,
backed by Claude via API and a Supabase data layer. The app runs locally in
development and is deployed to a Nava subdomain.

## Getting Started

### Prerequisites:
1. **Node.js:** v18 or higher.

### Installation:
```bash
npm install
npm run dev
```

## Local development

The app uses a fully local Supabase backend (Postgres + Auth + Studio) run via
the Supabase CLI and Docker.

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)
running, plus `npm install`.

```bash
# 1. Start the local Supabase stack (first run pulls Docker images).
npx supabase start

# 2. Copy the printed API URL + anon key into your .env.
cp .env.example .env
#   then set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the output.

# 3. Run the app.
npm run dev
```

Useful commands:
- `npx supabase status` — show local URLs/keys (Studio is at http://127.0.0.1:54323).
- `npx supabase db reset` — re-apply migrations + seed against a fresh local DB.
- `npx supabase stop` — tear the stack down.

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
