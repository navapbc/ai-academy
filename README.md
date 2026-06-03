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

### Local Development

The full stack is three pieces: the Supabase backend, the Edge Functions (the
Claude proxy), and the Vite frontend. **Docker Desktop must be running.**

**One-time setup** (skip if your `.env` files already exist — see
[Local development — setup & configuration](#local-development--setup--configuration)
for what goes in them):

```bash
npm install
cp .env.example .env                                   # frontend + Supabase + Google SSO vars
cp supabase/functions/.env.example supabase/functions/.env  # set ANTHROPIC_API_KEY here
```

**Run the full stack** — use three terminals; terminals 2 and 3 stay running:

```bash
# Terminal 1 — local Supabase stack (Postgres + Auth + Studio)
npx supabase start

# Terminal 2 — Edge Functions (the server-side Claude proxy; AI features 503 without it)
npx supabase functions serve --env-file supabase/functions/.env

# Terminal 3 — frontend
npm run dev
```

Then open **http://localhost:3000**. Studio (browse the DB) is at
**http://127.0.0.1:54323**.

Useful extras:

```bash
npx supabase status      # show local URLs + keys; confirm services are Up
npx supabase stop        # stop the stack (preserves DB data)
npm run lint             # tsc --noEmit && eslint
npm test                 # vitest run
```

> Sign-in is Google SSO restricted to `@navapbc.com`. For local work without
> Google configured, use the dev-only email/password fallback with the seeded
> demo user `demo@navapbc.com` / `demo-password`.

## Local development — setup & configuration

The app uses a fully local Supabase backend (Postgres + Auth + Studio) run via
the Supabase CLI and Docker.

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)
running, plus `npm install`.

AI features (Playground, Prompt Lab) talk to Claude through a Supabase Edge
Function (`supabase/functions/chat`). The `ANTHROPIC_API_KEY` is held
**server-side** in that function's runtime env and is never exposed to the
browser — the client only ever calls the Edge Function.

```bash
# 1. Copy the env template (it is gitignored) and fill in values below.
cp .env.example .env

# 2. Start the local Supabase stack (first run pulls Docker images).
#    Run from the repo root so the CLI auto-loads .env (it needs GOOGLE_CLIENT_ID
#    / GOOGLE_SECRET to enable Google sign-in — see "Google SSO" below).
npx supabase start
#    Copy the printed API URL + anon key into VITE_SUPABASE_URL and
#    VITE_SUPABASE_ANON_KEY in .env.

# 3. Set your Anthropic API key for the Edge Function (server-side only).
cp supabase/functions/.env.example supabase/functions/.env
#   then set ANTHROPIC_API_KEY=sk-ant-... in that file (it is gitignored).

# 4. Serve the Edge Functions with that env file (leave running).
npx supabase functions serve --env-file supabase/functions/.env

# 5. In another terminal, run the app.
npm run dev
```

### Google SSO (sign-in)

Sign-in is **Google SSO restricted to `@navapbc.com`**. Access is enforced in two
layers that don't trust the browser: a client guard in `src/lib/auth.tsx` that
signs out any non-`navapbc.com` session, and a `before insert on auth.users`
database trigger (the `restrict_auth_email_domain` migration) that rejects the
row outright. Google's `hd` hint is UX only, not a boundary.

To enable Google sign-in locally:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth 2.0 Client ID** of type **Web application**. A personal/dev
   Google Cloud project is fine for local work; the production client lives in
   the Nava Google org and is wired up at deploy time.
2. Add this **Authorized redirect URI**:
   `http://127.0.0.1:54321/auth/v1/callback` (the local Supabase auth endpoint).
3. Put the client id/secret in your gitignored `.env`:
   ```bash
   GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
   GOOGLE_SECRET=your-google-oauth-client-secret
   ```
   The Supabase CLI substitutes these into `supabase/config.toml`
   (`[auth.external.google]`) on `supabase start`. `GOOGLE_SECRET` is server-side
   only — never VITE-prefix it; it is never exposed to the browser.

**Local dev fallback:** the email/password form (shown only in dev) signs in the
seeded demo user `demo@navapbc.com` / `demo-password`, so you can work locally
without configuring Google.

Get an Anthropic API key from
[console.anthropic.com](https://console.anthropic.com/settings/keys). The
function defaults to Claude Haiku 4.5 (cheapest current model); override the
default with `ANTHROPIC_MODEL` in the same env file, or per request via the
in-app model selector.

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
