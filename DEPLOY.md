# Xygo Vercel Deploy Guide

The Vercel deployment now uses Node serverless entrypoints instead of a static-only output directory.
This is required for `/runtime-config.json`, `/auth/*`, `/ready`, `/v1/*`, and the staging smoke tests.

- Repo to import: `https://github.com/XenXiii/XygoAEC`
- Branch: `main`
- Config file: `vercel.json` at the repo root
- Framework preset: Other
- Root directory: repo root (`./`)
- Build command: blank
- Output directory: blank

Do not set the project output directory to `apps/web/public`; that bypasses the dynamic runtime and
causes `/runtime-config.json` to return a static 404.

## Runtime Routing

`vercel.json` routes:

- `/v1/*`, `/ready`, `/health`, `/metrics`, and `/webhooks/email` to the API serverless function.
- all other paths, including `/runtime-config.json`, `/auth/*`, and static web assets, to the web
  serverless function.

The web function serves files from `apps/web/public` and builds `/runtime-config.json` field-by-field
from the public allowlist. Server-only secrets are excluded.

## Staging Rules

Before promoting a Vercel deployment as staging, configure the complete environment contract from
`config/production.env.example` plus `config/staging-deployment.env.example`, then run:

```sh
npm run check:staging
npm run migrate:postgres
npm run check:postgres
XYGO_STAGING_BASE_URL=https://STAGING_WEB_HOST \
XYGO_STAGING_EXPECTED_RELEASE=$XYGO_RELEASE \
npm run smoke:staging
```

The current code treats `NODE_ENV=production` plus `XYGO_DEPLOY_ENVIRONMENT=staging` as a staging
deployment with production safety gates enabled.
