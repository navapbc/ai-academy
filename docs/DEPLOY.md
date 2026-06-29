# Deployment

This describes how Nava AI Academy is built and deployed via CI/CD: the static
frontend goes to **S3 + CloudFront**, and the backend (Postgres + Edge Functions)
goes to a **hosted Supabase project**. The pipeline lives in
`.github/workflows/deploy.yml`.

> Note: `.github/workflows/ci.yml` is a separate workflow (lint + build + test +
> DB-gated integration tests on pull requests / pushes). `deploy.yml` is only for
> shipping. Don't merge the two.

## Architecture recap (why it's not "just a static site")

`npm run build` (`vite build`) emits a static `dist/` that S3 + CloudFront can
serve. But the SPA is useless without two things that **cannot** live on
S3/CloudFront:

1. **Supabase** — Postgres + Auth + the `modules` table (curriculum is
   content-as-data, fetched at runtime).
2. **Edge Functions** (`chat`, `grade`, `review-grade`, `admin-*`) — the Deno
   proxies that hold `ANTHROPIC_API_KEY`. The browser calls these, never
   Anthropic directly.

So a deploy is **two halves**: the static frontend → AWS, and the database +
Edge Functions → a hosted Supabase project. `deploy.yml` does both.

## How the pipeline runs

Triggers (`deploy.yml`):

- Push to `main` → deploys to **staging** (auto).
- Push to `release` → deploys to **production**.
- Manual `workflow_dispatch` → pick `staging` or `prod`.

The branch/input resolves to a GitHub **Environment** (`staging` or
`production`), which scopes the secrets and can require reviewers. Each
environment points at its own S3 bucket, CloudFront distribution, and Supabase
project.

Job flow:

1. **test** — `npm ci` → `npm run lint` → `npm run test`.
2. **deploy** (needs `test`):
   - `npm run build` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in env
     (Vite inlines them into the bundle at build time).
   - Assume AWS role via **OIDC** (no long-lived AWS keys).
   - `aws s3 sync` in two passes: hashed assets with a 1-year immutable
     cache, then HTML with `no-cache`.
   - CloudFront invalidation of `/*.html`.
   - `supabase db push` (migrations) + `supabase functions deploy` (all Edge
     Functions).

## What to configure in the GitHub UI

### 1. Environments

**Settings → Environments** → create `staging` and `production`. The names must
match exactly — the workflow's `environment:` expression resolves to those
strings. Add required reviewers on `production` for a manual approval gate.

### 2. Per-environment secrets

**Settings → Environments → [each env] → Environment secrets.** Each environment
targets its own Supabase project and its own S3/CloudFront:

| Secret | What it is |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | IAM role for GitHub OIDC to assume (S3 + CloudFront permissions) |
| `AWS_S3_BUCKET_NAME` | Target bucket for that environment |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | Distribution in front of that bucket |
| `VITE_SUPABASE_URL` | Hosted Supabase project URL (e.g. `https://<ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key — **public by design**, RLS protects data |
| `SUPABASE_ACCESS_TOKEN` | Personal access token from supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_REF` | The project ref (the `<ref>` in the URL) |
| `SUPABASE_DB_PASSWORD` | DB password, needed by `supabase db push` |

## What to configure in AWS (one-time)

- An **OIDC identity provider** for `token.actions.githubusercontent.com` and a
  role whose trust policy is scoped to this repo (ideally to the
  `staging`/`production` environments). This is what makes `id-token: write` work
  without long-lived AWS keys.
- CloudFront: a **403/404 → `/index.html` (200)** custom error response, or
  deep-link refreshes break (SPA routing).

## What must NOT go in GitHub

These are **not** GitHub secrets — they live on the Supabase project itself:

- **`ANTHROPIC_API_KEY`** (plus optional `ANTHROPIC_MODEL`,
  `BOOTSTRAP_ADMIN_EMAILS`) — set once per project:
  ```bash
  supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref>
  ```
  or Dashboard → Edge Functions → Secrets. The whole security model is that this
  key only ever exists in the Deno runtime — keep it out of the build and out of
  GitHub.
- **Google SSO** (`GOOGLE_CLIENT_ID` / `GOOGLE_SECRET`) — for hosted Supabase
  these are configured in **Dashboard → Authentication → Providers → Google**,
  not via the deploy. Add your CloudFront domain to the provider's redirect URIs
  and to Supabase's allowed redirect URLs.

### Live project secrets (inventory)

Every secret that must be set directly on the Supabase project (via
`supabase secrets set … --project-ref <ref>` or Dashboard → Edge Functions →
Secrets). This table is the authoritative list — if a secret is not here it
should not exist on the project.

| Secret | Purpose | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Server-side Claude key for `chat` / `grade` | Org token (rotated in P6.1); never a GitHub secret |
| `ANTHROPIC_MODEL` | Override default model | Optional. Validated against the allow-list; off-list values fall back to Haiku |
| `APP_ORIGIN` | Deployed site origin for the Edge Functions' CORS allow-list | Scheme + host, no trailing slash — e.g. `https://<your-prod-site>`. Required: without it cross-origin browser calls are CORS-rejected even if the deploy succeeded |
| `BOOTSTRAP_ADMIN_EMAILS` | Break-glass admin set for the `admin-set-role` function | Comma-separated `@navapbc.com` addresses |

**Not in this table (auto-injected or auth config, not function secrets):**

- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` — injected
  automatically into every Edge Function by the Supabase runtime; do not set
  these by hand.
- `GOOGLE_CLIENT_ID` / `GOOGLE_SECRET` — configured via Dashboard →
  Authentication → Providers → Google (CLI-substituted auth config), not via
  `supabase secrets set`.

### Rotating the Anthropic key

No function redeploy is required — Supabase Edge Functions read secrets at the
next invocation, so new requests automatically pick up the updated key.

> **Scope note (P6.1 decision):** Dual-key zero-downtime overlap (keeping the
> old key live until traffic drains) is **out of scope** — YAGNI for an internal
> tool with low concurrency. A brief window of 503s during the `set` → revoke
> gap is acceptable.

```bash
# 1. Provision the new org token in the Anthropic console.

# 2. Set it on each project (staging first, then prod):
supabase secrets set ANTHROPIC_API_KEY=<new-token> --project-ref <staging-ref>
supabase secrets set ANTHROPIC_API_KEY=<new-token> --project-ref <prod-ref>

# 3. Verify on each environment: sign in with an @navapbc.com account and
#    run one chat stream + one graded lab to confirm both Edge Functions respond.

# 4. Only after verification: revoke the old token in the Anthropic console.
```

## Post-deploy checklist

- **CORS origin allow-list:** the Edge Functions enforce an allow-listed CORS
  origin. After the first deploy, confirm each function's allowed origin includes
  the CloudFront domain for that environment, or browser calls are CORS-rejected
  even though the deploy "succeeded."
- **Staging vs prod isolation:** the workflow assumes separate staging/prod
  Supabase projects and a `release` branch. If you only have one Supabase
  project, both environments point at the same place — workable, but you'd be
  pushing migrations to your only DB from `main`.
