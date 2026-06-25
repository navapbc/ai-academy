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

## Post-deploy checklist

- **CORS origin allow-list:** the Edge Functions enforce an allow-listed CORS
  origin. After the first deploy, confirm each function's allowed origin includes
  the CloudFront domain for that environment, or browser calls are CORS-rejected
  even though the deploy "succeeded."
- **Staging vs prod isolation:** the workflow assumes separate staging/prod
  Supabase projects and a `release` branch. If you only have one Supabase
  project, both environments point at the same place — workable, but you'd be
  pushing migrations to your only DB from `main`.
